// Paises da Biblioteca de Anuncios (codigo ISO, nome em portugues). "ALL" = mundo todo.
import { norm } from './terms.js';

export const COUNTRIES = [
  ['ALL', 'Mundo todo'],
  ['AR', 'Argentina'], ['BO', 'Bolívia'], ['BR', 'Brasil'], ['CL', 'Chile'], ['CO', 'Colômbia'], ['CR', 'Costa Rica'],
  ['CU', 'Cuba'], ['DO', 'República Dominicana'], ['EC', 'Equador'], ['SV', 'El Salvador'], ['GT', 'Guatemala'],
  ['HN', 'Honduras'], ['MX', 'México'], ['NI', 'Nicarágua'], ['PA', 'Panamá'], ['PY', 'Paraguai'], ['PE', 'Peru'],
  ['PR', 'Porto Rico'], ['UY', 'Uruguai'], ['VE', 'Venezuela'], ['JM', 'Jamaica'], ['TT', 'Trinidad e Tobago'],
  ['US', 'Estados Unidos'], ['CA', 'Canadá'], ['GB', 'Reino Unido'], ['IE', 'Irlanda'], ['AU', 'Austrália'],
  ['NZ', 'Nova Zelândia'], ['ES', 'Espanha'], ['PT', 'Portugal'], ['FR', 'França'], ['DE', 'Alemanha'],
  ['IT', 'Itália'], ['NL', 'Países Baixos'], ['BE', 'Bélgica'], ['CH', 'Suíça'], ['AT', 'Áustria'], ['SE', 'Suécia'],
  ['NO', 'Noruega'], ['DK', 'Dinamarca'], ['FI', 'Finlândia'], ['PL', 'Polônia'], ['CZ', 'Tchéquia'], ['RO', 'Romênia'],
  ['GR', 'Grécia'], ['HU', 'Hungria'], ['BG', 'Bulgária'], ['HR', 'Croácia'], ['RS', 'Sérvia'], ['UA', 'Ucrânia'],
  ['RU', 'Rússia'], ['TR', 'Turquia'], ['IL', 'Israel'], ['AE', 'Emirados Árabes'], ['SA', 'Arábia Saudita'],
  ['QA', 'Catar'], ['KW', 'Kuwait'], ['EG', 'Egito'], ['MA', 'Marrocos'], ['DZ', 'Argélia'], ['TN', 'Tunísia'],
  ['NG', 'Nigéria'], ['GH', 'Gana'], ['KE', 'Quênia'], ['ZA', 'África do Sul'], ['AO', 'Angola'], ['MZ', 'Moçambique'],
  ['IN', 'Índia'], ['PK', 'Paquistão'], ['BD', 'Bangladesh'], ['ID', 'Indonésia'], ['MY', 'Malásia'],
  ['SG', 'Singapura'], ['TH', 'Tailândia'], ['VN', 'Vietnã'], ['PH', 'Filipinas'], ['JP', 'Japão'],
  ['KR', 'Coreia do Sul'], ['TW', 'Taiwan'], ['HK', 'Hong Kong'], ['CN', 'China'],
];

const ALIASES = {
  EUA: 'US', USA: 'US', 'ESTADOS UNIDOS DA AMERICA': 'US', AMERICA: 'US', UK: 'GB', INGLATERRA: 'GB',
  HOLANDA: 'NL', MUNDO: 'ALL', GLOBAL: 'ALL', TODOS: 'ALL', WORLD: 'ALL', 'TODOS OS PAISES': 'ALL',
};

function lev(a, b) {
  const m = a.length, n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}

const INDEX = COUNTRIES.map(([code, name]) => ({ code, name, key: norm(name).toUpperCase() }));

// Aceita sigla (mx), nome (mexico, México) ou nome com erro de digitacao (mexcio). Devolve {code, name} ou null.
export function resolveCountry(input) {
  const raw = String(input || '').trim();
  if (!raw) return null;
  const key = norm(raw).toUpperCase();
  if (ALIASES[key]) {
    const c = INDEX.find((x) => x.code === ALIASES[key]);
    return { code: c.code, name: c.name };
  }
  if (/^[A-Z]{2}$/.test(key) || key === 'ALL') {
    const c = INDEX.find((x) => x.code === key);
    if (c) return { code: c.code, name: c.name };
  }
  let hit = INDEX.find((x) => x.key === key);
  if (!hit && key.length >= 3) {
    const starts = INDEX.filter((x) => x.key.startsWith(key));
    if (starts.length === 1) hit = starts[0];
  }
  if (!hit && key.length >= 4) {
    let best = null;
    let bestD = 99;
    for (const x of INDEX) {
      const d = lev(key, x.key);
      if (d < bestD) { bestD = d; best = x; }
    }
    if (best && bestD <= Math.max(1, Math.floor(best.key.length / 3))) hit = best;
  }
  return hit ? { code: hit.code, name: hit.name } : null;
}
