import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractAds,
  mergeAd,
  parseTotal,
  summarizeAds,
  looksBlocked,
  hostOf,
  toEpoch,
} from '../src/parser.js';

// Fixture sintetica, montada de memoria a partir do formato conhecido das respostas
// da Biblioteca de Anuncios. NAO foi capturada do Facebook real: a primeira execucao
// de verdade precisa confirmar os nomes dos campos.
const fixture = {
  data: {
    ad_library_main: {
      search_results_connection: {
        edges: [
          {
            node: {
              collated_results: [
                {
                  ad_archive_id: '111',
                  page_id: '900',
                  page_name: 'Pagina Alfa',
                  start_date: 1760000000,
                  end_date: 1790000000,
                  is_active: true,
                  collation_count: 12,
                  snapshot: {
                    page_profile_uri: 'https://www.facebook.com/alfa',
                    body: { text: 'Baja de peso con este truco' },
                    title: 'Truco',
                    cta_text: 'Comprar',
                    link_url: 'https://l.facebook.com/l.php?u=https%3A%2F%2Fwww.alfa-oferta.com%2Fvsl%3Futm%3D1',
                    display_format: 'VIDEO',
                    videos: [{ video_preview_image_url: 'https://cdn/x.jpg' }],
                  },
                },
                {
                  ad_archive_id: '112',
                  page_id: '900',
                  page_name: 'Pagina Alfa',
                  start_date: 1755000000,
                  is_active: true,
                  collation_count: 3,
                  snapshot: {
                    body: { text: 'Otra version' },
                    link_url: 'https://alfa-oferta.com/otra',
                    cards: [{ title: 'Card', link_url: 'https://alfa-oferta.com/otra' }],
                  },
                },
              ],
            },
          },
          {
            node: {
              collated_results: [
                {
                  ad_archive_id: '222',
                  page_id: '901',
                  page_name: 'Pagina Beta',
                  start_date: 1770000000000,
                  is_active: true,
                  snapshot: {
                    body: { text: 'Gana dinero' },
                    link_url: 'https://www.facebook.com/beta',
                    caption: 'beta-ganar.com',
                  },
                },
              ],
            },
          },
        ],
      },
    },
  },
};

test('extractAds encontra anuncios aninhados e normaliza campos', () => {
  const ads = extractAds(fixture);
  assert.equal(ads.length, 3);
  const a = ads.find((x) => x.ad_id === '111');
  assert.equal(a.page_id, '900');
  assert.equal(a.domain, 'alfa-oferta.com');
  assert.equal(a.link_url, 'https://www.alfa-oferta.com/vsl?utm=1');
  assert.equal(a.collation_count, 12);
  assert.equal(a.thumb_url, 'https://cdn/x.jpg');
  assert.equal(a.body, 'Baja de peso con este truco');
});

test('dominio cai no caption quando o link e do proprio Facebook', () => {
  const ads = extractAds(fixture);
  const b = ads.find((x) => x.ad_id === '222');
  assert.equal(b.domain, 'beta-ganar.com');
  // timestamp em milissegundos vira segundos
  assert.equal(b.start_date, 1770000000);
});

test('mergeAd deduplica e mantem o maior collation_count', () => {
  const map = new Map();
  for (const ad of extractAds(fixture)) mergeAd(map, ad);
  const first = extractAds(fixture).find((x) => x.ad_id === '111');
  mergeAd(map, { ...first, collation_count: 40 });
  assert.equal(map.size, 3);
  assert.equal(map.get('111').collation_count, 40);
});

test('summarizeAds calcula ativos, mais antigo e dominio principal', () => {
  const ads = extractAds(fixture).filter((a) => a.page_id === '900');
  const s = summarizeAds(ads, null);
  assert.equal(s.ads_groups, 2);
  assert.equal(s.ads_active, 15);
  assert.equal(s.oldest_start, 1755000000);
  assert.equal(s.domain, 'alfa-oferta.com');
  const s2 = summarizeAds(ads, 99);
  assert.equal(s2.ads_active, 99);
});

test('parseTotal le numeros em pt, es e en', () => {
  assert.equal(parseTotal('~45 results'), 45);
  assert.equal(parseTotal('~1.200 resultados'), 1200);
  assert.equal(parseTotal('Aproximadamente 3,400 resultados'), 3400);
  assert.equal(parseTotal('sem contagem'), null);
});

test('looksBlocked detecta login e textos de bloqueio', () => {
  assert.ok(looksBlocked('', 'https://www.facebook.com/login/?next=x'));
  assert.ok(looksBlocked('You are temporarily blocked', 'https://www.facebook.com/ads/library'));
  assert.equal(looksBlocked('~45 results', 'https://www.facebook.com/ads/library'), null);
});

test('hostOf e toEpoch', () => {
  assert.equal(hostOf('https://www.Site.com/x'), 'site.com');
  assert.equal(hostOf('lixo'), '');
  assert.equal(toEpoch('2026-01-01T00:00:00Z'), 1767225600);
  assert.equal(toEpoch(null), null);
});
