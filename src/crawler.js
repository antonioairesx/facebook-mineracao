import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { config } from './config.js';
import { extractAds, mergeAd, parseTotal, looksBlocked } from './parser.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const rnd = (a, b) => a + Math.random() * (b - a);

const LIB = 'https://www.facebook.com/ads/library/';

export function searchUrl(term, country) {
  const q = term.replace(/\s*\+\s*/g, ' ').replace(/\s+/g, ' ').trim();
  const p = new URLSearchParams({
    active_status: 'active',
    ad_type: 'all',
    country,
    is_targeted_country: 'false',
    media_type: 'all',
    q,
    search_type: 'keyword_unordered',
  });
  return `${LIB}?${p.toString()}`;
}

export function pageUrl(pageId) {
  const p = new URLSearchParams({
    active_status: 'active',
    ad_type: 'all',
    country: 'ALL',
    is_targeted_country: 'false',
    media_type: 'all',
    search_type: 'page',
    view_all_page_id: String(pageId),
  });
  return `${LIB}?${p.toString()}`;
}

export function adLink(adId) {
  return `${LIB}?id=${encodeURIComponent(adId)}`;
}

export function pageLibraryLink(pageId) {
  return pageUrl(pageId);
}

let installing = null;

// Se o navegador nao estiver na maquina (build fora do Dockerfile), instala sozinho uma vez.
async function installChromium(log) {
  if (!installing) {
    if (log) log('Navegador não encontrado. Instalando o Chromium (1 a 3 minutos, só desta vez)...');
    const cli = path.join(ROOT, 'node_modules', 'playwright', 'cli.js');
    installing = new Promise((resolve, reject) => {
      execFile(process.execPath, [cli, 'install', '--with-deps', 'chromium'], { cwd: ROOT, timeout: 15 * 60 * 1000, env: process.env, maxBuffer: 20 * 1024 * 1024 }, (err, stdout, stderr) => {
        if (err) reject(new Error('Falha ao instalar o Chromium: ' + String(stderr || err.message).split('\n').filter(Boolean).slice(-2).join(' ')));
        else resolve();
      });
    }).finally(() => { installing = null; });
  }
  return installing;
}

export async function launchWithInstall(launch, log) {
  try {
    return await launch();
  } catch (err) {
    if (!/Executable doesn't exist|browserType\.launch/i.test(String(err && err.message))) throw err;
    await installChromium(log);
    return launch();
  }
}

export async function openBrowser(log) {
  const profileDir = path.join(config.dataDir, 'profile');
  fs.mkdirSync(profileDir, { recursive: true });
  const opts = {
    headless: config.headless,
    locale: 'en-US',
    viewport: { width: 1366, height: 900 },
    args: [
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--disable-blink-features=AutomationControlled',
    ],
  };
  if (config.proxyServer) {
    opts.proxy = { server: config.proxyServer };
    if (config.proxyUser) opts.proxy.username = config.proxyUser;
    if (config.proxyPass) opts.proxy.password = config.proxyPass;
  }
  return launchWithInstall(() => chromium.launchPersistentContext(profileDir, opts), log);
}

async function dismissDialogs(page) {
  const cookieButtons = [
    /decline optional cookies/i,
    /rechazar cookies opcionales/i,
    /recusar cookies opcionais/i,
    /only allow essential cookies/i,
    /permitir solo las cookies esenciales/i,
    /permitir somente cookies essenciais/i,
  ];
  for (const name of cookieButtons) {
    const btn = page.getByRole('button', { name }).first();
    if (await btn.isVisible({ timeout: 400 }).catch(() => false)) {
      await btn.click({ timeout: 2000 }).catch(() => {});
      await sleep(700);
      break;
    }
  }
  const closers = ['Close', 'Cerrar', 'Fechar'];
  for (const label of closers) {
    const btn = page.locator(`div[role="dialog"] [aria-label="${label}"]`).first();
    if (await btn.isVisible({ timeout: 300 }).catch(() => false)) {
      await btn.click({ timeout: 2000 }).catch(() => {});
      await sleep(500);
      break;
    }
  }
}

function debugDir() {
  const d = path.join(config.dataDir, 'debug');
  fs.mkdirSync(d, { recursive: true });
  // guarda so os 40 arquivos mais recentes
  const files = fs
    .readdirSync(d)
    .map((f) => ({ f, t: fs.statSync(path.join(d, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  for (const old of files.slice(40)) fs.rmSync(path.join(d, old.f), { force: true });
  return d;
}

async function saveDebug(page, tag, sample) {
  try {
    const d = debugDir();
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const base = `${stamp}-${tag}`.replace(/[^a-zA-Z0-9_-]/g, '_');
    await page.screenshot({ path: path.join(d, `${base}.png`), fullPage: false }).catch(() => {});
    if (sample) fs.writeFileSync(path.join(d, `${base}.json`), sample.slice(0, 400000));
    return `${base}.png`;
  } catch {
    return null;
  }
}

/**
 * Abre uma URL da Biblioteca, rola a pagina e devolve os anuncios capturados.
 * Retorna { ads, total, blocked, debugFile }.
 */
export async function collect(context, url, { scrolls, shouldStop, log, tag }) {
  const page = await context.newPage();
  const found = new Map();
  let graphqlResponses = 0;
  let biggestGraphql = '';
  let sampleWithAds = '';

  const onResponse = async (res) => {
    try {
      if (!res.url().includes('/api/graphql')) return;
      graphqlResponses += 1;
      const text = await res.text();
      if (text.length > biggestGraphql.length) biggestGraphql = text;
      if (!text.includes('ad_archive_id')) return;
      if (!sampleWithAds) sampleWithAds = text;
      for (const line of text.split('\n')) {
        const s = line.trim();
        if (!s || s[0] !== '{') continue;
        try {
          for (const ad of extractAds(JSON.parse(s))) mergeAd(found, ad);
        } catch {
          /* linha que nao e JSON */
        }
      }
    } catch {
      /* resposta descartada pelo navegador */
    }
  };
  page.on('response', onResponse);

  let total = null;
  let blocked = null;
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(rnd(2500, 4500));
    await dismissDialogs(page);
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});

    // primeiro lote costuma vir embutido no HTML
    const blobs = await page
      .$$eval('script[type="application/json"]', (els) =>
        els.map((e) => e.textContent || '').filter((t) => t.includes('ad_archive_id'))
      )
      .catch(() => []);
    for (const b of blobs) {
      try {
        for (const ad of extractAds(JSON.parse(b))) mergeAd(found, ad);
      } catch {
        /* ignora */
      }
    }

    const bodyText = await page
      .evaluate(() => (document.body ? document.body.innerText.slice(0, 6000) : ''))
      .catch(() => '');
    blocked = looksBlocked(bodyText, page.url());
    total = parseTotal(bodyText);

    if (!blocked) {
      let stale = 0;
      let last = found.size;
      for (let i = 0; i < scrolls && !shouldStop(); i += 1) {
        if (Math.random() < 0.5) {
          const part = rnd(0.5, 0.9);
          await page.evaluate((f) => window.scrollBy(0, window.innerHeight * f), part).catch(() => {});
          await sleep(rnd(500, 1300));
        }
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)).catch(() => {});
        await sleep(rnd(1800, 3500));
        await page.waitForLoadState('networkidle', { timeout: 6000 }).catch(() => {});
        if (found.size === last) {
          stale += 1;
          if (stale >= 2) break;
        } else {
          stale = 0;
          last = found.size;
        }
      }
      const after = await page
        .evaluate(() => (document.body ? document.body.innerText.slice(0, 6000) : ''))
        .catch(() => '');
      if (total === null) total = parseTotal(after);
    }

    let debugFile = null;
    if (blocked || found.size === 0) {
      debugFile = await saveDebug(page, `${tag}-${blocked ? 'bloqueio' : 'vazio'}`, sampleWithAds || biggestGraphql);
      log(
        `  diagnostico salvo: ${debugFile} (respostas graphql: ${graphqlResponses}, ads: ${found.size})`
      );
    }
    return { ads: [...found.values()], total, blocked, debugFile };
  } catch (err) {
    const debugFile = await saveDebug(page, `${tag}-erro`, biggestGraphql);
    log(`  erro ao abrir a pagina: ${String(err.message || err).split('\n')[0]}`);
    return { ads: [...found.values()], total, blocked: null, debugFile, error: String(err.message || err) };
  } finally {
    page.off('response', onResponse);
    await page.close().catch(() => {});
  }
}
