// Guarda uma copia local das miniaturas dos criativos: os links do Facebook expiram em poucos dias.
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

const DIR = path.join(config.dataDir, 'thumbs');
const MAX_FILES = 4000;
const MAX_BYTES = 600 * 1024;
let active = 0;
const queue = [];

export function thumbPath(adId) {
  if (!/^[A-Za-z0-9_-]{3,60}$/.test(String(adId))) return null;
  return path.join(DIR, `${adId}.img`);
}

export function hasThumb(adId) {
  const p = thumbPath(adId);
  return !!p && fs.existsSync(p);
}

async function fetchOne(adId, url) {
  const p = thumbPath(adId);
  if (!p || fs.existsSync(p) || !/^https:\/\//i.test(url)) return;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 15000);
  try {
    const res = await fetch(url, { signal: ctl.signal, headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!res.ok) return;
    const type = String(res.headers.get('content-type') || '');
    if (!type.startsWith('image/')) return;
    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length || buf.length > MAX_BYTES) return;
    fs.mkdirSync(DIR, { recursive: true });
    fs.writeFileSync(p, buf);
    fs.writeFileSync(p + '.type', type.split(';')[0]);
  } catch {
    /* miniatura indisponivel: segue sem ela */
  } finally {
    clearTimeout(timer);
  }
}

function pump() {
  while (active < 3 && queue.length) {
    const job = queue.shift();
    active += 1;
    fetchOne(job.adId, job.url).finally(() => {
      active -= 1;
      pump();
    });
  }
}

// ads: [{ad_id, thumb_url}]. Nao bloqueia quem chama.
export function cacheThumbs(ads, limit = 12) {
  let n = 0;
  for (const a of ads) {
    if (n >= limit) break;
    if (a.thumb_url && a.ad_id && !hasThumb(a.ad_id)) {
      queue.push({ adId: a.ad_id, url: a.thumb_url });
      n += 1;
    }
  }
  pump();
  cleanup();
}

let lastCleanup = 0;
function cleanup() {
  if (Date.now() - lastCleanup < 3600 * 1000) return;
  lastCleanup = Date.now();
  try {
    if (!fs.existsSync(DIR)) return;
    const files = fs
      .readdirSync(DIR)
      .filter((f) => f.endsWith('.img'))
      .map((f) => ({ f, t: fs.statSync(path.join(DIR, f)).mtimeMs }))
      .sort((a, b) => b.t - a.t);
    for (const old of files.slice(MAX_FILES)) {
      fs.rmSync(path.join(DIR, old.f), { force: true });
      fs.rmSync(path.join(DIR, old.f + '.type'), { force: true });
    }
  } catch { /* limpeza e opcional */ }
}

export function readThumb(adId) {
  const p = thumbPath(adId);
  if (!p || !fs.existsSync(p)) return null;
  let type = 'image/jpeg';
  try {
    const t = fs.readFileSync(p + '.type', 'utf8');
    if (/^image\/[a-z0-9.+-]+$/i.test(t)) type = t;
  } catch { /* usa jpeg */ }
  return { data: fs.readFileSync(p), type };
}
