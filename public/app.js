// Painel AdHunter. Sem build, sem dependencias. Todo texto vindo da biblioteca entra via textContent.
const root = document.getElementById('root');
const toastEl = document.getElementById('toast');

const S = {
  tab: 'inicio',
  defaultCountries: 'MX,CO,CL,PE',
  search: { mode: 'all', sel: new Set(), q: '', lang: '', niche: '', countries: '' },
  filters: { q: '', status: 'active', min_ads: '', min_days: '', country: '', term: '', only: false, niche: '', offer: '', tag: '', scaling: false },
  facets: { niches: [], tags: [], offers: [] },
  reports: [],
  alertDismissed: 0,
  sort: 'score',
  dir: 'desc',
  limit: 100,
  rows: [],
  total: 0,
  criteria: { min_ads: 5, min_days: 5 },
  selected: new Set(),
  keywords: [],
  settings: null,
  runs: [],
  status: null,
  pollTimer: null,
  openPage: null,
  user: null,
};
const isAdmin = () => !!(S.user && S.user.role === 'admin');

/* ---------- utilidades ---------- */
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'text') el.textContent = v;
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, v);
    }
  }
  for (const kid of kids.flat()) {
    if (kid === null || kid === undefined || kid === false) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

const ICONS = {
  layers: ['M12 2 2 7l10 5 10-5-10-5Z', 'm2 17 10 5 10-5', 'm2 12 10 5 10-5'],
  list: ['M8 6h13', 'M8 12h13', 'M8 18h13', 'M3 6h.01', 'M3 12h.01', 'M3 18h.01'],
  target: ['M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z', 'M18 12a6 6 0 1 1-12 0 6 6 0 0 1 12 0Z', 'M14 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z'],
  dot: ['M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10Z'],
  search: ['m21 21-4.3-4.3', 'M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z'],
  play: ['M7 4.5v15l12-7.5-12-7.5Z'],
  stop: ['M6 6h12v12H6Z'],
  logout: ['M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4', 'm16 17 5-5-5-5', 'M21 12H9'],
  sun: ['M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z', 'M12 2v2', 'M12 20v2', 'm4.93 4.93 1.41 1.41', 'm17.66 17.66 1.41 1.41', 'M2 12h2', 'M20 12h2', 'm6.34 17.66-1.41 1.41', 'm19.07 4.93-1.41 1.41'],
  moon: ['M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z'],
  user: ['M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2', 'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z'],
  lock: ['M5 11h14a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1Z', 'M8 11V7a4 4 0 0 1 8 0v4'],
  arrow: ['M5 12h14', 'm12 5 7 7-7 7'],
  eye: ['M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z', 'M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z'],
  star: ['m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2Z'],
  trash: ['M3 6h18', 'M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6', 'M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2'],
  download: ['M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4', 'm7 10 5 5 5-5', 'M12 15V3'],
  external: ['M15 3h6v6', 'M10 14 21 3', 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6'],
  right: ['m9 18 6-6-6-6'],
  more: ['M12 5h.01', 'M12 12h.01', 'M12 19h.01'],
  refresh: ['M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8', 'M21 3v5h-5', 'M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16', 'M8 16H3v5'],
  file: ['M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z', 'M14 2v6h6'],
  updown: ['m7 15 5 5 5-5', 'm7 9 5-5 5 5'],
  x: ['M18 6 6 18', 'M6 6l12 12'],
  trend: ['M22 7 13.5 15.5l-5-5L2 17', 'M16 7h6v6'],
  tag: ['M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8Z', 'M7.5 7.5h.01'],
  copy: ['M8 8h12a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z', 'M16 8V4a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h3'],
  alert: ['M12 9v4', 'M12 17h.01', 'M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z'],
  play2: ['m5 3 14 9-14 9V3Z'],
  sparkle: ['M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3Z'],
  doc: ['M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z', 'M14 2v6h6', 'M8 13h8', 'M8 17h8'],
};
const FILLED = new Set(['play', 'stop', 'dot']);
function ic(name) {
  const ns = 'http://www.w3.org/2000/svg';
  const el = document.createElementNS(ns, 'svg');
  el.setAttribute('viewBox', '0 0 24 24');
  el.setAttribute('class', 'ic');
  el.setAttribute('aria-hidden', 'true');
  el.setAttribute('fill', FILLED.has(name) ? 'currentColor' : 'none');
  el.setAttribute('stroke', 'currentColor');
  el.setAttribute('stroke-width', FILLED.has(name) ? '1' : '2');
  el.setAttribute('stroke-linecap', 'round');
  el.setAttribute('stroke-linejoin', 'round');
  for (const d of ICONS[name] || []) {
    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', d);
    el.append(path);
  }
  return el;
}

function currentTheme() {
  const t = document.documentElement.getAttribute('data-theme');
  if (t === 'dark' || t === 'light') return t;
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
function themeButton() {
  const btn = h('button', { class: 'iconbtn', type: 'button' });
  const paint = () => {
    const dark = currentTheme() === 'dark';
    btn.replaceChildren(ic(dark ? 'sun' : 'moon'));
    btn.setAttribute('aria-label', dark ? 'Usar tema claro' : 'Usar tema escuro');
    btn.title = dark ? 'Tema claro' : 'Tema escuro';
  };
  btn.addEventListener('click', () => {
    const next = currentTheme() === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('garimpo_theme', next); } catch { /* sem armazenamento */ }
    paint();
  });
  paint();
  return btn;
}

function avatar(name) {
  const words = String(name || '?').trim().split(/\s+/).filter(Boolean);
  const ini = ((words[0] || '?')[0] + (words[1] ? words[1][0] : '')).toUpperCase();
  let hue = 0;
  for (const ch of String(name || '')) hue = (hue * 31 + ch.charCodeAt(0)) % 360;
  const el = h('div', { class: 'avatar', 'aria-hidden': 'true' }, ini);
  el.style.setProperty('--h', String(hue));
  return el;
}

function svgLogo() {
  return h('img', { class: 'logo-img', src: '/logo.png', alt: '', width: '32', height: '32' });
}
function wordmark() {
  return h('span', { class: 'wordmark' }, 'Ad', h('b', null, 'Hunter'));
}

let toastTimer = null;
function toast(msg, bad) {
  toastEl.textContent = msg;
  toastEl.className = 'toast show' + (bad ? ' bad' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastEl.className = 'toast'; }, 3200);
}

async function api(path, { method = 'GET', body } = {}) {
  const opts = { method, credentials: 'same-origin', headers: {} };
  if (method !== 'GET') opts.headers['X-Garimpo'] = '1';
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(path, opts);
  let data = null;
  try { data = await res.json(); } catch { data = null; }
  if (res.status === 401 && path !== '/api/login') {
    stopPolling();
    renderLogin();
    throw new Error('Sessão expirada.');
  }
  if (!res.ok) throw new Error((data && data.error) || 'Erro ' + res.status);
  return data;
}

function fmtDate(sec) {
  if (!sec) return '-';
  return new Date(sec * 1000).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
}
function fmtDateTime(sec) {
  if (!sec) return '-';
  return new Date(sec * 1000).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}
function fmtDur(a, b) {
  if (!a || !b) return '';
  const s = Math.max(0, b - a);
  if (s < 90) return s + 's';
  if (s < 5400) return Math.round(s / 60) + ' min';
  return (s / 3600).toFixed(1).replace('.', ',') + ' h';
}
function ago(sec) {
  if (!sec) return 'nunca';
  const d = Math.floor(Date.now() / 1000) - sec;
  if (d < 90) return 'agora';
  if (d < 5400) return 'há ' + Math.round(d / 60) + ' min';
  if (d < 129600) return 'há ' + Math.round(d / 3600) + ' h';
  if (d < 1209600) return 'há ' + Math.round(d / 86400) + ' dias';
  return 'há ' + Math.round(d / 604800) + ' semanas';
}
const STATUS_LABEL = { new: 'Novo', seen: 'Visto', fav: 'Favorito', discarded: 'Descartado' };
const RUN_LABEL = { concluida: 'Concluída', bloqueada: 'Bloqueada', erro: 'Erro', cancelada: 'Cancelada', interrompida: 'Interrompida', rodando: 'Em andamento' };

/* ---------- login ---------- */
function renderLogin() {
  root.replaceChildren();
  const user = h('input', { type: 'text', id: 'un', autocomplete: 'username', autocapitalize: 'none', spellcheck: 'false', placeholder: 'Digite seu usuário' });
  const pass = h('input', { type: 'password', id: 'pw', autocomplete: 'current-password', placeholder: 'Digite sua senha' });
  const eye = h('button', { class: 'eyebtn', type: 'button', 'aria-label': 'Mostrar senha' }, ic('eye'));
  eye.addEventListener('click', () => {
    const show = pass.type === 'password';
    pass.type = show ? 'text' : 'password';
    eye.setAttribute('aria-label', show ? 'Ocultar senha' : 'Mostrar senha');
  });
  const err = h('div', { class: 'err', role: 'alert' });
  const submit = h('button', { class: 'btn primary big', type: 'submit' }, 'Entrar', ic('arrow'));
  const form = h('form', { class: 'login-form' },
    h('div', null, h('label', { class: 'lbl', for: 'un' }, 'Usuário'), h('div', { class: 'fieldicon' }, ic('user'), user)),
    h('div', null, h('label', { class: 'lbl', for: 'pw' }, 'Senha'), h('div', { class: 'fieldicon' }, ic('lock'), pass, eye)),
    err,
    submit
  );
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.textContent = '';
    submit.disabled = true;
    try {
      await api('/api/login', { method: 'POST', body: { username: user.value, password: pass.value } });
      await boot();
    } catch (ex) {
      err.textContent = ex.message;
      submit.disabled = false;
      pass.select();
    }
  });
  root.append(
    h('div', { class: 'login' },
      h('div', { class: 'login-side' },
        h('div', { class: 'login-hero' },
          h('img', { class: 'login-logo', src: '/logo.png', alt: '', width: '200', height: '200' }),
          h('div', { class: 'login-word' }, 'Ad', h('b', null, 'Hunter')),
          h('p', { class: 'login-tag' }, 'Encontre anunciantes de verdade.'),
          h('p', { class: 'login-note' }, 'Páginas, anúncios e oportunidades para você ir direto ao que funciona.')
        )
      ),
      h('div', { class: 'login-form-wrap' },
        h('div', { class: 'login-card' },
          h('div', { class: 'login-theme' }, themeButton()),
          h('img', { class: 'login-card-logo', src: '/logo.png', alt: '', width: '84', height: '84' }),
          h('h1', { class: 'login-h' }, 'Acesse sua conta'),
          h('p', { class: 'login-sub' }, 'Entre para continuar no AdHunter'),
          form
        )
      )
    )
  );
  user.focus();
}

/* ---------- casca ---------- */
let viewEl = null;
let runstateEl = null;
let runBtn = null;
const TABS_ALL = [['inicio', 'Início', false], ['paginas', 'Páginas', false], ['busca', 'Busca', false], ['rodadas', 'Rodadas', false], ['palavras', 'Palavras-chave', false], ['ajustes', 'Ajustes', true], ['conta', 'Conta', false]];
const tabsFor = () => TABS_ALL.filter(([, , adminOnly]) => !adminOnly || isAdmin());

let themeBtnEl = null;
let alertEl = null;
function renderShell() {
  root.replaceChildren();
  const tabs = h('div', { class: 'tabs', role: 'tablist' },
    tabsFor().map(([id, label]) =>
      h('button', { class: 'tab', role: 'tab', 'aria-selected': String(S.tab === id), 'data-tab': id, onclick: () => setTab(id) }, label)
    )
  );
  runstateEl = h('div', { class: 'runstate' });
  runBtn = h('button', { class: 'btn primary', onclick: onRunClick });
  const top = h('header', { class: 'top' },
    h('div', { class: 'logo' }, svgLogo(), wordmark()),
    tabs,
    h('div', { class: 'top-right' }, runstateEl, runBtn,
      h('span', { class: 'who' }, S.user ? S.user.username : ''),
      themeButton(),
      h('button', { class: 'btn ghost small', onclick: logout }, ic('logout'), 'Sair'))
  );
  alertEl = h('div', { class: 'alertwrap' });
  viewEl = h('main');
  root.append(top, alertEl, viewEl, buildDrawer());
  paintRunState();
  renderTab();
}

async function logout() {
  try { await api('/api/logout', { method: 'POST' }); } catch { /* ignora */ }
  stopPolling();
  renderLogin();
}

function setTab(id) {
  S.tab = id;
  for (const b of document.querySelectorAll('.tab')) b.setAttribute('aria-selected', String(b.dataset.tab === id));
  renderTab();
}

function renderTab() {
  closeDrawer();
  viewEl.replaceChildren();
  if (S.tab === 'inicio') viewHome();
  else if (S.tab === 'busca') viewSearch();
  else if (S.tab === 'paginas') viewPages();
  else if (S.tab === 'rodadas') viewRuns();
  else if (S.tab === 'palavras') viewKeywords();
  else if (S.tab === 'ajustes' && isAdmin()) viewSettings();
  else viewAccount();
}

/* ---------- estado da rodada ---------- */
function setRunBtn(running) {
  if (!runBtn) return;
  runBtn.replaceChildren(ic(running ? 'stop' : 'search'), running ? 'Parar' : 'Iniciar busca');
  runBtn.className = running ? 'btn danger' : 'btn primary';
}
function paintRunState() {
  const st = S.status;
  if (!runstateEl || !st) return;
  runstateEl.replaceChildren();
  if (st.running) {
    runstateEl.append(
      h('span', { class: 'dot on' }),
      h('span', { class: 'msg num' }, (st.phase ? st.phase + ' ' : '') + st.done + '/' + st.total + (st.message ? ' ' + st.message : ''))
    );
  } else {
    const lr = st.last_run;
    if (lr) {
      const good = lr.status === 'concluida';
      runstateEl.append(
        h('span', { class: 'dot ' + (good ? 'ok' : lr.status === 'bloqueada' || lr.status === 'erro' ? 'bad' : '') }),
        h('span', { class: 'msg' }, 'Última rodada ' + ago(lr.finished_at || lr.started_at)),
        h('span', { class: 'badge plain ' + lr.status }, RUN_LABEL[lr.status] || lr.status)
      );
    } else {
      runstateEl.append(h('span', { class: 'dot' }), h('span', { class: 'msg' }, 'Nenhuma rodada ainda'));
    }
  }
  setRunBtn(!!st.running);
  paintAlert();
}

function paintAlert() {
  if (!alertEl) return;
  alertEl.replaceChildren();
  const st = S.status;
  const a = st && !st.running ? st.alert : null;
  if (!a || S.alertDismissed === a.run_id) return;
  const blocked = a.kind === 'bloqueada';
  const title = blocked ? 'O Facebook bloqueou a última rodada (#' + a.run_id + ', ' + ago(a.at) + ')' : 'A última rodada terminou com erro (#' + a.run_id + ', ' + ago(a.at) + ')';
  const lines = [];
  if (a.error) lines.push('Motivo: ' + a.error + '.');
  if (blocked) {
    if (isAdmin()) {
      lines.push('O app só roda sozinho de novo depois de 6 horas. O que fazer: espere 24 a 48 horas, baixe as Buscas por rodada em Ajustes (por exemplo para 30) e aumente a pausa mínima.');
      lines.push(a.proxy ? 'Já tem proxy configurado: se repetir, troque o IP do proxy.' : 'Se repetir, a saída é usar um proxy residencial (variável PROXY_SERVER no EasyPanel).');
    } else {
      lines.push('A coleta fica pausada por algumas horas para proteger o acesso.');
    }
  } else if (isAdmin()) {
    lines.push('Veja o registro e os arquivos de diagnóstico na aba Rodadas. Dá para retomar de onde parou.');
  }
  const actions = [];
  actions.push(h('button', { class: 'btn small', onclick: () => { setTab('rodadas'); S.runSel = a.run_id; } }, 'Ver a rodada'));
  actions.push(h('button', { class: 'btn small ghost', onclick: () => { S.alertDismissed = a.run_id; paintAlert(); } }, 'Entendi'));
  alertEl.append(h('div', { class: 'alertbar ' + (blocked ? 'blocked' : 'failed'), role: 'alert' },
    h('span', { class: 'ai' }, ic('alert')),
    h('div', { class: 'at' }, h('b', null, title), h('p', null, lines.join(' '))),
    h('div', { class: 'aa' }, actions)));
}

async function refreshStatus() {
  try {
    const was = S.status && S.status.running;
    S.status = await api('/api/status');
    paintRunState();
    if (S.tab === 'busca') paintSearchProgress();
    if (S.tab === 'inicio') paintHomeRun();
    if (was && !S.status.running) {
      toast('Rodada finalizada.');
      if (S.tab === 'paginas') loadPages();
      if (S.tab === 'rodadas') loadRuns();
      if (S.tab === 'inicio') loadHome();
    }
    schedulePoll();
  } catch { schedulePoll(); }
}

function stopPolling() { clearTimeout(S.pollTimer); S.pollTimer = null; }
function schedulePoll() {
  clearTimeout(S.pollTimer);
  const running = S.status && S.status.running;
  S.pollTimer = setTimeout(refreshStatus, running ? 3000 : 20000);
}

async function onRunClick() {
  try {
    if (S.status && S.status.running) {
      await api('/api/runs/stop', { method: 'POST', body: {} });
      toast('Pedido de parada enviado.');
    } else {
      setTab('busca');
      return;
    }
    await refreshStatus();
  } catch (ex) { toast(ex.message, true); }
}

async function startAllNow() {
  try {
    if (!S.keywords.some((k) => k.active)) { toast('Nenhuma palavra-chave ativa. Cadastre na aba Palavras-chave.', true); return; }
    await api('/api/runs', { method: 'POST', body: {} });
    toast('Busca iniciada.');
    await refreshStatus();
  } catch (ex) { toast(ex.message, true); }
}


/* ---------- inicio ---------- */
let homeRunBox = null;
let homeBody = null;

function miniPage(r, extra) {
  return h('button', { class: 'minipage', type: 'button', onclick: () => openDrawer(r.page_id) },
    avatar(r.name),
    h('div', { class: 'mp-main' },
      h('div', { class: 'pname' }, r.name || '(sem nome)'),
      h('div', { class: 'pmeta' },
        h('span', { class: 'num' }, r.ads_active + ' anúncios'),
        h('span', { class: 'num' }, (r.days === null || r.days === undefined ? '?' : r.days) + ' dias'),
        r.offer_label ? h('span', { class: 'chip offer' }, r.offer_label) : null,
        extra ? extra(r) : null)),
    scoreBadge(r.score));
}

function viewHome() {
  homeRunBox = h('div', { class: 'card homerun', id: 'homerun' });
  homeBody = h('div', { class: 'home' });
  viewEl.append(homeRunBox, homeBody);
  paintHomeRun();
  loadHome();
}

function paintHomeRun() {
  if (!homeRunBox || !document.getElementById('homerun')) return;
  const st = S.status || {};
  const kids = [];
  if (st.running) {
    const pct = st.total ? Math.min(100, Math.round((st.done / st.total) * 100)) : 0;
    const bar = h('div', { class: 'progress' }, h('i'));
    bar.firstChild.style.width = pct + '%';
    kids.push(
      h('div', { class: 'hr-text' },
        h('div', { class: 'eyebrow' }, h('span', { class: 'dot on' }), 'Busca em andamento'),
        h('h2', null, (st.phase === 'paginas' ? 'Abrindo páginas' : 'Buscando palavras') + ': ' + st.done + ' de ' + st.total),
        h('p', null, st.message || 'trabalhando')),
      bar,
      h('div', { class: 'hr-actions' },
        h('button', { class: 'btn primary', onclick: () => setTab('busca') }, ic('eye'), 'Acompanhar'),
        h('button', { class: 'btn danger', onclick: onRunClick }, ic('stop'), 'Parar')));
  } else {
    const lr = st.last_run;
    let title = 'Nenhuma busca feita ainda';
    let text = 'Escolha as palavras na aba Busca e comece.';
    if (lr) {
      title = 'Última busca ' + ago(lr.finished_at || lr.started_at);
      text = (RUN_LABEL[lr.status] || lr.status) + '. ' + (st.pages || 0) + ' páginas no banco, ' + (st.fresh || 0) + ' novas para ver.';
    }
    kids.push(
      h('div', { class: 'hr-text' }, h('div', { class: 'eyebrow' }, 'Coleta'), h('h2', null, title), h('p', null, text)),
      h('div', { class: 'hr-actions' },
        h('button', { class: 'btn primary big', onclick: () => setTab('busca') }, ic('search'), 'Iniciar busca'),
        h('button', { class: 'btn', onclick: () => setTab('paginas') }, ic('layers'), 'Ver páginas')));
  }
  homeRunBox.replaceChildren(...kids);
}

async function loadHome() {
  try {
    const [best, scal, ok, all] = await Promise.all([
      api('/api/pages?qualifies=1&status=new&sort=score&limit=8'),
      api('/api/pages?scaling=1&status=active&sort=delta&limit=5'),
      api('/api/pages?qualifies=1&status=active&limit=1'),
      api('/api/pages?status=active&limit=1'),
    ]);
    if (S.tab !== 'inicio' || !homeBody) return;
    const num = (v, label, warm) => h('div', { class: 'ns-item' + (warm ? ' warm' : '') }, h('b', { class: 'num' }, String(v)), h('span', null, label));
    const strip = h('div', { class: 'numstrip' },
      num(ok.total, 'passam no critério'),
      num(best.total, 'novas que passam', true),
      num(scal.total, 'escalando agora'),
      num(all.total, 'páginas na lista'));
    const bestList = h('div', { class: 'minilist' }, best.rows.length ? best.rows.map((r) => miniPage(r)) : h('div', { class: 'empty' }, 'Nada novo que passe no critério por enquanto.'));
    const scalList = h('div', { class: 'minilist' }, scal.rows.length ? scal.rows.map((r) => miniPage(r, (x) => h('span', { class: 'chip scale' }, ic('trend'), scaleText(x)))) : h('div', { class: 'empty' }, 'Ninguém escalando ainda. Precisa de pelo menos duas leituras da mesma página.'));
    const left = h('div', { class: 'card' },
      h('div', { class: 'cardhead' }, h('h3', null, 'Melhores páginas novas'),
        h('button', { class: 'linkbtn', onclick: () => { S.filters.status = 'new'; S.filters.only = true; S.sort = 'score'; S.dir = 'desc'; setTab('paginas'); } }, 'Ver todas', ic('right'))),
      bestList);
    const rightKids = [h('div', { class: 'card' },
      h('div', { class: 'cardhead' }, h('h3', null, 'Escalando agora'),
        h('button', { class: 'linkbtn', onclick: () => { S.filters.scaling = true; S.sort = 'delta'; S.dir = 'desc'; setTab('paginas'); } }, 'Ver todas', ic('right'))),
      scalList)];
    if (isAdmin()) {
      const top = [...S.keywords].filter((k) => k.good > 0).sort((a, b) => b.good - a.good).slice(0, 5);
      rightKids.push(h('div', { class: 'card' },
        h('div', { class: 'cardhead' }, h('h3', null, 'Palavras que mais rendem')),
        top.length
          ? h('div', { class: 'kwtop' }, top.map((k) => h('div', { class: 'kwrow' }, h('span', null, k.term), h('b', { class: 'num' }, k.good + (k.good === 1 ? ' boa' : ' boas')))))
          : h('div', { class: 'pad' }, h('div', { class: 'hint' }, 'Aparece depois da primeira busca com páginas que passam no critério.'))));
    }
    homeBody.replaceChildren(strip, left, h('div', { class: 'homeside' }, rightKids));
  } catch (ex) { toast(ex.message, true); }
}

/* ---------- busca ---------- */
let searchProg = null;
let searchPreview = null;
let searchStartBtn = null;
let searchList = null;

function plannedSearches() {
  const se = S.search;
  const over = (se.countries || '').split(/[\s,;]+/).filter((c) => /^[A-Za-z]{2}$/.test(c));
  const defs = (S.defaultCountries || '').split(/[\s,;]+/).filter(Boolean);
  const pool = se.mode === 'pick' ? S.keywords.filter((k) => se.sel.has(k.id)) : S.keywords.filter((k) => k.active);
  let total = 0;
  for (const k of pool) {
    const own = (k.countries || '').split(/[\s,;]+/).filter(Boolean);
    total += over.length ? over.length : (own.length || defs.length);
  }
  return { words: pool.length, searches: total, specific: se.mode === 'pick' };
}

function viewSearch() {
  const se = S.search;
  const seg = h('div', { class: 'statusseg' });
  const modeNote = h('div', { class: 'hint' });
  const pickBox = h('div', { class: 'pickbox' });
  const countries = h('input', { type: 'text', id: 'b-countries', placeholder: 'Vazio usa os países de cada palavra ou os padrão (' + S.defaultCountries + ')', value: se.countries });
  countries.addEventListener('input', () => { se.countries = countries.value; paintPreview(); });
  searchPreview = h('div', { class: 'preview' });
  searchStartBtn = h('button', { class: 'btn primary big', onclick: startSearch }, ic('search'), 'Iniciar busca');
  searchProg = h('div', { class: 'card', id: 'searchprog' });

  function paintMode() {
    seg.replaceChildren(...[['all', 'Todas as ativas'], ['pick', 'Escolher palavras']].map(([v, l]) =>
      h('button', { 'aria-pressed': String(se.mode === v), onclick: () => { se.mode = v; paintMode(); } }, l)));
    modeNote.textContent = se.mode === 'all'
      ? 'Usa todas as palavras ativas. Se passar do limite de buscas por rodada (Ajustes), vão primeiro as nunca rodadas e as que mais rendem.'
      : 'Roda só as palavras marcadas, todas as buscas delas, sem o limite por rodada. Bom para a primeira rodada de teste.';
    pickBox.classList.toggle('hidden', se.mode !== 'pick');
    paintPicker();
    paintPreview();
  }

  const q = h('input', { type: 'text', placeholder: 'Filtrar palavras', value: se.q });
  q.addEventListener('input', () => { se.q = q.value.trim().toLowerCase(); paintPicker(); });
  const lang = h('select', null, [['', 'Todos os idiomas'], ['es', 'Espanhol'], ['en', 'Inglês'], ['pt', 'Português']].map(([v, l]) => h('option', { value: v, selected: se.lang === v }, l)));
  lang.addEventListener('change', () => { se.lang = lang.value; paintPicker(); });
  const niches = [...new Set(S.keywords.map((k) => k.niche).filter(Boolean))];
  const niche = h('select', null, h('option', { value: '' }, 'Todos os nichos'), niches.map((n) => h('option', { value: n, selected: se.niche === n }, n)));
  niche.addEventListener('change', () => { se.niche = niche.value; paintPicker(); });
  searchList = h('div', { class: 'picklist' });
  const visible = () => S.keywords.filter((k) =>
    (!se.q || k.term.toLowerCase().includes(se.q)) && (!se.lang || k.lang === se.lang) && (!se.niche || k.niche === se.niche));
  function paintPicker() {
    if (se.mode !== 'pick') return;
    const list = visible();
    searchList.replaceChildren(...(list.length ? list.map((k) => {
      const cb = h('input', { type: 'checkbox', checked: se.sel.has(k.id), 'aria-label': k.term });
      cb.addEventListener('change', () => { if (cb.checked) se.sel.add(k.id); else se.sel.delete(k.id); paintPreview(); });
      return h('label', { class: 'pickrow' }, cb,
        h('span', { class: 'pt' }, k.term),
        h('span', { class: 'chip' }, k.lang.toUpperCase() + (k.niche ? ' / ' + k.niche : '')),
        k.active ? null : h('span', { class: 'chip' }, 'desativada'),
        k.good ? h('span', { class: 'chip pass' }, k.good + (k.good === 1 ? ' boa' : ' boas')) : null);
    }) : [h('div', { class: 'empty' }, 'Nenhuma palavra com esses filtros.')]));
  }
  pickBox.append(
    h('div', { class: 'pickfilters' }, q, lang, niche),
    h('div', { class: 'pickbtns' },
      h('button', { class: 'linkbtn', type: 'button', onclick: () => { visible().forEach((k) => se.sel.add(k.id)); paintPicker(); paintPreview(); } }, 'Marcar os visíveis'),
      h('button', { class: 'linkbtn', type: 'button', onclick: () => { se.sel.clear(); paintPicker(); paintPreview(); } }, 'Limpar')),
    searchList);

  const left = h('div', { class: 'card pad searchform' },
    h('h2', { class: 'sec' }, 'Nova busca'),
    seg, modeNote, pickBox,
    h('div', null, h('label', { class: 'lbl', for: 'b-countries' }, 'Países (opcional)'), countries),
    searchPreview, searchStartBtn);
  viewEl.append(h('div', { class: 'searchgrid' }, left, searchProg));
  paintMode();
  paintSearchProgress();
}

function paintPreview() {
  if (!searchPreview) return;
  const p = plannedSearches();
  const running = !!(S.status && S.status.running);
  searchPreview.textContent = p.words
    ? p.searches + ' buscas em ' + p.words + (p.words === 1 ? ' palavra' : ' palavras') + (p.specific ? '' : ' (limite por rodada se aplica)')
    : (p.specific ? 'Marque ao menos uma palavra.' : 'Nenhuma palavra ativa. Cadastre ou ative em Palavras-chave.');
  if (searchStartBtn) searchStartBtn.disabled = running || !p.words;
}

async function startSearch() {
  const se = S.search;
  const body = {};
  if (se.mode === 'pick') body.keywordIds = [...se.sel];
  if (se.countries.trim()) body.countries = se.countries.trim();
  try {
    await api('/api/runs', { method: 'POST', body });
    toast('Busca iniciada.');
    await refreshStatus();
  } catch (ex) { toast(ex.message, true); }
}

let searchLogTimer = 0;
async function paintSearchProgress() {
  if (!searchProg || !document.getElementById('searchprog')) return;
  paintPreview();
  const st = S.status || {};
  if (st.running) {
    const pct = st.total ? Math.min(100, Math.round((st.done / st.total) * 100)) : 0;
    const bar = h('div', { class: 'progress' }, h('i'));
    bar.firstChild.style.width = pct + '%';
    const pre = h('pre', { class: 'log short' }, 'carregando o registro...');
    searchProg.replaceChildren(
      h('div', { class: 'pad' },
        h('div', { class: 'eyebrow' }, h('span', { class: 'dot on' }), 'Em andamento'),
        h('h2', { class: 'sec' }, (st.phase === 'paginas' ? 'Abrindo páginas' : 'Buscando palavras') + ': ' + st.done + ' de ' + st.total),
        bar,
        h('p', { class: 'hint' }, st.message || ''),
        h('div', { class: 'actions' }, h('button', { class: 'btn danger', onclick: onRunClick }, ic('stop'), 'Parar')),
        pre));
    if (st.runId && Date.now() - searchLogTimer > 2500) {
      searchLogTimer = Date.now();
      try {
        const d = await api('/api/runs/' + st.runId);
        pre.textContent = (d.log || '').split('\n').slice(-14).join('\n') || '(sem registro ainda)';
        pre.scrollTop = pre.scrollHeight;
      } catch { /* mantem o texto */ }
    }
    return;
  }
  const lr = st.last_run;
  const kids = [h('h2', { class: 'sec' }, 'Andamento')];
  if (!lr) {
    kids.push(h('div', { class: 'empty' }, h('b', null, 'Nada rodando'), 'Escolha as palavras e toque em Iniciar busca.'));
  } else {
    kids.push(
      h('div', { class: 'lastrun' },
        h('span', { class: 'badge ' + lr.status }, RUN_LABEL[lr.status] || lr.status),
        h('span', { class: 'dim' }, 'Última busca ' + ago(lr.finished_at || lr.started_at))),
      h('div', { class: 'actions' },
        h('button', { class: 'btn', onclick: () => { S.runSel = lr.id; setTab('rodadas'); } }, ic('list'), 'Ver a rodada'),
        ['interrompida', 'cancelada', 'erro'].includes(lr.status)
          ? h('button', { class: 'btn primary', onclick: async () => {
            try { await api('/api/runs/' + lr.id + '/resume', { method: 'POST', body: {} }); toast('Busca retomada.'); await refreshStatus(); } catch (ex) { toast(ex.message, true); }
          } }, ic('play'), 'Retomar de onde parou') : null));
  }
  searchProg.replaceChildren(h('div', { class: 'pad' }, ...kids));
}

/* ---------- paginas ---------- */
function queryString() {
  const f = S.filters;
  const p = new URLSearchParams();
  if (f.q) p.set('q', f.q);
  p.set('status', f.status);
  if (f.min_ads) p.set('min_ads', f.min_ads);
  if (f.min_days) p.set('min_days', f.min_days);
  if (f.country) p.set('country', f.country);
  if (f.term) p.set('term', f.term);
  if (f.only) p.set('qualifies', '1');
  if (f.niche) p.set('niche', f.niche);
  if (f.offer) p.set('offer', f.offer);
  if (f.tag) p.set('tag', f.tag);
  if (f.scaling) p.set('scaling', '1');
  p.set('sort', S.sort);
  p.set('dir', S.dir);
  return p;
}

let pagesBox = null;
let summaryBox = null;
let bulkBox = null;

function viewPages() {
  const f = S.filters;
  const q = h('input', { type: 'text', id: 'f-q', placeholder: 'Nome ou domínio', value: f.q });
  let qTimer = null;
  q.addEventListener('input', () => { clearTimeout(qTimer); qTimer = setTimeout(() => { f.q = q.value.trim(); loadPages(); }, 300); });
  const status = h('select', { id: 'f-status' },
    [['active', 'Sem descartadas'], ['all', 'Todas'], ['new', 'Novas'], ['seen', 'Vistas'], ['fav', 'Favoritas'], ['discarded', 'Descartadas']]
      .map(([v, l]) => h('option', { value: v, selected: f.status === v }, l)));
  status.addEventListener('change', () => { f.status = status.value; loadPages(); });
  const minAds = h('input', { type: 'number', min: '0', id: 'f-ads', placeholder: 'mín.', value: f.min_ads });
  minAds.addEventListener('change', () => { f.min_ads = minAds.value; loadPages(); });
  const minDays = h('input', { type: 'number', min: '0', id: 'f-days', placeholder: 'mín.', value: f.min_days });
  minDays.addEventListener('change', () => { f.min_days = minDays.value; loadPages(); });
  const country = h('input', { type: 'text', id: 'f-country', placeholder: 'MX', maxlength: '2', value: f.country });
  country.addEventListener('change', () => { f.country = country.value.trim().toUpperCase(); loadPages(); });
  const term = h('select', { id: 'f-term' },
    h('option', { value: '' }, 'Todas as palavras'),
    S.keywords.map((k) => h('option', { value: k.term, selected: f.term === k.term }, k.term)));
  term.addEventListener('change', () => { f.term = term.value; loadPages(); });
  const only = h('input', { type: 'checkbox', id: 'f-only', checked: f.only });
  only.addEventListener('change', () => { f.only = only.checked; loadPages(); });
  const scaling = h('input', { type: 'checkbox', id: 'f-scaling', checked: f.scaling });
  scaling.addEventListener('change', () => { f.scaling = scaling.checked; loadPages(); });
  const niche = h('select', { id: 'f-niche' }, h('option', { value: '' }, 'Todos os nichos'));
  niche.addEventListener('change', () => { f.niche = niche.value; loadPages(); });
  const offer = h('select', { id: 'f-offer' }, h('option', { value: '' }, 'Todas as ofertas'));
  offer.addEventListener('change', () => { f.offer = offer.value; loadPages(); });
  const tag = h('select', { id: 'f-tag' }, h('option', { value: '' }, 'Todas as etiquetas'));
  tag.addEventListener('change', () => { f.tag = tag.value; loadPages(); });
  const fillFacets = () => {
    const fill = (sel, items, cur, first) => {
      sel.replaceChildren(h('option', { value: '' }, first), ...items.map(([v, l]) => h('option', { value: v, selected: cur === v }, l)));
    };
    fill(niche, S.facets.niches.map((n) => [n, n]), f.niche, 'Todos os nichos');
    fill(offer, S.facets.offers.map((o) => [o.type, o.label + ' (' + o.n + ')']), f.offer, 'Todas as ofertas');
    fill(tag, S.facets.tags.map((t) => [t.tag, t.tag + ' (' + t.n + ')']), f.tag, 'Todas as etiquetas');
  };
  S.fillFacets = fillFacets;
  loadFacets().then(fillFacets);

  const field = (label, el, id) => h('div', null, h('label', { class: 'lbl', for: id }, label), el);
  summaryBox = h('div', { class: 'summary' });
  bulkBox = h('div', { class: 'bulkbar' });
  pagesBox = h('div');
  viewEl.append(
    summaryBox,
    h('div', { class: 'card filters' },
      h('div', { class: 'wide' }, field('Buscar', h('div', { class: 'fieldicon' }, ic('search'), q), 'f-q')),
      field('Status', status, 'f-status'),
      field('Anúncios (mín.)', minAds, 'f-ads'),
      field('Dias (mín.)', minDays, 'f-days'),
      field('País', country, 'f-country'),
      h('div', { class: 'wide' }, field('Palavra-chave', term, 'f-term')),
      field('Nicho', niche, 'f-niche'),
      field('Oferta', offer, 'f-offer'),
      field('Etiqueta', tag, 'f-tag'),
      h('div', { class: 'checks' },
        h('label', { class: 'chk', for: 'f-only' }, only, 'Só os que passam no critério'),
        h('label', { class: 'chk', for: 'f-scaling' }, scaling, 'Só escalando'))
    ),
    h('div', { class: 'card tablecard' }, bulkBox, pagesBox)
  );
  paintSummary();
  loadPages();
}

function paintSummary() {
  if (!summaryBox) return;
  const st = S.status || {};
  const stat = (icon, value, label, warm) =>
    h('div', { class: 'stat' + (warm ? ' warm' : '') },
      h('div', { class: 'tile' }, ic(icon)),
      h('div', null, h('b', { class: 'num' }, String(value)), h('span', null, label)));
  summaryBox.replaceChildren(
    stat('layers', st.pages ?? S.total, 'páginas no banco'),
    stat('dot', st.fresh ?? 0, 'novas para ver', true),
    stat('list', S.total, 'na lista agora'),
    h('div', { class: 'stat' },
      h('div', { class: 'tile' }, ic('target')),
      h('div', null, h('small', null, 'Critério atual'), h('span', { class: 'crit num' }, S.criteria.min_ads + '+ anúncios e ' + S.criteria.min_days + '+ dias')))
  );
}

async function loadFacets() {
  try { S.facets = await api('/api/facets'); } catch { /* filtros extras ficam vazios */ }
}

async function loadPages(append) {
  const p = queryString();
  p.set('limit', String(S.limit));
  p.set('offset', append ? String(S.rows.length) : '0');
  try {
    const d = await api('/api/pages?' + p.toString());
    S.rows = append ? S.rows.concat(d.rows) : d.rows;
    S.total = d.total;
    S.criteria = d.criteria;
    if (!append) S.selected.clear();
    paintSummary();
    paintTable();
    paintBulk();
  } catch (ex) { toast(ex.message, true); }
}

function sortHeader(label, key) {
  const active = S.sort === key;
  return h('th', { class: 'sortable', onclick: () => {
    if (S.sort === key) S.dir = S.dir === 'desc' ? 'asc' : 'desc';
    else { S.sort = key; S.dir = key === 'name' ? 'asc' : 'desc'; }
    loadPages();
  } }, label, active ? h('span', { class: 'arrow' }, S.dir === 'desc' ? '↓' : '↑') : h('span', { class: 'arrow faint' }, ic('updown')));
}

function barCell(value, max, threshold, hit) {
  const track = h('div', { class: 'track' });
  const fill = h('div', { class: 'fill' + (hit ? ' hit' : '') });
  const pct = value === null || value === undefined ? 0 : Math.min(100, (value / max) * 100);
  fill.style.width = pct + '%';
  track.append(fill);
  if (threshold > 0 && threshold <= max) {
    const tick = h('div', { class: 'tick', title: 'Critério: ' + threshold }, h('span', null, String(threshold)));
    tick.style.left = (threshold / max) * 100 + '%';
    track.append(tick);
  }
  return h('div', { class: 'barcell' }, h('span', { class: 'v num' }, value === null || value === undefined ? '-' : String(value)), track);
}

function scoreBadge(score) {
  const tier = score >= 75 ? 'hi' : score >= 50 ? 'mid' : 'lo';
  return h('span', { class: 'score ' + tier, title: 'Placar de 0 a 100: anúncios ativos, dias, criativos, novos em 7 dias e tipo de oferta' }, String(score));
}
function scaleText(r) {
  if (r.delta !== null && r.delta > 0) return 'escalando +' + r.delta;
  return r.new7 + ' novos em 7 dias';
}

function paintTable() {
  pagesBox.replaceChildren();
  if (!S.rows.length) {
    const none = (S.status && S.status.pages) ? 'Nada bate com esses filtros. Afrouxe um deles.' : 'Ainda não há páginas. Cadastre palavras-chave e toque em Rodar agora.';
    pagesBox.append(h('div', { class: 'empty' }, h('div', { class: 'big' }, ic('doc')), h('b', null, 'Lista vazia'), h('p', null, none)));
    return;
  }
  const maxAds = Math.max(50, ...S.rows.map((r) => r.ads_active || 0));
  const maxDays = Math.max(60, ...S.rows.map((r) => r.days || 0));
  const all = h('input', { type: 'checkbox', 'aria-label': 'Selecionar todas', checked: S.rows.length > 0 && S.rows.every((r) => S.selected.has(r.page_id)) });
  all.addEventListener('change', () => {
    if (all.checked) S.rows.forEach((r) => S.selected.add(r.page_id)); else S.selected.clear();
    paintTable(); paintBulk();
  });
  all.addEventListener('click', (e) => e.stopPropagation());
  const thead = h('thead', null, h('tr', null,
    h('th', { class: 'cb' }, all),
    sortHeader('Página', 'name'),
    sortHeader('Placar', 'score'),
    sortHeader('Anúncios ativos', 'ads_active'),
    sortHeader('Dias rodando', 'days'),
    h('th', null, 'Site'),
    sortHeader('Visto', 'first_seen'),
    h('th', null, 'Status'),
    h('th', { class: 'act' })
  ));
  const tbody = h('tbody');
  for (const r of S.rows) {
    const cb = h('input', { type: 'checkbox', 'aria-label': 'Selecionar ' + r.name, checked: S.selected.has(r.page_id) });
    cb.addEventListener('click', (e) => e.stopPropagation());
    cb.addEventListener('change', () => { if (cb.checked) S.selected.add(r.page_id); else S.selected.delete(r.page_id); paintBulk(); });
    const pill = h('button', { class: 'pill ' + r.status, title: 'Clique para mudar o status', onclick: (e) => { e.stopPropagation(); cycleStatus(r); } }, STATUS_LABEL[r.status] || r.status);
    const site = r.domain
      ? h('a', { href: r.site_url || ('https://' + r.domain), target: '_blank', rel: 'noopener noreferrer', onclick: (e) => e.stopPropagation() }, r.domain + ' ', ic('external'))
      : h('span', { class: 'faint' }, '-');
    const kebab = h('button', { class: 'iconbtn', type: 'button', 'aria-label': 'Mais ações', onclick: (e) => { e.stopPropagation(); openRowMenu(kebab, r); } }, ic('more'));
    const tr = h('tr', { class: (r.status === 'new' ? 'is-new ' : '') + (r.status === 'discarded' ? 'is-discarded' : ''), tabindex: '0', onclick: () => openDrawer(r.page_id) },
      h('td', { class: 'cb' }, cb),
      h('td', null, h('div', { class: 'pcell' }, avatar(r.name),
        h('div', null,
          h('div', { class: 'pname' }, r.name || '(sem nome)'),
          h('div', { class: 'pmeta' },
            r.qualifies ? h('span', { class: 'chip pass' }, 'passa no critério') : null,
            r.scaling ? h('span', { class: 'chip scale' }, ic('trend'), scaleText(r)) : null,
            r.offer_label ? h('span', { class: 'chip offer' }, r.offer_label) : null,
            r.tags.map((t) => h('span', { class: 'chip tag' }, t)),
            r.terms.length ? h('span', { class: 'chip' }, r.terms[0] + (r.terms.length > 1 ? ' +' + (r.terms.length - 1) : '')) : null)))),
      h('td', null, scoreBadge(r.score)),
      h('td', null, barCell(r.ads_active, maxAds, S.criteria.min_ads, r.ads_active >= S.criteria.min_ads)),
      h('td', null, barCell(r.days, maxDays, S.criteria.min_days, r.days !== null && r.days >= S.criteria.min_days)),
      h('td', null, site),
      h('td', null, h('div', { class: 'dim' }, ago(r.first_seen)), h('div', { class: 'countries' }, r.countries.map((c) => h('span', { class: 'cchip' }, c)))),
      h('td', null, pill),
      h('td', { class: 'act' }, kebab)
    );
    tr.addEventListener('keydown', (e) => { if (e.key === 'Enter') openDrawer(r.page_id); });
    tbody.append(tr);
  }
  pagesBox.append(h('div', { class: 'tablewrap' }, h('table', null, thead, tbody)));
  if (S.rows.length < S.total) {
    pagesBox.append(h('div', { class: 'more' }, h('button', { class: 'btn', onclick: () => loadPages(true) }, 'Carregar mais (' + (S.total - S.rows.length) + ')', ic('updown'))));
  }
}

let menuEl = null;
function closeMenu() { if (menuEl) { menuEl.remove(); menuEl = null; } }
document.addEventListener('click', closeMenu);
window.addEventListener('scroll', closeMenu, true);

function openMenuAt(btn, items) {
  closeMenu();
  const rect = btn.getBoundingClientRect();
  menuEl = h('div', { class: 'menu', role: 'menu', onclick: (e) => e.stopPropagation() }, items);
  document.body.append(menuEl);
  const w = menuEl.offsetWidth || 220;
  menuEl.style.left = Math.max(8, Math.min(rect.right - w, window.innerWidth - w - 8)) + 'px';
  const hgt = menuEl.offsetHeight;
  menuEl.style.top = (rect.bottom + hgt + 8 > window.innerHeight ? Math.max(8, rect.top - hgt - 4) : rect.bottom + 4) + 'px';
}
const menuItem = (icon, label, fn) => h('button', { type: 'button', onclick: () => { closeMenu(); fn(); } }, ic(icon), label);
const menuLink = (icon, label, href, download) => h('a', { href, target: download ? null : '_blank', rel: 'noopener noreferrer', download: download ? '' : null, onclick: closeMenu }, ic(icon), label);

function openRowMenu(btn, r) {
  const items = [
    menuItem('eye', 'Abrir detalhes', () => openDrawer(r.page_id)),
    menuLink('external', 'Abrir na Biblioteca', r.library_url),
  ];
  if (r.domain) items.push(menuLink('external', 'Abrir o site', r.site_url || ('https://' + r.domain)));
  items.push(h('hr'));
  for (const st of ['new', 'seen', 'fav', 'discarded']) {
    if (st !== r.status) items.push(menuItem(st === 'fav' ? 'star' : st === 'discarded' ? 'trash' : 'dot', 'Marcar como ' + STATUS_LABEL[st].toLowerCase(), () => setStatus(r, st)));
  }
  openMenuAt(btn, items);
}

async function setStatus(r, status) {
  try {
    await api('/api/pages/' + encodeURIComponent(r.page_id), { method: 'PATCH', body: { status } });
    r.status = status;
    paintTable();
    refreshStatus();
  } catch (ex) { toast(ex.message, true); }
}

function paintBulk() {
  if (!bulkBox) return;
  bulkBox.replaceChildren();
  const n = S.selected.size;
  if (n) {
    const mk = (icon, label, status, cls) => h('button', { class: 'btn ' + (cls || ''), onclick: () => bulkStatus(status) }, ic(icon), label);
    const tagBtn = h('button', { class: 'btn', onclick: (e) => { e.stopPropagation(); openTagMenu(tagBtn); } }, ic('tag'), 'Etiquetar');
    bulkBox.append(h('strong', null, n + (n === 1 ? ' selecionada' : ' selecionadas')), mk('eye', 'Marcar vistas', 'seen', 'tint'), mk('star', 'Favoritar', 'fav'), tagBtn, mk('trash', 'Descartar', 'discarded'));
  } else {
    bulkBox.append(h('span', { class: 'dim' }, S.total + (S.total === 1 ? ' página na lista' : ' páginas na lista')));
  }
  const repBtn = h('button', { class: 'btn spacer', onclick: (e) => {
    e.stopPropagation();
    openMenuAt(repBtn, [
      menuLink('download', 'PDF: últimas 24 horas', '/api/report.pdf?days=1', true),
      menuLink('download', 'PDF: últimos 7 dias', '/api/report.pdf?days=7', true),
      menuLink('download', 'PDF: últimos 30 dias', '/api/report.pdf?days=30', true),
    ]);
  } }, ic('doc'), 'Relatório PDF');
  bulkBox.append(repBtn, h('a', { class: 'btn primary', href: '/api/export.csv?' + queryString().toString(), download: '' }, ic('download'), 'Exportar CSV'));
}

function openTagMenu(btn) {
  const apply = async (tag) => {
    try {
      await api('/api/pages/bulk', { method: 'POST', body: { ids: [...S.selected], addTag: tag } });
      toast('Etiqueta "' + tag + '" aplicada.');
      await loadFacets();
      if (S.fillFacets) S.fillFacets();
      await loadPages();
    } catch (ex) { toast(ex.message, true); }
  };
  const items = S.facets.tags.map((t) => menuItem('tag', t.tag, () => apply(t.tag)));
  if (items.length) items.push(h('hr'));
  items.push(menuItem('sparkle', 'Nova etiqueta...', () => {
    const name = window.prompt('Nome da etiqueta (ex: testar, copiar, vsl forte):');
    if (name && name.trim()) apply(name.trim());
  }));
  openMenuAt(btn, items);
}

async function bulkStatus(status) {
  try {
    await api('/api/pages/bulk', { method: 'POST', body: { ids: [...S.selected], status } });
    toast('Atualizado.');
    await loadPages();
    refreshStatus();
  } catch (ex) { toast(ex.message, true); }
}

async function cycleStatus(r) {
  const order = ['new', 'seen', 'fav', 'discarded'];
  const next = order[(order.indexOf(r.status) + 1) % order.length];
  try {
    await api('/api/pages/' + encodeURIComponent(r.page_id), { method: 'PATCH', body: { status: next } });
    r.status = next;
    paintTable();
  } catch (ex) { toast(ex.message, true); }
}

/* ---------- gaveta ---------- */
let drawerEl = null;
let scrimEl = null;
function buildDrawer() {
  scrimEl = h('div', { class: 'scrim', onclick: closeDrawer });
  drawerEl = h('aside', { class: 'drawer', 'aria-hidden': 'true', role: 'dialog', 'aria-label': 'Detalhes da página' });
  const wrap = h('div');
  wrap.append(scrimEl, drawerEl);
  return wrap;
}
function closeDrawer() {
  if (!drawerEl) return;
  drawerEl.classList.remove('open');
  scrimEl.classList.remove('open');
  drawerEl.setAttribute('aria-hidden', 'true');
  S.openPage = null;
}
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeDrawer(); closeMenu(); } });

async function openDrawer(id) {
  try {
    const d = await api('/api/pages/' + encodeURIComponent(id));
    const p = d.page;
    S.openPage = p.page_id;
    if (p.status === 'new') {
      api('/api/pages/' + encodeURIComponent(id), { method: 'PATCH', body: { status: 'seen' } }).then(() => {
        const row = S.rows.find((x) => x.page_id === id);
        if (row && row.status === 'new') { row.status = 'seen'; if (S.tab === 'paginas') paintTable(); }
        p.status = 'seen';
        paintSeg();
      }).catch(() => {});
      p.status = 'seen';
    }
    const notes = h('textarea', { id: 'd-notes', placeholder: 'Anotações sobre essa página' });
    notes.value = p.notes || '';
    const saveNotes = h('button', { class: 'btn small', onclick: async () => {
      try { await api('/api/pages/' + encodeURIComponent(id), { method: 'PATCH', body: { notes: notes.value } }); toast('Anotação salva.'); } catch (ex) { toast(ex.message, true); }
    } }, 'Salvar anotação');
    const seg = h('div', { class: 'statusseg' });
    function paintSeg() {
      seg.replaceChildren(...['new', 'seen', 'fav', 'discarded'].map((s) =>
        h('button', { 'aria-pressed': String(p.status === s), onclick: async () => {
          try {
            await api('/api/pages/' + encodeURIComponent(id), { method: 'PATCH', body: { status: s } });
            p.status = s;
            const row = S.rows.find((x) => x.page_id === id);
            if (row) row.status = s;
            paintSeg();
            if (S.tab === 'paginas') paintTable();
          } catch (ex) { toast(ex.message, true); }
        } }, STATUS_LABEL[s])
      ));
    }
    paintSeg();

    const kv = h('dl', { class: 'kv' },
      h('dt', null, 'Placar'), h('dd', null, scoreBadge(p.score)),
      h('dt', null, 'Oferta'), h('dd', null, p.offer_label || 'não identificada'),
      h('dt', null, 'Escala'), h('dd', null, p.scaling ? scaleText(p) : (p.delta !== null ? (p.delta > 0 ? '+' + p.delta : String(p.delta)) + ' anúncios desde a última leitura' : 'ainda sem histórico')),
      h('dt', null, 'Novos em 7 dias'), h('dd', { class: 'num' }, String(p.new7)),
      h('dt', null, 'Anúncios ativos'), h('dd', { class: 'num' }, String(p.ads_active) + (p.ads_groups ? ' (' + p.ads_groups + ' criativos distintos)' : '')),
      h('dt', null, 'Mais antigo'), h('dd', { class: 'num' }, p.days === null || p.days === undefined ? 'sem data' : p.days + ' dias'),
      h('dt', null, 'Site'), h('dd', null, p.domain ? h('a', { href: p.site_url || ('https://' + p.domain), target: '_blank', rel: 'noopener noreferrer' }, p.site_url || p.domain) : '-'),
      h('dt', null, 'Países'), h('dd', null, p.countries.join(', ') || '-'),
      h('dt', null, 'Achada por'), h('dd', null, p.terms.join(' | ') || '-'),
      h('dt', null, 'Primeira vez'), h('dd', { class: 'num' }, fmtDate(p.first_seen)),
      h('dt', null, 'Dados'), h('dd', null, p.deep ? 'varredura completa da página' : 'só da busca (ainda sem varredura da página)')
    );
    const adsBox = h('div', { class: 'adlist' });
    const adFilter = h('div', { class: 'statusseg small' });
    let adMode = 'all';
    const paintAds = () => {
      const list = d.ads.filter((a) => adMode === 'all' || (adMode === 'active' && a.is_active) || (adMode === 'new' && a.is_active && a.days !== null && a.days <= 7));
      adsBox.replaceChildren(...(list.length ? list.map(adRow) : [h('div', { class: 'empty' }, 'Nenhum anúncio neste filtro.')]));
      adFilter.replaceChildren(...[['all', 'Todos'], ['active', 'Ativos'], ['new', 'Novos (7 dias)']].map(([v, l]) =>
        h('button', { 'aria-pressed': String(adMode === v), onclick: () => { adMode = v; paintAds(); } }, l)));
    };
    paintAds();
    const tagBox = h('div', { class: 'tagbox' });
    let tags = [...p.tags];
    const saveTags = async () => {
      try {
        await api('/api/pages/' + encodeURIComponent(id), { method: 'PATCH', body: { tags } });
        const row = S.rows.find((x) => x.page_id === id);
        if (row) row.tags = [...tags];
        if (S.tab === 'paginas') paintTable();
        await loadFacets();
        if (S.fillFacets) S.fillFacets();
      } catch (ex) { toast(ex.message, true); }
    };
    const tagInput = h('input', { type: 'text', placeholder: 'Nova etiqueta', maxlength: '30', list: 'taglist' });
    const tagList = h('datalist', { id: 'taglist' }, S.facets.tags.map((t) => h('option', { value: t.tag })));
    const paintTags = () => {
      tagBox.replaceChildren(...tags.map((t) => h('span', { class: 'chip tag removable' }, t,
        h('button', { type: 'button', 'aria-label': 'Remover ' + t, onclick: () => { tags = tags.filter((x) => x !== t); paintTags(); saveTags(); } }, ic('x')))), tagInput, tagList);
    };
    tagInput.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const v = tagInput.value.trim();
      if (v && !tags.some((x) => x.toLowerCase() === v.toLowerCase()) && tags.length < 12) { tags.push(v); tagInput.value = ''; paintTags(); saveTags(); tagInput.focus(); }
    });
    paintTags();
    drawerEl.replaceChildren(
      h('div', { class: 'dhead' }, h('h3', null, p.name || '(sem nome)'), h('button', { class: 'iconbtn', onclick: closeDrawer, 'aria-label': 'Fechar' }, ic('x'))),
      h('div', { class: 'dbody' },
        h('div', { class: 'actions' },
          h('a', { class: 'btn primary', href: p.library_url, target: '_blank', rel: 'noopener noreferrer' }, 'Abrir na Biblioteca', ic('external')),
          p.domain ? h('a', { class: 'btn', href: p.site_url || ('https://' + p.domain), target: '_blank', rel: 'noopener noreferrer' }, 'Abrir o site') : null
        ),
        seg, h('div', { style: null, class: 'hint' }, ' '),
        kv,
        h('h2', { class: 'sec' }, 'Etiquetas'), tagBox,
        h('h2', { class: 'sec' }, 'Anotações'), notes, h('div', { class: 'actions' }, saveNotes),
        h('div', { class: 'sechead' }, h('h2', { class: 'sec' }, 'Criativos (' + d.ads.length + ')'), adFilter), adsBox
      )
    );
    drawerEl.classList.add('open');
    scrimEl.classList.add('open');
    drawerEl.setAttribute('aria-hidden', 'false');
  } catch (ex) { toast(ex.message, true); }
}

function adRow(a) {
  let thumb;
  const ph = () => h('div', { class: 'thumb ph' }, a.format || 'ad');
  if (a.has_thumb || a.thumb_url) {
    thumb = h('img', { class: 'thumb', src: a.has_thumb ? '/api/thumb/' + encodeURIComponent(a.ad_id) : a.thumb_url, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' });
    thumb.addEventListener('error', () => {
      if (a.has_thumb && a.thumb_url && thumb.dataset.fallback !== '1') { thumb.dataset.fallback = '1'; thumb.src = a.thumb_url; }
      else thumb.replaceWith(ph());
    });
  } else thumb = ph();
  const copy = a.body ? h('button', { type: 'button', class: 'linkbtn', onclick: async () => {
    try { await navigator.clipboard.writeText((a.title ? a.title + '\n\n' : '') + a.body); toast('Texto copiado.'); } catch { toast('Não consegui copiar.', true); }
  } }, ic('copy'), 'Copiar texto') : null;
  return h('div', { class: 'ad' }, thumb,
    h('div', null,
      a.title ? h('div', { class: 't' }, a.title) : null,
      h('div', { class: 'b' }, a.body || ''),
      h('div', { class: 'm num' },
        a.is_active ? null : h('span', { class: 'chip' }, 'inativo'),
        h('span', null, a.days === null || a.days === undefined ? 'sem data' : a.days + ' dias'),
        a.offer_type ? h('span', { class: 'chip offer' }, OFFER_LABELS[a.offer_type] || a.offer_type) : null,
        a.cta ? h('span', null, a.cta) : null,
        a.format ? h('span', null, a.format) : null,
        a.collation_count > 1 ? h('span', null, a.collation_count + ' versões') : null,
        h('a', { href: a.library_url, target: '_blank', rel: 'noopener noreferrer' }, 'Biblioteca'),
        a.link_url ? h('a', { href: a.link_url, target: '_blank', rel: 'noopener noreferrer' }, 'Destino') : null,
        copy
      )
    )
  );
}
const OFFER_LABELS = { checkout: 'Checkout direto', vsl: 'VSL', quiz: 'Quiz', vendas: 'Página de vendas', loja: 'Loja', whatsapp: 'WhatsApp', app: 'App', interno: 'Facebook/Instagram' };

/* ---------- rodadas ---------- */
async function loadRuns() {
  try {
    const [r, dbg, rep] = await Promise.all([api('/api/runs'), isAdmin() ? api('/api/debug') : Promise.resolve({ rows: [] }), api('/api/reports').catch(() => ({ rows: [] }))]);
    S.runs = r.rows;
    S.reports = rep.rows;
    S.debug = dbg.rows;
    paintRuns();
    if (S.runs.length) {
      const keep = S.runs.find((x) => x.id === S.runSel);
      showRun((keep || S.runs[0]).id);
    } else {
      const d = document.getElementById('rundetail');
      if (d) d.replaceChildren();
    }
  } catch (ex) { toast(ex.message, true); }
}

let runLog = null;
function viewRuns() {
  viewEl.append(h('div', { class: 'runs' },
    h('div', { class: 'card runlist', id: 'runlist' }),
    h('div', { class: 'rundetail', id: 'rundetail' })));
  loadRuns();
}

function paintRuns() {
  const list = document.getElementById('runlist');
  if (!list) return;
  list.replaceChildren(h('div', { class: 'runhead' }, h('h2', null, 'Rodadas'), h('p', null, 'Histórico de todas as rodadas realizadas.')));
  if (!S.runs.length) {
    list.append(h('div', { class: 'empty' }, h('div', { class: 'big' }, ic('refresh')), h('b', null, 'Nenhuma rodada'), h('p', null, 'Toque em Rodar agora para a primeira.')));
    return;
  }
  for (const r of S.runs) {
    const row = h('div', { class: 'runrow', tabindex: '0', 'data-id': String(r.id), 'aria-selected': String(S.runSel === r.id), onclick: () => showRun(r.id) },
      h('span', { class: 'id num' }, '#' + String(r.id).padStart(3, '0')),
      h('div', null,
        h('div', { class: 'l1' }, h('span', { class: 'badge ' + r.status }, RUN_LABEL[r.status] || r.status), h('span', { class: 'dim' }, fmtDateTime(r.started_at) + (r.finished_at ? ' · ' + fmtDur(r.started_at, r.finished_at) : ''))),
        h('div', { class: 'l2 num' },
          h('span', null, ic('search'), r.searches_done + ' buscas'),
          h('span', null, ic('list'), r.deep_done + ' varreduras'),
          h('span', null, ic('file'), r.pages_found + ' páginas'),
          h('span', null, ic('sparkle'), r.new_pages + ' novas'))),
      h('span', { class: 'go' }, ic('right')));
    row.addEventListener('keydown', (e) => { if (e.key === 'Enter') showRun(r.id); });
    list.append(row);
  }
}

async function showRun(id) {
  S.runSel = id;
  for (const el of document.querySelectorAll('.runrow')) el.setAttribute('aria-selected', String(el.dataset.id === String(id)));
  const box = document.getElementById('rundetail');
  if (!box) return;
  try {
    const d = await api('/api/runs/' + id);
    if (S.runSel !== id) return;
    const when = d.started_at ? new Date(d.started_at * 1000) : null;
    const sub = when
      ? 'Início em ' + when.toLocaleDateString('pt-BR') + ' às ' + when.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) + (d.finished_at ? ' · Duração: ' + fmtDur(d.started_at, d.finished_at) : '')
      : '';
    const kpi = (icon, value, label) => h('div', { class: 'kpi' }, h('div', { class: 'tile' }, ic(icon)), h('div', null, h('b', { class: 'num' }, String(value)), h('span', null, label)));
    const idle = !(S.status && S.status.running);
    let hasPlan = false;
    try { hasPlan = JSON.parse(d.plan || '[]').length > 0; } catch { hasPlan = false; }
    const canResume = idle && hasPlan && ['interrompida', 'cancelada', 'erro'].includes(d.status);
    const resume = canResume ? h('button', { class: 'btn primary', onclick: async () => {
      try { await api('/api/runs/' + id + '/resume', { method: 'POST', body: {} }); toast('Rodada retomada.'); await refreshStatus(); } catch (ex) { toast(ex.message, true); }
    } }, ic('play'), 'Retomar de onde parou (' + d.searches_done + '/' + d.searches_total + ')') : null;
    const rerun = idle ? h('button', { class: 'btn', onclick: startAllNow }, ic('refresh'), 'Rodar novamente') : null;
    const logText = d.log || '(sem registro)';
    const dlLog = h('button', { class: 'btn small', onclick: () => {
      const url = URL.createObjectURL(new Blob([logText], { type: 'text/plain;charset=utf-8' }));
      const a = h('a', { href: url, download: 'rodada-' + String(id).padStart(3, '0') + '.txt' });
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } }, ic('download'), 'Baixar log (.txt)');
    const pre = h('pre', { class: 'log' }, logText);
    const cards = [
      h('div', { class: 'card' },
        h('div', { class: 'rd-head' }, h('div', null, h('h2', null, 'Rodada #' + String(id).padStart(3, '0'), h('span', { class: 'badge ' + d.status }, RUN_LABEL[d.status] || d.status)), h('p', null, sub)), h('div', { class: 'rd-actions' }, resume, rerun)),
        h('div', { class: 'kpis' }, kpi('search', d.searches_done, 'buscas realizadas'), kpi('list', d.deep_done, 'varreduras'), kpi('file', d.pages_found, 'páginas achadas'), kpi('sparkle', d.new_pages, 'novas páginas'))),
      h('div', { class: 'card' },
        h('div', { class: 'logcard-head' }, h('div', null, h('h3', null, 'Registro da rodada'), h('p', null, 'Log completo de execução desta rodada.')), dlLog),
        pre),
    ];
    cards.push(h('div', { class: 'card' },
      h('div', { class: 'logcard-head' }, h('div', null, h('h3', null, 'Relatórios diários'), h('p', null, 'PDF com as páginas novas que passam no critério e as que estão escalando. Sai sozinho ao fim de cada rodada concluída.')),
        isAdmin() ? h('button', { class: 'btn small', onclick: async (e) => {
          const b = e.currentTarget; b.disabled = true;
          try { const r = await api('/api/reports/generate', { method: 'POST', body: {} }); toast('Relatório gerado: ' + r.name); await loadRuns(); } catch (ex) { toast(ex.message, true); }
          b.disabled = false;
        } }, ic('doc'), 'Gerar agora') : null),
      S.reports.length
        ? h('div', { class: 'files' }, S.reports.slice(0, 7).map((f) => h('div', { class: 'file' }, ic('file'), h('span', { class: 'nm' }, f.name), h('span', { class: 'sz num' }, fmtDateTime(f.mtime)),
            h('a', { class: 'btn small', href: '/api/reports/' + encodeURIComponent(f.name), download: '' }, ic('download'), 'Baixar'))))
        : h('div', { class: 'pad' }, h('div', { class: 'hint' }, 'Nenhum relatório ainda. O primeiro sai depois da primeira rodada concluída.'))));
    if (isAdmin() && S.debug && S.debug.length) {
      const fmtSize = (b) => (b > 1048576 ? (b / 1048576).toFixed(1).replace('.', ',') + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB');
      cards.push(h('div', { class: 'card' },
        h('div', { class: 'logcard-head' }, h('div', null, h('h3', null, 'Arquivos de diagnóstico'), h('p', null, 'Gerados quando a rodada é bloqueada ou volta sem anúncios.'))),
        h('div', { class: 'files' }, S.debug.slice(0, 12).map((f) =>
          h('div', { class: 'file' }, ic('file'), h('span', { class: 'nm' }, f.name), h('span', { class: 'sz num' }, fmtSize(f.size)),
            h('a', { class: 'btn small', href: '/api/debug/' + encodeURIComponent(f.name), target: '_blank', rel: 'noopener noreferrer' }, ic('download'), 'Baixar'))))));
    }
    box.replaceChildren(...cards);
    pre.scrollTop = pre.scrollHeight;
  } catch (ex) { toast(ex.message, true); }
}

/* ---------- palavras-chave ---------- */
async function loadKeywords() {
  const d = await api('/api/keywords');
  S.keywords = d.rows;
  if (d.default_countries) S.defaultCountries = d.default_countries;
}

function viewKeywords() {
  const text = h('textarea', { id: 'k-text', placeholder: 'Uma por linha. Use + entre termos:\nbajar de peso + truco + gelatina' });
  const lang = h('select', { id: 'k-lang' }, [['es', 'Espanhol'], ['en', 'Inglês'], ['pt', 'Português']].map(([v, l]) => h('option', { value: v }, l)));
  const niche = h('input', { type: 'text', id: 'k-niche', placeholder: 'Emagrecimento', maxlength: '60' });
  const countries = h('input', { type: 'text', id: 'k-countries', placeholder: 'Vazio usa os países padrão' });
  const add = h('button', { class: 'btn primary', onclick: async () => {
    if (!text.value.trim()) { toast('Escreva ao menos uma palavra-chave.', true); return; }
    try {
      const d = await api('/api/keywords', { method: 'POST', body: { text: text.value, lang: lang.value, niche: niche.value, countries: countries.value } });
      toast(d.added + ' adicionadas' + (d.skipped ? ', ' + d.skipped + ' repetidas ou vazias ignoradas' : '') + '.');
      text.value = '';
      await loadKeywords();
      paintKeywords();
    } catch (ex) { toast(ex.message, true); }
  } }, 'Adicionar');
  const field = (label, el, id) => h('div', null, h('label', { class: 'lbl', for: id }, label), el);
  const importBtn = h('button', { class: 'btn tint', onclick: async () => {
    if (!confirm('Importar a lista pronta (espanhol e inglês, Emagrecimento e Renda extra)? As que já existem são ignoradas.')) return;
    importBtn.disabled = true;
    try {
      const d = await api('/api/keywords/import-defaults', { method: 'POST', body: {} });
      toast(d.added + ' importadas' + (d.skipped ? ', ' + d.skipped + ' já existiam' : '') + '.');
      await loadKeywords();
      paintKeywords();
    } catch (ex) { toast(ex.message, true); }
    importBtn.disabled = false;
  } }, ic('doc'), 'Importar lista pronta');
  viewEl.append(h('div', { class: 'kwgrid' },
    h('div', { class: 'form-stack' },
      h('h2', { class: 'sec' }, 'Adicionar'),
      field('Palavras-chave', text, 'k-text'),
      field('Idioma', lang, 'k-lang'),
      field('Nicho', niche, 'k-niche'),
      field('Países (opcional)', countries, 'k-countries'),
      h('div', { class: 'hint' }, 'O sinal de + vira espaço na busca. Países em siglas separadas por vírgula, ex: MX, CO.'),
      add,
      h('div', { class: 'hint' }, 'Ou carregue de uma vez as combinações em espanhol e inglês dos nichos Emagrecimento e Renda extra.'),
      importBtn
    ),
    h('div', { id: 'kwlist', class: 'kwlistwrap' })
  ));
  loadKeywords().then(paintKeywords).catch((ex) => toast(ex.message, true));
}

function paintKeywords() {
  const box = document.getElementById('kwlist');
  if (!box) return;
  box.replaceChildren(h('h2', { class: 'sec' }, 'Cadastradas (' + S.keywords.length + ')'));
  if (!S.keywords.length) { box.append(h('div', { class: 'empty' }, h('b', null, 'Nenhuma palavra-chave'), 'Cole a lista ao lado e toque em Adicionar.')); return; }
  const sel = new Set();
  const bar = h('div', { class: 'bulkbar' });
  const paintBar = () => {
    bar.replaceChildren();
    if (!sel.size) return;
    const act = (label, action, cls) => h('button', { class: 'btn small ' + (cls || ''), onclick: async () => {
      if (action === 'delete' && !confirm('Apagar ' + sel.size + ' palavras-chave?')) return;
      try { await api('/api/keywords/bulk', { method: 'POST', body: { action, ids: [...sel] } }); await loadKeywords(); paintKeywords(); } catch (ex) { toast(ex.message, true); }
    } }, label);
    bar.append(h('span', null, sel.size + ' selecionadas'), act('Ativar', 'activate'), act('Desativar', 'deactivate'), act('Apagar', 'delete', 'danger'));
  };
  const tbody = h('tbody');
  for (const k of S.keywords) {
    const cb = h('input', { type: 'checkbox', 'aria-label': 'Selecionar ' + k.term });
    cb.addEventListener('change', () => { if (cb.checked) sel.add(k.id); else sel.delete(k.id); paintBar(); });
    const on = h('input', { type: 'checkbox', checked: !!k.active, 'aria-label': 'Ativa: ' + k.term });
    on.addEventListener('change', async () => {
      try { await api('/api/keywords/' + k.id, { method: 'PATCH', body: { active: on.checked } }); k.active = on.checked ? 1 : 0; } catch (ex) { toast(ex.message, true); on.checked = !on.checked; }
    });
    tbody.append(h('tr', { style: null },
      h('td', { class: 'cb' }, cb),
      h('td', null, h('div', { class: 'pname' }, k.term), h('div', { class: 'pmeta' }, [k.lang.toUpperCase(), k.niche, k.countries ? k.countries.replace(/,/g, ' ') : 'países padrão'].filter(Boolean).join(' / '))),
      h('td', { class: 'num dim' }, String(k.pages) + (k.pages === 1 ? ' página' : ' páginas')),
      h('td', { class: 'num' }, k.good ? h('span', { class: 'chip pass' }, k.good + (k.good === 1 ? ' boa' : ' boas')) : h('span', { class: 'faint' }, '0')),
      h('td', { class: 'dim' }, k.last_run_at ? ago(k.last_run_at) : 'nunca'),
      h('td', null, on)
    ));
  }
  box.append(bar, h('div', { class: 'tablewrap' }, h('table', { style: null },
    h('thead', null, h('tr', null, h('th', { class: 'cb' }), h('th', null, 'Palavra-chave'), h('th', null, 'Achou'), h('th', null, 'Boas'), h('th', null, 'Última busca'), h('th', null, 'Ativa'))),
    tbody)));
}

/* ---------- ajustes ---------- */
const NUM_FIELDS = [
  ['min_ads', 'Anúncios ativos mínimos', 'Página só passa no critério com pelo menos esse tanto.'],
  ['min_days', 'Dias rodando mínimos', 'Idade do anúncio mais antigo ainda ativo.'],
  ['max_searches_per_run', 'Buscas por rodada', 'Menos buscas, menos risco de bloqueio.'],
  ['max_deep', 'Varreduras de página por rodada', 'Quantas páginas candidatas abrir por completo.'],
  ['deep_ttl_days', 'Reabrir página após (dias)', 'Evita varrer a mesma página toda hora.'],
  ['scrolls_search', 'Rolagens por busca', 'Mais rolagens trazem mais anúncios e mais tempo.'],
  ['scrolls_page', 'Rolagens por página', ''],
  ['delay_min', 'Pausa mínima (s)', 'Entre uma ação e outra.'],
  ['delay_max', 'Pausa máxima (s)', ''],
  ['schedule_every_hours', 'Intervalo (horas)', 'Usado no modo por intervalo.'],
];

async function viewSettings() {
  try {
    const d = await api('/api/settings');
    const s = d.settings;
    const inputs = {};
    const fields = NUM_FIELDS.map(([key, label, hint]) => {
      const el = h('input', { type: 'number', id: 's-' + key, value: s[key] });
      inputs[key] = el;
      return h('div', null, h('label', { class: 'lbl', for: 's-' + key }, label), el, hint ? h('div', { class: 'hint' }, hint) : null);
    });
    const countries = h('input', { type: 'text', id: 's-countries', value: s.default_countries });
    const mode = h('select', { id: 's-mode' }, [['off', 'Desligado'], ['daily', 'Todo dia'], ['interval', 'A cada N horas']].map(([v, l]) => h('option', { value: v, selected: s.schedule_mode === v }, l)));
    const time = h('input', { type: 'time', id: 's-time', value: s.schedule_time });
    const searchMode = h('select', { id: 's-smode' }, [['wide', 'Larga (recomendado)'], ['exact', 'Exata']].map(([v, l]) => h('option', { value: v, selected: s.search_mode === v }, l)));
    const prio = h('input', { type: 'checkbox', id: 's-prio', checked: s.prioritize === '1' });
    const autoRep = h('input', { type: 'checkbox', id: 's-arep', checked: s.auto_report === '1' });
    const save = h('button', { class: 'btn primary', onclick: async () => {
      const body = { default_countries: countries.value, schedule_mode: mode.value, schedule_time: time.value, search_mode: searchMode.value, prioritize: prio.checked, auto_report: autoRep.checked };
      for (const [k, el] of Object.entries(inputs)) body[k] = el.value;
      try { await api('/api/settings', { method: 'PUT', body }); toast('Ajustes salvos.'); refreshCriteria(); } catch (ex) { toast(ex.message, true); }
    } }, 'Salvar ajustes');
    viewEl.append(h('div', { class: 'settings' },
      h('fieldset', null, h('h2', { class: 'sec' }, 'Critério e ritmo'), h('div', { class: 'fgrid' }, fields)),
      h('fieldset', null, h('h2', { class: 'sec' }, 'Países e agenda (fuso ' + d.timezone + ')'), h('div', { class: 'fgrid' },
        h('div', null, h('label', { class: 'lbl', for: 's-countries' }, 'Países padrão'), countries, h('div', { class: 'hint' }, 'Siglas separadas por vírgula.')),
        h('div', null, h('label', { class: 'lbl', for: 's-mode' }, 'Rodar sozinho'), mode),
        h('div', null, h('label', { class: 'lbl', for: 's-time' }, 'Horário (modo diário)'), time)
      )),
      h('fieldset', null, h('h2', { class: 'sec' }, 'Busca e otimização'), h('div', { class: 'fgrid' },
        h('div', null, h('label', { class: 'lbl', for: 's-smode' }, 'Modo de busca'), searchMode,
          h('div', { class: 'hint' }, 'Larga: busca só pelos 2 primeiros termos e usa os outros como filtro no texto do anúncio. Traz mais páginas. Exata: busca com todos os termos.')),
        h('div', null, h('label', { class: 'chk', for: 's-prio' }, prio, 'Priorizar palavras que rendem'),
          h('div', { class: 'hint' }, 'Quando as buscas não cabem na rodada, vão primeiro as palavras nunca rodadas e as que mais trouxeram páginas boas.')),
        h('div', null, h('label', { class: 'chk', for: 's-arep' }, autoRep, 'Relatório diário em PDF'),
          h('div', { class: 'hint' }, 'Gera um PDF ao fim de cada rodada concluída.')))),
      backupBlock(),
      h('div', { class: 'hint' }, d.proxy ? 'Proxy configurado no servidor.' : 'Sem proxy. Se o Facebook bloquear o IP da VPS, configure PROXY_SERVER nas variáveis do serviço.'),
      h('div', null, save)
    ));
  } catch (ex) { toast(ex.message, true); }
}

function backupBlock() {
  const box = h('fieldset', null, h('h2', { class: 'sec' }, 'Backup do banco'));
  const info = h('div', { class: 'hint' }, 'Carregando...');
  const dl = h('a', { class: 'btn', href: '/api/backup/download', download: '' }, 'Baixar backup agora');
  const drive = h('button', { class: 'btn', onclick: async () => {
    drive.disabled = true;
    try { const r = await api('/api/backup/drive', { method: 'POST', body: {} }); toast('Enviado ao Drive: ' + r.name); }
    catch (ex) { toast(ex.message, true); }
    drive.disabled = false;
    paintBackupInfo();
  } }, 'Enviar ao Drive agora');
  box.append(h('div', { class: 'actions' }, dl, drive), info);
  async function paintBackupInfo() {
    try {
      const st = await api('/api/backup/status');
      drive.classList.toggle('hidden', !st.drive);
      const parts = [];
      parts.push(st.drive ? 'Drive ligado: um backup automático por dia, depois das 04:30.' : 'Drive desligado. Para ligar, defina BACKUP_WEBHOOK_URL e BACKUP_KEY no EasyPanel.');
      if (st.last) parts.push('Último envio: ' + fmtDateTime(Math.floor(st.last.at)) + ' (' + (st.last.ok ? 'ok' : 'falhou') + '). ' + st.last.message);
      info.textContent = parts.join(' ');
    } catch { info.textContent = ''; }
  }
  paintBackupInfo();
  return box;
}

async function refreshCriteria() {
  try { const d = await api('/api/pages?limit=1'); S.criteria = d.criteria; } catch { /* ignora */ }
}

/* ---------- conta e acessos ---------- */
function viewAccount() {
  const wrap = h('div', { class: 'settings' });
  viewEl.append(wrap);

  if (S.user && S.user.env) {
    wrap.append(h('fieldset', null, h('h2', { class: 'sec' }, 'Sua conta'),
      h('div', { class: 'hint' }, 'Você entra como administrador (' + S.user.username + '). A senha dele é definida na variável ADMIN_PASSWORD no EasyPanel.')));
  } else {
    const cur = h('input', { type: 'password', id: 'pw-cur', autocomplete: 'current-password' });
    const nxt = h('input', { type: 'password', id: 'pw-new', autocomplete: 'new-password' });
    const btn = h('button', { class: 'btn primary', onclick: async () => {
      try {
        await api('/api/me/password', { method: 'POST', body: { current: cur.value, next: nxt.value } });
        cur.value = ''; nxt.value = '';
        toast('Senha trocada.');
      } catch (ex) { toast(ex.message, true); }
    } }, 'Trocar senha');
    wrap.append(h('fieldset', null, h('h2', { class: 'sec' }, 'Sua conta (' + (S.user ? S.user.username : '') + ')'),
      h('div', { class: 'fgrid' },
        h('div', null, h('label', { class: 'lbl', for: 'pw-cur' }, 'Senha atual'), cur),
        h('div', null, h('label', { class: 'lbl', for: 'pw-new' }, 'Nova senha (mínimo 8)'), nxt)),
      h('div', { style: null, class: 'hint' }, ' '), btn));
  }

  if (!isAdmin()) return;
  const box = h('div');
  wrap.append(h('fieldset', null, h('h2', { class: 'sec' }, 'Acessos'), box));
  loadUsers(box);
}

async function loadUsers(box) {
  try {
    const d = await api('/api/users');
    box.replaceChildren();
    const un = h('input', { type: 'text', id: 'nu-user', autocapitalize: 'none', spellcheck: 'false', placeholder: 'ex: joao' });
    const pw = h('input', { type: 'text', id: 'nu-pass', autocomplete: 'off', placeholder: 'mínimo 8 caracteres' });
    const add = h('button', { class: 'btn primary', onclick: async () => {
      try {
        await api('/api/users', { method: 'POST', body: { username: un.value, password: pw.value } });
        toast('Usuário criado. Passe o usuário e a senha para a pessoa.');
        loadUsers(box);
      } catch (ex) { toast(ex.message, true); }
    } }, 'Criar usuário');
    box.append(
      h('div', { class: 'hint' }, 'Amigos podem ver a lista, favoritar, anotar, exportar, cadastrar palavras-chave e iniciar buscas. Ajustes e acessos ficam só com você (' + d.admin + ').'),
      h('div', { class: 'fgrid', style: null },
        h('div', null, h('label', { class: 'lbl', for: 'nu-user' }, 'Usuário'), un),
        h('div', null, h('label', { class: 'lbl', for: 'nu-pass' }, 'Senha inicial'), pw)),
      h('div', { class: 'actions' }, add)
    );
    if (!d.rows.length) { box.append(h('div', { class: 'hint' }, 'Nenhum amigo cadastrado ainda.')); return; }
    const tbody = h('tbody');
    for (const u of d.rows) {
      const on = h('input', { type: 'checkbox', checked: !!u.active, 'aria-label': 'Ativo: ' + u.username });
      on.addEventListener('change', async () => {
        try { await api('/api/users/' + u.id, { method: 'PATCH', body: { active: on.checked } }); toast(on.checked ? 'Acesso liberado.' : 'Acesso bloqueado.'); }
        catch (ex) { toast(ex.message, true); on.checked = !on.checked; }
      });
      const reset = h('button', { class: 'btn small', onclick: async () => {
        const np = prompt('Nova senha para ' + u.username + ' (mínimo 8 caracteres):');
        if (!np) return;
        try { await api('/api/users/' + u.id, { method: 'PATCH', body: { password: np } }); toast('Senha redefinida.'); } catch (ex) { toast(ex.message, true); }
      } }, 'Redefinir senha');
      const del = h('button', { class: 'btn small danger', onclick: async () => {
        if (!confirm('Apagar o usuário ' + u.username + '?')) return;
        try { await api('/api/users/' + u.id, { method: 'DELETE' }); loadUsers(box); } catch (ex) { toast(ex.message, true); }
      } }, 'Apagar');
      tbody.append(h('tr', { style: null },
        h('td', null, h('div', { class: 'pname' }, u.username), h('div', { class: 'pmeta' }, 'último acesso: ' + (u.last_login_at ? ago(u.last_login_at) : 'nunca'))),
        h('td', null, on),
        h('td', null, h('div', { class: 'actions', style: null }, reset, del))
      ));
    }
    box.append(h('div', { class: 'tablewrap' }, h('table', { style: null },
      h('thead', null, h('tr', null, h('th', null, 'Usuário'), h('th', null, 'Ativo'), h('th', null, ''))), tbody)));
  } catch (ex) { toast(ex.message, true); }
}

/* ---------- partida ---------- */
async function boot() {
  try {
    const sess = await (await fetch('/api/session', { credentials: 'same-origin' })).json();
    if (!sess.authenticated) { renderLogin(); return; }
    S.user = sess.user;
    S.tab = 'inicio';
    await loadKeywords();
    S.status = await api('/api/status');
    renderShell();
    schedulePoll();
  } catch { /* login ja foi desenhado em caso de 401 */ }
}

(async function start() {
  try {
    const r = await fetch('/api/session', { credentials: 'same-origin' });
    const d = await r.json();
    if (d.authenticated) await boot(); else renderLogin();
  } catch { renderLogin(); }
})();
