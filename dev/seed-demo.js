// Popula o banco com dados FICTICIOS so para testar o painel. Nao use em producao.
import { openDb, now } from '../src/db.js';

const db = openDb();
const t = now();
const day = 86400;

const kws = [
  ['grasa abdominal + truco + canela', 'es', 'Emagrecimento', 'MX,CO'],
  ['bajar de peso + truco + gelatina', 'es', 'Emagrecimento', ''],
  ['ganar dinero + celular + truco', 'es', 'Renda extra', 'MX,CL,PE'],
  ['actividades para adultos mayores', 'es', 'Idosos', ''],
  ['belly fat + trick + cinnamon', 'en', 'Emagrecimento', 'US'],
];
for (const [term, lang, niche, countries] of kws) {
  db.prepare(
    'INSERT OR IGNORE INTO keywords(term, lang, niche, countries, active, created_at, last_run_at, last_ads) VALUES (?, ?, ?, ?, 1, ?, ?, ?)'
  ).run(term, lang, niche, countries, t, t - 3600, 38);
}

const pages = [
  ['9001', 'Vida Ligera Oficial', 48, 63, 'vidaligera-oferta.com', 'new', ['MX', 'CO'], 0],
  ['9002', 'Metodo Cuerpo Nuevo', 31, 41, 'cuerponuevo.shop', 'new', ['MX'], 1],
  ['9003', 'Ganar Desde Casa Pro', 24, 17, 'ganardesdecasa.online', 'seen', ['CL', 'PE', 'MX'], 2],
  ['9004', 'Actividades Mayores', 19, 9, 'actividadesmayores.site', 'fav', ['MX', 'CO'], 3],
  ['9005', 'Quema Grasa Natural', 12, 28, 'quemagrasa-natural.com', 'new', ['CO'], 0],
  ['9006', 'Ingreso Facil Hoy', 7, 6, 'ingresofacil.top', 'seen', ['PE'], 2],
  ['9007', 'Salud Plena Club', 6, 3, 'saludplena.club', 'new', ['MX'], 1],
  ['9008', 'Mente Activa Senior', 5, 5, 'menteactivasenior.com', 'new', ['MX', 'CO'], 3],
  ['9009', 'Tienda Cualquiera', 2, 2, 'tiendacualquiera.com', 'discarded', ['MX'], 1],
  ['9010', 'Belly Reset Daily', 15, 22, 'bellyresetdaily.com', 'new', ['US'], 4],
];

for (const [id, name, ads, days, domain, status, countries, kwIdx] of pages) {
  db.prepare(
    `INSERT OR REPLACE INTO pages(page_id, name, profile_url, first_seen, last_seen, ads_active, ads_groups,
       oldest_start, domain, site_url, sample_text, sample_ad_id, last_deep_at, status)
     VALUES (?, ?, '', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    name,
    t - 2 * day,
    t - 600,
    ads,
    Math.max(1, Math.round(ads / 3)),
    t - days * day,
    domain,
    `https://${domain}/oferta`,
    'Descubre el truco que los medicos no quieren que sepas. Solo necesitas 5 minutos al dia y tu celular.',
    `ad-${id}-0`,
    status === 'new' ? null : t - 3600,
    status
  );
  for (const c of countries) {
    db.prepare('INSERT OR IGNORE INTO page_hits(page_id, term, country, first_seen) VALUES (?, ?, ?, ?)').run(
      id,
      kws[kwIdx][0],
      c,
      t - day
    );
  }
  for (let i = 0; i < Math.min(6, ads); i += 1) {
    db.prepare(
      `INSERT OR REPLACE INTO ads(ad_id, page_id, start_date, is_active, body, title, cta, link_url, domain, format,
         thumb_url, collation_count, first_seen, last_seen)
       VALUES (?, ?, ?, 1, ?, ?, 'Comprar', ?, ?, ?, '', ?, ?, ?)`
    ).run(
      `ad-${id}-${i}`,
      id,
      t - Math.max(1, days - i * 2) * day,
      i % 2 ? 'Gana dinero desde casa con este metodo simple. Sin experiencia, sin inversion inicial.' : 'Baja de peso con este truco de cocina. Resultados desde la primera semana.',
      i % 2 ? 'Metodo simple' : 'Truco de cocina',
      `https://${domain}/v${i}`,
      domain,
      i % 3 === 0 ? 'VIDEO' : 'IMAGE',
      1 + i * 2,
      t - day,
      t - 600
    );
  }
}

const runs = [
  ['concluida', 'agendada', 60, 60, 30, 1420, 88, 12, null, 5400],
  ['concluida', 'manual', 24, 24, 18, 610, 40, 6, null, 2300],
  ['bloqueada', 'manual', 7, 60, 0, 180, 21, 3, 'redirecionado para login/checkpoint', 700],
];
runs.forEach(([status, trigger, sd, st, dd, seen, found, fresh, error, dur], i) => {
  const started = t - (i + 1) * day;
  db.prepare(
    `INSERT INTO runs(started_at, finished_at, status, trigger, searches_done, searches_total, deep_done, ads_seen,
       pages_found, new_pages, error, log) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    started,
    started + dur,
    status,
    trigger,
    sd,
    st,
    dd,
    seen,
    found,
    fresh,
    error,
    '03:00:01  Rodada iniciada (dados de exemplo)\n03:00:14  [1/60] "grasa abdominal + truco + canela" em MX\n03:01:02    38 anuncios, 9 paginas (2 novas)'
  );
});

console.log('Dados de exemplo gravados.');
