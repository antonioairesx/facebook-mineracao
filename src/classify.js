// Classifica o tipo de oferta pelo link de destino e texto do anuncio (sem visitar o site)
// e calcula o placar da pagina. Heuristica: serve para triar, nao e verdade absoluta.
import { norm } from './terms.js';

export const OFFER_LABEL = {
  checkout: 'Checkout direto',
  vsl: 'VSL',
  quiz: 'Quiz',
  vendas: 'Página de vendas',
  loja: 'Loja',
  whatsapp: 'WhatsApp/Telegram',
  linkhub: 'Linktree e similares',
  app: 'App',
  interno: 'Facebook/Instagram',
};

const PRIORITY = ['checkout', 'vsl', 'quiz', 'vendas', 'loja', 'whatsapp', 'linkhub', 'app', 'interno'];

const LINKHUB_HOST = /(^|\.)(linktr\.ee|linktree\.com|beacons\.ai|bio\.link|linkin\.bio|lnk\.bio|taplink\.(cc|at)|allmylinks\.com|campsite\.bio|solo\.to|linkr\.bio|hoo\.be|direct\.me|bio\.site|carrd\.co|stan\.store|msha\.ke|lnk\.to|linkpop\.com|withkoji\.com|tap\.bio|link\.bio|biolink\.[a-z.]+|linkfly\.[a-z.]+|bio\.fm|manylink\.co|many\.link|wa\.link|chat\.whatsapp\.com|t\.me|telegram\.me|telegram\.dog)$/i;
const CHECKOUT_HOST = /(hotmart|kiwify|eduzz|monetizze|cartpanda|clickbank|buygoods|digistore24|cakto|payt\.|ticto|perfectpay|greenn|yampi|lastlink|doppus|braip|appmax|sunize|checkout|pay\.|pagar|stripe\.com|paypal)/i;
const CHECKOUT_PATH = /\/(checkout|pay|payment|buy|order|cart|comprar|pagar|carrito)(\/|$|\?|-)/i;
const VSL_PATH = /(\/vsl|\/video|\/watch|\/v\/|vsl[-_.]|\/webinar|\/masterclass|\/clase|\/presentacion)/i;
const VSL_HOST = /(^|[.-])vsl([.-]|$)/i;
const QUIZ_PATH = /(\/quiz|\/test(?!imon)|\/quizz|\/funnel|\/survey|\/encuesta|\/cuestionario|\/diagnostico|\/assessment|\/start|\/q\/|\/pregunta)/i;
const QUIZ_HOST = /(quiz|funnel)/i;
const SHOP_HOST = /(myshopify\.com|shopify|tiendanube|nuvemshop|woocommerce|mercadoshops|tienda|store|shop)/i;
const SHOP_PATH = /\/(products?|collections?|producto|productos|shop|tienda|store)(\/|$)/i;
const VSL_TEXT = /(mira este video|mira el video|ve este video|watch this video|watch the video|video gratis|video gratuito|antes de que lo eliminen|presentacion gratuita|clase gratuita)/;
const QUIZ_TEXT = /(haz el test|haz este test|responde|test gratis|descubre tu|take the quiz|quiz|contesta estas|cuestionario|evalua tu)/;

export function classifyAd(ad) {
  const url = String(ad.link_url || '');
  let host = String(ad.domain || '').toLowerCase();
  let path = '';
  try {
    const u = new URL(url);
    if (!host) host = u.hostname.toLowerCase();
    path = u.pathname + u.search;
  } catch { /* sem url valida */ }
  const cta = norm(ad.cta);
  const text = norm([ad.body, ad.title].filter(Boolean).join(' '));

  if (/wa\.me|api\.whatsapp\.com|whatsapp\.com|wa\.link|(^|\.)t\.me$|telegram\.(me|dog)$/.test(host) || /whatsapp|telegram/.test(cta)) return 'whatsapp';
  if (LINKHUB_HOST.test(host)) return 'linkhub';
  if (/(^|\.)m\.me$/.test(host) || /messenger/.test(cta)) return 'interno';
  if (/play\.google\.com|apps\.apple\.com|itunes\.apple\.com/.test(host)) return 'app';
  if (!host) return url ? 'interno' : '';
  if (/(^|\.)(facebook|instagram|fb)\.com$/.test(host)) return 'interno';
  if (CHECKOUT_HOST.test(host) || CHECKOUT_PATH.test(path)) return 'checkout';
  if (VSL_HOST.test(host) || VSL_PATH.test(path) || VSL_TEXT.test(text)) return 'vsl';
  if (QUIZ_HOST.test(host) || QUIZ_PATH.test(path) || QUIZ_TEXT.test(text)) return 'quiz';
  if (SHOP_HOST.test(host) || SHOP_PATH.test(path)) return 'loja';
  return 'vendas';
}

export function classifyPage(ads) {
  const count = new Map();
  for (const a of ads) {
    const t = a.offer_type !== undefined ? a.offer_type : classifyAd(a);
    if (t) count.set(t, (count.get(t) || 0) + 1);
  }
  let best = '';
  let bestN = 0;
  for (const t of PRIORITY) {
    const n = count.get(t) || 0;
    if (n > bestN) {
      best = t;
      bestN = n;
    }
  }
  return best;
}

const OFFER_POINTS = { checkout: 10, vsl: 10, quiz: 10, vendas: 6, loja: 4, whatsapp: 1, linkhub: 1 };

// 0 a 100. Pesos: anuncios ativos 35, dias 25, criativos distintos 15, novos nos ultimos 7 dias 10,
// tipo de oferta 10, site identificado 5.
export function scorePage({ ads_active, ads_groups, days, new7, offer_type, domain }) {
  const clamp = (v) => Math.max(0, Math.min(1, v));
  const pts =
    clamp((ads_active || 0) / 30) * 35 +
    clamp((days || 0) / 60) * 25 +
    clamp((ads_groups || 0) / 15) * 15 +
    clamp((new7 || 0) / 5) * 10 +
    (OFFER_POINTS[offer_type] || 0) +
    (domain ? 5 : 0);
  return Math.round(pts);
}

export const SCALE_DELTA = 3;
export const SCALE_NEW7 = 5;
export function isScaling(delta, new7) {
  return (delta !== null && delta !== undefined && delta >= SCALE_DELTA) || (new7 || 0) >= SCALE_NEW7;
}
