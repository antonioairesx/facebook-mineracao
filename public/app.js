// Painel Garimpo. Sem build, sem dependencias. Todo texto vindo da biblioteca entra via textContent.
const root = document.getElementById('root');
const toastEl = document.getElementById('toast');

const S = {
  tab: 'paginas',
  filters: { q: '', status: 'active', min_ads: '', min_days: '', country: '', term: '', only: false },
  sort: 'ads_active',
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
};

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

function svgLogo() {
  const ns = 'http://www.w3.org/2000/svg';
  const s = document.createElementNS(ns, 'svg');
  s.setAttribute('viewBox', '0 0 32 32');
  const bars = [[7, 17, 8], [14, 11, 14], [21, 6, 19]];
  for (const [x, y, hh] of bars) {
    const r = document.createElementNS(ns, 'rect');
    r.setAttribute('x', x); r.setAttribute('y', y); r.setAttribute('width', 4); r.setAttribute('height', hh);
    r.setAttribute('rx', 1); r.setAttribute('fill', 'oklch(0.78 0.145 78)');
    s.append(r);
  }
  return s;
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
    throw new Error('Sessao expirada.');
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
  if (d < 5400) return Math.round(d / 60) + ' min atras';
  if (d < 129600) return Math.round(d / 3600) + ' h atras';
  return Math.round(d / 86400) + ' dias atras';
}
const STATUS_LABEL = { new: 'novo', seen: 'visto', fav: 'favorito', discarded: 'descartado' };
const RUN_LABEL = { concluida: 'concluida', bloqueada: 'bloqueada', erro: 'erro', cancelada: 'cancelada', interrompida: 'interrompida', rodando: 'rodando' };

/* ---------- login ---------- */
function renderLogin() {
  root.replaceChildren();
  const pass = h('input', { type: 'password', id: 'pw', autocomplete: 'current-password', autofocus: true });
  const err = h('div', { class: 'err', role: 'alert' });
  const form = h('form', { class: 'login-form' },
    h('div', null, h('label', { class: 'lbl', for: 'pw' }, 'Senha'), pass),
    err,
    h('button', { class: 'btn primary', type: 'submit' }, 'Entrar')
  );
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.textContent = '';
    try {
      await api('/api/login', { method: 'POST', body: { password: pass.value } });
      await boot();
    } catch (ex) {
      err.textContent = ex.message;
      pass.select();
    }
  });
  root.append(
    h('div', { class: 'login' },
      h('div', { class: 'login-side' },
        h('div', { class: 'login-brand' }, 'Garimpo'),
        h('h1', { class: 'login-title' }, 'Quem anuncia ', h('span', null, 'de verdade'), '.'),
        h('p', { class: 'login-note' }, 'Anunciantes da Biblioteca de Anuncios, ordenados por quantos anuncios ativos tem e ha quantos dias rodam.')
      ),
      h('div', { class: 'login-form-wrap' }, form)
    )
  );
  pass.focus();
}

/* ---------- casca ---------- */
let viewEl = null;
let runstateEl = null;
let runBtn = null;
const TABS = [['paginas', 'Paginas'], ['rodadas', 'Rodadas'], ['palavras', 'Palavras-chave'], ['ajustes', 'Ajustes']];

function renderShell() {
  root.replaceChildren();
  const tabs = h('div', { class: 'tabs', role: 'tablist' },
    TABS.map(([id, label]) =>
      h('button', { class: 'tab', role: 'tab', 'aria-selected': String(S.tab === id), 'data-tab': id, onclick: () => setTab(id) }, label)
    )
  );
  runstateEl = h('div', { class: 'runstate' });
  runBtn = h('button', { class: 'btn primary', onclick: onRunClick }, 'Rodar agora');
  const top = h('header', { class: 'top' },
    h('div', { class: 'logo' }, svgLogo(), h('span', null, 'Garimpo')),
    tabs,
    h('div', { class: 'top-right' }, runstateEl, runBtn,
      h('button', { class: 'btn ghost small', onclick: logout }, 'Sair'))
  );
  viewEl = h('main');
  root.append(top, viewEl, buildDrawer());
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
  if (S.tab === 'paginas') viewPages();
  else if (S.tab === 'rodadas') viewRuns();
  else if (S.tab === 'palavras') viewKeywords();
  else viewSettings();
}

/* ---------- estado da rodada ---------- */
function paintRunState() {
  const st = S.status;
  if (!runstateEl || !st) return;
  runstateEl.replaceChildren();
  if (st.running) {
    runstateEl.append(
      h('span', { class: 'dot on' }),
      h('span', { class: 'msg num' }, (st.phase ? st.phase + ' ' : '') + st.done + '/' + st.total + (st.message ? ' ' + st.message : ''))
    );
    runBtn.textContent = 'Parar';
    runBtn.className = 'btn danger';
  } else {
    const lr = st.last_run;
    runstateEl.append(
      h('span', { class: 'dot' }),
      h('span', { class: 'msg' }, lr ? 'Ultima rodada ' + ago(lr.finished_at || lr.started_at) + ' (' + (RUN_LABEL[lr.status] || lr.status) + ')' : 'Nenhuma rodada ainda')
    );
    runBtn.textContent = 'Rodar agora';
    runBtn.className = 'btn primary';
  }
}

async function refreshStatus() {
  try {
    const was = S.status && S.status.running;
    S.status = await api('/api/status');
    paintRunState();
    if (was && !S.status.running) {
      toast('Rodada finalizada.');
      if (S.tab === 'paginas') loadPages();
      if (S.tab === 'rodadas') loadRuns();
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
      const active = S.keywords.length ? S.keywords.filter((k) => k.active).length : null;
      if (active === 0) { toast('Nenhuma palavra-chave ativa. Cadastre na aba Palavras-chave.', true); return; }
      await api('/api/runs', { method: 'POST', body: {} });
      toast('Rodada iniciada.');
    }
    await refreshStatus();
  } catch (ex) { toast(ex.message, true); }
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
  p.set('sort', S.sort);
  p.set('dir', S.dir);
  return p;
}

let pagesBox = null;
let summaryBox = null;
let bulkBox = null;

function viewPages() {
  const f = S.filters;
  const q = h('input', { type: 'text', id: 'f-q', placeholder: 'Nome ou dominio', value: f.q });
  let qTimer = null;
  q.addEventListener('input', () => { clearTimeout(qTimer); qTimer = setTimeout(() => { f.q = q.value.trim(); loadPages(); }, 300); });
  const status = h('select', { id: 'f-status' },
    [['active', 'Sem descartadas'], ['all', 'Todas'], ['new', 'Novas'], ['seen', 'Vistas'], ['fav', 'Favoritas'], ['discarded', 'Descartadas']]
      .map(([v, l]) => h('option', { value: v, selected: f.status === v }, l)));
  status.addEventListener('change', () => { f.status = status.value; loadPages(); });
  const minAds = h('input', { type: 'number', min: '0', id: 'f-ads', placeholder: 'min', value: f.min_ads });
  minAds.addEventListener('change', () => { f.min_ads = minAds.value; loadPages(); });
  const minDays = h('input', { type: 'number', min: '0', id: 'f-days', placeholder: 'min', value: f.min_days });
  minDays.addEventListener('change', () => { f.min_days = minDays.value; loadPages(); });
  const country = h('input', { type: 'text', id: 'f-country', placeholder: 'MX', maxlength: '2', value: f.country });
  country.addEventListener('change', () => { f.country = country.value.trim().toUpperCase(); loadPages(); });
  const term = h('select', { id: 'f-term' },
    h('option', { value: '' }, 'Todas as palavras'),
    S.keywords.map((k) => h('option', { value: k.term, selected: f.term === k.term }, k.term)));
  term.addEventListener('change', () => { f.term = term.value; loadPages(); });
  const only = h('input', { type: 'checkbox', id: 'f-only', checked: f.only });
  only.addEventListener('change', () => { f.only = only.checked; loadPages(); });

  const field = (label, el, id) => h('div', null, h('label', { class: 'lbl', for: id }, label), el);
  summaryBox = h('div', { class: 'summary' });
  bulkBox = h('div', { class: 'bulkbar' });
  pagesBox = h('div');
  viewEl.append(
    summaryBox,
    h('div', { class: 'filters' },
      field('Buscar', q, 'f-q'),
      field('Status', status, 'f-status'),
      field('Anuncios (min)', minAds, 'f-ads'),
      field('Dias (min)', minDays, 'f-days'),
      field('Pais', country, 'f-country'),
      field('Palavra-chave', term, 'f-term'),
      h('label', { class: 'chk', for: 'f-only' }, only, 'So os que passam no criterio')
    ),
    bulkBox,
    pagesBox
  );
  paintSummary();
  loadPages();
}

function paintSummary() {
  if (!summaryBox) return;
  const st = S.status || {};
  summaryBox.replaceChildren(
    h('div', { class: 'stat' }, h('b', { class: 'num' }, String(st.pages ?? S.total)), h('span', null, 'paginas no banco')),
    h('div', { class: 'stat' }, h('b', { class: 'num' }, String(st.fresh ?? 0)), h('span', null, 'novas para ver')),
    h('div', { class: 'stat' }, h('b', { class: 'num' }, String(S.total)), h('span', null, 'na lista agora')),
    h('div', { class: 'stat' }, h('span', null, 'Criterio: ' + S.criteria.min_ads + '+ anuncios e ' + S.criteria.min_days + '+ dias'))
  );
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
  const th = h('th', { class: 'sortable', onclick: () => {
    if (S.sort === key) S.dir = S.dir === 'desc' ? 'asc' : 'desc';
    else { S.sort = key; S.dir = key === 'name' ? 'asc' : 'desc'; }
    loadPages();
  } }, label, S.sort === key ? h('span', { class: 'arrow' }, S.dir === 'desc' ? 'v' : '^') : null);
  return th;
}

function barCell(value, max, threshold, hit) {
  const track = h('div', { class: 'track' });
  const fill = h('div', { class: 'fill' + (hit ? ' hit' : '') });
  const pct = value === null || value === undefined ? 0 : Math.min(100, (value / max) * 100);
  fill.style.width = pct + '%';
  track.append(fill);
  if (threshold > 0 && threshold <= max) {
    const tick = h('div', { class: 'tick', title: 'Criterio: ' + threshold });
    tick.style.left = (threshold / max) * 100 + '%';
    track.append(tick);
  }
  return h('div', { class: 'barcell' }, h('span', { class: 'v num' }, value === null || value === undefined ? '-' : String(value)), track);
}

function paintTable() {
  pagesBox.replaceChildren();
  if (!S.rows.length) {
    const none = (S.status && S.status.pages) ? 'Nada bate com esses filtros. Afrouxe um deles.' : 'Ainda nao ha paginas. Cadastre palavras-chave e toque em Rodar agora.';
    pagesBox.append(h('div', { class: 'empty' }, h('b', null, 'Lista vazia'), none));
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
    sortHeader('Pagina', 'name'),
    sortHeader('Anuncios ativos', 'ads_active'),
    sortHeader('Dias rodando', 'days'),
    h('th', null, 'Site'),
    h('th', null, 'Paises'),
    h('th', null, 'Status'),
    sortHeader('Visto em', 'first_seen')
  ));
  const tbody = h('tbody');
  for (const r of S.rows) {
    const cb = h('input', { type: 'checkbox', 'aria-label': 'Selecionar ' + r.name, checked: S.selected.has(r.page_id) });
    cb.addEventListener('click', (e) => e.stopPropagation());
    cb.addEventListener('change', () => { if (cb.checked) S.selected.add(r.page_id); else S.selected.delete(r.page_id); paintBulk(); });
    const pill = h('button', { class: 'pill ' + r.status, title: 'Clique para mudar o status', onclick: (e) => { e.stopPropagation(); cycleStatus(r); } }, STATUS_LABEL[r.status] || r.status);
    const site = r.domain
      ? h('a', { href: r.site_url || ('https://' + r.domain), target: '_blank', rel: 'noopener noreferrer', onclick: (e) => e.stopPropagation() }, r.domain)
      : h('span', { class: 'faint' }, '-');
    const tr = h('tr', { class: (r.status === 'new' ? 'is-new ' : '') + (r.status === 'discarded' ? 'is-discarded' : ''), tabindex: '0', onclick: () => openDrawer(r.page_id) },
      h('td', { class: 'cb' }, cb),
      h('td', null,
        h('div', { class: 'pname' }, r.name || '(sem nome)'),
        h('div', { class: 'pmeta' }, r.qualifies ? h('span', { class: 'flag' }, 'passa no criterio') : null, r.qualifies ? ' ' : null, r.terms.length ? r.terms[0] + (r.terms.length > 1 ? ' +' + (r.terms.length - 1) : '') : '')
      ),
      h('td', null, barCell(r.ads_active, maxAds, S.criteria.min_ads, r.ads_active >= S.criteria.min_ads)),
      h('td', null, barCell(r.days, maxDays, S.criteria.min_days, r.days !== null && r.days >= S.criteria.min_days)),
      h('td', null, site),
      h('td', { class: 'dim' }, r.countries.join(' ')),
      h('td', null, pill),
      h('td', { class: 'dim num' }, fmtDate(r.first_seen))
    );
    tr.addEventListener('keydown', (e) => { if (e.key === 'Enter') openDrawer(r.page_id); });
    tbody.append(tr);
  }
  pagesBox.append(h('div', { class: 'tablewrap' }, h('table', null, thead, tbody)));
  if (S.rows.length < S.total) {
    pagesBox.append(h('div', { class: 'more' }, h('button', { class: 'btn', onclick: () => loadPages(true) }, 'Carregar mais (' + (S.total - S.rows.length) + ')')));
  }
}

function paintBulk() {
  if (!bulkBox) return;
  bulkBox.replaceChildren();
  const n = S.selected.size;
  if (n) {
    const mk = (label, status) => h('button', { class: 'btn small', onclick: () => bulkStatus(status) }, label);
    bulkBox.append(h('span', null, n + ' selecionadas'), mk('Marcar vistas', 'seen'), mk('Favoritar', 'fav'), mk('Descartar', 'discarded'));
  }
  bulkBox.append(h('a', { href: '/api/export.csv?' + queryString().toString(), class: 'btn small', style: null, download: '' }, 'Exportar CSV'));
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
  drawerEl = h('aside', { class: 'drawer', 'aria-hidden': 'true', role: 'dialog', 'aria-label': 'Detalhes da pagina' });
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
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDrawer(); });

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
    const notes = h('textarea', { id: 'd-notes', placeholder: 'Anotacoes sobre essa pagina' });
    notes.value = p.notes || '';
    const saveNotes = h('button', { class: 'btn small', onclick: async () => {
      try { await api('/api/pages/' + encodeURIComponent(id), { method: 'PATCH', body: { notes: notes.value } }); toast('Anotacao salva.'); } catch (ex) { toast(ex.message, true); }
    } }, 'Salvar anotacao');
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
      h('dt', null, 'Anuncios ativos'), h('dd', { class: 'num' }, String(p.ads_active) + (p.ads_groups ? ' (' + p.ads_groups + ' criativos distintos)' : '')),
      h('dt', null, 'Mais antigo'), h('dd', { class: 'num' }, p.days === null || p.days === undefined ? 'sem data' : p.days + ' dias'),
      h('dt', null, 'Site'), h('dd', null, p.domain ? h('a', { href: p.site_url || ('https://' + p.domain), target: '_blank', rel: 'noopener noreferrer' }, p.site_url || p.domain) : '-'),
      h('dt', null, 'Paises'), h('dd', null, p.countries.join(', ') || '-'),
      h('dt', null, 'Achada por'), h('dd', null, p.terms.join(' | ') || '-'),
      h('dt', null, 'Primeira vez'), h('dd', { class: 'num' }, fmtDate(p.first_seen)),
      h('dt', null, 'Dados'), h('dd', null, p.deep ? 'varredura completa da pagina' : 'so da busca (ainda sem varredura da pagina)')
    );
    const ads = h('div', { class: 'adlist' }, d.ads.length ? d.ads.map(adRow) : h('div', { class: 'empty' }, 'Nenhum anuncio guardado ainda.'));
    drawerEl.replaceChildren(
      h('div', { class: 'dhead' }, h('h3', null, p.name || '(sem nome)'), h('button', { class: 'btn ghost small', onclick: closeDrawer, 'aria-label': 'Fechar' }, 'Fechar')),
      h('div', { class: 'dbody' },
        h('div', { class: 'actions' },
          h('a', { class: 'btn primary', href: p.library_url, target: '_blank', rel: 'noopener noreferrer' }, 'Abrir na Biblioteca'),
          p.domain ? h('a', { class: 'btn', href: p.site_url || ('https://' + p.domain), target: '_blank', rel: 'noopener noreferrer' }, 'Abrir o site') : null
        ),
        seg, h('div', { style: null, class: 'hint' }, ' '),
        kv,
        h('h2', { class: 'sec' }, 'Anotacoes'), notes, h('div', { class: 'actions' }, saveNotes),
        h('h2', { class: 'sec' }, 'Anuncios (' + d.ads.length + ')'), ads
      )
    );
    drawerEl.classList.add('open');
    scrimEl.classList.add('open');
    drawerEl.setAttribute('aria-hidden', 'false');
  } catch (ex) { toast(ex.message, true); }
}

function adRow(a) {
  const thumb = a.thumb_url
    ? h('img', { class: 'thumb', src: a.thumb_url, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' })
    : h('div', { class: 'thumb ph' }, a.format || 'ad');
  return h('div', { class: 'ad' }, thumb,
    h('div', null,
      a.title ? h('div', { class: 't' }, a.title) : null,
      h('div', { class: 'b' }, a.body || ''),
      h('div', { class: 'm num' },
        h('span', null, a.days === null || a.days === undefined ? 'sem data' : a.days + ' dias'),
        a.cta ? h('span', null, a.cta) : null,
        a.format ? h('span', null, a.format) : null,
        a.collation_count > 1 ? h('span', null, a.collation_count + ' versoes') : null,
        h('a', { href: a.library_url, target: '_blank', rel: 'noopener noreferrer' }, 'Biblioteca'),
        a.link_url ? h('a', { href: a.link_url, target: '_blank', rel: 'noopener noreferrer' }, 'Destino') : null
      )
    )
  );
}

/* ---------- rodadas ---------- */
async function loadRuns() {
  try {
    const [r, dbg] = await Promise.all([api('/api/runs'), api('/api/debug')]);
    S.runs = r.rows;
    paintRuns(dbg.rows);
  } catch (ex) { toast(ex.message, true); }
}

let runLog = null;
function viewRuns() {
  runLog = h('pre', { class: 'log' }, 'Escolha uma rodada para ver o registro.');
  viewEl.append(h('div', { class: 'runs' }, h('div', { id: 'runlist' }), h('div', null, h('h2', { class: 'sec' }, 'Registro'), runLog, h('div', { id: 'dbg', class: 'debuglist' }))));
  loadRuns();
}

function paintRuns(debugRows) {
  const list = document.getElementById('runlist');
  if (!list) return;
  list.replaceChildren(h('h2', { class: 'sec' }, 'Rodadas'));
  if (!S.runs.length) { list.append(h('div', { class: 'empty' }, h('b', null, 'Nenhuma rodada'), 'Toque em Rodar agora para a primeira.')); }
  else {
    const box = h('div', { class: 'box' });
    for (const r of S.runs) {
      const row = h('div', { class: 'runrow', tabindex: '0', onclick: () => showRun(r.id, row) },
        h('span', { class: 'num dim' }, '#' + r.id),
        h('div', null,
          h('div', null, h('span', { class: 'st ' + r.status }, RUN_LABEL[r.status] || r.status), ' ', h('span', { class: 'dim' }, fmtDateTime(r.started_at) + ' ' + fmtDur(r.started_at, r.finished_at))),
          h('div', { class: 'pmeta num' }, r.searches_done + '/' + r.searches_total + ' buscas, ' + r.deep_done + ' varreduras, ' + r.pages_found + ' paginas (' + r.new_pages + ' novas)'),
          r.error ? h('div', { class: 'pmeta' }, r.error.slice(0, 120)) : null
        ),
        h('span')
      );
      row.addEventListener('keydown', (e) => { if (e.key === 'Enter') showRun(r.id, row); });
      box.append(row);
    }
    list.append(box);
  }
  const dbg = document.getElementById('dbg');
  if (dbg) {
    dbg.replaceChildren();
    if (debugRows && debugRows.length) {
      dbg.append(h('h2', { class: 'sec' }, 'Arquivos de diagnostico'), h('div', { class: 'hint' }, 'Gerados quando a rodada e bloqueada ou volta sem anuncios. Envie para ajustar o minerador.'), h('div'));
      const wrap = dbg.lastChild;
      for (const f of debugRows.slice(0, 12)) wrap.append(h('a', { href: '/api/debug/' + encodeURIComponent(f.name), target: '_blank', rel: 'noopener noreferrer' }, f.name));
    }
  }
}

async function showRun(id, row) {
  for (const el of document.querySelectorAll('.runrow')) el.removeAttribute('aria-selected');
  row.setAttribute('aria-selected', 'true');
  try {
    const d = await api('/api/runs/' + id);
    runLog.textContent = d.log || '(sem registro)';
    runLog.scrollTop = runLog.scrollHeight;
  } catch (ex) { toast(ex.message, true); }
}

/* ---------- palavras-chave ---------- */
async function loadKeywords() {
  const d = await api('/api/keywords');
  S.keywords = d.rows;
}

function viewKeywords() {
  const text = h('textarea', { id: 'k-text', placeholder: 'Uma por linha. Use + entre termos:\nbajar de peso + truco + gelatina' });
  const lang = h('select', { id: 'k-lang' }, [['es', 'Espanhol'], ['en', 'Ingles'], ['pt', 'Portugues']].map(([v, l]) => h('option', { value: v }, l)));
  const niche = h('input', { type: 'text', id: 'k-niche', placeholder: 'Emagrecimento', maxlength: '60' });
  const countries = h('input', { type: 'text', id: 'k-countries', placeholder: 'Vazio usa os paises padrao' });
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
  viewEl.append(h('div', { class: 'kwgrid' },
    h('div', { class: 'form-stack' },
      h('h2', { class: 'sec' }, 'Adicionar'),
      field('Palavras-chave', text, 'k-text'),
      field('Idioma', lang, 'k-lang'),
      field('Nicho', niche, 'k-niche'),
      field('Paises (opcional)', countries, 'k-countries'),
      h('div', { class: 'hint' }, 'O sinal de + vira espaco na busca. Paises em siglas separadas por virgula, ex: MX, CO.'),
      add
    ),
    h('div', { id: 'kwlist' })
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
      h('td', null, h('div', { class: 'pname' }, k.term), h('div', { class: 'pmeta' }, [k.lang.toUpperCase(), k.niche, k.countries ? k.countries.replace(/,/g, ' ') : 'paises padrao'].filter(Boolean).join(' / '))),
      h('td', { class: 'num dim' }, String(k.pages) + ' paginas'),
      h('td', { class: 'dim' }, k.last_run_at ? ago(k.last_run_at) : 'nunca'),
      h('td', null, on)
    ));
  }
  box.append(bar, h('div', { class: 'tablewrap' }, h('table', { style: null },
    h('thead', null, h('tr', null, h('th', { class: 'cb' }), h('th', null, 'Palavra-chave'), h('th', null, 'Achou'), h('th', null, 'Ultima busca'), h('th', null, 'Ativa'))),
    tbody)));
}

/* ---------- ajustes ---------- */
const NUM_FIELDS = [
  ['min_ads', 'Anuncios ativos minimos', 'Pagina so passa no criterio com pelo menos esse tanto.'],
  ['min_days', 'Dias rodando minimos', 'Idade do anuncio mais antigo ainda ativo.'],
  ['max_searches_per_run', 'Buscas por rodada', 'Menos buscas, menos risco de bloqueio.'],
  ['max_deep', 'Varreduras de pagina por rodada', 'Quantas paginas candidatas abrir por completo.'],
  ['deep_ttl_days', 'Reabrir pagina apos (dias)', 'Evita varrer a mesma pagina toda hora.'],
  ['scrolls_search', 'Rolagens por busca', 'Mais rolagens trazem mais anuncios e mais tempo.'],
  ['scrolls_page', 'Rolagens por pagina', ''],
  ['delay_min', 'Pausa minima (s)', 'Entre uma acao e outra.'],
  ['delay_max', 'Pausa maxima (s)', ''],
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
    const save = h('button', { class: 'btn primary', onclick: async () => {
      const body = { default_countries: countries.value, schedule_mode: mode.value, schedule_time: time.value };
      for (const [k, el] of Object.entries(inputs)) body[k] = el.value;
      try { await api('/api/settings', { method: 'PUT', body }); toast('Ajustes salvos.'); refreshCriteria(); } catch (ex) { toast(ex.message, true); }
    } }, 'Salvar ajustes');
    viewEl.append(h('div', { class: 'settings' },
      h('fieldset', null, h('h2', { class: 'sec' }, 'Criterio e ritmo'), h('div', { class: 'fgrid' }, fields)),
      h('fieldset', null, h('h2', { class: 'sec' }, 'Paises e agenda (fuso ' + d.timezone + ')'), h('div', { class: 'fgrid' },
        h('div', null, h('label', { class: 'lbl', for: 's-countries' }, 'Paises padrao'), countries, h('div', { class: 'hint' }, 'Siglas separadas por virgula.')),
        h('div', null, h('label', { class: 'lbl', for: 's-mode' }, 'Rodar sozinho'), mode),
        h('div', null, h('label', { class: 'lbl', for: 's-time' }, 'Horario (modo diario)'), time)
      )),
      h('div', { class: 'hint' }, d.proxy ? 'Proxy configurado no servidor.' : 'Sem proxy. Se o Facebook bloquear o IP da VPS, configure PROXY_SERVER nas variaveis do servico.'),
      h('div', null, save)
    ));
  } catch (ex) { toast(ex.message, true); }
}

async function refreshCriteria() {
  try { const d = await api('/api/pages?limit=1'); S.criteria = d.criteria; } catch { /* ignora */ }
}

/* ---------- partida ---------- */
async function boot() {
  try {
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
