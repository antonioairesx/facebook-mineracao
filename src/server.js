import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import { config, assertConfig } from './config.js';
import { openDb, getSettings, setSettings, num, now, DEFAULT_SETTINGS } from './db.js';
import {
  passwordMatches,
  makeSession,
  readCookie,
  isValidSession,
  sessionCookie,
  clearCookie,
  loginBlocked,
  registerFailure,
  registerSuccess,
} from './auth.js';
import { getState, startRun, stopRun, parseCountries } from './miner.js';
import { startScheduler } from './scheduler.js';
import { adLink, pageLibraryLink } from './crawler.js';
import { toCsv } from './csv.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

const STATIC = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/index.html': ['index.html', 'text/html; charset=utf-8'],
  '/app.css': ['app.css', 'text/css; charset=utf-8'],
  '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
  '/favicon.svg': ['favicon.svg', 'image/svg+xml'],
};

const STATUSES = ['new', 'seen', 'fav', 'discarded'];

assertConfig();
const db = openDb();

const app = Fastify({ trustProxy: true, logger: { level: 'warn' }, bodyLimit: 2 * 1024 * 1024 });

// ---------- cabecalhos de seguranca ----------
app.addHook('onSend', async (req, reply) => {
  reply.header('X-Content-Type-Options', 'nosniff');
  reply.header('X-Frame-Options', 'DENY');
  reply.header('Referrer-Policy', 'no-referrer');
  reply.header(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; " +
      "font-src https://fonts.gstatic.com; img-src 'self' https: data:; connect-src 'self'; " +
      "frame-ancestors 'none'; base-uri 'none'; form-action 'self'"
  );
});

// ---------- autenticacao ----------
const OPEN_API = new Set(['/api/login', '/api/session', '/api/health']);

app.addHook('onRequest', async (req, reply) => {
  const url = req.url.split('?')[0];
  if (!url.startsWith('/api/')) return;
  if (req.method !== 'GET' && req.headers['x-garimpo'] !== '1') {
    return reply.code(403).send({ error: 'Requisicao recusada.' });
  }
  if (OPEN_API.has(url)) return;
  if (!isValidSession(readCookie(req.headers.cookie))) {
    return reply.code(401).send({ error: 'Sessao expirada. Entre de novo.' });
  }
});

app.get('/api/health', async () => ({ ok: true }));

app.get('/api/session', async (req) => ({
  authenticated: isValidSession(readCookie(req.headers.cookie)),
}));

app.post('/api/login', async (req, reply) => {
  const ip = req.ip;
  if (loginBlocked(ip)) {
    return reply.code(429).send({ error: 'Muitas tentativas. Aguarde 10 minutos.' });
  }
  const password = req.body && typeof req.body.password === 'string' ? req.body.password : '';
  if (!password || !passwordMatches(password)) {
    registerFailure(ip);
    return reply.code(401).send({ error: 'Senha incorreta.' });
  }
  registerSuccess(ip);
  reply.header('Set-Cookie', sessionCookie(makeSession(), req.protocol === 'https'));
  return { ok: true };
});

app.post('/api/logout', async (req, reply) => {
  reply.header('Set-Cookie', clearCookie(req.protocol === 'https'));
  return { ok: true };
});

// ---------- paginas anunciantes ----------
const SORTS = {
  ads_active: 'ads_active',
  days: 'days',
  name: 'name COLLATE NOCASE',
  first_seen: 'first_seen',
  last_seen: 'last_seen',
  domain: 'domain COLLATE NOCASE',
  hits: 'hits',
};

const PAGES_BASE = `
    SELECT p.page_id AS page_id_x, p.page_id, p.name, p.profile_url, p.first_seen, p.last_seen,
      p.ads_active, p.ads_groups, p.oldest_start, p.domain, p.site_url, p.sample_text,
      p.sample_ad_id, p.last_deep_at, p.status, p.notes,
      CASE WHEN p.oldest_start IS NULL THEN NULL
           ELSE CAST((strftime('%s', 'now') - p.oldest_start) / 86400 AS INTEGER) END AS days,
      (SELECT COUNT(*) FROM page_hits h WHERE h.page_id = p.page_id) AS hits,
      (SELECT group_concat(term, '|') FROM (SELECT DISTINCT term FROM page_hits WHERE page_id = p.page_id)) AS terms,
      (SELECT group_concat(country, ',') FROM (SELECT DISTINCT country FROM page_hits WHERE page_id = p.page_id)) AS countries
    FROM pages p`;

function buildPagesQuery(query, { forExport = false } = {}) {
  const where = [];
  const params = [];
  const status = query.status || 'active';
  if (status === 'active') where.push("status IN ('new', 'seen', 'fav')");
  else if (STATUSES.includes(status)) {
    where.push('status = ?');
    params.push(status);
  }
  const q = String(query.q || '').trim();
  if (q) {
    where.push('(name LIKE ? OR domain LIKE ?)');
    params.push(`%${q}%`, `%${q}%`);
  }
  const minAds = Number(query.min_ads);
  if (Number.isFinite(minAds) && minAds > 0) {
    where.push('ads_active >= ?');
    params.push(minAds);
  }
  const minDays = Number(query.min_days);
  if (Number.isFinite(minDays) && minDays > 0) {
    where.push('days >= ?');
    params.push(minDays);
  }
  if (query.qualifies === '1') {
    const st = getSettings();
    where.push('ads_active >= ? AND days >= ?');
    params.push(num(st, 'min_ads'), num(st, 'min_days'));
  }
  if (query.country) {
    where.push('EXISTS (SELECT 1 FROM page_hits h WHERE h.page_id = page_id_x AND h.country = ?)');
    params.push(String(query.country).toUpperCase());
  }
  if (query.term) {
    where.push('EXISTS (SELECT 1 FROM page_hits h WHERE h.page_id = page_id_x AND h.term = ?)');
    params.push(String(query.term));
  }
  const sortKey = SORTS[query.sort] ? query.sort : 'ads_active';
  const dir = String(query.dir).toLowerCase() === 'asc' ? 'ASC' : 'DESC';
  const limit = forExport ? 5000 : Math.min(Math.max(Number(query.limit) || 100, 1), 500);
  const offset = Math.max(Number(query.offset) || 0, 0);

  const base = PAGES_BASE;
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const orderSql = `ORDER BY (${SORTS[sortKey].split(' ')[0]} IS NULL), ${SORTS[sortKey]} ${dir}, name COLLATE NOCASE ASC`;
  return {
    listSql: `SELECT * FROM (${base}) ${whereSql} ${orderSql} LIMIT ${limit} OFFSET ${offset}`,
    countSql: `SELECT COUNT(*) AS n FROM (${base}) ${whereSql}`,
    params,
  };
}

function decoratePage(row, settings) {
  const minAds = num(settings, 'min_ads');
  const minDays = num(settings, 'min_days');
  return {
    page_id: row.page_id,
    name: row.name,
    profile_url: row.profile_url,
    first_seen: row.first_seen,
    last_seen: row.last_seen,
    ads_active: row.ads_active,
    ads_groups: row.ads_groups,
    days: row.days,
    domain: row.domain,
    site_url: row.site_url,
    sample_text: row.sample_text,
    status: row.status,
    notes: row.notes,
    deep: !!row.last_deep_at,
    hits: row.hits,
    terms: row.terms ? row.terms.split('|') : [],
    countries: row.countries ? row.countries.split(',').filter(Boolean) : [],
    qualifies: row.ads_active >= minAds && row.days !== null && row.days >= minDays,
    library_url: pageLibraryLink(row.page_id),
  };
}

app.get('/api/pages', async (req) => {
  const settings = getSettings();
  const { listSql, countSql, params } = buildPagesQuery(req.query || {});
  const rows = db.prepare(listSql).all(...params).map((r) => decoratePage(r, settings));
  const total = db.prepare(countSql).get(...params).n;
  return {
    rows,
    total,
    criteria: { min_ads: num(settings, 'min_ads'), min_days: num(settings, 'min_days') },
  };
});

app.get('/api/pages/:id', async (req, reply) => {
  const settings = getSettings();
  const row = db
    .prepare(`SELECT * FROM (${PAGES_BASE}) WHERE page_id = ?`)
    .get(String(req.params.id));
  if (!row) return reply.code(404).send({ error: 'Pagina nao encontrada.' });
  const ads = db
    .prepare(
      `SELECT ad_id, start_date, end_date, is_active, body, title, cta, link_url, domain, format,
              thumb_url, collation_count
       FROM ads WHERE page_id = ? ORDER BY is_active DESC, start_date ASC LIMIT 200`
    )
    .all(String(req.params.id))
    .map((a) => ({
      ...a,
      days: a.start_date ? Math.floor((now() - a.start_date) / 86400) : null,
      library_url: adLink(a.ad_id),
    }));
  const hits = db
    .prepare('SELECT term, country FROM page_hits WHERE page_id = ? ORDER BY term, country')
    .all(String(req.params.id));
  return { page: decoratePage(row, settings), ads, hits };
});

app.patch('/api/pages/:id', async (req, reply) => {
  const body = req.body || {};
  const sets = [];
  const params = [];
  if (body.status !== undefined) {
    if (!STATUSES.includes(body.status)) return reply.code(400).send({ error: 'Status invalido.' });
    sets.push('status = ?');
    params.push(body.status);
  }
  if (body.notes !== undefined) {
    sets.push('notes = ?');
    params.push(String(body.notes).slice(0, 4000));
  }
  if (!sets.length) return reply.code(400).send({ error: 'Nada para atualizar.' });
  const info = db.prepare(`UPDATE pages SET ${sets.join(', ')} WHERE page_id = ?`).run(...params, String(req.params.id));
  if (!info.changes) return reply.code(404).send({ error: 'Pagina nao encontrada.' });
  return { ok: true };
});

app.post('/api/pages/bulk', async (req, reply) => {
  const { ids, status } = req.body || {};
  if (!Array.isArray(ids) || !ids.length || !STATUSES.includes(status)) {
    return reply.code(400).send({ error: 'Pedido invalido.' });
  }
  const stmt = db.prepare('UPDATE pages SET status = ? WHERE page_id = ?');
  db.exec('BEGIN');
  try {
    for (const id of ids.slice(0, 1000)) stmt.run(status, String(id));
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  return { ok: true };
});

app.get('/api/export.csv', async (req, reply) => {
  const settings = getSettings();
  const { listSql, params } = buildPagesQuery(req.query || {}, { forExport: true });
  const rows = db.prepare(listSql).all(...params).map((r) => decoratePage(r, settings));
  const fmt = (t) => (t ? new Date(t * 1000).toISOString().slice(0, 10) : '');
  const csv = toCsv(
    [
      'Pagina',
      'Link da pagina na Biblioteca',
      'Anuncios ativos',
      'Criativos distintos',
      'Dias ativo (mais antigo)',
      'Dominio',
      'Site de destino',
      'Paises',
      'Palavras-chave',
      'Passa no criterio',
      'Status',
      'Primeira vez visto',
      'Exemplo de texto',
    ],
    rows.map((r) => [
      r.name,
      r.library_url,
      r.ads_active,
      r.ads_groups,
      r.days === null ? '' : r.days,
      r.domain,
      r.site_url,
      r.countries.join(' '),
      r.terms.join(' | '),
      r.qualifies ? 'sim' : 'nao',
      r.status,
      fmt(r.first_seen),
      r.sample_text.replace(/\s+/g, ' ').slice(0, 300),
    ])
  );
  reply
    .header('Content-Type', 'text/csv; charset=utf-8')
    .header('Content-Disposition', `attachment; filename="garimpo-${new Date().toISOString().slice(0, 10)}.csv"`);
  return csv;
});

// ---------- palavras-chave ----------
app.get('/api/keywords', async () => {
  const rows = db
    .prepare(
      `SELECT k.*, (SELECT COUNT(*) FROM page_hits h WHERE h.term = k.term) AS pages
       FROM keywords k ORDER BY k.niche COLLATE NOCASE, k.term COLLATE NOCASE`
    )
    .all();
  return { rows, default_countries: getSettings().default_countries };
});

app.post('/api/keywords', async (req, reply) => {
  const { text, lang, niche, countries } = req.body || {};
  const lines = String(text || '')
    .split(/\r?\n/)
    .map((l) => l.trim().replace(/\s+/g, ' '))
    .filter(Boolean)
    .slice(0, 1000);
  if (!lines.length) return reply.code(400).send({ error: 'Cole ao menos uma palavra-chave.' });
  const langOk = ['es', 'en', 'pt'].includes(lang) ? lang : 'es';
  const cs = parseCountries(countries).join(',');
  const stmt = db.prepare(
    'INSERT OR IGNORE INTO keywords(term, lang, niche, countries, active, created_at) VALUES (?, ?, ?, ?, 1, ?)'
  );
  let added = 0;
  db.exec('BEGIN');
  try {
    for (const term of lines) {
      const info = stmt.run(term.slice(0, 200), langOk, String(niche || '').slice(0, 60), cs, now());
      added += info.changes;
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  return { ok: true, added, skipped: lines.length - added };
});

app.patch('/api/keywords/:id', async (req, reply) => {
  const body = req.body || {};
  const sets = [];
  const params = [];
  if (body.active !== undefined) {
    sets.push('active = ?');
    params.push(body.active ? 1 : 0);
  }
  if (body.countries !== undefined) {
    sets.push('countries = ?');
    params.push(parseCountries(body.countries).join(','));
  }
  if (body.niche !== undefined) {
    sets.push('niche = ?');
    params.push(String(body.niche).slice(0, 60));
  }
  if (!sets.length) return reply.code(400).send({ error: 'Nada para atualizar.' });
  db.prepare(`UPDATE keywords SET ${sets.join(', ')} WHERE id = ?`).run(...params, Number(req.params.id));
  return { ok: true };
});

app.delete('/api/keywords/:id', async (req) => {
  db.prepare('DELETE FROM keywords WHERE id = ?').run(Number(req.params.id));
  return { ok: true };
});

app.post('/api/keywords/bulk', async (req, reply) => {
  const { action, ids } = req.body || {};
  if (!Array.isArray(ids) || !ids.length || !['activate', 'deactivate', 'delete'].includes(action)) {
    return reply.code(400).send({ error: 'Pedido invalido.' });
  }
  db.exec('BEGIN');
  try {
    for (const id of ids.slice(0, 2000)) {
      if (action === 'delete') db.prepare('DELETE FROM keywords WHERE id = ?').run(Number(id));
      else db.prepare('UPDATE keywords SET active = ? WHERE id = ?').run(action === 'activate' ? 1 : 0, Number(id));
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  return { ok: true };
});

// ---------- rodadas ----------
app.get('/api/status', async () => {
  const st = getState();
  const counts = db
    .prepare(
      `SELECT COUNT(*) AS pages,
              SUM(CASE WHEN status = 'new' THEN 1 ELSE 0 END) AS fresh
       FROM pages WHERE status != 'discarded'`
    )
    .get();
  const last = db
    .prepare('SELECT id, started_at, finished_at, status FROM runs ORDER BY id DESC LIMIT 1')
    .get();
  return { ...st, pages: counts.pages || 0, fresh: counts.fresh || 0, last_run: last || null };
});

app.get('/api/runs', async () => ({
  rows: db
    .prepare(
      `SELECT id, started_at, finished_at, status, trigger, searches_done, searches_total, deep_done,
              ads_seen, pages_found, new_pages, error
       FROM runs ORDER BY id DESC LIMIT 60`
    )
    .all(),
}));

app.get('/api/runs/:id', async (req, reply) => {
  const row = db.prepare('SELECT * FROM runs WHERE id = ?').get(Number(req.params.id));
  if (!row) return reply.code(404).send({ error: 'Rodada nao encontrada.' });
  return row;
});

app.post('/api/runs', async (req, reply) => {
  const ids = req.body && Array.isArray(req.body.keywordIds) ? req.body.keywordIds : null;
  const res = startRun({ trigger: 'manual', keywordIds: ids });
  if (!res.ok) return reply.code(409).send({ error: res.error });
  return res;
});

app.post('/api/runs/stop', async () => ({ ok: stopRun() }));

// ---------- ajustes ----------
const LIMITS = {
  min_ads: [0, 1000],
  min_days: [0, 3650],
  scrolls_search: [1, 40],
  scrolls_page: [1, 60],
  max_deep: [0, 300],
  deep_ttl_days: [0, 90],
  delay_min: [1, 120],
  delay_max: [1, 300],
  max_searches_per_run: [1, 500],
  schedule_every_hours: [1, 168],
};

app.get('/api/settings', async () => {
  const s = getSettings();
  const out = {};
  for (const k of Object.keys(DEFAULT_SETTINGS)) {
    if (k === 'search_cursor' || k === 'last_scheduled_date') continue;
    out[k] = s[k];
  }
  return { settings: out, timezone: config.timezone, proxy: !!config.proxyServer };
});

app.put('/api/settings', async (req, reply) => {
  const body = req.body || {};
  const patch = {};
  for (const [k, [lo, hi]] of Object.entries(LIMITS)) {
    if (body[k] === undefined) continue;
    const n = Number(body[k]);
    if (!Number.isFinite(n) || n < lo || n > hi) {
      return reply.code(400).send({ error: `Valor invalido em ${k} (aceita de ${lo} a ${hi}).` });
    }
    patch[k] = Math.round(n);
  }
  if (body.default_countries !== undefined) {
    const cs = parseCountries(body.default_countries);
    if (!cs.length) return reply.code(400).send({ error: 'Informe ao menos um pais (ex: MX, CO).' });
    patch.default_countries = cs.join(',');
  }
  if (body.schedule_mode !== undefined) {
    if (!['off', 'daily', 'interval'].includes(body.schedule_mode)) {
      return reply.code(400).send({ error: 'Modo de agendamento invalido.' });
    }
    patch.schedule_mode = body.schedule_mode;
  }
  if (body.schedule_time !== undefined) {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(body.schedule_time)) {
      return reply.code(400).send({ error: 'Horario invalido (use HH:MM).' });
    }
    patch.schedule_time = body.schedule_time;
  }
  setSettings(patch);
  return { ok: true };
});

// ---------- diagnostico ----------
const DEBUG_DIR = path.join(config.dataDir, 'debug');
const DEBUG_NAME = /^[A-Za-z0-9_-]+\.(png|json)$/;

app.get('/api/debug', async () => {
  if (!fs.existsSync(DEBUG_DIR)) return { rows: [] };
  const rows = fs
    .readdirSync(DEBUG_DIR)
    .filter((f) => DEBUG_NAME.test(f))
    .map((f) => ({ name: f, size: fs.statSync(path.join(DEBUG_DIR, f)).size, mtime: fs.statSync(path.join(DEBUG_DIR, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, 40);
  return { rows };
});

app.get('/api/debug/:file', async (req, reply) => {
  const f = String(req.params.file);
  if (!DEBUG_NAME.test(f)) return reply.code(400).send({ error: 'Arquivo invalido.' });
  const full = path.join(DEBUG_DIR, f);
  if (!fs.existsSync(full)) return reply.code(404).send({ error: 'Arquivo nao encontrado.' });
  reply.header('Content-Type', f.endsWith('.png') ? 'image/png' : 'application/json; charset=utf-8');
  return fs.readFileSync(full);
});

// ---------- arquivos estaticos ----------
app.get('/*', async (req, reply) => {
  const url = req.url.split('?')[0];
  if (url.startsWith('/api/')) return reply.code(404).send({ error: 'Rota nao encontrada.' });
  const hit = STATIC[url];
  if (!hit) return reply.code(404).type('text/plain').send('Nao encontrado');
  const file = path.join(PUBLIC_DIR, hit[0]);
  if (!fs.existsSync(file)) return reply.code(404).type('text/plain').send('Nao encontrado');
  reply.header('Cache-Control', 'no-cache').type(hit[1]);
  return fs.readFileSync(file);
});

startScheduler();

app.listen({ port: config.port, host: '0.0.0.0' }).then(() => {
  console.log(`Garimpo no ar na porta ${config.port}`);
});

export default app;
