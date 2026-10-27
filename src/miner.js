import { openDb, now, getSettings, setSettings, num } from './db.js';
import { config } from './config.js';
import { openBrowser, collect, searchUrl, pageUrl, sleep, rnd } from './crawler.js';
import { savePageFromAds, groupByPage } from './store.js';
import { splitTerm, matchesAll } from './terms.js';
import { isChatAd } from './classify.js';
import { resolveCountry } from './countries.js';
import { saveDailyReport } from './report.js';

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
  const out = [];
  for (const part of String(text || '').split(/[,;\n]+/)) {
    const t = part.trim();
    if (!t) continue;
    const r = resolveCountry(t);
    if (r && !out.includes(r.code)) out.push(r.code);
  }
  // mundo todo sozinho: se tiver ALL junto com outros, vale ALL
  return out.includes('ALL') ? ['ALL'] : out;
}

export function buildSearches(keywords, settings, override = []) {
  const defaults = override.length ? override : parseCountries(settings.default_countries);
  const out = [];
  for (const kw of keywords) {
    const own = override.length ? [] : parseCountries(kw.countries);
    const countries = own.length ? own : defaults;
    for (const country of countries) out.push({ kw, country });
  }
  return out;
}

// Ordem das buscas quando nao cabem todas na rodada: palavras nunca rodadas primeiro,
// depois as que mais trouxeram paginas boas, depois as rodadas ha mais tempo.
export function prioritizeSearches(searches, d, settings) {
  const minAds = num(settings, 'min_ads');
  const minDays = num(settings, 'min_days');
  const rows = d
    .prepare(
      `SELECT h.term AS term, COUNT(DISTINCT p.page_id) AS good
       FROM page_hits h JOIN pages p ON p.page_id = h.page_id
       WHERE p.status != 'discarded' AND p.ads_active >= ? AND p.oldest_start IS NOT NULL
         AND (strftime('%s', 'now') - p.oldest_start) / 86400 >= ?
       GROUP BY h.term`
    )
    .all(minAds, minDays);
  const good = new Map(rows.map((r) => [r.term, r.good]));
  const keyed = searches.map((s, i) => ({ s, i, never: s.kw.last_run_at ? 0 : 1, good: good.get(s.kw.term) || 0, last: s.kw.last_run_at || 0 }));
  keyed.sort((a, b) => b.never - a.never || b.good - a.good || a.last - b.last || a.i - b.i);
  return keyed.map((k) => k.s);
}

// pausa irregular entre acoes, com alguns intervalos mais longos de vez em quando
function humanPause(settings) {
  const lo = num(settings, 'delay_min');
  const hi = Math.max(lo, num(settings, 'delay_max'));
  let sec = rnd(lo, hi);
  const r = Math.random();
  if (r < 0.12) sec += rnd(8, 25);
  else if (r < 0.3) sec *= rnd(0.7, 1.4);
  return Math.max(1, sec);
}

async function interruptibleSleep(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end && !state.stop) await sleep(Math.min(500, end - Date.now()));
}

function stamp() {
  return new Date().toLocaleTimeString('pt-BR', { timeZone: config.timezone, hour12: false });
}

export function startRun({ trigger = 'manual', keywordIds = null, resumeRunId = null, countries = null, skipChat = null } = {}) {
  if (state.running) return { ok: false, error: 'Já existe uma rodada em andamento.' };
  const d = openDb();

  if (resumeRunId) {
    const run = d.prepare('SELECT * FROM runs WHERE id = ?').get(Number(resumeRunId));
    if (!run) return { ok: false, error: 'Rodada não encontrada.' };
    if (!['interrompida', 'cancelada', 'erro'].includes(run.status)) {
      return { ok: false, error: 'Só dá para retomar rodadas interrompidas, canceladas ou com erro.' };
    }
    let plan = [];
    try { plan = JSON.parse(run.plan || '[]'); } catch { plan = []; }
    if (!Array.isArray(plan) || !plan.length) {
      return { ok: false, error: 'Essa rodada é antiga e não guardou o plano de buscas. Use Rodar novamente.' };
    }
    const kwById = new Map(d.prepare('SELECT * FROM keywords').all().map((k) => [k.id, k]));
    const searches = plan.map(([id, country]) => ({ kw: kwById.get(id), country })).filter((x) => x.kw);
    d.prepare("UPDATE runs SET status = 'rodando', finished_at = NULL, error = NULL WHERE id = ?").run(run.id);
    state.skipChat = skipChat === null || skipChat === undefined ? getSettings().skip_chat !== '0' : !!skipChat;
    state.running = true;
    state.runId = run.id;
    state.stop = false;
    state.phase = 'preparando';
    state.message = 'retomando a rodada ' + run.id;
    state.done = run.searches_done;
    state.total = searches.length;
    state.startedAt = run.started_at;
    runMining(run.id, { searches, resume: run }).catch((err) => console.error('Falha inesperada na rodada', err));
    return { ok: true, runId: run.id, resumed: true };
  }

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
  state.skipChat = skipChat === null || skipChat === undefined ? getSettings().skip_chat !== '0' : !!skipChat;
  state.running = true;
  state.runId = runId;
  state.stop = false;
  state.phase = 'preparando';
  state.message = 'abrindo o navegador';
  state.done = 0;
  state.total = 0;
  state.startedAt = now();

  runMining(runId, { keywords: kws, specific, override: parseCountries(Array.isArray(countries) ? countries.join(',') : countries) }).catch((err) => {
    console.error('Falha inesperada na rodada', err);
  });
  return { ok: true, runId };
}

async function runMining(runId, { keywords = [], specific = false, override = [], searches: resumeSearches = null, resume = null } = {}) {
  const d = openDb();
  const settings = getSettings();
  const startedAt = state.startedAt;
  const lines = resume && resume.log ? resume.log.split('\n') : [];
  const counters = resume
    ? { searches_done: resume.searches_done, searches_total: resume.searches_total, deep_done: resume.deep_done, ads_seen: resume.ads_seen, pages_found: resume.pages_found, new_pages: resume.new_pages }
    : { searches_done: 0, searches_total: 0, deep_done: 0, ads_seen: 0, pages_found: 0, new_pages: 0 };
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
  if (resume) {
    for (const r of d.prepare('SELECT page_id FROM pages WHERE last_seen >= ?').all(startedAt)) touched.add(r.page_id);
  }

  let context = null;
  try {
    let searches;
    let startIndex = 0;
    if (resume) {
      searches = resumeSearches;
      startIndex = Math.min(resume.searches_done, searches.length);
      counters.searches_total = searches.length;
      state.total = searches.length;
      log(`Rodada ${runId} retomada na busca ${startIndex + 1} de ${searches.length}.`);
    } else {
      searches = buildSearches(keywords, settings, override);
      const cap = num(settings, 'max_searches_per_run');
      if (!specific && searches.length > cap) {
        if (settings.prioritize === '1') {
          searches = prioritizeSearches(searches, d, settings).slice(0, cap);
        } else {
          const start = num(settings, 'search_cursor') % searches.length;
          searches = [...searches.slice(start), ...searches.slice(0, start)].slice(0, cap);
          setSettings({ search_cursor: (start + cap) % buildSearches(keywords, settings, override).length });
        }
      }
      d.prepare('UPDATE runs SET plan = ? WHERE id = ?').run(JSON.stringify(searches.map((x) => [x.kw.id, x.country])), runId);
      counters.searches_total = searches.length;
      state.total = searches.length;
      log(`Rodada ${runId} iniciada: ${searches.length} buscas (${keywords.length} palavras-chave ativas).`);
    }

    context = await openBrowser(log);
    log('Navegador aberto.');

    // ---------- etapa 1: buscas por palavra-chave ----------
    state.phase = 'buscas';
    let consecutiveErrors = 0;
    let nextLong = Math.floor(rnd(6, 13));
    for (let i = startIndex; i < searches.length; i += 1) {
      if (shouldStop()) {
        finalStatus = 'cancelada';
        break;
      }
      const { kw, country } = searches[i];
      state.done = i;
      state.message = `busca ${i + 1} de ${searches.length}: ${kw.term} (${country})`;
      log(`[${i + 1}/${searches.length}] "${kw.term}" em ${country}`);

      const split = splitTerm(kw.term, settings.search_mode);
      const r = await collect(context, searchUrl(split.query, country), {
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
      const textOk = split.filters.length ? r.ads.filter((a) => matchesAll(a, split.filters)) : r.ads;
      const usable = state.skipChat === false ? textOk : textOk.filter((a) => !isChatAd(a));
      if (usable.length < textOk.length) log(`  ${textOk.length - usable.length} anúncios ignorados (link para WhatsApp, Telegram ou Linktree)`);
      if (split.filters.length) log(`  busca larga: ${usable.length} de ${r.ads.length} anúncios contêm "${split.filters.join(' ')}"`);
      const groups = groupByPage(usable);
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
      d.prepare('UPDATE keywords SET last_run_at = ?, last_ads = ? WHERE id = ?').run(now(), usable.length, kw.id);
      log(`  ${usable.length} anúncios, ${groups.length} páginas (${newHere} novas)`);

      if (i < searches.length - 1) {
        await interruptibleSleep(humanPause(settings) * 1000);
        nextLong -= 1;
        if (nextLong <= 0) {
          nextLong = Math.floor(rnd(6, 13));
          log('  pausa longa para parecer mais humano');
          await interruptibleSleep(rnd(30, 75) * 1000);
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
        const allMine = r.ads.filter((a) => a.page_id === String(c.page_id));
        const mine = state.skipChat === false ? allMine : allMine.filter((a) => !isChatAd(a));
        const chatDropped = allMine.length - mine.length;
        if (!mine.length && chatDropped) {
          zeros = 0;
          log(`  só anúncios com WhatsApp, Telegram ou Linktree: página descartada`);
          d.prepare("UPDATE pages SET status = 'discarded', last_deep_at = ? WHERE page_id = ?").run(now(), String(c.page_id));
        } else if (!mine.length) {
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
            total: chatDropped ? null : r.total,
            deep: true,
          });
          counters.deep_done += 1;
          const row = d.prepare('SELECT ads_active, oldest_start, domain FROM pages WHERE page_id = ?').get(String(c.page_id));
          const days = row && row.oldest_start ? Math.floor((now() - row.oldest_start) / 86400) : '?';
          log(`  ${row ? row.ads_active : '?'} anuncios ativos, mais antigo com ${days} dias, site ${row && row.domain ? row.domain : 'nao identificado'}`);
        }
        if (i < candidates.length - 1) await interruptibleSleep(humanPause(settings) * 1000);
      }
    }
    if (state.stop && finalStatus === 'concluida') finalStatus = 'cancelada';
  } catch (err) {
    finalStatus = 'erro';
    finalError = String(err && err.message ? err.message : err).split('\n')[0];
    log(`ERRO: ${finalError}`);
    if (/Executable doesn't exist|browserType\.launch/i.test(String(err && err.message))) {
      log('O navegador não está instalado. No EasyPanel, confira se o método de construção é Dockerfile.');
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
    if (finalStatus === 'concluida' && getSettings().auto_report === '1') {
      await saveDailyReport().catch((e) => console.error('Falha no relatório diário', e));
    }
    state.running = false;
    state.stop = false;
    state.phase = '';
    state.message = '';
    state.runId = null;
  }
}
