import { openDb, now, getSettings, setSettings, num } from './db.js';
import { config } from './config.js';
import { openBrowser, collect, searchUrl, pageUrl, sleep, rnd } from './crawler.js';
import { savePageFromAds, groupByPage } from './store.js';

const state = {
  running: false,
  runId: null,
  stop: false,
  phase: '',
  message: '',
  done: 0,
  total: 0,
  startedAt: null,
};

export function getState() {
  return { ...state };
}

export function isRunning() {
  return state.running;
}

export function stopRun() {
  if (!state.running) return false;
  state.stop = true;
  state.message = 'parando depois da etapa atual...';
  return true;
}

export function parseCountries(text) {
  return String(text || '')
    .split(/[\s,;]+/)
    .map((c) => c.trim().toUpperCase())
    .filter((c) => /^[A-Z]{2}$/.test(c) || c === 'ALL');
}

export function buildSearches(keywords, settings) {
  const defaults = parseCountries(settings.default_countries);
  const out = [];
  for (const kw of keywords) {
    const own = parseCountries(kw.countries);
    const countries = own.length ? own : defaults;
    for (const country of countries) out.push({ kw, country });
  }
  return out;
}

async function interruptibleSleep(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end && !state.stop) await sleep(Math.min(500, end - Date.now()));
}

function stamp() {
  return new Date().toLocaleTimeString('pt-BR', { timeZone: config.timezone, hour12: false });
}

export function startRun({ trigger = 'manual', keywordIds = null } = {}) {
  if (state.running) return { ok: false, error: 'Ja existe uma rodada em andamento.' };
  const d = openDb();
  let kws = d.prepare('SELECT * FROM keywords WHERE active = 1 ORDER BY id').all();
  const specific = Array.isArray(keywordIds) && keywordIds.length > 0;
  if (specific) {
    const set = new Set(keywordIds.map(Number));
    kws = d.prepare('SELECT * FROM keywords ORDER BY id').all().filter((k) => set.has(k.id));
  }
  if (!kws.length) {
    return { ok: false, error: 'Cadastre palavras-chave ativas antes de rodar.' };
  }
  const info = d
    .prepare("INSERT INTO runs(started_at, status, trigger) VALUES (?, 'rodando', ?)")
    .run(now(), trigger);
  const runId = Number(info.lastInsertRowid);
  state.running = true;
  state.runId = runId;
  state.stop = false;
  state.phase = 'preparando';
  state.message = 'abrindo o navegador';
  state.done = 0;
  state.total = 0;
  state.startedAt = now();

  runMining(runId, kws, specific).catch((err) => {
    console.error('Falha inesperada na rodada', err);
  });
  return { ok: true, runId };
}

async function runMining(runId, keywords, specific) {
  const d = openDb();
  const settings = getSettings();
  const startedAt = state.startedAt;
  const lines = [];
  const counters = { searches_done: 0, searches_total: 0, deep_done: 0, ads_seen: 0, pages_found: 0, new_pages: 0 };
  let finalStatus = 'concluida';
  let finalError = null;

  const flush = (extra = {}) => {
    const merged = { ...counters, ...extra };
    d.prepare(
      `UPDATE runs SET searches_done = ?, searches_total = ?, deep_done = ?, ads_seen = ?,
         pages_found = ?, new_pages = ?, log = ? WHERE id = ?`
    ).run(
      merged.searches_done,
      merged.searches_total,
      merged.deep_done,
      merged.ads_seen,
      merged.pages_found,
      merged.new_pages,
      lines.slice(-400).join('\n'),
      runId
    );
  };
  const log = (msg) => {
    lines.push(`${stamp()}  ${msg}`);
    flush();
  };
  const shouldStop = () => state.stop;
  const touched = new Set();

  let context = null;
  try {
    let searches = buildSearches(keywords, settings);
    const cap = num(settings, 'max_searches_per_run');
    if (!specific && searches.length > cap) {
      const start = num(settings, 'search_cursor') % searches.length;
      searches = [...searches.slice(start), ...searches.slice(0, start)].slice(0, cap);
      setSettings({ search_cursor: (start + cap) % buildSearches(keywords, settings).length });
    }
    counters.searches_total = searches.length;
    state.total = searches.length;
    log(`Rodada ${runId} iniciada: ${searches.length} buscas (${keywords.length} palavras-chave ativas).`);

    context = await openBrowser();
    log('Navegador aberto.');

    // ---------- etapa 1: buscas por palavra-chave ----------
    state.phase = 'buscas';
    let consecutiveErrors = 0;
    for (let i = 0; i < searches.length; i += 1) {
      if (shouldStop()) {
        finalStatus = 'cancelada';
        break;
      }
      const { kw, country } = searches[i];
      state.done = i;
      state.message = `busca ${i + 1} de ${searches.length}: ${kw.term} (${country})`;
      log(`[${i + 1}/${searches.length}] "${kw.term}" em ${country}`);

      const r = await collect(context, searchUrl(kw.term, country), {
        scrolls: num(settings, 'scrolls_search'),
        shouldStop,
        log,
        tag: `busca-${country}`,
      });

      if (r.blocked) {
        log(`BLOQUEIO detectado: ${r.blocked}. Rodada encerrada para proteger o IP.`);
        finalStatus = 'bloqueada';
        finalError = r.blocked;
        break;
      }
      if (r.error) {
        consecutiveErrors += 1;
        if (consecutiveErrors >= 3) {
          finalStatus = 'erro';
          finalError = 'Tres falhas seguidas ao abrir a Biblioteca.';
          log(finalError);
          break;
        }
      } else {
        consecutiveErrors = 0;
      }

      counters.searches_done = i + 1;
      counters.ads_seen += r.ads.length;
      const groups = groupByPage(r.ads);
      let newHere = 0;
      for (const g of groups) {
        const isNew = savePageFromAds({
          pageId: g.pageId,
          pageName: g.pageName,
          profileUri: g.profileUri,
          ads: g.ads,
          total: null,
          deep: false,
          term: kw.term,
          country,
        });
        touched.add(g.pageId);
        if (isNew) {
          newHere += 1;
          counters.new_pages += 1;
        }
      }
      counters.pages_found = touched.size;
      d.prepare('UPDATE keywords SET last_run_at = ?, last_ads = ? WHERE id = ?').run(now(), r.ads.length, kw.id);
      log(`  ${r.ads.length} anuncios, ${groups.length} paginas (${newHere} novas)`);

      if (i < searches.length - 1) {
        const pause = rnd(num(settings, 'delay_min'), Math.max(num(settings, 'delay_min'), num(settings, 'delay_max')));
        await interruptibleSleep(pause * 1000);
        if ((i + 1) % 10 === 0) {
          log('  pausa longa para parecer mais humano');
          await interruptibleSleep(rnd(30, 60) * 1000);
        }
      }
    }

    // ---------- etapa 2: visita a pagina de cada anunciante ----------
    if (finalStatus === 'concluida' && !shouldStop() && touched.size > 0) {
      state.phase = 'paginas';
      const ttl = num(settings, 'deep_ttl_days') * 86400;
      const candidates = d
        .prepare(
          `SELECT page_id, name, ads_active FROM pages
           WHERE last_seen >= ? AND status != 'discarded'
             AND (last_deep_at IS NULL OR last_deep_at < ?)
           ORDER BY ads_active DESC LIMIT ?`
        )
        .all(startedAt, now() - ttl, num(settings, 'max_deep'));
      state.total = candidates.length;
      log(`Aprofundando ${candidates.length} paginas para contar anuncios e dias ativos.`);
      let zeros = 0;
      for (let i = 0; i < candidates.length; i += 1) {
        if (shouldStop()) {
          finalStatus = 'cancelada';
          break;
        }
        const c = candidates[i];
        state.done = i;
        state.message = `pagina ${i + 1} de ${candidates.length}: ${c.name}`;
        log(`[pagina ${i + 1}/${candidates.length}] ${c.name}`);
        const r = await collect(context, pageUrl(c.page_id), {
          scrolls: num(settings, 'scrolls_page'),
          shouldStop,
          log,
          tag: 'pagina',
        });
        if (r.blocked) {
          log(`BLOQUEIO detectado: ${r.blocked}. Rodada encerrada.`);
          finalStatus = 'bloqueada';
          finalError = r.blocked;
          break;
        }
        const mine = r.ads.filter((a) => a.page_id === String(c.page_id));
        if (!mine.length) {
          zeros += 1;
          log('  nenhum anuncio capturado nesta pagina');
          if (zeros >= 3) {
            finalStatus = 'erro';
            finalError = 'Tres paginas seguidas sem anuncios capturados. Provavel mudanca de formato ou bloqueio.';
            log(finalError);
            break;
          }
        } else {
          zeros = 0;
          savePageFromAds({
            pageId: String(c.page_id),
            pageName: mine[0].page_name,
            profileUri: mine[0].page_profile_uri,
            ads: mine,
            total: r.total,
            deep: true,
          });
          counters.deep_done += 1;
          const row = d.prepare('SELECT ads_active, oldest_start, domain FROM pages WHERE page_id = ?').get(String(c.page_id));
          const days = row && row.oldest_start ? Math.floor((now() - row.oldest_start) / 86400) : '?';
          log(`  ${row ? row.ads_active : '?'} anuncios ativos, mais antigo com ${days} dias, site ${row && row.domain ? row.domain : 'nao identificado'}`);
        }
        if (i < candidates.length - 1) {
          await interruptibleSleep(rnd(num(settings, 'delay_min'), Math.max(num(settings, 'delay_min'), num(settings, 'delay_max'))) * 1000);
        }
      }
    }
    if (state.stop && finalStatus === 'concluida') finalStatus = 'cancelada';
  } catch (err) {
    finalStatus = 'erro';
    finalError = String(err && err.message ? err.message : err).split('\n')[0];
    log(`ERRO: ${finalError}`);
    if (/Executable doesn't exist|browserType\.launch/i.test(String(err && err.message))) {
      log('O navegador nao esta instalado na imagem. Use o Dockerfile do projeto.');
    }
  } finally {
    if (context) await context.close().catch(() => {});
    log(`Rodada finalizada: ${finalStatus}. ${counters.pages_found} paginas, ${counters.new_pages} novas.`);
    d.prepare('UPDATE runs SET status = ?, finished_at = ?, error = ? WHERE id = ?').run(
      finalStatus,
      now(),
      finalError,
      runId
    );
    flush();
    state.running = false;
    state.stop = false;
    state.phase = '';
    state.message = '';
    state.runId = null;
  }
}
