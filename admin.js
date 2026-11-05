/* Страница «Админ» (admin.html). Отдельная страница вместо вкладки карты
   (решение владельца 06.11.2026), переделана для удобства: меню слева,
   «Главная» со сводкой и быстрыми действиями, учётка и карта открываются в
   выезжающей панели, подтверждения — своим окном, у списков — поиск.
   Работает через ту же сессию, что и карта; всё пишет только роль admin —
   сервер проверяет сам. Общие помощники (esc, uiIcon, toast, parseSheet,
   toRecs…) — в common.js. */
'use strict';

const SERVER_URL = window._HM_SERVER_URL || '';
const PERMS = [
  ['layers', 'Свои слои из Excel', 'Загружать свои тепловые слои и слои точек — их видит только он'],
  ['manual', 'Точки вручную с фото', 'Ставить точки на карте вручную, с карточкой и фото'],
  ['bounds', 'Свои границы', 'Рисовать свои зоны на вкладке «Границы»'],
];
const KEY_LABELS = { maps: 'Список карт', auth_overrides: 'Пароли, заданные здесь', auth_accounts: 'Учётки, созданные здесь',
  account_perms: 'Права и карты учёток', role_rules: 'Права по умолчанию (старые)', shared_layers: 'Общие слои', dataset: 'Базовые данные (районы)' };
const RENDER_RAM = 512 * 1048576;   // память сервера на тарифе Render

Object.assign(UI_ICONS, {
  home: '<rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  userplus: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" x2="19" y1="8" y2="14"/><line x1="22" x2="16" y1="11" y2="11"/>',
  map: '<path d="M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0z"/><path d="M15 5.764v15"/><path d="M9 3.236v15"/>',
  layers: '<path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/>',
  shield: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>',
  server: '<rect width="20" height="8" x="2" y="2" rx="2" ry="2"/><rect width="20" height="8" x="2" y="14" rx="2" ry="2"/><line x1="6" x2="6.01" y1="6" y2="6"/><line x1="6" x2="6.01" y1="18" y2="18"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  key: '<path d="m15.5 7.5 2.3 2.3a1 1 0 0 0 1.4 0l2.1-2.1a1 1 0 0 0 0-1.4L19 4"/><path d="m21 2-9.6 9.6"/><circle cx="7.5" cy="15.5" r="5.5"/>',
  copy: '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
  external: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  right: '<path d="m9 18 6-6-6-6"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/>',
  back: '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
  refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
  history: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11"/>',
  image: '<rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>',
});

let SESSION_TOKEN = '', WRITE_KEY = '', ME = null;
const D = { maps: [], users: null, layers: null, storage: null, rules: null };   // данные сервера

const $ = id => document.getElementById(id);
const fmtN = n => (Number(n) || 0).toLocaleString('ru-RU');
const pts = n => fmtN(n) + ' ' + plural(Number(n) || 0, 'точка', 'точки', 'точек');
const fmtDate = v => (v ? new Date(v).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');
const mapName = id => (D.maps.find(m => m.id === id) || { name: id }).name;
function genPassword() {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const buf = new Uint32Array(12); crypto.getRandomValues(buf);
  return Array.from(buf, n => abc[n % abc.length]).join('');
}
const switchHtml = (on, attrs, label, disabled) =>
  `<div class="cbx sm${on ? ' on' : ''}" role="switch" tabindex="${disabled ? -1 : 0}" aria-checked="${!!on}" aria-label="${esc(label)}"${disabled ? ' aria-disabled="true" style="opacity:.5;pointer-events:none"' : ''} ${attrs}></div>`;
function wireSwitch(el, fn) {
  const go = () => fn(el.getAttribute('aria-checked') !== 'true');
  el.addEventListener('click', go);
  el.addEventListener('keydown', e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); go(); } });
}
const skeleton = (n = 3) => Array.from({ length: n }, () => '<div class="a-skel"></div>').join('');
function memState(rss) {
  const share = rss / RENDER_RAM;
  return share > 0.85 ? ['bad', 'почти на пределе'] : share > 0.65 ? ['warn', 'много занято'] : ['', 'в норме'];
}

/* ── Сервер ─────────────────────────────────────────────────────────── */
const authHeaders = (extra = {}) => (SESSION_TOKEN ? { ...extra, Authorization: 'Bearer ' + SESSION_TOKEN } : { ...extra });
async function errorText(res) {
  let msg = '';
  try { msg = ((await res.json()) || {}).error || ''; } catch (_) {}
  if (res.status === 401) return 'Сессия закончилась — войдите заново';
  return msg || ('Ошибка сервера (HTTP ' + res.status + ')');
}
async function api(path, timeoutMs = 60000) {
  const res = await fetch(SERVER_URL + path, { headers: authHeaders(), credentials: 'include', signal: AbortSignal.timeout(timeoutMs) });
  if (res.status === 401) { showLogin('Сессия закончилась — войдите заново'); throw new Error('Сессия закончилась'); }
  if (!res.ok) throw new Error(await errorText(res));
  return res.json();
}
async function post(path, body, timeoutMs = 60000) {
  const res = await fetch(SERVER_URL + path, {
    method: 'POST', credentials: 'include', signal: AbortSignal.timeout(timeoutMs),
    headers: authHeaders({ 'Content-Type': 'application/json', 'X-API-Key': WRITE_KEY }), body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await errorText(res));
  return res.json().catch(() => ({}));
}
// Действие: уведомление об успехе или ошибке; true — получилось.
async function act(fn, okText) {
  try {
    const r = await fn();
    if (okText) toast(typeof okText === 'function' ? okText(r) : okText, 'ok', 3000);
    return true;
  } catch (e) { toast(e.message, 'err', 5000); return false; }
}
const loaders = {
  maps: async () => { D.maps = (await api('/maps')).maps || []; },
  users: async () => { const j = await api('/auth/users'); D.users = j.users || []; D.pwMin = j.min || 8; },
  layers: async () => { D.layers = await api('/admin/layers', 120000); },
  storage: async () => { D.storage = await api('/admin/storage', 120000); },
  rules: async () => { D.rules = (await api('/auth/rules')).rules || {}; },
  log: async () => { D.log = await api('/admin/log?limit=8'); },
};
async function load(...names) { await Promise.all(names.map(n => loaders[n]())); updateCounts(); }

/* ── Окно подтверждения и выезжающая панель ─────────────────────────── */
let _dlgDone = null;
// ask({ title, text(html), ok, danger, input: { label, placeholder, value, must } }) → true/строка | false
function ask({ title, text = '', ok = 'Да', danger = false, input = null }) {
  return new Promise(resolve => {
    if (_dlgDone) _dlgDone(false);
    const wrap = $('a-dialog'), okBtn = $('a-dlg-ok');
    $('a-dlg-title').textContent = title;
    $('a-dlg-text').innerHTML = text + (input ? `<label class="a-field"><span>${esc(input.label)}</span><input class="mf-input" id="a-dlg-input" value="${esc(input.value || '')}" placeholder="${esc(input.placeholder || '')}" autocomplete="off"/></label>` : '');
    okBtn.textContent = ok;
    okBtn.className = 'a-btn' + (danger ? ' danger-fill' : '');
    wrap.hidden = false;
    const inp = $('a-dlg-input');
    const valid = () => !input || (input.must ? inp.value.trim().toLowerCase() === input.must.toLowerCase() : !!inp.value.trim());
    if (inp) { inp.addEventListener('input', () => { okBtn.disabled = !valid(); }); inp.addEventListener('keydown', e => { if (e.key === 'Enter' && valid()) done(true); }); }
    okBtn.disabled = !valid();
    const prev = document.activeElement;
    const done = yes => {
      wrap.hidden = true; _dlgDone = null;
      resolve(yes ? (input ? inp.value.trim() : true) : false);
      if (prev && prev.focus) prev.focus();
    };
    _dlgDone = done;
    (inp || (danger ? $('a-dlg-cancel') : okBtn)).focus();
  });
}
$('a-dlg-ok').addEventListener('click', () => _dlgDone && _dlgDone(true));
$('a-dlg-cancel').addEventListener('click', () => _dlgDone && _dlgDone(false));
$('a-dialog').addEventListener('click', e => { if (e.target === $('a-dialog') && _dlgDone) _dlgDone(false); });

let _drawer = null;   // { render, onClose }
function openDrawer({ title, sub = '', wide = false, render, onClose }) {
  _drawer = { render, onClose, title };
  $('a-drawer').classList.toggle('wide', wide);
  $('a-drawer-title').textContent = title;
  $('a-drawer-sub').textContent = sub;
  $('a-drawer').hidden = false; $('a-scrim').hidden = false;
  document.body.style.overflow = 'hidden';
  render($('a-drawer-body'));
  $('a-drawer-close').focus();
}
function setDrawerHead(title, sub) { $('a-drawer-title').textContent = title; $('a-drawer-sub').textContent = sub || ''; }
function redrawDrawer() { if (_drawer) _drawer.render($('a-drawer-body')); }
function closeDrawer() {
  if (!_drawer) return;
  const d = _drawer; _drawer = null;
  $('a-drawer').hidden = true; $('a-scrim').hidden = true;
  document.body.style.overflow = '';
  $('a-drawer-body').innerHTML = '';
  if (d.onClose) d.onClose();
}
$('a-drawer-close').innerHTML = uiIcon('x', 18);
$('a-drawer-close').addEventListener('click', closeDrawer);
$('a-scrim').addEventListener('click', closeDrawer);
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if (_dlgDone) _dlgDone(false); else if (_drawer) closeDrawer();
});

/* ── Вход ───────────────────────────────────────────────────────────── */
function showLogin(sub) {
  closeDrawer();
  $('ad-app').hidden = true; $('ad-login').hidden = false;
  if (sub) $('ad-login-sub').textContent = sub;
  $('ad-user').focus();
}
async function boot() {
  try {
    const res = await fetch(SERVER_URL + '/auth/me', { headers: authHeaders(), credentials: 'include', signal: AbortSignal.timeout(20000) });
    if (!res.ok) return showLogin();
    ME = await res.json();
  } catch (_) { return showLogin('Сервер не отвечает — попробуйте ещё раз через минуту'); }
  if (ME.token) SESSION_TOKEN = ME.token;
  WRITE_KEY = ME.writeKey || '';
  if (ME.role !== 'admin') return showLogin('Эта страница только для админа. Войдите под учёткой владельца.');
  $('ad-login').hidden = true; $('ad-app').hidden = false;
  $('a-me-name').textContent = ME.username;
  $('a-me-av').textContent = ME.username.slice(0, 1).toUpperCase();
  try { await load('maps'); } catch (e) { toast('Не удалось загрузить карты: ' + e.message, 'err', 5000); }
  route();
}
$('ad-login-form').addEventListener('submit', async e => {
  e.preventDefault();
  const err = $('ad-login-err'), btn = $('ad-login-btn');
  err.textContent = ''; btn.disabled = true;
  try {
    const res = await fetch(SERVER_URL + '/auth/login', {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: $('ad-user').value.trim(), password: $('ad-pass').value }), signal: AbortSignal.timeout(30000),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) { err.textContent = res.status === 401 ? 'Неверный логин или пароль' : (j.error || 'Не удалось войти'); return; }
    SESSION_TOKEN = j.token || '';
    $('ad-pass').value = '';
    await boot();
  } catch (_) { err.textContent = 'Сервер не отвечает — попробуйте ещё раз'; } finally { btn.disabled = false; }
});
$('ad-logout').innerHTML = uiIcon('logout', 17);
$('ad-logout').addEventListener('click', async () => {
  try { await fetch(SERVER_URL + '/auth/logout', { method: 'POST', credentials: 'include' }); } catch (_) {}
  SESSION_TOKEN = ''; WRITE_KEY = ''; ME = null;
  showLogin('Вы вышли');
});
$('a-tomap').innerHTML = uiIcon('back', 15) + ' К карте';

/* ── Меню и разделы ─────────────────────────────────────────────────── */
const SECTIONS = [
  ['home', 'Главная', 'home', renderHome],
  ['users', 'Учётки', 'users', renderUsers],
  ['maps', 'Карты', 'map', renderMaps],
  ['layers', 'Слои и точки', 'layers', renderLayers],
  ['log', 'Журнал', 'history', renderLog],
  ['server', 'Сервер', 'server', renderServer],
];
$('a-nav').innerHTML = SECTIONS.map(([id, label, ic]) =>
  `<a href="#${id}" data-sec="${id}">${uiIcon(ic, 18)}<span>${label}</span><span class="a-count" data-count="${id}"></span></a>`).join('');
function updateCounts() {
  const set = (id, v) => { const el = document.querySelector(`[data-count="${id}"]`); if (el) el.textContent = v == null ? '' : fmtN(v); };
  set('users', D.users && D.users.length);
  set('maps', D.maps.length || null);
  set('layers', D.layers && (D.layers.maps.reduce((a, m) => a + m.layers.length, 0) + D.layers.shared.length));
}
let _section = '';
function route() {
  if (!ME) return;
  const id = SECTIONS.some(s => s[0] === location.hash.slice(1)) ? location.hash.slice(1) : 'home';
  const sec = SECTIONS.find(s => s[0] === id);
  document.querySelectorAll('.a-nav a').forEach(a => {
    const on = a.dataset.sec === id;
    a.classList.toggle('on', on);
    if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  if (_section !== id) { closeDrawer(); window.scrollTo(0, 0); }
  _section = id;
  document.title = sec[1] + ' · Админ';
  sec[3]();
}
window.addEventListener('hashchange', route);
const go = id => { if (location.hash === '#' + id) route(); else location.hash = id; };
function page(title, sub, acts = '') {
  return `<div class="a-head"><div><h1>${esc(title)}</h1>${sub ? `<p>${sub}</p>` : ''}</div><div class="a-head-acts">${acts}</div></div>`;
}
const mobileFoot = () => `<div class="a-mobile-foot"><a class="a-btn ghost" href="index.html">${uiIcon('back', 15)} К карте</a><button type="button" class="a-btn ghost" data-logout>${uiIcon('logout', 15)} Выйти</button></div>`;
function main(html) {
  const m = $('a-main');
  m.innerHTML = html + mobileFoot();
  m.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => go(b.dataset.go)));
  m.querySelectorAll('[data-logout]').forEach(b => b.addEventListener('click', () => $('ad-logout').click()));
  return m;
}
const stale = id => _section !== id;   // пока грузили, пользователь ушёл в другой раздел

/* ── Главная ────────────────────────────────────────────────────────── */
async function renderHome() {
  const hello = new Date().getHours() < 12 ? 'Доброе утро' : new Date().getHours() < 18 ? 'Добрый день' : 'Добрый вечер';
  const quick = `<div class="a-quick">
    <button type="button" class="a-btn" data-quick="user">${uiIcon('userplus', 16)} Новая учётка</button>
    <button type="button" class="a-btn ghost" data-quick="map">${uiIcon('plus', 16)} Новая карта</button>
    <button type="button" class="a-btn ghost" data-quick="shared">${uiIcon('upload', 16)} Общий слой из Excel</button></div>`;
  const draw = () => {
    const users = D.users || [], L = D.layers, S = D.storage;
    const layerN = L ? L.maps.reduce((a, m) => a + m.layers.length, 0) + L.shared.length : null;
    const pointN = L ? L.maps.reduce((a, m) => a + m.layers.reduce((b, l) => b + l.n, 0), 0) + L.shared.reduce((a, l) => a + l.n, 0) : null;
    const mem = S ? memState(S.process.rss) : null;
    const share = S ? Math.min(100, Math.round(S.process.rss / RENDER_RAM * 100)) : 0;
    const tile = (sec, ic, title, value, note, extra = '') =>
      `<a class="a-stat" href="#${sec}"><span class="a-stat-top"><span class="a-stat-ic">${uiIcon(ic, 16)}</span>${title}</span><b>${value}</b><small>${note}</small>${extra}</a>`;
    const admins = users.filter(u => u.role === 'admin').length;
    const byRole = `админов: ${admins} · остальных: ${users.length - admins}`;
    const m = main(page(`${hello}, ${ME.username}`, 'Здесь управляются учётки, карты, слои и сервер. Изменения действуют сразу.', '') + quick +
      '<div style="height:16px"></div><div class="a-grid">' +
      tile('users', 'users', 'Учётки', D.users ? fmtN(users.length) : '…', D.users ? esc(byRole || 'нет учёток') : 'загружаем') +
      tile('maps', 'map', 'Карты', fmtN(D.maps.length), esc(D.maps.map(x => x.name).slice(0, 3).join(', ') + (D.maps.length > 3 ? '…' : ''))) +
      tile('layers', 'layers', 'Слои', layerN == null ? '…' : fmtN(layerN), pointN == null ? 'загружаем' : 'всего ' + pts(pointN)) +
      tile('server', 'server', 'Память сервера', S ? share + ' %' : '…', S ? `${fmtBytes(S.process.rss)} из 512 МБ · <span class="a-status ${mem[0]}">${mem[1]}</span>` : 'загружаем',
        S ? `<div class="a-gauge ${mem[0]}"><i style="width:${share}%"></i></div>` : '') +
      tile('log', 'history', 'Ошибки за сутки', D.log ? fmtN(D.log.errors24h) : '…', D.log ? (D.log.errors24h ? 'посмотреть в журнале' : 'всё спокойно') + (D.log.warn24h ? ` · отказов: ${fmtN(D.log.warn24h)}` : '') : 'загружаем') +
      '</div>' +
      (D.log && D.log.rows.length ? `<div class="a-h2" style="margin-top:20px;display:flex;justify-content:space-between;align-items:center">Последние действия <a class="a-link" href="#log">Весь журнал</a></div><div class="a-panel">${logListHtml(D.log.rows)}</div>` : '') +
      (S && S.photos.orphans.count ? `<div class="a-panel a-pad" style="margin-top:16px"><b>Можно освободить место:</b> ${fmtN(S.photos.orphans.count)} ${plural(S.photos.orphans.count, 'фото', 'фото', 'фото')} (${fmtBytes(S.photos.orphans.bytes)}) больше не привязаны ни к одной точке. <button type="button" class="a-link" data-go="server">Перейти в «Сервер»</button></div>` : ''));
    wireUndo(m, () => { loaders.log().then(() => { if (!stale('home')) draw(); }).catch(() => {}); });
    m.querySelectorAll('[data-quick]').forEach(b => b.addEventListener('click', () => {
      if (b.dataset.quick === 'user') openNewUser();
      else if (b.dataset.quick === 'map') openMap(null);
      else openSharedUpload();
    }));
  };
  draw();
  for (const name of ['users', 'layers', 'storage', 'log']) {
    loaders[name]().then(() => { updateCounts(); if (!stale('home')) draw(); }).catch(() => {});
  }
}

/* ── Учётки ─────────────────────────────────────────────────────────── */
let _uq = '', _uf = '';
const isAdminU = u => u.role === 'admin';
// Карты, открытые учётке сейчас: выбранные админом или (у старых учёток
// отделов из Render, пока им не выбирали) — карты их отдела.
function mapsOfUser(u) {
  if (isAdminU(u)) return D.maps;
  return D.maps.filter(m => (Array.isArray(u.maps) ? u.maps.includes(m.id) : (m.id === u.role || (m.viewers || []).includes(u.role))));
}
const canText = u => (isAdminU(u) ? 'всё' : (PERMS.filter(([p]) => u.perms[p]).map(([, l]) => l.toLowerCase()).join(', ') || 'только смотреть'));
function userRowHtml(u) {
  const me = u.username === ME.username;
  const maps = mapsOfUser(u);
  return `<button type="button" class="a-row" data-user="${esc(u.username)}">
    <span class="a-av" aria-hidden="true">${esc(u.username.slice(0, 1).toUpperCase())}</span>
    <span class="a-row-main"><b>${esc(u.username)}${isAdminU(u) ? ' <span class="a-chip dark">Админ</span>' : ''}${me ? ' <span class="a-chip">это вы</span>' : ''}</b>
      <small>${isAdminU(u) ? 'Все карты и эта страница' : `Карты: ${maps.length ? esc(maps.map(m => m.name).join(', ')) : '<b>нет ни одной</b>'} · Может: ${esc(canText(u))}`}</small></span>
    ${uiIcon('right', 18).replace('<svg', '<svg class="chev"')}
  </button>`;
}
async function renderUsers() {
  const head = page('Учётки', 'Учётка — это человек: логин и пароль, какие карты он видит и что может делать. Нажмите на учётку, чтобы изменить.',
    `<button type="button" class="a-btn" id="u-new">${uiIcon('userplus', 16)} Новая учётка</button>`);
  const toolbar = `<div class="a-toolbar"><label class="a-search">${uiIcon('search', 16)}<input type="search" class="mf-input" id="u-q" placeholder="Найти по логину" aria-label="Найти учётку" value="${esc(_uq)}"/></label>
    <select class="mf-input" id="u-f" aria-label="Показать"><option value="">Все</option><option value="admin"${_uf === 'admin' ? ' selected' : ''}>Админы</option><option value="user"${_uf === 'user' ? ' selected' : ''}>Остальные</option>
    ${D.maps.map(m => `<option value="map:${esc(m.id)}"${_uf === 'map:' + m.id ? ' selected' : ''}>Видят «${esc(m.name)}»</option>`).join('')}</select></div>`;
  main(head + toolbar + `<div class="a-list" id="u-list">${skeleton()}</div>`);
  $('u-new').addEventListener('click', openNewUser);
  try { await load('users', 'maps'); } catch (e) { $('u-list').innerHTML = `<div class="a-empty">Не удалось загрузить учётки: ${esc(e.message)}</div>`; return; }
  if (stale('users')) return;
  const draw = () => {
    const q = _uq.trim().toLowerCase();
    const fit = u => !_uf || (_uf === 'admin' ? isAdminU(u) : _uf === 'user' ? !isAdminU(u) : mapsOfUser(u).some(m => 'map:' + m.id === _uf));
    const list = D.users.filter(u => (!q || u.username.includes(q)) && fit(u))
      .sort((a, b) => (isAdminU(b) - isAdminU(a)) || a.username.localeCompare(b.username));
    $('u-list').innerHTML = list.map(userRowHtml).join('') || '<div class="a-empty">Никого не нашлось</div>';
    $('u-list').querySelectorAll('[data-user]').forEach(b => b.addEventListener('click', () => openUser(b.dataset.user)));
  };
  draw();
  $('u-q').addEventListener('input', e => { _uq = e.target.value; draw(); });
  $('u-f').addEventListener('change', e => { _uf = e.target.value; draw(); });
}
async function refreshUsers() {
  try { await load('users'); } catch (_) {}
  if (_section === 'users') renderUsers();
  if (_section === 'maps') renderMaps();
  redrawDrawer();
}
const mapChecks = (picked, attr) => `<div class="a-checks">${D.maps.map(m => `<label class="a-check"><input type="checkbox" ${attr} value="${esc(m.id)}"${picked.has(m.id) ? ' checked' : ''}/>${mapIconHtml(m.icon, 15)}${esc(m.name)}</label>`).join('')}</div>`;
const permRows = (perms, attr) => PERMS.map(([p, l, d]) => `<div class="a-perm"><div><b>${esc(l)}</b><small>${esc(d)}</small></div>${switchHtml(perms[p], `${attr}="${p}"`, l)}</div>`).join('');
function openUser(username) {
  openDrawer({
    title: username,
    render: body => {
      const u = (D.users || []).find(x => x.username === username);
      if (!u) { body.innerHTML = '<div class="a-empty">Учётки больше нет</div>'; return; }
      const me = u.username === ME.username, admin = isAdminU(u);
      setDrawerHead(u.username, (u.created ? 'Создана здесь' : 'Задана в настройках Render') + (u.changedAt ? ' · пароль менялся ' + fmtDate(u.changedAt) : ''));
      const picked = new Set(mapsOfUser(u).map(m => m.id));
      body.innerHTML = `
        <div class="a-block"><div class="a-perm"><div><b>Админ</b><small>${me ? 'Это вы — снять с себя админа нельзя' : 'Видит все карты, правит их и заходит на эту страницу'}</small></div>${switchHtml(admin, 'id="u-admin"', 'Админ', me)}</div></div>
        ${admin ? '' : `
        <div class="a-block"><h3>Какие карты видит</h3>
          ${picked.size ? '' : '<p><b>Сейчас не видит ни одной карты</b> — отметьте нужные.</p>'}
          ${mapChecks(picked, 'data-umap')}
        </div>
        <div class="a-block"><h3>Что может делать</h3><p>Смотреть карты может всегда. Включённое — дополнительно.</p>
          <div>${permRows(u.perms, 'data-uperm')}</div></div>`}
        <div class="a-block"><h3>Пароль</h3>
          <p>${me ? 'Другие ваши сессии будут завершены.' : 'Все сессии этого логина завершатся — человек войдёт с новым паролем.'}</p>
          <div class="a-pw"><input type="text" class="mf-input" id="u-pw" placeholder="Новый пароль, от ${D.pwMin || 8} символов" autocomplete="new-password" maxlength="128" aria-label="Новый пароль"/>
            <button type="button" class="a-btn ghost" id="u-pw-gen">${uiIcon('key', 15)} Придумать</button>
            <button type="button" class="a-btn" id="u-pw-save">Сохранить</button></div>
        </div>
        ${u.created && !me ? `<div class="a-block danger-zone"><h3>Удалить учётку</h3><p>Человек сразу выйдет и больше не сможет войти.</p>
          <div class="a-acts"><button type="button" class="a-btn danger" id="u-del">${uiIcon('trash', 15)} Удалить «${esc(u.username)}»</button></div></div>` :
          (!u.created && !me ? '<p class="a-hint">Эта учётка задана в настройках Render — удалить её можно только там.</p>' : '')}`;
      const sw = $('u-admin');
      if (sw && !me) wireSwitch(sw, async on => {
        const yes = await ask({ title: on ? `Сделать ${u.username} админом?` : `Снять админа с ${u.username}?`, ok: on ? 'Сделать админом' : 'Снять', danger: on,
          text: on ? `<p><b>${esc(u.username)}</b> получит полный доступ ко всем картам и к этой странице.</p><p>Его сессии завершатся — он войдёт заново.</p>`
            : `<p>Останутся только карты, которые вы отметите. Сессии <b>${esc(u.username)}</b> завершатся.</p>` });
        if (yes) await act(() => post('/auth/role', { username: u.username, role: on ? 'admin' : 'user' }), on ? `${u.username} — админ` : `${u.username} больше не админ — отметьте ему карты`);
        refreshUsers();
      });
      body.querySelectorAll('[data-umap]').forEach(cb => cb.addEventListener('change', async () => {
        const maps = [...body.querySelectorAll('[data-umap]:checked')].map(x => x.value);
        await act(() => post('/auth/maps', { username: u.username, maps }), 'Карты сохранены');
        refreshUsers();
      }));
      body.querySelectorAll('[data-uperm]').forEach(el => wireSwitch(el, async on => {
        await act(() => post('/auth/perms', { username: u.username, perms: { [el.dataset.uperm]: on } }), 'Сохранено');
        refreshUsers();
      }));
      $('u-pw-gen').addEventListener('click', () => { $('u-pw').value = genPassword(); $('u-pw').focus(); $('u-pw').select(); });
      $('u-pw-save').addEventListener('click', async () => {
        const password = $('u-pw').value;
        if (password.length < (D.pwMin || 8)) { toast(`Пароль — от ${D.pwMin || 8} символов`, 'warn'); $('u-pw').focus(); return; }
        if (!await ask({ title: 'Сменить пароль?', ok: 'Сменить', text: `<p>Новый пароль для <b>${esc(u.username)}</b>: <b>${esc(password)}</b></p><p>Скопируйте его и передайте человеку.</p>` })) return;
        await act(async () => {
          const j = await post('/auth/password', { username: u.username, password }, 30000);
          if (j.self) { SESSION_TOKEN = j.token || SESSION_TOKEN; WRITE_KEY = j.writeKey || WRITE_KEY; }
        }, 'Пароль изменён');
        refreshUsers();
      });
      const del = $('u-del');
      if (del) del.addEventListener('click', async () => {
        if (!await ask({ title: `Удалить «${u.username}»?`, ok: 'Удалить', danger: true, text: '<p>Человек сразу выйдет и больше не сможет войти. Это нельзя отменить.</p>' })) return;
        if (await act(() => post('/auth/users/delete', { username: u.username }), `Учётка ${u.username} удалена`)) closeDrawer();
        refreshUsers();
      });
    },
  });
}
const NEW_PERMS = { layers: true, manual: false, bounds: true };
function openNewUser() {
  const st = { admin: false, maps: new Set(), perms: { ...NEW_PERMS } };
  openDrawer({
    title: 'Новая учётка', sub: 'Человек сможет войти сразу',
    render: body => {
      body.innerHTML = `<div class="a-block">
          <label class="a-field"><span>Логин</span><input type="text" class="mf-input" id="n-name" maxlength="32" placeholder="Например: anna.k" autocomplete="off" autocapitalize="none" spellcheck="false"/><small>Латиница, цифры, точка, дефис</small></label>
          <label class="a-field"><span>Пароль</span><div class="a-pw" style="grid-template-columns:minmax(0,1fr) auto"><input type="text" class="mf-input" id="n-pass" maxlength="128" placeholder="От 8 символов" autocomplete="new-password"/><button type="button" class="a-btn ghost" id="n-gen">${uiIcon('key', 15)} Придумать</button></div></label>
        </div>
        <div class="a-block"><div class="a-perm"><div><b>Админ</b><small>Видит все карты, правит их и заходит на эту страницу</small></div>${switchHtml(st.admin, 'id="n-admin"', 'Админ')}</div></div>
        <div id="n-access"${st.admin ? ' hidden' : ''}>
          <div class="a-block"><h3>Какие карты видит</h3>${mapChecks(st.maps, 'data-nmap')}</div>
          <div class="a-block" style="margin-top:14px"><h3>Что может делать</h3><p>Смотреть карты может всегда. Включённое — дополнительно.</p><div>${permRows(st.perms, 'data-nperm')}</div></div>
        </div>
        <button type="button" class="a-btn wide" id="n-create">${uiIcon('userplus', 16)} Создать учётку</button>`;
      $('n-pass').value = genPassword();
      $('n-gen').addEventListener('click', () => { $('n-pass').value = genPassword(); });
      $('n-name').focus();
      wireSwitch($('n-admin'), on => {
        st.admin = on;
        $('n-admin').classList.toggle('on', on); $('n-admin').setAttribute('aria-checked', String(on));
        $('n-access').hidden = on;
      });
      body.querySelectorAll('[data-nmap]').forEach(cb => cb.addEventListener('change', () => { if (cb.checked) st.maps.add(cb.value); else st.maps.delete(cb.value); }));
      body.querySelectorAll('[data-nperm]').forEach(el => wireSwitch(el, on => {
        st.perms[el.dataset.nperm] = on;
        el.classList.toggle('on', on); el.setAttribute('aria-checked', String(on));
      }));
      $('n-create').addEventListener('click', async () => {
        const username = $('n-name').value.trim().toLowerCase(), password = $('n-pass').value;
        if (!username) { toast('Укажите логин', 'warn'); $('n-name').focus(); return; }
        if (password.length < 8) { toast('Пароль — от 8 символов', 'warn'); $('n-pass').focus(); return; }
        if (st.admin && !await ask({ title: 'Создать админа?', ok: 'Создать', danger: true, text: `<p><b>${esc(username)}</b> получит полный доступ ко всем картам и к этой странице.</p>` })) return;
        if (!st.admin && !st.maps.size && !await ask({ title: 'Без карт?', ok: 'Создать без карт', text: '<p>Не отмечено ни одной карты — человек войдёт, но ничего не увидит. Карты можно отметить позже.</p>' })) return;
        $('n-create').disabled = true;
        const body2 = st.admin ? { username, role: 'admin', password } : { username, role: 'user', password, maps: [...st.maps], perms: st.perms };
        const ok = await act(() => post('/auth/users/create', body2, 30000), null);
        $('n-create').disabled = false;
        if (!ok) return;
        await ask({ title: 'Учётка создана', ok: 'Готово', text: `<p>Передайте человеку:</p><p>Логин: <b>${esc(username)}</b><br>Пароль: <b>${esc(password)}</b></p>` });
        await load('users').catch(() => {});
        if (_section === 'users') renderUsers();
        openUser(username);   // карточка новой учётки — проверить и поправить
      });
    },
  });
}

/* ── Карты ──────────────────────────────────────────────────────────── */
const whoSees = m => (D.users || []).filter(u => !isAdminU(u) && mapsOfUser(u).some(x => x.id === m.id));
async function renderMaps() {
  main(page('Карты', 'Каждая карта — свой набор слоёв и точек. «Настроить» — название, кто видит, резервная копия, удаление.',
    `<button type="button" class="a-btn" id="m-new">${uiIcon('plus', 16)} Новая карта</button>`) + `<div class="a-list" id="m-list">${skeleton()}</div>`);
  $('m-new').addEventListener('click', () => openMap(null));
  try { await load('maps', 'users'); } catch (e) { $('m-list').innerHTML = `<div class="a-empty">Не удалось загрузить карты: ${esc(e.message)}</div>`; return; }
  if (stale('maps')) return;
  $('m-list').innerHTML = D.maps.map(m => {
    const st = m.stats || {};
    const who = whoSees(m);
    return `<div class="a-row">
      <span class="a-av sq" aria-hidden="true">${mapIconHtml(m.icon, 20)}</span>
      <span class="a-row-main"><b>${esc(m.name)}</b>
        <small>${esc(m.desc || (m.country === 'kg' ? 'Кыргызстан' : 'Узбекистан'))} · ${st.bytes ? fmtBytes(st.bytes) + (st.updatedAt ? ', изменена ' + fmtDate(st.updatedAt) : '') : 'пустая'}${st.photos ? ' · фото: ' + fmtN(st.photos) : ''}</small>
        <span class="a-chips">${who.length ? who.map(u => `<span class="a-chip acc">${esc(u.username)}</span>`).join('') : '<span class="a-chip off">видят только админы</span>'}</span></span>
      <span class="a-row-acts">
        <a class="a-btn ghost sm" href="index.html?map=${encodeURIComponent(m.id)}" target="_blank" rel="noopener">${uiIcon('external', 14)} Открыть</a>
        <button type="button" class="a-btn ghost sm" data-medit="${esc(m.id)}">${uiIcon('pencil', 14)} Настроить</button>
      </span></div>`;
  }).join('') || '<div class="a-empty">Карт пока нет</div>';
  $('m-list').querySelectorAll('[data-medit]').forEach(b => b.addEventListener('click', () => openMap(b.dataset.medit)));
}
// Кто видит карту = у каких учёток она отмечена: меняем списки карт учёток.
async function saveWhoSees(mapId, wanted) {
  const changes = (D.users || []).filter(u => !isAdminU(u)).map(u => {
    const has = mapsOfUser(u).map(m => m.id);
    const on = has.includes(mapId), want = wanted.has(u.username);
    if (on === want) return null;
    return { username: u.username, maps: want ? has.concat(mapId) : has.filter(id => id !== mapId) };
  }).filter(Boolean);
  for (const c of changes) await post('/auth/maps', c);
  return changes.length;
}
function openMap(id) {
  const m = id ? D.maps.find(x => x.id === id) : null;
  let icon = (m && m.icon) || '🗺';
  const users = (D.users || []).filter(u => !isAdminU(u));
  const seeing = new Set(m ? whoSees(m).map(u => u.username) : []);
  openDrawer({
    title: m ? m.name : 'Новая карта', sub: m ? 'Изменения сохраняются кнопкой внизу формы' : 'Пустая или копия другой карты',
    render: body => {
      body.innerHTML = `<div class="a-block">
          <label class="a-field"><span>Название</span><input type="text" class="mf-input" id="mf-name" maxlength="60" value="${esc(m ? m.name : '')}" placeholder="Например: Самарканд — HoReCa" autocomplete="off"/></label>
          <label class="a-field"><span>Описание</span><input type="text" class="mf-input" id="mf-desc" maxlength="120" value="${esc(m ? m.desc || '' : '')}" placeholder="Для кого эта карта" autocomplete="off"/><small>Видно при выборе карты</small></label>
          <div class="a-field"><span>Значок</span><div class="a-icons" id="mf-icons">${MAP_ICONS.map(ic => `<button type="button" data-ic="${ic}" class="${ic === icon ? 'on' : ''}" aria-label="Значок карты" aria-pressed="${ic === icon}">${mapIconHtml(ic)}</button>`).join('')}</div></div>
          <label class="a-field"><span>Страна</span><select id="mf-country" class="mf-input"${m && m.base ? ' disabled' : ''}>
            <option value="uz"${!m || m.country !== 'kg' ? ' selected' : ''}>Узбекистан — города, районы, статистика УЗ</option>
            <option value="kg"${m && m.country === 'kg' ? ' selected' : ''}>Кыргызстан — города и статистика КГ</option></select></label>
        </div>
        <div class="a-block"><h3>Кто видит карту</h3><p>Админы видят все карты. Отметьте учётки, которым карта нужна.</p>
          ${users.length ? `<div class="a-checks">${users.map(u => `<label class="a-check"><input type="checkbox" data-mwho value="${esc(u.username)}"${seeing.has(u.username) ? ' checked' : ''}/>${esc(u.username)}</label>`).join('')}</div>` : '<p>Других учёток пока нет.</p>'}</div>
        ${m ? '' : `<div class="a-block"><label class="a-field"><span>Начать с</span><select id="mf-copy" class="mf-input"><option value="">Пустая карта</option>${D.maps.map(x => `<option value="${esc(x.id)}">Копия «${esc(x.name)}» — все слои и точки</option>`).join('')}</select></label></div>`}
        <button type="button" class="a-btn wide" id="mf-submit">${m ? 'Сохранить изменения' : 'Создать карту'}</button>
        ${m ? `<div class="a-block"><h3>История изменений</h3><p>Как карта выглядела до последних правок. «Вернуть» — откатить у всех; текущее состояние тоже сохранится.</p><div class="a-list" id="mf-versions">${skeleton(1)}</div></div>` : ''}
        ${m ? `<div class="a-block"><h3>Резервная копия</h3><p>Вся карта одним файлом: слои, точки, вид. Загрузка файла заменит карту его содержимым.</p>
          <div class="a-acts"><button type="button" class="a-btn ghost" id="mf-exp">${uiIcon('download', 15)} Скачать файл</button>
          <button type="button" class="a-btn ghost" id="mf-imp">${uiIcon('upload', 15)} Загрузить файл</button></div></div>
          ${m.base ? '' : `<div class="a-block danger-zone"><h3>Удалить карту</h3><p>Вместе со всеми слоями, точками и фото. Это нельзя отменить.</p>
          <div class="a-acts"><button type="button" class="a-btn danger" id="mf-del">${uiIcon('trash', 15)} Удалить карту</button></div></div>`}` : ''}`;
      body.querySelectorAll('[data-ic]').forEach(b => b.addEventListener('click', () => {
        icon = b.dataset.ic;
        body.querySelectorAll('[data-ic]').forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', String(x === b)); });
      }));
      $('mf-name').focus();
      $('mf-submit').addEventListener('click', async () => {
        const name = $('mf-name').value.trim();
        if (!name) { toast('Укажите название карты', 'warn'); $('mf-name').focus(); return; }
        const wanted = new Set([...body.querySelectorAll('[data-mwho]:checked')].map(i => i.value));
        const data = { name, desc: $('mf-desc').value.trim(), icon, country: $('mf-country').value, viewers: m ? (m.viewers || []) : [] };
        $('mf-submit').disabled = true;
        const ok = await act(async () => {
          let mapId = m && m.id;
          if (m) await post('/maps/update', { id: m.id, ...data });
          else mapId = (await post('/maps', { ...data, copyFrom: $('mf-copy').value || '' }, 180000)).map.id;
          await saveWhoSees(mapId, wanted);
        }, m ? 'Карта сохранена' : `Карта «${name}» создана`);
        $('mf-submit').disabled = false;
        if (!ok) return;
        closeDrawer();
        await load('maps', 'users').catch(() => {});
        if (_section === 'maps') renderMaps();
      });
      if (!m) return;
      const vbox = $('mf-versions');
      const drawVersions = async () => {
        try {
          const list = (await api('/admin/versions?key=' + encodeURIComponent(m.id))).versions.slice(0, 5);
          if (!vbox.isConnected) return;
          vbox.innerHTML = list.length ? list.map(versionRowHtml).join('') : '<p class="a-hint" style="margin:0">Изменений пока не было.</p>';
          wireRestore(vbox, drawVersions);
        } catch (e) { vbox.innerHTML = `<p class="a-hint" style="margin:0">Не удалось загрузить историю: ${esc(e.message)}</p>`; }
      };
      drawVersions();
      $('mf-exp').addEventListener('click', () => exportMap(m));
      $('mf-imp').addEventListener('click', () => pickFile('.json,application/json', f => importMap(m, f)));
      const del = $('mf-del');
      if (del) del.addEventListener('click', async () => {
        const typed = await ask({ title: `Удалить карту «${m.name}»?`, ok: 'Удалить навсегда', danger: true,
          text: '<p>Пропадут все слои, точки и фото этой карты. Это нельзя отменить.</p>', input: { label: 'Введите название карты для подтверждения', placeholder: m.name, must: m.name } });
        if (!typed) return;
        if (await act(() => post('/maps/delete', { id: m.id, confirm: typed }), `Карта «${m.name}» удалена`)) {
          closeDrawer();
          await load('maps').catch(() => {});
          if (_section === 'maps') renderMaps();
        }
      });
    },
  });
}
function pickFile(accept, cb) {
  const inp = $('a-file');
  inp.accept = accept; inp.value = '';
  inp.onchange = () => { const f = inp.files[0]; inp.value = ''; if (f) cb(f); };
  inp.click();
}
async function exportMap(m) {
  try {
    const st = await api('/state?map=' + encodeURIComponent(m.id), 120000);
    if (st.empty) { toast('Карта пустая — сохранять нечего', 'info'); return; }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(st, null, 2)], { type: 'application/json' }));
    a.download = `карта_${m.name.replace(/[^\wа-яё -]/gi, '')}_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  } catch (e) { toast('Не удалось скачать: ' + e.message, 'err', 5000); }
}
function importMap(m, f) {
  const rd = new FileReader();
  rd.onload = async () => {
    let st;
    try { st = JSON.parse(rd.result); } catch (_) { toast('Файл повреждён или это не JSON', 'err'); return; }
    if (!st || st._app !== 'hm-br') { toast('Это не файл карты', 'err'); return; }
    if (!await ask({ title: `Заменить карту «${m.name}»?`, ok: 'Заменить', danger: true, text: `<p>Текущие слои и точки карты заменятся содержимым файла <b>${esc(f.name)}</b>.</p>` })) return;
    delete st._lazy;
    await act(() => post('/state?map=' + encodeURIComponent(m.id), st, 180000), 'Карта загружена из файла');
  };
  rd.readAsText(f);
}

/* ── Слои и точки ───────────────────────────────────────────────────── */
let _src = '';   // 'map:<id>' | 'shared' | 'own'
const kindText = l => (l.kind === 'heat' ? 'Тепловой слой' : l.manual ? 'Точки вручную' : 'Слой точек');
async function renderLayers() {
  main(page('Слои и точки', 'Слева — где лежат слои. Нажмите «Точки», чтобы найти и удалить точки; удаление действует у всех сразу.',
    `<button type="button" class="a-btn ghost" id="l-shared">${uiIcon('upload', 16)} Общий слой из Excel</button>`) +
    `<div class="a-split"><div><select class="mf-input a-sources-select" id="l-src-sel" aria-label="Где слои"></select><nav class="a-panel a-sources" id="l-src" aria-label="Где слои"></nav></div><div id="l-body">${skeleton()}</div></div>`);
  $('l-shared').addEventListener('click', openSharedUpload);
  try { await load('layers', 'maps'); } catch (e) { $('l-body').innerHTML = `<div class="a-empty">Не удалось загрузить слои: ${esc(e.message)}</div>`; return; }
  if (stale('layers')) return;
  drawLayers();
}
function drawLayers() {
  const L = D.layers;
  const sources = L.maps.map(m => [`map:${m.id}`, m.name, m.layers.length, 'map'])
    .concat([['shared', 'Общие слои', L.shared.length, 'share'], ['own', 'Личные слои учёток', L.own.length, 'users']]);
  if (!sources.some(s => s[0] === _src)) _src = sources[0][0];
  $('l-src').innerHTML = sources.map(([id, name, n, ic], i) => (i === L.maps.length ? '<hr/>' : '') +
    `<button type="button" data-src="${esc(id)}" class="${id === _src ? 'on' : ''}"${id === _src ? ' aria-current="true"' : ''}>${uiIcon(ic, 16)}<span>${esc(name)}</span><span class="a-count">${n}</span></button>`).join('');
  $('l-src-sel').innerHTML = sources.map(([id, name, n]) => `<option value="${esc(id)}"${id === _src ? ' selected' : ''}>${esc(name)} (${n})</option>`).join('');
  $('l-src').querySelectorAll('[data-src]').forEach(b => b.addEventListener('click', () => { _src = b.dataset.src; drawLayers(); }));
  $('l-src-sel').onchange = e => { _src = e.target.value; drawLayers(); };
  const body = $('l-body');
  const row = (l, addr, extra = '') => `<div class="a-row">
    <span class="a-av sq" aria-hidden="true">${uiIcon(l.kind === 'heat' ? 'flame' : 'pin', 18)}</span>
    <span class="a-row-main"><b><span class="name">${esc(l.name)}</span></b><small>${kindText(l)} · ${pts(l.n)}</small>${extra}</span>
    <span class="a-row-acts">
      <button type="button" class="a-btn sm" data-lpts ${addr}>${uiIcon('search', 14)} Точки</button>
      <button type="button" class="a-btn ghost sm" data-lren ${addr} data-name="${esc(l.name)}">${uiIcon('pencil', 14)} Переименовать</button>
      <button type="button" class="a-btn danger sm" data-ldel ${addr} data-name="${esc(l.name)}" aria-label="Удалить слой «${esc(l.name)}»">${uiIcon('trash', 14)}</button>
    </span></div>`;
  const addrOf = (scope, map, l) => `data-scope="${scope}" data-map="${esc(map || '')}" data-kind="${l.kind}" data-key="${esc(l.key)}" data-name="${esc(l.name)}"`;
  if (_src.startsWith('map:')) {
    const m = L.maps.find(x => 'map:' + x.id === _src);
    body.innerHTML = `<h2 class="a-h2">Карта «${esc(m.name)}»</h2><div class="a-list">` +
      (m.layers.map(l => row(l, addrOf('map', m.id, l))).join('') || '<div class="a-empty">На этой карте пока нет слоёв. Слои загружаются на самой карте.</div>') + '</div>';
  } else if (_src === 'shared') {
    body.innerHTML = '<h2 class="a-h2">Общие слои</h2><div class="a-list">' + (L.shared.map(l => {
      const where = l.maps.includes('*') ? 'Все карты' + (l.except.length ? ', кроме ' + l.except.map(mapName).join(', ') : '') : (l.maps.map(mapName).join(', ') || 'ни одной карты');
      return row(l, addrOf('shared', '', l), `<span class="a-chips"><span class="a-chip acc">${esc(where)}</span><button type="button" class="a-link" data-lwhere="${esc(l.key)}">Изменить карты</button></span>`);
    }).join('') || `<div class="a-empty">Общих слоёв пока нет<br><button type="button" class="a-btn" id="l-shared2">${uiIcon('upload', 16)} Загрузить из Excel</button></div>`) +
      '</div><p class="a-hint">Общий слой виден на отмеченных картах всем, кому они открыты. «Все карты» — и на тех, что появятся позже.</p>';
    const b2 = $('l-shared2'); if (b2) b2.addEventListener('click', openSharedUpload);
  } else {
    body.innerHTML = '<h2 class="a-h2">Личные слои учёток</h2><div class="a-list">' + (L.own.map(o => `<div class="a-row">
      <span class="a-av" aria-hidden="true">${esc((o.owner || '?').slice(0, 1).toUpperCase())}</span>
      <span class="a-row-main"><b>${esc(o.owner || 'неизвестная учётка')} <span class="a-chip">${esc(mapName(o.map))}</span></b>
        <small>${esc(o.layers.map(l => `${l.name} — ${pts(l.n)}`).join('; ') || 'пусто')} · ${fmtBytes(o.bytes)}</small></span>
      <span class="a-row-acts"><button type="button" class="a-btn danger sm" data-owndel="${esc(o.storageKey)}" data-name="${esc((o.owner || '') + ' · ' + mapName(o.map))}">${uiIcon('trash', 14)} Удалить</button></span></div>`).join('') ||
      '<div class="a-empty">Ни у кого нет своих слоёв</div>') + '</div><p class="a-hint">Свои слои видит только их хозяин. Удаление стирает все его слои и точки на этой карте.</p>';
  }
  const addr = d => ({ scope: d.scope, map: d.map || '', kind: d.kind, key: d.key });
  body.querySelectorAll('[data-lpts]').forEach(b => b.addEventListener('click', () => openPoints(addr(b.dataset), b.dataset.name)));
  body.querySelectorAll('[data-lren]').forEach(b => b.addEventListener('click', async () => {
    const name = await ask({ title: 'Переименовать слой', ok: 'Сохранить', input: { label: 'Новое название', value: b.dataset.name } });
    if (!name || name === b.dataset.name) return;
    if (await act(() => post('/admin/layers/update', { ...addr(b.dataset), name: capFirst(name) }), 'Слой переименован')) reloadLayers();
  }));
  body.querySelectorAll('[data-ldel]').forEach(b => b.addEventListener('click', async () => {
    const a = addr(b.dataset);
    const where = a.scope === 'shared' ? 'со всех карт' : `с карты «${mapName(a.map)}»`;
    if (!await ask({ title: `Удалить слой «${b.dataset.name}»?`, ok: 'Удалить слой', danger: true, text: `<p>Слой и все его точки пропадут ${where} у всех. Это нельзя отменить.</p>` })) return;
    if (await act(() => post('/admin/layers/delete', a, 60000), `Слой «${b.dataset.name}» удалён`)) reloadLayers();
  }));
  body.querySelectorAll('[data-owndel]').forEach(b => b.addEventListener('click', async () => {
    if (!await ask({ title: 'Удалить личные слои?', ok: 'Удалить', danger: true, text: `<p>${esc(b.dataset.name)}: все свои слои и точки этой учётки на карте.</p>` })) return;
    if (await act(() => post('/admin/storage/delete', { key: b.dataset.owndel }), 'Личные слои удалены')) reloadLayers();
  }));
  body.querySelectorAll('[data-lwhere]').forEach(b => b.addEventListener('click', () => openSharedMaps(L.shared.find(l => l.key === b.dataset.lwhere))));
}
async function reloadLayers() {
  try { await load('layers'); } catch (_) {}
  if (_section === 'layers') drawLayers();
}
function openSharedMaps(l) {
  let all = l.maps.includes('*'), picked = new Set(D.maps.filter(m => sharedOnMap(l, m.id)).map(m => m.id));
  openDrawer({
    title: 'Где показывать слой', sub: l.name,
    render: body => {
      body.innerHTML = `<div class="a-block"><div class="a-choices" role="radiogroup" aria-label="Где показывать">
          <label class="a-choice"><input type="radio" name="w-mode" value="all"${all ? ' checked' : ''}/><span><b>На всех картах</b><small>И на тех, что появятся позже. Снимите галочки, где слой не нужен.</small></span></label>
          <label class="a-choice"><input type="radio" name="w-mode" value="list"${all ? '' : ' checked'}/><span><b>Только на выбранных</b><small>Новые карты слой не получат</small></span></label></div>
          <div class="a-checks">${D.maps.map(m => `<label class="a-check"><input type="checkbox" data-wmap value="${esc(m.id)}"${picked.has(m.id) ? ' checked' : ''}/>${esc(m.name)}</label>`).join('')}</div></div>
        <button type="button" class="a-btn wide" id="w-save">Сохранить</button>`;
      body.querySelectorAll('input[name="w-mode"]').forEach(r => r.addEventListener('change', () => { all = r.value === 'all'; }));
      body.querySelectorAll('[data-wmap]').forEach(cb => cb.addEventListener('change', () => { if (cb.checked) picked.add(cb.value); else picked.delete(cb.value); }));
      $('w-save').addEventListener('click', async () => {
        const maps = all ? ['*'] : [...picked];
        const except = all ? D.maps.filter(m => !picked.has(m.id)).map(m => m.id) : [];
        const ok = await act(async () => {
          const cur = ((await api('/shared/layers/all', 60000)).layers || []).find(x => x.id === l.key);
          if (!cur) throw new Error('Слой уже удалён');
          await post('/shared/layers/one', { layer: { ...cur, maps, except } }, 120000);
        }, 'Сохранено');
        if (ok) { closeDrawer(); reloadLayers(); }
      });
    },
  });
}
function openSharedUpload() {
  openDrawer({
    title: 'Общий слой из Excel', sub: 'Появится на всех картах — потом можно выбрать, где именно',
    render: body => {
      body.innerHTML = `<div class="a-block">
          <label class="a-field"><span>Название</span><input type="text" class="mf-input" id="s-name" maxlength="40" placeholder="Например: Конкуренты" autocomplete="off"/><small>Если пусто — по имени файла</small></label>
          <div class="a-field"><span>Что в файле</span><div class="a-choices" role="radiogroup" aria-label="Что в файле">
            <label class="a-choice"><input type="radio" name="s-kind" value="heat" checked/><span><b>Тепловой слой</b><small>Точки со значением — рисуются тепловым пятном</small></span></label>
            <label class="a-choice"><input type="radio" name="s-kind" value="pt"/><span><b>Слой точек</b><small>Точки рисуются метками</small></span></label></div></div>
          <p>Нужны колонки с широтой и долготой; название, адрес, код и значение — по желанию.</p>
        </div>
        <button type="button" class="a-btn wide" id="s-pick">${uiIcon('upload', 16)} Выбрать файл Excel или CSV</button>`;
      $('s-name').focus();
      $('s-pick').addEventListener('click', () => pickFile('.csv,.xlsx,.xls', f => {
        const kind = body.querySelector('input[name="s-kind"]:checked').value;
        const name = capFirst($('s-name').value) || capFirst(f.name.replace(/\.[^.]+$/, ''));
        parseSheet(f, async rows => {
          const recs = kind === 'heat' ? toRecs(rows) : toCustomPtRecs(rows);
          if (!recs.length) { toast('В файле нет строк с широтой и долготой', 'err', 5000); return; }
          const n = D.layers ? D.layers.shared.length : 0;
          const layer = { id: 's' + Date.now().toString(36), kind, name: name.slice(0, 40), maps: ['*'], color: LAYER_PALETTE[n % LAYER_PALETTE.length], fields: recs._fields || [],
            ...(kind === 'heat' ? { volUnit: recs._percent ? '%' : '', recs: slimRecs(recs) } : { recs }) };
          $('s-pick').disabled = true;
          const ok = await act(() => post('/shared/layers/one', { layer }, 180000), `Общий слой «${name}»: ${pts(recs.length)} — на всех картах`);
          if (!ok) { $('s-pick').disabled = false; return; }
          closeDrawer();
          _src = 'shared';
          await load('layers').catch(() => {});
          go('layers');
        });
      }));
    },
  });
}

// Точки слоя: поиск, выбор, удаление.
function openPoints(addr, name) {
  const P = { ...addr, name, q: '', rows: [], offset: 0, matched: 0, total: 0, sel: new Map(), loading: false };
  const heat = addr.kind === 'heat';
  const fetchPage = async fresh => {
    if (fresh) { P.rows = []; P.offset = 0; P.sel.clear(); }
    P.loading = true;
    try {
      const j = await api('/admin/points?' + new URLSearchParams({ scope: P.scope, map: P.map, kind: P.kind, key: P.key, q: P.q, offset: P.offset }).toString(), 60000);
      P.rows = P.rows.concat(j.rows); P.matched = j.matched; P.total = j.total; P.offset = j.offset + j.rows.length;
    } catch (e) { toast('Не удалось загрузить точки: ' + e.message, 'err', 5000); }
    P.loading = false;
    draw();
  };
  const draw = () => {
    const t = $('p-table'); if (!t) return;
    $('p-count').textContent = P.matched === P.total ? `Всего ${pts(P.total)}` : `Найдено ${fmtN(P.matched)} из ${pts(P.total)}`;
    t.innerHTML = `<thead><tr><th><input type="checkbox" id="p-all" aria-label="Выбрать все показанные"${P.rows.length && P.rows.every(r => P.sel.has(r.i)) ? ' checked' : ''}/></th><th>Название</th><th>Адрес</th><th>Код</th><th class="num">${heat ? 'Значение' : 'Фото'}</th><th class="num">Координаты</th></tr></thead><tbody>` +
      (P.rows.map(r => `<tr class="${P.sel.has(r.i) ? 'sel' : ''}"><td><input type="checkbox" data-pti="${r.i}"${P.sel.has(r.i) ? ' checked' : ''} aria-label="Выбрать «${esc(r.name || 'без названия')}»"/></td>
        <td>${esc(r.name || 'без названия')}</td><td class="dim">${esc(r.addr || '')}</td><td class="dim">${esc(r.code || '')}</td>
        <td class="num">${heat ? fmtN(r.vol) : (r.photos || '—')}</td><td class="num dim">${(+r.lat).toFixed(5)}, ${(+r.lon).toFixed(5)}</td></tr>`).join('') ||
        `<tr><td colspan="6" class="dim">${P.loading ? 'Загружаем…' : 'Ничего не найдено'}</td></tr>`) + '</tbody>';
    $('p-more').hidden = P.rows.length >= P.matched;
    $('p-more').textContent = `Показать ещё (${fmtN(P.matched - P.rows.length)})`;
    $('p-bar').hidden = !P.sel.size;
    $('p-sel').textContent = `Выбрано: ${pts(P.sel.size)}`;
    t.querySelectorAll('[data-pti]').forEach(cb => cb.addEventListener('change', () => {
      const r = P.rows.find(x => x.i === +cb.dataset.pti);
      if (cb.checked) P.sel.set(r.i, r); else P.sel.delete(r.i);
      draw();
    }));
    $('p-all').addEventListener('change', e => { P.rows.forEach(r => { if (e.target.checked) P.sel.set(r.i, r); else P.sel.delete(r.i); }); draw(); });
  };
  openDrawer({
    title: name, sub: (addr.scope === 'shared' ? 'Общий слой' : 'Карта «' + mapName(addr.map) + '»') + ' · ' + (heat ? 'тепловой слой' : 'слой точек'), wide: true,
    render: body => {
      body.innerHTML = `<div class="a-toolbar"><label class="a-search">${uiIcon('search', 16)}<input type="search" class="mf-input" id="p-q" placeholder="Поиск по названию, адресу, коду" aria-label="Поиск точек"/></label><span class="a-hint" id="p-count" style="margin:0"></span></div>
        <div class="a-table-wrap"><table class="a-table" id="p-table"></table></div>
        <button type="button" class="a-btn ghost" id="p-more" hidden></button>
        <div class="a-selbar" id="p-bar" hidden><span id="p-sel"></span><span class="a-acts"><button type="button" class="a-btn sm" id="p-clear">Снять выбор</button><button type="button" class="a-btn sm" id="p-del">${uiIcon('trash', 14)} Удалить выбранные</button></span></div>`;
      let t = null;
      $('p-q').addEventListener('input', e => { P.q = e.target.value.trim(); clearTimeout(t); t = setTimeout(() => fetchPage(true), 300); });
      $('p-q').focus();
      $('p-more').addEventListener('click', () => fetchPage(false));
      $('p-clear').addEventListener('click', () => { P.sel.clear(); draw(); });
      $('p-del').addEventListener('click', async () => {
        const n = P.sel.size;
        if (!await ask({ title: `Удалить ${pts(n)}?`, ok: 'Удалить', danger: true, text: `<p>Точки пропадут из слоя «${esc(P.name)}» у всех. Это нельзя отменить.</p>` })) return;
        const points = [...P.sel.values()].map(r => ({ i: r.i, lat: r.lat, lon: r.lon }));
        const ok = await act(() => post('/admin/points/delete', { scope: P.scope, map: P.map, kind: P.kind, key: P.key, points }, 120000),
          r => `Удалено: ${pts(r.deleted)}. В слое осталось ${pts(r.left)}`);
        if (ok) { fetchPage(true); reloadLayers(); }
      });
      fetchPage(true);
    },
  });
}

/* ── Журнал: действия, ошибки, откат ────────────────────────────────── */
const keyName = k => (k === 'shared_layers' ? 'общие слои' : `карту «${esc(mapName(k))}»`);
const mapLabel = id => (id ? `«${esc(mapName(id))}»` : '');
const isLogin = e => e.action === '/auth/login' || e.action === '/auth/logout';
// Запись журнала — простой фразой: кто что сделал.
function describe(e) {
  const d = e.detail || {}, ok = e.status < 400 && e.level !== 'error';
  const who = d.username ? `<b>${esc(d.username)}</b>` : '';
  const T = {
    '/auth/login': ok ? 'вошёл' : e.status === 429 ? 'слишком много неудачных попыток — вход временно закрыт' : 'не смог войти: неверный логин или пароль',
    '/auth/logout': 'вышел',
    // Сервер сравнивает карту до и после: «удалил 1 точку из слоя «Киоски»».
    '/state': d.change ? `${esc(d.change)} — карта ${mapLabel(e.map)}` : `сохранил карту ${mapLabel(e.map)}`,
    '/my/bounds': `сохранил свои границы на карте ${mapLabel(e.map)}`,
    '/my/layers': `сохранил свои слои на карте ${mapLabel(e.map)}`,
    '/photo': `загрузил фото на карту ${mapLabel(e.map)}`,
    '/maps': `создал карту «${esc(d.name || '')}»`,
    '/maps/update': `изменил карту «${esc(d.name || mapName(d.id))}»`,
    '/maps/delete': `удалил карту «${esc(d.confirm || d.id || '')}»`,
    '/auth/password': `сменил пароль ${who}`,
    '/auth/users/create': `создал учётку ${who}`,
    '/auth/users/delete': `удалил учётку ${who}`,
    '/auth/role': d.role === 'admin' ? `сделал ${who} админом` : `снял админа с ${who}`,
    '/auth/perms': `изменил права ${who}`,
    '/auth/maps': `изменил карты ${who}`,
    '/auth/rules': 'изменил права по умолчанию',
    '/shared/layers': d.change ? `${esc(d.change)} — общие слои` : 'изменил общие слои',
    '/shared/layers/one': d.change ? `${esc(d.change)} — общий слой` : `изменил общий слой «${esc(d.name || '')}»`,
    '/shared/layers/hide': d.change ? esc(d.change) : `убрал общий слой с карты ${mapLabel(d.map)}`,
    '/admin/points/delete': `удалил ${pts(d.points)} из слоя ${d.scope === 'shared' ? '(общий слой)' : 'на карте ' + mapLabel(d.map)}`,
    '/admin/layers/update': `переименовал слой в «${esc(d.name || '')}»`,
    '/admin/layers/delete': `удалил слой ${d.scope === 'shared' ? '(общий)' : 'с карты ' + mapLabel(d.map)}`,
    '/admin/storage/delete': 'удалил личные данные учётки',
    '/admin/photos/prune': 'удалил ненужные фото',
    '/admin/cache/clear': 'очистил кэш сервера',
    '/admin/versions/restore': `вернул ${keyName(d.key || '')} к состоянию от ${esc(fmtDate(d.savedAt))}`,
    '/data': 'обновил базовые данные',
    'client-error': d.kind === 'toast' ? `увидел ошибку: «${esc(d.error || '')}»` : `сбой на странице: ${esc(d.error || '')}${d.where ? ` <span class="a-dim">(${esc(d.where)})</span>` : ''}`,
  };
  if (e.action.startsWith('GET ')) return `ошибка сервера при открытии ${esc(e.action.slice(4))}${d.error ? ' — ' + esc(d.error) : ''}`;
  let text = T[e.action] || esc(e.action);
  if (!ok && T[e.action] && e.action !== '/auth/login' && e.action !== 'client-error') text = `не смог: ${text}${d.error ? ` — <span class="a-why">${esc(d.error)}</span>` : ''}`;
  return text;
}
function logRowHtml(e) {
  const t = new Date(e.at);
  const lvl = e.level === 'error' ? 'bad' : e.level === 'warn' ? 'warn' : '';
  return `<div class="a-log ${lvl}">
    <span class="a-log-time">${t.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</span>
    <span class="a-av sm" aria-hidden="true">${esc((e.username || '?').slice(0, 1).toUpperCase())}</span>
    <span class="a-log-text"><b>${esc(e.username || 'неизвестно')}</b> ${describe(e)}${e.count > 1 ? ` <span class="a-chip">×${fmtN(e.count)}</span>` : ''}</span>
    ${lvl ? `<span class="a-status ${lvl}">${lvl === 'bad' ? 'ошибка' : 'отказ'}</span>` : ''}
    ${e.detail && e.detail.version && !lvl ? `<button type="button" class="a-btn ghost sm" data-undo="${e.detail.version}" data-vkey="${esc(e.detail.vkey || '')}" data-what="${esc(((e.username || '') + ' ' + describe(e)).replace(/<[^>]+>/g, ''))}" data-when="${esc(fmtDate(e.at))}">${uiIcon('undo', 14)} Отменить</button>` : ''}
  </div>`;
}
function dayTitle(iso) {
  const d = new Date(iso), today = new Date(); const y = new Date(Date.now() - 864e5);
  const same = (a, b) => a.toDateString() === b.toDateString();
  return same(d, today) ? 'Сегодня' : same(d, y) ? 'Вчера' : d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
}
// «Отменить» в строке журнала — вернуть данные к состоянию перед этим действием.
function wireUndo(box, after) {
  box.querySelectorAll('[data-undo]').forEach(b => b.addEventListener('click', async () => {
    const what = b.dataset.vkey === 'shared_layers' ? 'общие слои' : 'карту «' + mapName(b.dataset.vkey) + '»';
    const yes = await ask({ title: 'Отменить это действие?', ok: 'Отменить действие', danger: true,
      text: `<p><b>${esc(b.dataset.what)}</b> (${esc(b.dataset.when)})</p><p>Вернём ${esc(what)} к состоянию перед ним — у всех. Если после этого были другие изменения там же, они тоже отменятся.</p><p>Текущее состояние сохранится — отмену можно отменить.</p>` });
    if (!yes) return;
    if (await act(() => post('/admin/versions/restore', { id: +b.dataset.undo }, 180000), 'Отменено. У кого карта открыта — придёт предложение обновить.')) after();
  }));
}
function logListHtml(rows) {
  let day = '', html = '';
  rows.forEach(e => {
    const t = dayTitle(e.at);
    if (t !== day) { day = t; html += `<div class="a-log-day">${esc(t)}</div>`; }
    html += logRowHtml(e);
  });
  return html;
}
let _logTab = 'actions', _logType = '', _logUser = '', _logQ = '';
async function renderLog() {
  main(page('Журнал', 'Кто что делал, какие были ошибки — и откат карт к прошлому состоянию.') +
    `<div class="a-tabs" role="tablist">
      <button type="button" role="tab" data-ltab="actions" aria-selected="${_logTab === 'actions'}" class="${_logTab === 'actions' ? 'on' : ''}">${uiIcon('history', 16)} Действия и ошибки</button>
      <button type="button" role="tab" data-ltab="versions" aria-selected="${_logTab === 'versions'}" class="${_logTab === 'versions' ? 'on' : ''}">${uiIcon('undo', 16)} Откат изменений</button>
    </div><div id="log-body">${skeleton(4)}</div>`);
  document.querySelectorAll('[data-ltab]').forEach(b => b.addEventListener('click', () => { _logTab = b.dataset.ltab; renderLog(); }));
  if (_logTab === 'versions') return renderVersions($('log-body'));
  try { await load('users'); } catch (_) {}
  if (stale('log')) return;
  const body = $('log-body');
  body.innerHTML = `<div class="a-toolbar">
      <label class="a-search">${uiIcon('search', 16)}<input type="search" class="mf-input" id="lg-q" placeholder="Поиск по журналу" aria-label="Поиск по журналу" value="${esc(_logQ)}"/></label>
      <select class="mf-input" id="lg-type" aria-label="Что показать">
        <option value="">Всё</option><option value="changes"${_logType === 'changes' ? ' selected' : ''}>Изменения</option>
        <option value="logins"${_logType === 'logins' ? ' selected' : ''}>Входы</option>
        <option value="error"${_logType === 'error' ? ' selected' : ''}>Ошибки</option><option value="warn"${_logType === 'warn' ? ' selected' : ''}>Отказы</option></select>
      <select class="mf-input" id="lg-user" aria-label="Учётка"><option value="">Все учётки</option>${(D.users || []).map(u => `<option value="${esc(u.username)}"${_logUser === u.username ? ' selected' : ''}>${esc(u.username)}</option>`).join('')}</select>
    </div><div id="lg-sum"></div><div class="a-panel" id="lg-list">${skeleton(5)}</div><button type="button" class="a-btn ghost" id="lg-more" hidden style="margin-top:10px">Показать ещё</button>`;
  let rows = [], last = 0, done = false;
  const pass = e => (!_logType || (_logType === 'logins' ? isLogin(e) : _logType === 'changes' ? (!isLogin(e) && e.level === 'info') : true)) &&
    (!_logQ || (e.username + ' ' + describe(e).replace(/<[^>]+>/g, '')).toLowerCase().includes(_logQ.toLowerCase()));
  const draw = () => {
    const shown = rows.filter(pass);
    $('lg-list').innerHTML = shown.length ? logListHtml(shown) : '<div class="a-empty" style="border:0">Записей нет</div>';
    $('lg-more').hidden = done;
    wireUndo($('lg-list'), () => renderLog());
  };
  const more = async () => {
    const q = new URLSearchParams({ limit: 200 });
    if (last) q.set('before', last);
    if (_logType === 'error' || _logType === 'warn') q.set('level', _logType);
    if (_logUser) q.set('user', _logUser);
    try {
      const j = await api('/admin/log?' + q.toString());
      if (stale('log')) return;
      rows = rows.concat(j.rows); done = j.rows.length < 200;
      if (j.rows.length) last = j.rows[j.rows.length - 1].at;
      $('lg-sum').innerHTML = j.errors24h || j.warn24h ? `<p class="a-hint" style="margin:0 0 10px">За сутки: ошибок — <b>${fmtN(j.errors24h)}</b>, отказов — <b>${fmtN(j.warn24h)}</b>. Отказ — сервер не дал что-то сделать (нет прав, неверные данные, неверный пароль).</p>` : '<p class="a-hint" style="margin:0 0 10px">За сутки ошибок не было.</p>';
      draw();
    } catch (e) { $('lg-list').innerHTML = `<div class="a-empty" style="border:0">Не удалось загрузить журнал: ${esc(e.message)}</div>`; }
  };
  $('lg-q').addEventListener('input', e => { _logQ = e.target.value; draw(); });
  $('lg-type').addEventListener('change', e => { _logType = e.target.value; renderLog(); });
  $('lg-user').addEventListener('change', e => { _logUser = e.target.value; renderLog(); });
  $('lg-more').addEventListener('click', more);
  more();
}
// Версии: состояние ДО изменения. Вернуть — текущее тоже сохранится версией.
const verSummary = v => {
  const s = v.summary || {};
  return [s.layers != null ? `${fmtN(s.layers)} ${plural(s.layers, 'слой', 'слоя', 'слоёв')}` : '', s.points != null ? pts(s.points) : '', s.zones ? `${fmtN(s.zones)} ${plural(s.zones, 'зона', 'зоны', 'зон')}` : ''].filter(Boolean).join(', ');
};
function versionRowHtml(v) {
  const ch = (v.summary || {}).change;
  const what = v.reason === 'before-restore' ? `Как было до отката ${esc(fmtDate(v.at))}`
    : ch ? `До того, как <b>${esc(v.username || 'кто-то')}</b> ${esc(ch)} · ${esc(fmtDate(v.at))}`
      : `Как было до изменений <b>${esc(v.username || 'неизвестно')}</b> ${esc(fmtDate(v.at))}`;
  return `<div class="a-row"><span class="a-av sq" aria-hidden="true">${uiIcon('history', 18)}</span>
    <span class="a-row-main"><b>${what}</b><small>${esc(verSummary(v) || 'пусто')}${v.savedAt ? ' · сохранено ' + esc(fmtDate(v.savedAt)) : ''}</small></span>
    <span class="a-row-acts"><button type="button" class="a-btn ghost sm" data-restore="${v.id}" data-key="${esc(v.key)}" data-when="${esc(fmtDate(v.savedAt || v.at))}">${uiIcon('undo', 14)} Вернуть</button></span></div>`;
}
function wireRestore(box, after) {
  box.querySelectorAll('[data-restore]').forEach(b => b.addEventListener('click', async () => {
    const yes = await ask({ title: `Вернуть ${keyName(b.dataset.key).replace(/<[^>]+>/g, '')}?`, ok: 'Вернуть', danger: true,
      text: `<p>Будет как на <b>${esc(b.dataset.when)}</b> — у всех, кто её видит.</p><p>Текущее состояние сохранится в истории, так что откат можно отменить.</p>` });
    if (!yes) return;
    if (await act(() => post('/admin/versions/restore', { id: +b.dataset.restore }, 180000), 'Возвращено. Тем, у кого карта открыта, придёт предложение обновить.')) after();
  }));
}
async function renderVersions(box) {
  let list;
  try { await load('maps'); list = (await api('/admin/versions')).versions; } catch (e) { box.innerHTML = `<div class="a-empty">Не удалось загрузить историю: ${esc(e.message)}</div>`; return; }
  if (stale('log')) return;
  const keys = [...new Set(list.map(v => v.key))];
  box.innerHTML = '<p class="a-hint" style="margin:0 0 12px">Перед каждым изменением карты и общих слоёв сервер сохраняет, как было. Серия правок одного человека в течение 10 минут — одна точка возврата. Хранятся последние 10 на каждую карту.</p>' +
    (keys.length ? keys.map(k => `<h2 class="a-h2" style="margin-top:16px">${k === 'shared_layers' ? 'Общие слои' : 'Карта «' + esc(mapName(k)) + '»'}</h2><div class="a-list">${list.filter(v => v.key === k).map(versionRowHtml).join('')}</div>`).join('')
      : '<div class="a-empty">Изменений пока не было — откатывать нечего.</div>');
  wireRestore(box, () => renderVersions(box));
}

/* ── Сервер ─────────────────────────────────────────────────────────── */
function keyLabel(k) {
  if (k.kind === 'map') return 'Карта «' + mapName(k.map) + '»';
  if (k.kind === 'own') return `${k.owner || 'неизвестная учётка'} — ${k.what === 'bounds' ? 'свои границы' : 'свои слои'} на «${k.orphan ? 'удалённой карте' : mapName(k.map)}»`;
  if (k.kind === 'system') return KEY_LABELS[k.key] || k.key;
  return k.key + ' (карты больше нет)';
}
async function renderServer() {
  main(page('Сервер', 'Сколько памяти и места занято и что можно освободить.',
    `<button type="button" class="a-btn ghost" id="s-refresh">${uiIcon('refresh', 15)} Обновить</button>`) + `<div id="s-body">${skeleton(2)}</div>`);
  $('s-refresh').addEventListener('click', renderServer);
  try { await load('storage'); } catch (e) { $('s-body').innerHTML = `<div class="a-empty">Не удалось получить отчёт: ${esc(e.message)}</div>`; return; }
  if (stale('server')) return;
  const S = D.storage, mem = memState(S.process.rss), share = Math.min(100, Math.round(S.process.rss / RENDER_RAM * 100));
  const total = S.keys.reduce((a, k) => a + k.bytes, 0);
  const up = S.process.uptime, upText = up >= 86400 ? Math.floor(up / 86400) + ' дн.' : up >= 3600 ? Math.floor(up / 3600) + ' ч' : Math.max(1, Math.floor(up / 60)) + ' мин';
  const group = (title, keys, hint, del) => `<h2 class="a-h2">${title}</h2>` + (keys.length ? `<div class="a-list">${keys.map(k => {
    const ph = k.kind === 'map' ? (S.photos.byMap[k.map] || null) : null;
    return `<div class="a-row"><span class="a-row-main"><b>${esc(keyLabel(k))}</b><small>${fmtBytes(k.bytes)}${ph ? ` · фото: ${fmtN(ph.count)} (${fmtBytes(ph.bytes)})` : ''}${k.updatedAt ? ' · изменено ' + fmtDate(k.updatedAt) : ''}</small></span>
      ${del ? `<span class="a-row-acts"><button type="button" class="a-btn danger sm" data-keydel="${esc(k.key)}" data-label="${esc(keyLabel(k))}">${uiIcon('trash', 14)} Удалить</button></span>` : ''}</div>`;
  }).join('')}</div>` : '<div class="a-empty">Нет</div>') + (hint ? `<p class="a-hint">${hint}</p>` : '');
  $('s-body').innerHTML = `<div class="a-grid">
      <div class="a-stat"><span class="a-stat-top"><span class="a-stat-ic">${uiIcon('server', 16)}</span>Память сервера</span><b>${share} %</b>
        <small>${fmtBytes(S.process.rss)} из 512 МБ · <span class="a-status ${mem[0]}">${mem[1]}</span> · работает ${upText}</small><div class="a-gauge ${mem[0]}"><i style="width:${share}%"></i></div></div>
      <div class="a-stat"><span class="a-stat-top"><span class="a-stat-ic">${uiIcon('sheet', 16)}</span>${S.storage === 'postgresql' ? 'База PostgreSQL' : 'Файлы на сервере'}</span><b>${fmtBytes(S.dbBytes != null ? S.dbBytes : total + S.photos.bytes)}</b>
        <small>${S.storage === 'postgresql' ? 'данные сохраняются при перезапуске' : 'внимание: без базы данные пропадут при перезапуске'}</small></div>
      <div class="a-stat"><span class="a-stat-top"><span class="a-stat-ic">${uiIcon('image', 16)}</span>Фото точек</span><b>${fmtN(S.photos.count)}</b><small>${fmtBytes(S.photos.bytes)}</small></div>
    </div>
    <div class="a-panel a-pad" style="margin-top:16px;display:grid;gap:12px">
      <div class="a-perm"><div><b>Ненужные фото: ${S.photos.orphans.count ? fmtN(S.photos.orphans.count) + ' (' + fmtBytes(S.photos.orphans.bytes) + ')' : 'нет'}</b><small>Снимки, на которые больше не ссылается ни одна точка — точку удалили, а фото осталось.</small></div>
        <button type="button" class="a-btn ghost" id="s-prune"${S.photos.orphans.count ? '' : ' disabled'}>${uiIcon('trash', 15)} Удалить</button></div>
      <div class="a-perm"><div><b>Кэш: ${fmtN(S.caches.states + S.caches.chunks)} ${plural(S.caches.states + S.caches.chunks, 'запись', 'записи', 'записей')}</b><small>Разобранные карты в памяти. Очищается сам каждые 30 секунд; очистить вручную — если память на пределе.</small></div>
        <button type="button" class="a-btn ghost" id="s-cache">${uiIcon('refresh', 15)} Очистить</button></div>
    </div>
    <div style="height:18px"></div>
    ${group('Карты', S.keys.filter(k => k.kind === 'map'), 'Карта удаляется в разделе «Карты».', false)}
    <div style="height:18px"></div>
    ${group('Личные данные учёток', S.keys.filter(k => k.kind === 'own' || k.kind === 'other'), 'Свои слои и границы учёток. Удаление стирает их у хозяина.', true)}
    <div style="height:18px"></div>
    <details class="a-panel a-pad"><summary class="a-h2" style="cursor:pointer;margin:0">Служебные записи (${S.keys.filter(k => k.kind === 'system').length})</summary><div style="height:10px"></div>${group('', S.keys.filter(k => k.kind === 'system'), '', false)}</details>`;
  $('s-prune').addEventListener('click', async () => {
    if (!await ask({ title: 'Удалить ненужные фото?', ok: 'Удалить', danger: true, text: `<p>${fmtN(S.photos.orphans.count)} фото, на которые не ссылается ни одна точка.</p>` })) return;
    if (await act(() => post('/admin/photos/prune', {}, 120000), r => `Удалено фото: ${fmtN(r.count)} (${fmtBytes(r.bytes)})`)) renderServer();
  });
  $('s-cache').addEventListener('click', async () => { if (await act(() => post('/admin/cache/clear', {}), 'Кэш очищен')) renderServer(); });
  $('s-body').querySelectorAll('[data-keydel]').forEach(b => b.addEventListener('click', async () => {
    if (!await ask({ title: 'Удалить запись?', ok: 'Удалить', danger: true, text: `<p>${esc(b.dataset.label)}. Это нельзя отменить.</p>` })) return;
    if (await act(() => post('/admin/storage/delete', { key: b.dataset.keydel }), 'Удалено')) renderServer();
  }));
}

boot();
