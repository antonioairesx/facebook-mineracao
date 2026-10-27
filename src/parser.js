// Extrai anuncios das respostas internas (GraphQL) e do HTML da Biblioteca de Anuncios.
// O formato nao e uma API publica: o parser e tolerante e procura qualquer objeto
// que tenha "ad_archive_id", em qualquer profundidade.

const IGNORED_HOSTS = /(^|\.)(facebook\.com|fb\.com|fb\.me|instagram\.com|messenger\.com|fbcdn\.net|meta\.com)$/i;

export function toEpoch(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return v > 1e12 ? Math.floor(v / 1000) : Math.floor(v);
  const t = Date.parse(String(v));
  return Number.isNaN(t) ? null : Math.floor(t / 1000);
}

export function hostOf(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return '';
  try {
    let u = new URL(rawUrl);
    // links de saida do Facebook: l.facebook.com/l.php?u=<destino>
    if (/^l\.facebook\.com$/i.test(u.hostname) && u.searchParams.get('u')) {
      u = new URL(u.searchParams.get('u'));
    }
    return u.hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

export function realUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return '';
  try {
    const u = new URL(rawUrl);
    if (/^l\.facebook\.com$/i.test(u.hostname) && u.searchParams.get('u')) {
      return new URL(u.searchParams.get('u')).toString();
    }
    return u.toString();
  } catch {
    return '';
  }
}

export function isExternalHost(host) {
  return !!host && !IGNORED_HOSTS.test(host);
}

function firstString(...vals) {
  for (const v of vals) {
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return '';
}

export function normalizeAd(o) {
  const snap = o.snapshot && typeof o.snapshot === 'object' ? o.snapshot : {};
  const cards = Array.isArray(snap.cards) ? snap.cards : [];
  const card0 = cards[0] || {};
  const body = firstString(
    snap.body && snap.body.text,
    typeof snap.body === 'string' ? snap.body : '',
    card0.body,
    o.body && o.body.text
  );
  const title = firstString(snap.title, card0.title, o.title);
  const cta = firstString(snap.cta_text, card0.cta_text);
  const linkRaw = firstString(snap.link_url, card0.link_url, o.link_url);
  const link = realUrl(linkRaw);
  let host = hostOf(linkRaw);
  if (!isExternalHost(host)) {
    // alguns anuncios trazem o dominio exibido em "caption"
    const caption = firstString(snap.caption, card0.caption).toLowerCase();
    if (/^[a-z0-9.-]+\.[a-z]{2,}$/.test(caption)) host = caption.replace(/^www\./, '');
  }
  const images = Array.isArray(snap.images) ? snap.images : [];
  const videos = Array.isArray(snap.videos) ? snap.videos : [];
  const thumb = firstString(
    images[0] && (images[0].resized_image_url || images[0].original_image_url),
    videos[0] && videos[0].video_preview_image_url,
    card0.resized_image_url,
    card0.original_image_url
  );
  const pageId = String(o.page_id || snap.page_id || '');
  const collation = Number(o.collation_count);
  return {
    ad_id: String(o.ad_archive_id),
    page_id: pageId,
    page_name: firstString(o.page_name, snap.page_name),
    page_profile_uri: firstString(snap.page_profile_uri),
    start_date: toEpoch(o.start_date),
    end_date: toEpoch(o.end_date),
    is_active: o.is_active === false ? 0 : 1,
    body,
    title,
    cta,
    link_url: link,
    domain: isExternalHost(host) ? host : '',
    format: firstString(snap.display_format),
    thumb_url: thumb,
    collation_count: Number.isFinite(collation) && collation > 0 ? collation : 1,
  };
}

export function mergeAd(map, ad) {
  if (!ad.ad_id || !ad.page_id) return;
  const prev = map.get(ad.ad_id);
  if (!prev) {
    map.set(ad.ad_id, ad);
    return;
  }
  for (const k of Object.keys(ad)) {
    if (k === 'collation_count') prev[k] = Math.max(prev[k] || 1, ad[k] || 1);
    else if (!prev[k] && ad[k]) prev[k] = ad[k];
  }
}

export function extractAds(root, out = []) {
  const stack = [[root, 0]];
  while (stack.length) {
    const [node, depth] = stack.pop();
    if (!node || typeof node !== 'object' || depth > 60) continue;
    if (Array.isArray(node)) {
      for (const item of node) stack.push([item, depth + 1]);
      continue;
    }
    if (node.ad_archive_id) {
      try {
        out.push(normalizeAd(node));
      } catch {
        /* ignora objeto malformado */
      }
    }
    for (const key of Object.keys(node)) {
      const v = node[key];
      if (v && typeof v === 'object') stack.push([v, depth + 1]);
    }
  }
  return out;
}

// "~1.200 resultados", "~45 results", "45 resultados"
export function parseTotal(text) {
  if (!text) return null;
  const m = String(text).match(/~?\s*([\d][\d.,]*)\s*(?:resultados?|results?)\b/i);
  if (!m) return null;
  const n = parseInt(m[1].replace(/[.,]/g, ''), 10);
  return Number.isFinite(n) ? n : null;
}

export function looksBlocked(text, url) {
  const t = String(text || '').toLowerCase();
  const u = String(url || '').toLowerCase();
  if (u.includes('/login') || u.includes('/checkpoint')) return 'redirecionado para login/checkpoint';
  const signs = [
    'temporarily blocked',
    'you’re temporarily restricted',
    "you're temporarily restricted",
    'temporariamente bloqueado',
    'temporariamente impedido',
    'bloqueado temporalmente',
    'rate limit',
    'please log in to continue',
    'faca login para continuar',
    'inicia sesion para continuar',
  ];
  for (const s of signs) if (t.includes(s)) return `texto de bloqueio na pagina: "${s}"`;
  return null;
}

// Resumo de um conjunto de anuncios de uma mesma pagina
export function summarizeAds(ads, totalText = null) {
  const ids = new Set(ads.map((a) => a.ad_id));
  const groups = ids.size;
  let sum = 0;
  for (const a of ads) sum += a.collation_count || 1;
  const estimated = Math.max(groups, sum, totalText || 0);
  let oldest = null;
  const hostCount = new Map();
  const urlByHost = new Map();
  for (const a of ads) {
    if (a.start_date && (oldest === null || a.start_date < oldest)) oldest = a.start_date;
    if (a.domain) {
      hostCount.set(a.domain, (hostCount.get(a.domain) || 0) + (a.collation_count || 1));
      if (!urlByHost.has(a.domain) && a.link_url) urlByHost.set(a.domain, a.link_url);
    }
  }
  let topHost = '';
  let best = 0;
  for (const [h, c] of hostCount) {
    if (c > best) {
      best = c;
      topHost = h;
    }
  }
  return {
    ads_active: estimated,
    ads_groups: groups,
    oldest_start: oldest,
    domain: topHost,
    site_url: topHost ? urlByHost.get(topHost) || '' : '',
  };
}
