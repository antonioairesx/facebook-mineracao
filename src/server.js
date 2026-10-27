import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import { config, assertConfig } from './config.js';
import { openDb, getSettings, setSettings, num, now, DEFAULT_SETTINGS } from './db.js';
import {
  passwordMatches,
  hashPassword,
  verifyPassword,
  fakeVerify,
  makeSession,
  readCookie,
  readSession,
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
import { importDefaultKeywords } from './default-keywords.js';
import { OFFER_LABEL, classifyAd, isScaling, SCALE_DELTA, SCALE_NEW7 } from './classify.js';
import { readThumb, hasThumb } from './thumbs.js';
import { recomputeAllDerived } from './store.js';
import { renderPdf, saveDailyReport, listReports, isReportName, REPORT_DIR } from './report.js';
import { COUNTRIES, resolveCountry } from './countries.js';
import { storageInfo, bootInfo } from './storage.js';
const BOOT = bootInfo();
import { createBackup, sendToDrive, driveConfigured, recordBackup, lastBackupInfo } from './backup.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

const STATIC = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/index.html': ['index.html', 'text/html; charset=utf-8'],
  '/app.css': ['app.css', 'text/css; charset=utf-8'],
  '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
  '/theme.js': ['theme.js', 'text/javascript; charset=utf-8'],
  '/favicon.png': ['favicon.png', 'image/png'],
  '/logo.png': ['logo.png', 'image/png'],
};

const STATUSES = ['new', 'seen', 'fav', 'discarded'];

assertConfig();
const db = openDb();
// primeira subida: carrega a lista pronta de palavras-chave uma unica vez
try {
  if (getSettings().keywords_seeded !== '1') {
    importDefaultKeywords(db, now);
    setSettings({ keywords_seeded: '1' });
  }
} catch (err) { console.error('Falha ao carregar palavras-chave iniciais', err); }
// padrao novo: mundo todo (uma vez so, depois respeita o que o admin escolher)
if (getSettings().countries_world !== '1') {
  setSettings({ default_countries: 'ALL', countries_world: '1' });
}
try { recomputeAllDerived(); } catch (err) { console.error('Falha ao recalcular placares', err); }

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

// ---------- autenticacao e papeis ----------
const OPEN_API = new Set(['/api/login', '/api/session', '/api/health']);

function tokenTag(passHash) {
  return String(passHash).slice(-12);
}

// devolve {id, username, role} ou null. Papel e status sempre vem do banco (revogar vale na hora).
function resolveUser(req) {
  const sess = readSession(readCookie(req.headers.cookie));
  if (!sess) return null;
  if (sess.uid === 0) return { id: 0, username: config.adminUser, role: 'admin', env: true };
  const u = db.prepare('SELECT id, username, role, active, pass_hash FROM users WHERE id = ?').get(sess.uid);
  if (!u || !u.active || sess.v !== tokenTag(u.pass_hash)) return null;
  return { id: u.id, username: u.username, role: u.role, env: false };
}

// rotas so do admin: tudo que roda, apaga ou configura
function adminOnly(method, url) {
  if (url === '/api/users' || url.startsWith('/api/users/')) return true;
  if (url === '/api/reports/generate') return true;
  if (url === '/api/settings' || url.startsWith('/api/debug') || url.startsWith('/api/backup')) return true;
  // amigos podem iniciar buscas e gerenciar palavras-chave; configurar, relatorio manual, backup e acessos so o admin
  return false;
}

app.addHook('onRequest', async (req, reply) => {
  const url = req.url.split('?')[0];
  if (!url.startsWith('/api/')) return;
  if (req.method !== 'GET' && req.headers['x-garimpo'] !== '1') {
    return reply.code(403).send({ error: 'Requisição recusada.' });
  }
  if (OPEN_API.has(url)) return;
  const user = resolveUser(req);
  if (!user) return reply.code(401).send({ error: 'Sessão expirada. Entre de novo.' });
  if (adminOnly(req.method, url) && user.role !== 'admin') {
    return reply.code(403).send({ error: 'Somente o administrador pode fazer isso.' });
  }
  req.user = user;
});

app.get('/api/health', async () => ({ ok: true, storage: storageInfo(BOOT.boots), boots: BOOT.boots, data_since: BOOT.since, data_dir: config.dataDir }));

app.get('/api/session', async (req) => {
  const u = resolveUser(req);
  return { authenticated: !!u, user: u ? { username: u.username, role: u.role, env: u.env } : null };
});

app.post('/api/login', async (req, reply) => {
  const ip = req.ip;
  if (loginBlocked(ip)) {
    return reply.code(429).send({ error: 'Muitas tentativas. Aguarde 10 minutos.' });
  }
  const body = req.body || {};
  const username = typeof body.username === 'string' ? body.username.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const fail = () => {
    registerFailure(ip);
    return reply.code(401).send({ error: 'Usuário ou senha incorretos.' });
  };
  if (!username || !password) return fail();

  let token = null;
  if (username.toLowerCase() === config.adminUser.toLowerCase()) {
    if (!passwordMatches(password)) return fail();
    token = makeSession(0);
  } else {
    const u = db.prepare('SELECT id, pass_hash, active FROM users WHERE username = ? COLLATE NOCASE').get(username);
    if (!u) {
      fakeVerify(password);
      return fail();
    }
    // aceita a senha como digitada ou sem espacos nas pontas (comum ao colar do WhatsApp)
    const okPass = verifyPassword(password, u.pass_hash) || (password.trim() !== password && verifyPassword(password.trim(), u.pass_hash));
    if (!okPass || !u.active) return fail();
    db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(now(), u.id);
    token = makeSession(u.id, tokenTag(u.pass_hash));
  }
  registerSuccess(ip);
  reply.header('Set-Cookie', sessionCookie(token, req.protocol === 'https'));
  return { ok: true };
});

app.post('/api/logout', async (req, reply) => {
  reply.header('Set-Cookie', clearCookie(req.protocol === 'https'));
  return { ok: true };
});

// troca da propria senha (o admin das variaveis de ambiente troca la no EasyPanel)
app.post('/api/me/password', async (req, reply) => {
  if (req.user.env) {
    return reply.code(400).send({ error: 'A senha do administrador é definida em ADMIN_PASSWORD no EasyPanel.' });
  }
  const { current, next } = req.body || {};
  if (typeof next !== 'string' || next.length < 8 || next.length > 200) {
    return reply.code(400).send({ error: 'A nova senha precisa ter de 8 a 200 caracteres.' });
  }
  const u = db.prepare('SELECT pass_hash FROM users WHERE id = ?').get(req.user.id);
  if (!u || typeof current !== 'string' || !verifyPassword(current, u.pass_hash)) {
    return reply.code(400).send({ error: 'Senha atual incorreta.' });
  }
  const hash = hashPassword(next);
  db.prepare('UPDATE users SET pass_hash = ? WHERE id = ?').run(hash, req.user.id);
  // a sessao atual caiu junto com a troca: renova o cookie
  reply.header('Set-Cookie', sessionCookie(makeSession(req.user.id, tokenTag(hash)), req.protocol === 'https'));
  return { ok: true };
});

// ---------- usuarios (admin) ----------
const USERNAME_RE = /^[A-Za-z0-9._-]{3,30}$/;

// Amigos definidos na variavel EXTRA_USERS (usuario:senha, separados por virgula ou quebra de linha).
// Sao recriados a cada boot, entao sobrevivem mesmo se o banco for apagado.
for (const item of config.extraUsers.split(/[,\n;]+/)) {
  const i = item.indexOf(':');
  if (i < 1) continue;
  const name = item.slice(0, i).trim();
  const pass = item.slice(i + 1).trim();
  if (!USERNAME_RE.test(name) || pass.length < 8 || name.toLowerCase() === config.adminUser.toLowerCase()) {
    console.error('EXTRA_USERS: ignorando entrada invalida para "' + name + '" (usuario 3 a 30 caracteres, senha minimo 8).');
    continue;
  }
  const ex = db.prepare('SELECT id, pass_hash FROM users WHERE username = ? COLLATE NOCASE').get(name);
  if (!ex) {
    db.prepare("INSERT INTO users(username, pass_hash, role, active, created_at) VALUES (?, ?, 'member', 1, ?)").run(name, hashPassword(pass), now());
  } else if (!verifyPassword(pass, ex.pass_hash)) {
    db.prepare('UPDATE users SET pass_hash = ? WHERE id = ?').run(hashPassword(pass), ex.id);
  }
}

app.get('/api/users', async () => ({
  admin: config.adminUser,
  rows: db
    .prepare('SELECT id, username, role, active, created_at, last_login_at FROM users ORDER BY username COLLATE NOCASE')
    .all(),
}));

app.post('/api/users', async (req, reply) => {
  const { username, password } = req.body || {};
  if (typeof username !== 'string' || !USERNAME_RE.test(username.trim())) {
    return reply.code(400).send({ error: 'Usuário de 3 a 30 caracteres: letras, números, ponto, hífen ou sublinhado.' });
  }
  if (typeof password !== 'string' || password.length < 8 || password.length > 200) {
    return reply.code(400).send({ error: 'A senha precisa ter de 8 a 200 caracteres.' });
  }
  const name = username.trim();
  const pass = password.trim();
  if (pass.length < 8) return reply.code(400).send({ error: 'A senha precisa ter de 8 a 200 caracteres.' });
  if (name.toLowerCase() === config.adminUser.toLowerCase()) {
    return reply.code(400).send({ error: 'Esse nome é reservado para o administrador.' });
  }
  if (db.prepare('SELECT 1 FROM users WHERE username = ? COLLATE NOCASE').get(name)) {
    return reply.code(409).send({ error: 'Já existe um usuário com esse nome.' });
  }
  const info = db
    .prepare("INSERT INTO users(username, pass_hash, role, active, created_at) VALUES (?, ?, 'member', 1, ?)")
    .run(name, hashPassword(pass), now());
  return { ok: true, id: Number(info.lastInsertRowid) };
});

app.patch('/api/users/:id', async (req, reply) => {
  const id = Number(req.params.id);
  const u = db.prepare('SELECT id FROM users WHERE id = ?').get(id);
  if (!u) return reply.code(404).send({ error: 'Usuário não encontrado.' });
  const body = req.body || {};
  if (body.active !== undefined) {
    db.prepare('UPDATE users SET active = ? WHERE id = ?').run(body.active ? 1 : 0, id);
  }
  if (body.password !== undefined) {
    if (typeof body.password !== 'string' || body.password.length < 8 || body.password.length > 200) {
      return reply.code(400).send({ error: 'A senha precisa ter de 8 a 200 caracteres.' });
    }
    db.prepare('UPDATE users SET pass_hash = ? WHERE id = ?').run(hashPassword(body.password.trim()), id);
  }
  return { ok: true };
});

app.delete('/api/users/:id', async (req) => {
  db.prepare('DELETE FROM users WHERE id = ?').run(Number(req.params.id));
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
  score: 'score',
  new7: 'new7',
  delta: 'delta',
};

function cleanTags(list) {
  const out = [];
  for (const raw of list) {
    const t = String(raw || '').replace(/[|,;]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 30);
    if (t && !out.some((o) => o.toLowerCase() === t.toLowerCase())) out.push(t);
    if (out.length >= 12) break;
  }
  return out;
}

const PAGES_BASE = `
    SELECT p.page_id AS page_id_x, p.page_id, p.name, p.profile_url, p.first_seen, p.last_seen,
      p.ads_active, p.ads_groups, p.oldest_start, p.domain, p.site_url, p.sample_text,
      p.sample_ad_id, p.last_deep_at, p.status, p.notes, p.offer_type, p.score,
      (SELECT COUNT(*) FROM ads a WHERE a.page_id = p.page_id AND a.is_active = 1 AND a.start_date >= strftime('%s', 'now') - 604800) AS new7,
      p.ads_active - (SELECT s.ads_active FROM page_snapshots s WHERE s.page_id = p.page_id AND s.at <= strftime('%s', 'now') - 72000
                      ORDER BY ABS(s.at - (strftime('%s', 'now') - 604800)) ASC LIMIT 1) AS delta,
      (SELECT group_concat(tag, '|') FROM page_tags WHERE page_id = p.page_id) AS tags,
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
  if (query.offer) {
    where.push('offer_type = ?');
    params.push(String(query.offer));
  } else if (query.hide_chat === '1') {
    where.push("offer_type NOT IN ('whatsapp', 'linkhub')");
  }
  if (query.tag) {
    where.push('EXISTS (SELECT 1 FROM page_tags t WHERE t.page_id = page_id_x AND t.tag = ?)');
    params.push(String(query.tag));
  }
  if (query.niche) {
    where.push('EXISTS (SELECT 1 FROM page_hits h JOIN keywords k ON k.term = h.term WHERE h.page_id = page_id_x AND k.niche = ?)');
    params.push(String(query.niche));
  }
  if (query.scaling === '1') {
    where.push('((delta IS NOT NULL AND delta >= ?) OR new7 >= ?)');
    params.push(SCALE_DELTA, SCALE_NEW7);
  }
  if (query.term) {
    where.push('EXISTS (SELECT 1 FROM page_hits h WHERE h.page_id = page_id_x AND h.term = ?)');
    params.push(String(query.term));
  }
  const sortKey = SORTS[query.sort] ? query.sort : 'score';
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
    offer_type: row.offer_type || '',
    offer_label: OFFER_LABEL[row.offer_type] || '',
    score: row.score || 0,
    new7: row.new7 || 0,
    delta: row.delta === null || row.delta === undefined ? null : row.delta,
    scaling: isScaling(row.delta, row.new7),
    tags: row.tags ? row.tags.split('|') : [],
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
  if (!row) return reply.code(404).send({ error: 'Página não encontrada.' });
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
      offer_type: classifyAd(a),
      has_thumb: hasThumb(a.ad_id),
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
    if (!STATUSES.includes(body.status)) return reply.code(400).send({ error: 'Status inválido.' });
    sets.push('status = ?');
    params.push(body.status);
  }
  if (body.notes !== undefined) {
    sets.push('notes = ?');
    params.push(String(body.notes).slice(0, 4000));
  }
  if (body.tags !== undefined && !Array.isArray(body.tags)) return reply.code(400).send({ error: 'Etiquetas inválidas.' });
  if (!sets.length && body.tags === undefined) return reply.code(400).send({ error: 'Nada para atualizar.' });
  const id = String(req.params.id);
  if (!db.prepare('SELECT 1 FROM pages WHERE page_id = ?').get(id)) return reply.code(404).send({ error: 'Página não encontrada.' });
  if (sets.length) db.prepare(`UPDATE pages SET ${sets.join(', ')} WHERE page_id = ?`).run(...params, id);
  if (body.tags !== undefined) {
    const tags = cleanTags(body.tags);
    db.exec('BEGIN');
    try {
      db.prepare('DELETE FROM page_tags WHERE page_id = ?').run(id);
      for (const t of tags) db.prepare('INSERT OR IGNORE INTO page_tags(page_id, tag) VALUES (?, ?)').run(id, t);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }
  return { ok: true };
});

app.post('/api/pages/bulk', async (req, reply) => {
  const { ids, status, addTag, removeTag } = req.body || {};
  const tag = cleanTags([addTag])[0];
  const untag = cleanTags([removeTag])[0];
  if (!Array.isArray(ids) || !ids.length || (!STATUSES.includes(status) && !tag && !untag)) {
    return reply.code(400).send({ error: 'Pedido inválido.' });
  }
  const stmt = db.prepare('UPDATE pages SET status = ? WHERE page_id = ?');
  db.exec('BEGIN');
  try {
    for (const id of ids.slice(0, 1000)) {
      if (STATUSES.includes(status)) stmt.run(status, String(id));
      if (tag) db.prepare('INSERT OR IGNORE INTO page_tags(page_id, tag) VALUES (?, ?)').run(String(id), tag);
      if (untag) db.prepare('DELETE FROM page_tags WHERE page_id = ? AND tag = ?').run(String(id), untag);
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  return { ok: true };
});

app.get('/api/facets', async () => ({
  niches: db.prepare("SELECT DISTINCT niche FROM keywords WHERE niche != '' ORDER BY niche COLLATE NOCASE").all().map((r) => r.niche),
  tags: db.prepare('SELECT tag, COUNT(*) AS n FROM page_tags GROUP BY tag ORDER BY tag COLLATE NOCASE').all(),
  offers: db
    .prepare("SELECT offer_type AS type, COUNT(*) AS n FROM pages WHERE offer_type != '' AND status != 'discarded' GROUP BY offer_type ORDER BY n DESC")
    .all()
    .map((r) => ({ ...r, label: OFFER_LABEL[r.type] || r.type })),
}));

app.get('/api/thumb/:id', async (req, reply) => {
  const t = readThumb(String(req.params.id));
  if (!t) return reply.code(404).send({ error: 'Sem miniatura.' });
  reply.header('Content-Type', t.type).header('Cache-Control', 'private, max-age=86400').header('X-Content-Type-Options', 'nosniff');
  return t.data;
});

app.get('/api/report.pdf', async (req, reply) => {
  const days = [1, 7, 30].includes(Number(req.query.days)) ? Number(req.query.days) : 1;
  try {
    const buf = await renderPdf(days);
    reply
      .header('Content-Type', 'application/pdf')
      .header('Content-Disposition', `attachment; filename="adhunter-relatorio-${new Date().toISOString().slice(0, 10)}.pdf"`)
      .header('Cache-Control', 'no-store');
    return buf;
  } catch (err) {
    return reply.code(500).send({ error: 'Não consegui gerar o PDF: ' + String(err.message || err).split('\n')[0] });
  }
});

app.get('/api/reports', async () => ({ rows: listReports() }));

app.get('/api/reports/:name', async (req, reply) => {
  const name = String(req.params.name);
  if (!isReportName(name)) return reply.code(400).send({ error: 'Arquivo inválido.' });
  const full = path.join(REPORT_DIR, name);
  if (!fs.existsSync(full)) return reply.code(404).send({ error: 'Relatório não encontrado.' });
  reply.header('Content-Type', 'application/pdf').header('Content-Disposition', `attachment; filename="${name}"`);
  return fs.readFileSync(full);
});

app.post('/api/reports/generate', async (req, reply) => {
  try {
    return { ok: true, name: await saveDailyReport() };
  } catch (err) {
    return reply.code(500).send({ error: 'Não consegui gerar o relatório: ' + String(err.message || err).split('\n')[0] });
  }
});

app.get('/api/export.csv', async (req, reply) => {
  const settings = getSettings();
  const { listSql, params } = buildPagesQuery(req.query || {}, { forExport: true });
  const rows = db.prepare(listSql).all(...params).map((r) => decoratePage(r, settings));
  const fmt = (t) => (t ? new Date(t * 1000).toISOString().slice(0, 10) : '');
  const csv = toCsv(
    [
      'Página',
      'Placar',
      'Oferta',
      'Escalando',
      'Novos anúncios em 7 dias',
      'Etiquetas',
      'Link da página na Biblioteca',
      'Anúncios ativos',
      'Criativos distintos',
      'Dias ativo (mais antigo)',
      'Domínio',
      'Site de destino',
      'Países',
      'Palavras-chave',
      'Passa no critério',
      'Status',
      'Primeira vez visto',
      'Exemplo de texto',
    ],
    rows.map((r) => [
      r.name,
      r.score,
      r.offer_label,
      r.scaling ? 'sim' + (r.delta > 0 ? ' (+' + r.delta + ')' : '') : 'não',
      r.new7,
      r.tags.join(' | '),
      r.library_url,
      r.ads_active,
      r.ads_groups,
      r.days === null ? '' : r.days,
      r.domain,
      r.site_url,
      r.countries.join(' '),
      r.terms.join(' | '),
      r.qualifies ? 'sim' : 'não',
      r.status,
      fmt(r.first_seen),
      r.sample_text.replace(/\s+/g, ' ').slice(0, 300),
    ])
  );
  reply
    .header('Content-Type', 'text/csv; charset=utf-8')
    .header('Content-Disposition', `attachment; filename="adhunter-${new Date().toISOString().slice(0, 10)}.csv"`);
  return csv;
});

// ---------- palavras-chave ----------
app.get('/api/keywords', async () => {
  const rows = db
    .prepare(
      `SELECT k.*, (SELECT COUNT(*) FROM page_hits h WHERE h.term = k.term) AS pages,
         (SELECT COUNT(DISTINCT p.page_id) FROM page_hits h JOIN pages p ON p.page_id = h.page_id
            WHERE h.term = k.term AND p.status != 'discarded' AND p.ads_active >= ? AND p.oldest_start IS NOT NULL
              AND (strftime('%s', 'now') - p.oldest_start) / 86400 >= ?) AS good
       FROM keywords k ORDER BY k.niche COLLATE NOCASE, k.term COLLATE NOCASE`
    )
    .all(num(getSettings(), 'min_ads'), num(getSettings(), 'min_days'));
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

app.post('/api/keywords/import-defaults', async () => ({ ok: true, ...importDefaultKeywords(db, now) }));

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
    return reply.code(400).send({ error: 'Pedido inválido.' });
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
app.get('/api/countries', async () => ({ rows: COUNTRIES }));
app.get('/api/countries/resolve', async (req) => {
  const codes = [];
  const unknown = [];
  for (const part of String(req.query.q || '').split(/[,;\n]+/)) {
    const t = part.trim();
    if (!t) continue;
    const r = resolveCountry(t);
    if (!r) unknown.push(t);
    else if (!codes.includes(r.code)) codes.push(r.code);
  }
  return { codes: codes.includes('ALL') ? ['ALL'] : codes, unknown };
});

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
  let alert = null;
  const lastFull = db.prepare('SELECT id, finished_at, status, error FROM runs ORDER BY id DESC LIMIT 1').get();
  if (lastFull && (lastFull.status === 'bloqueada' || lastFull.status === 'erro')) {
    alert = { kind: lastFull.status, run_id: lastFull.id, at: lastFull.finished_at, error: lastFull.error || '', proxy: !!config.proxyServer };
  }
  return { ...st, pages: counts.pages || 0, fresh: counts.fresh || 0, last_run: last || null, alert, storage: storageInfo(BOOT.boots) };
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
  if (!row) return reply.code(404).send({ error: 'Rodada não encontrada.' });
  return row;
});

app.post('/api/runs', async (req, reply) => {
  const ids = req.body && Array.isArray(req.body.keywordIds) ? req.body.keywordIds : null;
  const res = startRun({ trigger: 'manual', keywordIds: ids, countries: req.body && req.body.countries });
  if (!res.ok) return reply.code(409).send({ error: res.error });
  return res;
});

app.post('/api/runs/:id/resume', async (req, reply) => {
  const res = startRun({ trigger: 'manual', resumeRunId: Number(req.params.id) });
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
    if (['search_cursor', 'last_scheduled_date', 'last_backup_date', 'last_backup_info', 'last_report_date', 'keywords_seeded', 'countries_world'].includes(k)) continue;
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
      return reply.code(400).send({ error: `Valor inválido em ${k} (aceita de ${lo} a ${hi}).` });
    }
    patch[k] = Math.round(n);
  }
  if (body.default_countries !== undefined) {
    const cs = parseCountries(body.default_countries);
    if (!cs.length) return reply.code(400).send({ error: 'Informe ao menos um país (ex: MX, CO).' });
    patch.default_countries = cs.join(',');
  }
  if (body.search_mode !== undefined) {
    if (!['wide', 'exact'].includes(body.search_mode)) return reply.code(400).send({ error: 'Modo de busca inválido.' });
    patch.search_mode = body.search_mode;
  }
  for (const k of ['prioritize', 'auto_report']) {
    if (body[k] !== undefined) patch[k] = body[k] === true || body[k] === '1' || body[k] === 1 ? '1' : '0';
  }
  if (body.schedule_mode !== undefined) {
    if (!['off', 'daily', 'interval'].includes(body.schedule_mode)) {
      return reply.code(400).send({ error: 'Modo de agendamento inválido.' });
    }
    patch.schedule_mode = body.schedule_mode;
  }
  if (body.schedule_time !== undefined) {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(body.schedule_time)) {
      return reply.code(400).send({ error: 'Horário inválido (use HH:MM).' });
    }
    patch.schedule_time = body.schedule_time;
  }
  setSettings(patch);
  return { ok: true };
});

// ---------- backup (admin) ----------
app.get('/api/backup/status', async () => ({ drive: driveConfigured(), last: lastBackupInfo() }));

app.get('/api/backup/download', async (req, reply) => {
  const b = createBackup();
  reply.header('Content-Type', 'application/gzip');
  reply.header('Content-Disposition', `attachment; filename="${b.name}"`);
  reply.header('Cache-Control', 'no-store');
  return fs.readFileSync(b.path);
});

app.post('/api/backup/drive', async (req, reply) => {
  try {
    const r = await sendToDrive();
    recordBackup(true, 'Enviado: ' + r.name);
    return { ok: true, name: r.name };
  } catch (err) {
    recordBackup(false, err.message);
    return reply.code(502).send({ error: err.message });
  }
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
  if (!DEBUG_NAME.test(f)) return reply.code(400).send({ error: 'Arquivo inválido.' });
  const full = path.join(DEBUG_DIR, f);
  if (!fs.existsSync(full)) return reply.code(404).send({ error: 'Arquivo não encontrado.' });
  reply.header('Content-Type', f.endsWith('.png') ? 'image/png' : 'application/json; charset=utf-8');
  return fs.readFileSync(full);
});

// ---------- arquivos estaticos ----------
app.get('/*', async (req, reply) => {
  const url = req.url.split('?')[0];
  if (url.startsWith('/api/')) return reply.code(404).send({ error: 'Rota não encontrada.' });
  const hit = STATIC[url];
  if (!hit) return reply.code(404).type('text/plain').send('Nao encontrado');
  const file = path.join(PUBLIC_DIR, hit[0]);
  if (!fs.existsSync(file)) return reply.code(404).type('text/plain').send('Nao encontrado');
  reply.header('Cache-Control', 'no-cache').type(hit[1]);
  return fs.readFileSync(file);
});

startScheduler();

app.listen({ port: config.port, host: '0.0.0.0' }).then(() => {
  console.log(`AdHunter no ar na porta ${config.port}`);
});

export default app;
