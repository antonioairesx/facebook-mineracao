// Relatorio diario em PDF (renderizado pelo Chromium) com as paginas novas que passam no criterio
// e as que estao escalando.
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { config } from './config.js';
import { openDb, now, getSettings, setSettings, num } from './db.js';
import { OFFER_LABEL, isScaling } from './classify.js';
import { pageLibraryLink, launchWithInstall } from './crawler.js';

export const REPORT_DIR = path.join(config.dataDir, 'reports');
const NAME_RE = /^relatorio-\d{4}-\d{2}-\d{2}(-\d{4})?\.pdf$/;
export const isReportName = (n) => NAME_RE.test(String(n));

const esc = (v) =>
  String(v === null || v === undefined ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function localDate(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: config.timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

function collect(days) {
  const d = openDb();
  const st = getSettings();
  const t = now();
  const rows = d
    .prepare(
      `SELECT p.page_id, p.name, p.domain, p.site_url, p.ads_active, p.offer_type, p.score, p.first_seen,
         CAST((? - p.oldest_start) / 86400 AS INTEGER) AS days,
         (SELECT COUNT(*) FROM ads a WHERE a.page_id = p.page_id AND a.is_active = 1 AND a.start_date >= ? - 604800) AS new7,
         p.ads_active - (SELECT s.ads_active FROM page_snapshots s WHERE s.page_id = p.page_id AND s.at <= ? - 72000
                         ORDER BY ABS(s.at - (? - 604800)) ASC LIMIT 1) AS delta
       FROM pages p WHERE p.status != 'discarded' AND p.oldest_start IS NOT NULL`
    )
    .all(t, t, t, t);
  const minAds = num(st, 'min_ads');
  const minDays = num(st, 'min_days');
  const ok = (r) => r.ads_active >= minAds && r.days >= minDays;
  const fresh = rows.filter((r) => ok(r) && r.first_seen >= t - days * 86400).sort((a, b) => b.score - a.score).slice(0, 60);
  const scaling = rows.filter((r) => ok(r) && isScaling(r.delta, r.new7)).sort((a, b) => (b.delta || 0) - (a.delta || 0) || b.score - a.score).slice(0, 30);
  return { fresh, scaling, minAds, minDays, days };
}

function table(rows, withDelta) {
  if (!rows.length) return '<p class="none">Nenhuma página nesta lista.</p>';
  const head = `<tr><th>Página</th><th>Placar</th><th>Anúncios</th><th>Dias</th><th>Oferta</th>${withDelta ? '<th>Escala</th>' : ''}<th>Site</th></tr>`;
  const body = rows
    .map(
      (r) => `<tr><td><a href="${esc(pageLibraryLink(r.page_id))}">${esc(r.name || r.page_id)}</a></td>
      <td class="n">${r.score}</td><td class="n">${r.ads_active}</td><td class="n">${r.days}</td>
      <td>${esc(OFFER_LABEL[r.offer_type] || '')}</td>
      ${withDelta ? `<td class="n">${r.delta !== null && r.delta > 0 ? '+' + r.delta + ' anúncios' : ''}${r.new7 ? (r.delta > 0 ? ', ' : '') + r.new7 + ' novos em 7 dias' : ''}</td>` : ''}
      <td>${esc(r.domain || '')}</td></tr>`
    )
    .join('');
  return `<table>${head}${body}</table>`;
}

export function renderHtml(days) {
  const c = collect(days);
  const title = days === 1 ? 'Relatório diário' : `Relatório dos últimos ${days} dias`;
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${title}</title><style>
  body{font-family:Arial,Helvetica,sans-serif;color:#142033;margin:0;padding:28px 32px;font-size:11px}
  h1{font-size:22px;margin:0 0 4px} h1 span{color:#1572e8} h2{font-size:14px;margin:26px 0 8px}
  .sub{color:#5b6b82;margin:0 0 6px}
  table{width:100%;border-collapse:collapse} th,td{text-align:left;padding:6px 8px;border-bottom:1px solid #dfe6f0;vertical-align:top}
  th{font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:#5b6b82} td.n{white-space:nowrap}
  a{color:#1572e8;text-decoration:none} .none{color:#5b6b82}
  </style></head><body>
  <h1>Ad<span>Hunter</span> · ${title}</h1>
  <p class="sub">Gerado em ${new Intl.DateTimeFormat('pt-BR', { timeZone: config.timezone, dateStyle: 'long', timeStyle: 'short' }).format(new Date())}. Critério: ${c.minAds}+ anúncios ativos e ${c.minDays}+ dias.</p>
  <h2>Novas páginas que passam no critério (${c.fresh.length})</h2>${table(c.fresh, false)}
  <h2>Escalando agora (${c.scaling.length})</h2>
  <p class="sub">Ganharam anúncios desde a última leitura ou lançaram 5 ou mais anúncios nos últimos 7 dias.</p>${table(c.scaling, true)}
  </body></html>`;
}

export async function renderPdf(days) {
  const html = renderHtml(days);
  const browser = await launchWithInstall(() => chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] }));
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load' });
    return await page.pdf({ format: 'A4', printBackground: true, margin: { top: '12mm', bottom: '12mm', left: '8mm', right: '8mm' } });
  } finally {
    await browser.close().catch(() => {});
  }
}

export async function saveDailyReport() {
  const buf = await renderPdf(1);
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const name = `relatorio-${localDate()}.pdf`;
  fs.writeFileSync(path.join(REPORT_DIR, name), buf);
  const files = fs.readdirSync(REPORT_DIR).filter(isReportName).sort().reverse();
  for (const old of files.slice(45)) fs.rmSync(path.join(REPORT_DIR, old), { force: true });
  setSettings({ last_report_date: localDate() });
  return name;
}

export function listReports() {
  if (!fs.existsSync(REPORT_DIR)) return [];
  return fs
    .readdirSync(REPORT_DIR)
    .filter(isReportName)
    .sort()
    .reverse()
    .slice(0, 30)
    .map((name) => ({ name, size: fs.statSync(path.join(REPORT_DIR, name)).size, mtime: Math.floor(fs.statSync(path.join(REPORT_DIR, name)).mtimeMs / 1000) }));
}
