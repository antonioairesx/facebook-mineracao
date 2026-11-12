// Traducao de palavras-chave sem custo: endpoint gratuito do Google Translate (sem chave) e,
// se falhar, o MyMemory. Termos "a + b + c" sao traduzidos parte por parte e remontados.
import { termParts } from './terms.js';

const GT = { zh: 'zh-CN', he: 'iw', fil: 'tl' };
const gt = (c) => GT[c] || c;

async function viaGoogle(text, from, to) {
  const url = 'https://translate.googleapis.com/translate_a/single?client=gtx&dt=t&sl=' + encodeURIComponent(gt(from)) +
    '&tl=' + encodeURIComponent(gt(to)) + '&q=' + encodeURIComponent(text);
  const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
  if (!res.ok) throw new Error('google ' + res.status);
  const j = await res.json();
  const out = (j[0] || []).map((s) => s[0]).join('').trim();
  if (!out) throw new Error('google vazio');
  return out;
}

async function viaMyMemory(text, from, to) {
  const url = 'https://api.mymemory.translated.net/get?q=' + encodeURIComponent(text) + '&langpair=' + encodeURIComponent(gt(from) + '|' + gt(to));
  const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
  if (!res.ok) throw new Error('mymemory ' + res.status);
  const j = await res.json();
  const out = j && j.responseData && j.responseData.translatedText;
  if (!out || j.quotaFinished) throw new Error('mymemory sem resultado');
  return String(out).trim();
}

export async function translatePart(text, from, to) {
  try {
    return await viaGoogle(text, from, to);
  } catch {
    return await viaMyMemory(text, from, to);
  }
}

// devolve o termo traduzido, mantendo o formato "a + b + c"
export async function translateTerm(term, from, to) {
  const parts = termParts(term);
  const out = [];
  for (const p of parts) {
    const t = await translatePart(p, from, to);
    out.push(t.toLowerCase().replace(/\s+/g, ' ').trim());
  }
  return out.join(' + ');
}
