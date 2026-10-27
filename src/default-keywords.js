// Lista pronta de palavras-chave (EN e ES), por nicho. [en, es]. O sinal + vira espaco na busca.
const EMAGRECIMENTO = [
  ['belly fat + trick + cinnamon', 'grasa abdominal + truco + canela'],
  ['belly fat + secret + ginger', 'grasa abdominal + secreto + jengibre'],
  ['flat belly + method + 7 days', 'vientre plano + método + 7 días'],
  ['stubborn belly + trick + bedtime', 'grasa rebelde + truco + antes de dormir'],
  ['lose belly + doctor + never tells', 'perder barriga + médico + nunca te dice'],
  ['belly fat + overnight + drink', 'grasa abdominal + de noche + bebida'],
  ['bloated belly + fix + seed', 'barriga hinchada + solución + semilla'],
  ['slow metabolism + fix + morning ritual', 'metabolismo lento + solución + ritual mañana'],
  ['thyroid + trick + lose weight', 'tiroides + truco + bajar de peso'],
  ['cortisol + belly fat + trick', 'cortisol + grasa abdominal + truco'],
  ['hormones + weight gain + secret', 'hormonas + subir de peso + secreto'],
  ['menopause + belly + trick', 'menopausia + barriga + truco'],
  ['insulin resistance + shrink + hack', 'resistencia insulina + reducir + truco'],
  ['weight loss + trick + ice', 'bajar de peso + truco + hielo'],
  ['weight loss + trick + gelatin', 'bajar de peso + truco + gelatina'],
  ['weight loss + trick + lemon', 'bajar de peso + truco + limón'],
  ['fat burning + trick + coffee', 'quemar grasa + truco + café'],
  ['fat burning + secret + garlic', 'quemar grasa + secreto + ajo'],
  ['weight loss + hack + salt', 'bajar de peso + hack + sal'],
  ['lose weight + trick + baking soda', 'bajar de peso + truco + bicarbonato'],
  ['fat loss + secret + avocado seed', 'perder grasa + secreto + semilla aguacate'],
  ['slim + trick + chia', 'adelgazar + truco + chía'],
  ['weight loss + method + nopal', 'bajar de peso + método + nopal'],
  ['fat loss + remedy + apple cider', 'quemar grasa + remedio + vinagre manzana'],
  ['lose weight + ritual + turmeric', 'bajar de peso + ritual + cúrcuma'],
  ['lose 10 pounds + 2 weeks + trick', 'bajar 10 kilos + 2 semanas + truco'],
  ['drop weight fast + secret + doctor', 'bajar peso rápido + secreto + doctor'],
  ['lose weight in 30 days + method', 'bajar de peso en 30 días + método'],
  ['1 week + flat stomach + trick', '1 semana + estómago plano + truco'],
  ['women over 40 + belly fat + trick', 'mujeres mayores 40 + grasa abdominal + truco'],
  ['after 50 + lose weight + secret', 'después de 50 + bajar de peso + secreto'],
  ['diabetic + weight loss + hack', 'diabético + bajar de peso + truco'],
  ['after pregnancy + flat belly + method', 'después del embarazo + vientre plano + método'],
];

const RENDA_EXTRA = [
  ['make money + phone + trick', 'ganar dinero + celular + truco'],
  ['earn money + cellphone + secret', 'ganar dinero + teléfono + secreto'],
  ['earn online + no experience + method', 'ganar en línea + sin experiencia + método'],
  ['make money + 1 hour + phone', 'ganar dinero + 1 hora + celular'],
  ['passive income + phone + trick', 'ingreso pasivo + celular + truco'],
  ['earn dollars + from home + secret', 'ganar dólares + desde casa + secreto'],
  ['no experience + earn + daily', 'sin experiencia + ganar + diario'],
  ['beginner + earn online + trick', 'principiante + ganar en línea + truco'],
  ['anyone can do + earn + internet', 'cualquiera puede + ganar + internet'],
  ['copy paste + earn money + secret', 'copiar pegar + ganar dinero + secreto'],
  ['simple method + earn + home', 'método simple + ganar + casa'],
  ['earn 500 dollars + week + trick', 'ganar 500 dólares + semana + truco'],
  ['make money fast + secret + online', 'ganar dinero rápido + secreto + en línea'],
  ['earn daily + method + no investment', 'ganar diario + método + sin inversión'],
  ['extra income + 2 hours + home', 'ingreso extra + 2 horas + casa'],
  ['earn while you sleep + trick', 'ganar mientras duermes + truco'],
  ['earn with WhatsApp + secret', 'ganar con WhatsApp + secreto'],
  ['earn with TikTok + trick + no followers', 'ganar con TikTok + truco + sin seguidores'],
  ['earn with Instagram + method', 'ganar con Instagram + método'],
  ['dropshipping + secret + beginner', 'dropshipping + secreto + principiante'],
  ['affiliate marketing + trick + no website', 'marketing afiliado + truco + sin sitio web'],
  ['freelance + earn + no experience', 'freelance + ganar + sin experiencia'],
  ['housewife + earn online + secret', 'ama de casa + ganar en línea + secreto'],
  ['student + earn + no investment', 'estudiante + ganar + sin inversión'],
  ['retired + extra income + trick', 'jubilado + ingreso extra + truco'],
  ['single mom + earn from home', 'madre soltera + ganar desde casa'],
];

// Termos genericos em espanhol (volume alto). Diabetes e articulacoes entram desativados.
const ES_GERAIS = [
  ['Emagrecimento', 1, ['bajar de peso', 'perder peso rápido', 'quemar grasa', 'adelgazar', 'dieta para bajar de peso',
    'como bajar de peso rápido', 'pastillas para adelgazar', 'suplemento para bajar de peso', 'grasa abdominal',
    'vientre plano', 'eliminar la panza', 'bajar la barriga', 'detox natural', 'acelerar el metabolismo',
    'limpieza de colon', 'desintoxicar el cuerpo', 'gotas para bajar de peso', 'gotas detox', 'té para bajar de peso',
    'cápsulas naturales']],
  ['Diabetes', 0, ['bajar el azúcar', 'controlar la diabetes naturalmente', 'diabetes tipo 2 remedio natural']],
  ['Dores articulares', 0, ['dolor de rodillas remedio', 'dolor articular natural', 'cartílago de rodilla']],
];

export function defaultKeywordRows() {
  const rows = [];
  for (const [niche, list] of [['Emagrecimento', EMAGRECIMENTO], ['Renda extra', RENDA_EXTRA]]) {
    for (const [en, es] of list) {
      rows.push({ term: es, lang: 'es', niche, active: 1 });
      rows.push({ term: en, lang: 'en', niche, active: 1 });
    }
  }
  for (const [niche, active, terms] of ES_GERAIS) {
    for (const term of terms) rows.push({ term, lang: 'es', niche, active });
  }
  return rows;
}
