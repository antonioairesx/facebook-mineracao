// Quebra "bajar de peso + truco + gelatina" em partes e decide o que vai para a busca
// e o que vira filtro no texto do anuncio (modo "larga").

export function termParts(term) {
  return String(term || '')
    .split('+')
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

// mode 'wide': busca pelas 2 primeiras partes e filtra as demais no texto. 'exact': busca tudo.
export function splitTerm(term, mode = 'wide') {
  const parts = termParts(term);
  if (mode !== 'wide' || parts.length < 3) return { query: parts.join(' '), filters: [] };
  return { query: parts.slice(0, 2).join(' '), filters: parts.slice(2) };
}

export function norm(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

// o anuncio precisa conter TODAS as partes de filtro (sem acento, sem maiuscula)
export function matchesAll(ad, filters) {
  if (!filters.length) return true;
  const hay = norm([ad.body, ad.title, ad.cta].filter(Boolean).join(' '));
  return filters.every((f) => hay.includes(norm(f)));
}
