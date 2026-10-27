import test from 'node:test';
import assert from 'node:assert/strict';
import { splitTerm, matchesAll, termParts } from '../src/terms.js';
import { classifyAd, classifyPage, scorePage, isScaling } from '../src/classify.js';

test('busca larga usa as 2 primeiras partes e filtra o resto', () => {
  const s = splitTerm('bajar de peso + truco + gelatina', 'wide');
  assert.equal(s.query, 'bajar de peso truco');
  assert.deepEqual(s.filters, ['gelatina']);
  const e = splitTerm('bajar de peso + truco + gelatina', 'exact');
  assert.equal(e.query, 'bajar de peso truco gelatina');
  assert.deepEqual(e.filters, []);
  assert.deepEqual(splitTerm('adelgazar + truco', 'wide').filters, []);
  assert.deepEqual(termParts(' a +  b+c '), ['a', 'b', 'c']);
});

test('filtro de texto ignora acento e maiuscula', () => {
  assert.equal(matchesAll({ body: 'Truco con GELATINA para ti' }, ['gelatina']), true);
  assert.equal(matchesAll({ body: 'Té de limón' }, ['limon']), true);
  assert.equal(matchesAll({ body: 'nada' }, ['limon']), false);
});

test('classifica ofertas pelo destino', () => {
  assert.equal(classifyAd({ link_url: 'https://pay.hotmart.com/A1' }), 'checkout');
  assert.equal(classifyAd({ link_url: 'https://site.com/vsl/oferta' }), 'vsl');
  assert.equal(classifyAd({ link_url: 'https://site.com/quiz-peso' }), 'quiz');
  assert.equal(classifyAd({ link_url: 'https://loja.myshopify.com/products/x' }), 'loja');
  assert.equal(classifyAd({ link_url: 'https://wa.me/5511' }), 'whatsapp');
  assert.equal(classifyAd({ link_url: 'https://oferta.com/' }), 'vendas');
  assert.equal(classifyAd({}), '');
  assert.equal(classifyPage([{ offer_type: 'vsl' }, { offer_type: 'vsl' }, { offer_type: 'quiz' }]), 'vsl');
});

test('placar fica entre 0 e 100 e premia mais anuncios e dias', () => {
  const low = scorePage({ ads_active: 5, ads_groups: 2, days: 5, new7: 0, offer_type: '', domain: '' });
  const high = scorePage({ ads_active: 40, ads_groups: 20, days: 90, new7: 8, offer_type: 'vsl', domain: 'a.com' });
  assert.ok(low > 0 && low < high && high === 100);
});

test('escalando por delta ou por anuncios novos', () => {
  assert.equal(isScaling(3, 0), true);
  assert.equal(isScaling(null, 5), true);
  assert.equal(isScaling(2, 4), false);
  assert.equal(isScaling(null, 0), false);
});
