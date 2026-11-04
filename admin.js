/* Страница «Админ» (admin.html, решение владельца 06.11.2026): отдельная
   страница вместо вкладки. Разделы: сервер и память, карты, слои и точки всех
   карт, учётки, роли и правила. Работает через ту же сессию, что и карта
   (cookie / bearer), всё пишет только роль admin — сервер проверяет сам.
   Общие помощники (esc, uiIcon, toast, parseSheet, toRecs…) — в common.js. */
'use strict';

const SERVER_URL = window._HM_SERVER_URL || '';
const ROLE_NAMES = { admin: 'Админ (владелец)', comdep: 'Com Dep', other: 'Другая', kg: 'Кыргызстан' };
const MAP_ROLES = ['comdep', 'other', 'kg'];
const PERM_LABELS = [['layers', 'Свои слои из Excel'], ['manual', 'Точки вручную с фото'], ['bounds', 'Свои границы']];
const KEY_LABELS = { maps: 'Список карт', auth_overrides: 'Пароли, заданные здесь', auth_accounts: 'Учётки, созданные здесь',
  account_perms: 'Права, роли и карты учёток', role_rules: 'Правила ролей', shared_layers: 'Общие слои', dataset: 'Базовые данные (районы)' };

let SESSION_TOKEN = '', WRITE_KEY = '', ME = null;
let MAPS = [];

const $ = id => document.getElementById(id);
const fmtN = n => (Number(n) || 0).toLocaleString('ru-RU');
const pts = n => fmtN(n) + ' ' + plural(Number(n) || 0, 'точка', 'точки', 'точек');
const fmtDate = v => (v ? new Date(v).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');
const mapName = id => (MAPS.find(m => m.id === id) || { name: id }).name;
function genPassword() {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const buf = new Uint32Array(12); crypto.getRandomValues(buf);
  return Array.from(buf, n => abc[n % abc.length]).join('');
}
// Переключатель .cbx: клик и пробел/Enter.
function wireSwitch(el, fn) {
  const go = () => fn(el.getAttribute('aria-checked') !== 'true');
  el.addEventListener('click', go);
  el.addEventListener('keydown', e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); go(); } });
}
const switchHtml = (on, attrs, label) =>
  `<div class="cbx sm${on ? ' on' : ''}" role="switch" tabindex="0" aria-checked="${!!on}" aria-label="${esc(label)}" ${attrs}></div>`;

/* ── Сервер ─────────────────────────────────────────────────────────── */
function headers(extra = {}) {
  const h = { ...extra };
  if (SESSION_TOKEN) h.Authorization = 'Bearer ' + SESSION_TOKEN;
  return h;
}
async function errorText(res) {
  let msg = '';
  try { msg = ((await res.json()) || {}).error || ''; } catch (_) {}
  if (res.status === 401) return 'сессия закончилась — войдите заново';
  return msg || ('ошибка сервера, HTTP ' + res.status);
}
async function api(path, timeoutMs = 60000) {
  const res = await fetch(SERVER_URL + path, { headers: headers(), credentials: 'include', signal: AbortSignal.timeout(timeoutMs) });
  if (res.status === 401) { showLogin('Сессия закончилась — войдите заново'); throw new Error('сессия закончилась'); }
  if (!res.ok) throw new Error(await errorText(res));
  return res.json();
}
async function post(path, body, timeoutMs = 60000) {
  const res = await fetch(SERVER_URL + path, {
    method: 'POST', credentials: 'include', signal: AbortSignal.timeout(timeoutMs),
    headers: headers({ 'Content-Type': 'application/json', 'X-API-Key': WRITE_KEY }), body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await errorText(res));
  return res.json().catch(() => ({}));
}
// Действие с уведомлением; при ошибке — текст ошибки, затем перерисовка.
async function act(fn, okText, redraw) {
  try {
    const r = await fn();
    if (okText) toast(typeof okText === 'function' ? okText(r) : okText, 'ok', 3000);
  } catch (e) { toast(e.message, 'err', 5000); }
  if (redraw) await redraw();
}

/* ── Вход ───────────────────────────────────────────────────────────── */
function showLogin(sub) {
  $('ad-app').hidden = true;
  $('ad-login').hidden = false;
  if (sub) $('ad-login-sub').textContent = sub;
  $('ad-user').focus();
}
async function boot() {
  try {
    const res = await fetch(SERVER_URL + '/auth/me', { headers: headers(), credentials: 'include', signal: AbortSignal.timeout(20000) });
    if (!res.ok) return showLogin();
    ME = await res.json();
  } catch (e) {
    return showLogin('Сервер не отвечает — попробуйте ещё раз через минуту');
  }
  if (ME.token) SESSION_TOKEN = ME.token;
  WRITE_KEY = ME.writeKey || '';
  if (ME.role !== 'admin') return showLogin('Эта страница только для админа. Войдите под учёткой владельца.');
  $('ad-login').hidden = true;
  $('ad-app').hidden = false;
  $('ad-who').textContent = 'Вы вошли как ' + ME.username;
  await loadMaps();
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
  } catch (_) {
    err.textContent = 'Сервер не отвечает — попробуйте ещё раз';
  } finally { btn.disabled = false; }
});
$('ad-logout').addEventListener('click', async () => {
  try { await fetch(SERVER_URL + '/auth/logout', { method: 'POST', credentials: 'include' }); } catch (_) {}
  SESSION_TOKEN = ''; WRITE_KEY = ''; ME = null;
  showLogin('Вы вышли');
});

/* ── Разделы ────────────────────────────────────────────────────────── */
const SECTIONS = { overview: renderOverview, maps: renderMaps, layers: renderLayers, users: renderUsers, rules: renderRules };
function route() {
  if (!ME) return;
  const sec = SECTIONS[location.hash.slice(1)] ? location.hash.slice(1) : 'overview';
  document.querySelectorAll('.ad-nav a').forEach(a => { a.classList.toggle('on', a.dataset.sec === sec); a.setAttribute('aria-current', a.dataset.sec === sec ? 'page' : 'false'); });
  document.querySelectorAll('.ad-sec').forEach(s => { s.hidden = s.id !== 'sec-' + sec; });
  SECTIONS[sec]();
}
window.addEventListener('hashchange', route);
document.querySelectorAll('[data-refresh]').forEach(b => b.addEventListener('click', () => SECTIONS[b.dataset.refresh]()));

async function loadMaps() {
  try { MAPS = (await api('/maps')).maps || []; } catch (e) { toast('Не удалось загрузить карты: ' + e.message, 'err', 5000); }
}

/* ── Сервер и память ────────────────────────────────────────────────── */
const RENDER_RAM = 512 * 1048576;   // память сервера на тарифе Render
function keyLabel(k) {
  if (k.kind === 'map') return 'Карта «' + mapName(k.map) + '»';
  if (k.kind === 'own') {
    const what = k.what === 'bounds' ? 'Свои границы' : 'Свои слои';
    return `${what} · ${k.owner || 'неизвестная учётка'} · ${k.orphan ? 'карты больше нет' : mapName(k.map)}`;
  }
  if (k.kind === 'system') return KEY_LABELS[k.key] || k.key;
  return k.key + ' · карты больше нет';
}
async function renderOverview() {
  const cards = $('ov-cards'), table = $('ov-keys');
  cards.innerHTML = '<div class="maps-empty">Считаем…</div>';
  let r;
  try { r = await api('/admin/storage', 120000); } catch (e) { cards.innerHTML = `<div class="maps-empty">Не удалось получить отчёт: ${esc(e.message)}</div>`; table.innerHTML = ''; return; }
  const total = r.keys.reduce((a, k) => a + k.bytes, 0);
  const rssShare = Math.min(1, r.process.rss / RENDER_RAM);
  const up = r.process.uptime, upText = up >= 86400 ? Math.floor(up / 86400) + ' дн.' : up >= 3600 ? Math.floor(up / 3600) + ' ч' : Math.max(1, Math.floor(up / 60)) + ' мин';
  cards.innerHTML = [
    ['Хранилище', r.storage === 'postgresql' ? 'PostgreSQL' : 'Файлы', r.storage === 'postgresql' ? 'данные переживают перезапуск' : 'без базы: данные пропадут при перезапуске'],
    ['Размер базы', r.dbBytes != null ? fmtBytes(r.dbBytes) : fmtBytes(total + r.photos.bytes), r.dbBytes != null ? 'вся база PostgreSQL' : 'файлы состояния и фото'],
    ['Данные карт и учёток', fmtBytes(total), r.keys.length + ' ' + plural(r.keys.length, 'запись', 'записи', 'записей')],
    ['Фото точек', fmtBytes(r.photos.bytes), fmtN(r.photos.count) + ' шт.'],
    ['Ненужные фото', fmtBytes(r.photos.orphans.bytes), r.photos.orphans.count ? fmtN(r.photos.orphans.count) + ' шт. — можно удалить' : 'нет'],
  ].map(([t, v, n]) => `<div class="ad-card"><small>${esc(t)}</small><b>${esc(v)}</b><span>${esc(n)}</span></div>`).join('') +
    `<div class="ad-card"><small>Память сервера</small><b>${fmtBytes(r.process.rss)}</b><span>из ~512 МБ · в куче ${fmtBytes(r.process.heapUsed)} · работает ${upText}</span>
      <div class="ad-bar${rssShare > 0.75 ? ' hot' : ''}" role="img" aria-label="Занято ${Math.round(rssShare * 100)} % памяти"><i style="width:${Math.round(rssShare * 100)}%"></i></div></div>` +
    `<div class="ad-card"><small>Кэш сервера</small><b>${fmtN(r.caches.states + r.caches.chunks)}</b><span>карт: ${fmtN(r.caches.states)} · кусков слоёв: ${fmtN(r.caches.chunks)}</span></div>`;
  $('ov-prune').disabled = !r.photos.orphans.count;
  const photosOf = id => (r.photos.byMap[id] || { count: 0, bytes: 0 });
  table.innerHTML = '<thead><tr><th>Что</th><th class="num">Размер</th><th class="num">Фото</th><th>Изменено</th><th></th></tr></thead><tbody>' +
    r.keys.map(k => {
      const ph = k.kind === 'map' ? photosOf(k.map) : null;
      const del = k.kind === 'own' || k.kind === 'other';
      return `<tr><td>${esc(keyLabel(k))}</td><td class="num">${fmtBytes(k.bytes)}</td>
        <td class="num">${ph && ph.count ? fmtN(ph.count) + ' · ' + fmtBytes(ph.bytes) : '—'}</td>
        <td class="dim">${esc(fmtDate(k.updatedAt))}</td>
        <td class="num">${del ? `<button type="button" class="lyr-act" data-keydel="${esc(k.key)}" data-label="${esc(keyLabel(k))}">Удалить</button>` : ''}</td></tr>`;
    }).join('') + '</tbody>';
  table.querySelectorAll('[data-keydel]').forEach(b => b.addEventListener('click', () => {
    if (!confirm(`Удалить «${b.dataset.label}»? Это необратимо.`)) return;
    act(() => post('/admin/storage/delete', { key: b.dataset.keydel }), 'Запись удалена', renderOverview);
  }));
}
$('ov-prune').addEventListener('click', () => {
  if (!confirm('Удалить фото, на которые не ссылается ни одна точка?')) return;
  act(() => post('/admin/photos/prune', {}, 120000), r => `Удалено фото: ${fmtN(r.count)} (${fmtBytes(r.bytes)})`, renderOverview);
});
$('ov-cache').addEventListener('click', () => act(() => post('/admin/cache/clear', {}), 'Кэш сервера очищен', renderOverview));

/* ── Карты ──────────────────────────────────────────────────────────── */
let _mapEditId = null;
async function renderMaps() {
  const box = $('maps-list');
  box.innerHTML = '<div class="maps-empty">Загружаем карты…</div>';
  await loadMaps();
  box.innerHTML = MAPS.map(m => {
    const st = m.stats || {};
    const viewers = (m.viewers || []).filter(r => MAP_ROLES.includes(r)).map(r => ROLE_NAMES[r]);
    const meta = [m.country === 'kg' ? 'Кыргызстан' : 'Узбекистан', 'роли: ' + (viewers.length ? viewers.join(', ') : 'только админ'),
      st.bytes ? fmtBytes(st.bytes) + (st.updatedAt ? ' · ' + fmtDate(st.updatedAt) : '') : 'пустая',
      st.photos ? `фото: ${st.photos} (${fmtBytes(st.photoBytes)})` : ''].filter(Boolean).join(' · ');
    return `<div class="map-row">
      <span class="map-row-ic">${mapIconHtml(m.icon, 20)}</span>
      <div class="map-row-main"><b>${esc(m.name)}${m.base ? '<span class="map-row-tag base">исходная</span>' : ''}</b><small>${esc(meta)}</small></div>
      <div class="map-row-acts ad-layer-acts">
        <a class="lyr-act ad-link" href="index.html?map=${encodeURIComponent(m.id)}" target="_blank" rel="noopener">Открыть</a>
        <button type="button" class="lyr-act" data-mapexp="${esc(m.id)}">Скачать настройки</button>
        <button type="button" class="lyr-act" data-mapimp="${esc(m.id)}">Загрузить настройки</button>
        <button type="button" class="lyr-act" data-mapedit="${esc(m.id)}" aria-label="Изменить карту «${esc(m.name)}»">${uiIcon('pencil', 14)}</button>
        ${m.base ? '' : `<button type="button" class="lyr-act lyr-del" data-mapdel="${esc(m.id)}" aria-label="Удалить карту «${esc(m.name)}»">${uiIcon('trash', 14)}</button>`}
      </div>
    </div>`;
  }).join('') || '<div class="maps-empty">Карт нет</div>';
  box.querySelectorAll('[data-mapedit]').forEach(b => b.addEventListener('click', () => editMap(b.dataset.mapedit)));
  box.querySelectorAll('[data-mapdel]').forEach(b => b.addEventListener('click', () => deleteMap(b.dataset.mapdel)));
  box.querySelectorAll('[data-mapexp]').forEach(b => b.addEventListener('click', () => exportMap(b.dataset.mapexp)));
  box.querySelectorAll('[data-mapimp]').forEach(b => b.addEventListener('click', () => { _importMap = b.dataset.mapimp; $('map-import-file').click(); }));
  syncMapForm();
}
function syncMapForm() {
  const copy = $('mf-copy'), keep = copy.value;
  copy.innerHTML = '<option value="">Пустая карта</option>' + MAPS.map(m => `<option value="${esc(m.id)}">Копия «${esc(m.name)}» — все слои и точки</option>`).join('');
  copy.value = MAPS.some(m => m.id === keep) ? keep : '';
  const roles = $('mf-roles');
  if (!roles.dataset.built) {
    roles.dataset.built = '1';
    roles.innerHTML = MAP_ROLES.map(r => `<label class="mf-role"><input type="checkbox" value="${r}"/> <span>${esc(ROLE_NAMES[r])}</span></label>`).join('');
  }
  const icons = $('mf-icons');
  if (!icons.dataset.built) {
    icons.dataset.built = '1';
    icons.innerHTML = MAP_ICONS.map(ic => `<button type="button" class="mf-icon" data-ic="${ic}" aria-label="Значок карты">${mapIconHtml(ic)}</button>`).join('');
    icons.querySelectorAll('[data-ic]').forEach(b => b.addEventListener('click', () => setMapIcon(b.dataset.ic)));
  }
}
function setMapIcon(ic) {
  $('mf-icons').dataset.value = ic;
  $('mf-icons').querySelectorAll('[data-ic]').forEach(b => b.classList.toggle('on', b.dataset.ic === ic));
}
function resetMapForm() {
  _mapEditId = null;
  syncMapForm();
  $('mf-name').value = ''; $('mf-desc').value = '';
  $('mf-country').value = 'uz'; $('mf-country').disabled = false;
  $('mf-copy').value = ''; $('mf-copy-row').hidden = false;
  document.querySelectorAll('#mf-roles input').forEach(i => { i.checked = false; i.disabled = false; });
  setMapIcon('🗺');
  $('mf-title').textContent = '＋ Новая карта';
  $('mf-submit').textContent = 'Создать карту';
  $('mf-cancel').hidden = true;
}
function editMap(id) {
  const m = MAPS.find(x => x.id === id); if (!m) return;
  syncMapForm();
  _mapEditId = id;
  $('mf-name').value = m.name; $('mf-desc').value = m.desc || '';
  $('mf-country').value = m.country === 'kg' ? 'kg' : 'uz';
  $('mf-country').disabled = !!m.base;
  $('mf-copy-row').hidden = true;
  document.querySelectorAll('#mf-roles input').forEach(i => { i.checked = (m.viewers || []).includes(i.value); i.disabled = m.base && i.value === m.id; });
  setMapIcon(m.icon || '🗺');
  $('mf-title').textContent = 'Изменить: ' + m.name;
  $('mf-submit').textContent = 'Сохранить изменения';
  $('mf-cancel').hidden = false;
  $('map-form-group').open = true;
  $('map-form-group').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}
async function submitMapForm() {
  const name = $('mf-name').value.trim();
  if (!name) { toast('Укажите название карты', 'warn'); $('mf-name').focus(); return; }
  const body = { name, desc: $('mf-desc').value.trim(), icon: $('mf-icons').dataset.value || '🗺', country: $('mf-country').value,
    viewers: Array.from(document.querySelectorAll('#mf-roles input:checked')).map(i => i.value) };
  const btn = $('mf-submit'); btn.disabled = true;
  try {
    if (_mapEditId) {
      await post('/maps/update', { id: _mapEditId, ...body });
      toast(`Карта «${name}» обновлена`, 'ok');
    } else {
      body.copyFrom = $('mf-copy').value || '';
      const j = await post('/maps', body, 120000);
      toast(`Карта «${j.map.name}» создана`, 'ok', 4000);
      $('map-form-group').open = false;
    }
    resetMapForm();
    await renderMaps();
  } catch (e) { toast(e.message, 'err', 5000); } finally { btn.disabled = false; }
}
async function deleteMap(id) {
  const m = MAPS.find(x => x.id === id); if (!m) return;
  const typed = prompt(`Удалить карту «${m.name}» вместе со всеми слоями, точками и фото? Это необратимо.\n\nДля подтверждения введите название карты:`);
  if (typed == null) return;
  await act(() => post('/maps/delete', { id, confirm: typed.trim() }), `Карта «${m.name}» удалена`, renderMaps);
  if (_mapEditId === id) resetMapForm();
}
async function exportMap(id) {
  try {
    const st = await api('/state?map=' + encodeURIComponent(id), 120000);
    if (st.empty) { toast('Карта пустая — сохранять нечего', 'info'); return; }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(st, null, 2)], { type: 'application/json' }));
    a.download = `heatmap_${id}_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  } catch (e) { toast('Не удалось скачать: ' + e.message, 'err', 5000); }
}
let _importMap = null;
$('map-import-file').addEventListener('change', () => {
  const f = $('map-import-file').files[0], id = _importMap;
  $('map-import-file').value = ''; _importMap = null;
  if (!f || !id) return;
  const rd = new FileReader();
  rd.onload = () => {
    let st;
    try { st = JSON.parse(rd.result); } catch (_) { toast('Файл повреждён или это не JSON', 'err'); return; }
    if (!st || st._app !== 'hm-br') { toast('Это не файл настроек карты', 'err'); return; }
    if (!confirm(`Заменить карту «${mapName(id)}» содержимым файла «${f.name}»? Текущие слои и точки этой карты пропадут.`)) return;
    delete st._lazy;
    act(() => post('/state?map=' + encodeURIComponent(id), st, 180000), 'Настройки карты загружены', renderMaps);
  };
  rd.readAsText(f);
});
$('mf-submit').addEventListener('click', submitMapForm);
$('mf-cancel').addEventListener('click', resetMapForm);
$('mf-name').addEventListener('keydown', e => { if (e.key === 'Enter') submitMapForm(); });

/* ── Слои и точки ───────────────────────────────────────────────────── */
let LY = null;           // ответ /admin/layers
let _pt = null;          // открытый слой: { scope, map, kind, key, name, offset, rows, sel }
const layerIcon = l => uiIcon(l.kind === 'heat' ? 'flame' : 'pin', 14);
const kindText = l => (l.kind === 'heat' ? 'Тепловой слой' : l.manual ? 'Точки вручную' : 'Слой точек');
function layerRowHtml(l, addr, extra = '') {
  const a = Object.entries(addr).map(([k, v]) => `data-${k}="${esc(v)}"`).join(' ');
  const sel = _pt && _pt.key === l.key && _pt.scope === addr.scope && (_pt.map || '') === (addr.map || '');
  return `<div class="ad-layer${sel ? ' sel' : ''}">
    <span class="user-av" aria-hidden="true">${layerIcon(l)}</span>
    <div class="user-main"><b>${esc(l.name)}</b><small>${kindText(l)} · ${pts(l.n)}${extra}</small></div>
    <div class="ad-layer-acts">
      <button type="button" class="lyr-act" data-lyact="points" ${a} data-name="${esc(l.name)}">Точки</button>
      <button type="button" class="lyr-act" data-lyact="rename" ${a} data-name="${esc(l.name)}">Переименовать</button>
      <button type="button" class="lyr-act lyr-del" data-lyact="delete" ${a} data-name="${esc(l.name)}" aria-label="Удалить слой «${esc(l.name)}»">${uiIcon('trash', 14)}</button>
    </div>
  </div>`;
}
function sharedMapsHtml(l, i) {
  const all = l.maps.includes('*');
  return `<div class="sh-maps" role="group" aria-label="Карты для «${esc(l.name)}»">
    <label class="sh-map"><input type="checkbox" data-shmap="${i}" value="*"${all ? ' checked' : ''}/> Все карты, включая новые</label>
    ${MAPS.map(m => `<label class="sh-map"><input type="checkbox" data-shmap="${i}" value="${esc(m.id)}"${sharedOnMap(l, m.id) ? ' checked' : ''}/> ${esc(m.name)}</label>`).join('')}
  </div>`;
}
async function renderLayers() {
  const box = $('ly-list');
  box.innerHTML = '<div class="maps-empty">Собираем слои всех карт…</div>';
  try { LY = await api('/admin/layers', 120000); } catch (e) { box.innerHTML = `<div class="maps-empty">Не удалось загрузить слои: ${esc(e.message)}</div>`; return; }
  const f = $('ly-filter'), keep = f.value || 'all';
  f.innerHTML = '<option value="all">Все карты и слои</option>' + LY.maps.map(m => `<option value="map:${esc(m.id)}">Карта «${esc(m.name)}»</option>`).join('') +
    '<option value="shared">Общие слои</option><option value="own">Личные слои учёток</option>';
  f.value = [...f.options].some(o => o.value === keep) ? keep : 'all';
  drawLayers();
  if (_pt) loadPoints(true);
}
function drawLayers() {
  const box = $('ly-list'), want = $('ly-filter').value;
  const show = k => want === 'all' || want === k;
  let html = '';
  LY.maps.forEach(m => {
    if (!show('map:' + m.id)) return;
    html += `<div class="ad-group"><h3>Карта «${esc(m.name)}»</h3>` +
      (m.layers.map(l => layerRowHtml(l, { scope: 'map', map: m.id, kind: l.kind, key: l.key })).join('') || '<div class="maps-empty">Слоёв нет</div>') + '</div>';
  });
  if (show('shared')) {
    html += '<div class="ad-group"><h3>Общие слои</h3>' + (LY.shared.map((l, i) =>
      `<div class="ad-layer-box">${layerRowHtml(l, { scope: 'shared', kind: l.kind, key: l.key })}${sharedMapsHtml(l, i)}</div>`).join('') ||
      '<div class="maps-empty">Общих слоёв пока нет</div>') + '</div>';
  }
  if (show('own')) {
    html += '<div class="ad-group"><h3>Личные слои учёток</h3>' + (LY.own.map(o =>
      `<div class="ad-layer"><span class="user-av" aria-hidden="true">${esc((o.owner || '?').slice(0, 1).toUpperCase())}</span>
        <div class="user-main"><b>${esc(o.owner || 'неизвестная учётка')} · ${esc(mapName(o.map))}</b>
        <small>${esc(o.layers.map(l => `${l.name} (${pts(l.n)})`).join(', ') || 'пусто')} · ${fmtBytes(o.bytes)}</small></div>
        <div class="ad-layer-acts"><button type="button" class="lyr-act" data-owndel="${esc(o.storageKey)}" data-name="${esc((o.owner || '') + ' · ' + mapName(o.map))}">Удалить</button></div>
      </div>`).join('') || '<div class="maps-empty">Личных слоёв нет</div>') +
      '<p class="ad-hint">Личные слои видит только их хозяин. Удаление стирает все его свои слои и точки на этой карте.</p></div>';
  }
  box.innerHTML = html;
  box.querySelectorAll('[data-lyact]').forEach(b => b.addEventListener('click', () => layerAction(b.dataset.lyact, b.dataset)));
  box.querySelectorAll('[data-owndel]').forEach(b => b.addEventListener('click', () => {
    if (!confirm(`Удалить личные слои «${b.dataset.name}»?`)) return;
    act(() => post('/admin/storage/delete', { key: b.dataset.owndel }), 'Личные слои удалены', renderLayers);
  }));
  box.querySelectorAll('[data-shmap]').forEach(cb => cb.addEventListener('change', () => setSharedMaps(LY.shared[+cb.dataset.shmap], cb)));
}
$('ly-filter').addEventListener('change', drawLayers);
const layerAddr = d => ({ scope: d.scope, map: d.map || '', kind: d.kind, key: d.key });
function layerAction(what, d) {
  const addr = layerAddr(d);
  if (what === 'points') { _pt = { ...addr, name: d.name, offset: 0, rows: [], sel: new Map() }; $('pt-q').value = ''; drawLayers(); loadPoints(true); return; }
  if (what === 'rename') {
    const name = prompt('Новое название слоя', d.name);
    if (name == null || !name.trim() || name.trim() === d.name) return;
    act(() => post('/admin/layers/update', { ...addr, name: capFirst(name) }), 'Слой переименован', renderLayers);
    return;
  }
  const where = addr.scope === 'shared' ? 'со всех карт' : `с карты «${mapName(addr.map)}»`;
  if (!confirm(`Удалить слой «${d.name}» ${where}? Все его точки пропадут у всех. Это необратимо.`)) return;
  if (_pt && _pt.key === addr.key) closePoints();
  act(() => post('/admin/layers/delete', addr, 60000), `Слой «${d.name}» удалён`, renderLayers);
}
// Общий слой: галочки карт («все» + исключения или список).
function setSharedMaps(l, cb) {
  const except = l.except || [];
  let maps = l.maps, ex = except;
  if (cb.value === '*') { maps = cb.checked ? ['*'] : MAPS.filter(m => sharedOnMap(l, m.id)).map(m => m.id); ex = []; } else if (l.maps.includes('*')) {
    ex = cb.checked ? except.filter(m => m !== cb.value) : [...new Set([...except, cb.value])];
  } else {
    maps = cb.checked ? [...new Set([...l.maps, cb.value])] : l.maps.filter(m => m !== cb.value);
  }
  act(async () => {
    const all = (await api('/shared/layers/all', 60000)).layers || [];
    const cur = all.find(x => x.id === l.key);
    if (!cur) throw new Error('Слой уже удалён');
    await post('/shared/layers/one', { layer: { ...cur, maps, except: ex } }, 120000);
  }, 'Карты общего слоя сохранены', renderLayers);
}

// Точки слоя: поиск, выбор, удаление.
async function loadPoints(fresh) {
  if (!_pt) return;
  $('ly-points').hidden = false;
  $('pt-title').textContent = `Точки слоя «${_pt.name}»` + (_pt.scope === 'shared' ? ' · общий' : ' · ' + mapName(_pt.map));
  if (fresh) { _pt.offset = 0; _pt.rows = []; _pt.sel.clear(); }
  const q = new URLSearchParams({ scope: _pt.scope, map: _pt.map, kind: _pt.kind, key: _pt.key, q: $('pt-q').value.trim(), offset: _pt.offset });
  try {
    const j = await api('/admin/points?' + q.toString(), 60000);
    _pt.rows = _pt.rows.concat(j.rows);
    _pt.matched = j.matched; _pt.total = j.total;
    _pt.offset = j.offset + j.rows.length;
  } catch (e) { toast('Не удалось загрузить точки: ' + e.message, 'err', 5000); return; }
  drawPoints();
}
function drawPoints() {
  const t = $('pt-table'), p = _pt;
  $('pt-count').textContent = p.matched === p.total ? `Всего ${pts(p.total)}` : `Найдено ${fmtN(p.matched)} из ${pts(p.total)}`;
  const heat = p.kind === 'heat';
  t.innerHTML = `<thead><tr><th><input type="checkbox" id="pt-all" aria-label="Выбрать все показанные"/></th><th>Название</th><th>Адрес</th><th>Код</th><th class="num">Координаты</th>${heat ? '<th class="num">Значение</th>' : '<th class="num">Фото</th>'}</tr></thead><tbody>` +
    p.rows.map(r => `<tr><td><input type="checkbox" data-pti="${r.i}"${p.sel.has(r.i) ? ' checked' : ''} aria-label="Выбрать «${esc(r.name || 'без названия')}»"/></td>
      <td>${esc(r.name || '—')}</td><td class="dim">${esc(r.addr || '')}</td><td class="dim">${esc(r.code || '')}</td>
      <td class="num">${(+r.lat).toFixed(5)}, ${(+r.lon).toFixed(5)}</td><td class="num">${heat ? fmtN(r.vol) : (r.photos || '—')}</td></tr>`).join('') +
    (p.rows.length ? '' : '<tr><td colspan="6" class="dim">Ничего не найдено</td></tr>') + '</tbody>';
  $('pt-more').hidden = p.rows.length >= p.matched;
  const sync = () => { $('pt-del').disabled = !p.sel.size; $('pt-del').textContent = p.sel.size ? `Удалить выбранные (${fmtN(p.sel.size)})` : 'Удалить выбранные'; };
  t.querySelectorAll('[data-pti]').forEach(cb => cb.addEventListener('change', () => {
    const r = p.rows.find(x => x.i === +cb.dataset.pti);
    if (cb.checked) p.sel.set(r.i, r); else p.sel.delete(r.i);
    sync();
  }));
  $('pt-all').addEventListener('change', e => {
    p.rows.forEach(r => { if (e.target.checked) p.sel.set(r.i, r); else p.sel.delete(r.i); });
    drawPoints();
  });
  sync();
}
function closePoints() { _pt = null; $('ly-points').hidden = true; if (LY) drawLayers(); }
let _ptSearchT = null;
$('pt-q').addEventListener('input', () => { clearTimeout(_ptSearchT); _ptSearchT = setTimeout(() => loadPoints(true), 300); });
$('pt-more').addEventListener('click', () => loadPoints(false));
$('pt-close').addEventListener('click', closePoints);
$('pt-del').addEventListener('click', () => {
  const p = _pt; if (!p || !p.sel.size) return;
  const n = p.sel.size;
  if (!confirm(`Удалить ${pts(n)} из слоя «${p.name}»? Они пропадут из слоя у всех. Это необратимо.`)) return;
  const points = [...p.sel.values()].map(r => ({ i: r.i, lat: r.lat, lon: r.lon }));
  act(() => post('/admin/points/delete', { scope: p.scope, map: p.map, kind: p.kind, key: p.key, points }, 120000),
    r => `Удалено: ${pts(r.deleted)}, в слое осталось ${pts(r.left)}`, renderLayers);
});

// Новый общий слой из файла.
$('sh-upload').addEventListener('click', () => $('sh-file').click());
$('sh-file').addEventListener('change', () => {
  const f = $('sh-file').files[0]; if (!f) return;
  $('sh-file').value = '';
  const kind = $('sh-kind').value;
  const name = capFirst($('sh-name').value) || capFirst(f.name.replace(/\.[^.]+$/, ''));
  parseSheet(f, rows => {
    const recs = kind === 'heat' ? toRecs(rows) : toCustomPtRecs(rows);
    if (!recs.length) { toast('В файле нет строк с широтой и долготой', 'err'); return; }
    const n = LY ? LY.shared.length : 0;
    const layer = { id: 's' + Date.now().toString(36), kind, name: name.slice(0, 40), maps: ['*'], color: LAYER_PALETTE[n % LAYER_PALETTE.length], fields: recs._fields || [],
      ...(kind === 'heat' ? { volUnit: recs._percent ? '%' : '', recs: slimRecs(recs) } : { recs }) };
    act(async () => { await post('/shared/layers/one', { layer }, 180000); $('sh-name').value = ''; },
      `Общий слой «${name}»: ${pts(recs.length)} — на всех картах`, renderLayers);
  });
});

/* ── Учётки ─────────────────────────────────────────────────────────── */
let _pwOpen = null, _users = [], _pwMin = 8;
function userMapsOpen(u, m) {
  return Array.isArray(u.maps) ? u.maps.includes(m.id) : (m.id === u.role || (m.viewers || []).includes(u.role));
}
function userRowHtml(u) {
  const me = u.username === ME.username, open = _pwOpen === u.username;
  const when = u.changedAt ? 'пароль изменён ' + fmtDate(u.changedAt) : 'пароль из настроек сервера';
  const roleSel = me ? `<span class="map-row-tag base">${esc(ROLE_NAMES[u.role] || u.role)}</span>`
    : `<select class="mf-input ad-role" data-urole="${esc(u.username)}" aria-label="Роль «${esc(u.username)}»">${Object.entries(ROLE_NAMES).map(([r, n]) => `<option value="${r}"${r === u.role ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select>`;
  const own = u.own || {};
  const perms = u.role === 'admin' ? '<div class="ad-hint">Админ может всё и видит все карты.</div>' : `
    <div class="user-perms" role="group" aria-label="Права «${esc(u.username)}»">
      <div class="user-perms-head"><span>Права</span>${Object.keys(own).length ? `<button type="button" class="lc-link" data-upreset="${esc(u.username)}">Как в правиле роли</button>` : '<span>как в правиле роли</span>'}</div>
      ${PERM_LABELS.map(([p, label]) => `<div class="lc-opt">${switchHtml(u.perms[p], `data-permuser="${esc(u.username)}" data-perm="${p}"`, label + ' — ' + u.username)}<span>${esc(label)}</span>${p in own ? '<span class="user-perm-src">своё</span>' : ''}</div>`).join('')}
    </div>
    <div class="sh-maps user-maps" role="group" aria-label="Карты «${esc(u.username)}»">
      <div class="user-maps-head"><span>Карты: ${Array.isArray(u.maps) ? 'выбраны вручную' : 'по роли'}</span>${Array.isArray(u.maps) ? `<button type="button" class="lc-link" data-umreset="${esc(u.username)}">По роли</button>` : ''}</div>
      ${MAPS.map(m => `<label class="sh-map"><input type="checkbox" data-umuser="${esc(u.username)}" value="${esc(m.id)}"${userMapsOpen(u, m) ? ' checked' : ''}/> ${esc(m.name)}</label>`).join('')}
    </div>`;
  return `<div class="user-row${open ? ' open' : ''}">
    <div class="user-top">
      <span class="user-av" aria-hidden="true">${esc(u.username.slice(0, 1).toUpperCase())}</span>
      <div class="user-main"><b>${esc(u.username)}${me ? '<span class="map-row-tag">вы</span>' : ''}${u.created ? '<span class="map-row-tag base">создана здесь</span>' : ''}</b><small>${esc(when)}</small></div>
      ${roleSel}
      <button type="button" class="lyr-act" data-pwtoggle="${esc(u.username)}">${open ? 'Отмена' : 'Сменить пароль'}</button>
      ${u.created && !me ? `<button type="button" class="lyr-act lyr-del" data-userdel="${esc(u.username)}" aria-label="Удалить учётку «${esc(u.username)}»">${uiIcon('trash', 14)}</button>` : ''}
    </div>
    ${perms}
    ${open ? `<div class="user-pw-form">
      <div class="user-pw-row"><input type="password" class="mf-input" data-pw1 autocomplete="new-password" placeholder="Новый пароль, от ${_pwMin} символов" maxlength="128" aria-label="Новый пароль"/>
        <button type="button" class="lyr-act" data-pwshow aria-label="Показать пароль">${uiIcon('eye', 14)}</button></div>
      <input type="password" class="mf-input" data-pw2 autocomplete="new-password" placeholder="Повторите пароль" maxlength="128" aria-label="Повторите пароль"/>
      <div class="user-pw-acts"><button type="button" class="lyr-act" data-pwgen>Сгенерировать</button>
        <button type="button" class="btn user-pw-save" data-pwsave="${esc(u.username)}">Сохранить пароль</button></div>
    </div>` : ''}
  </div>`;
}
async function renderUsers() {
  const box = $('users-list');
  if (!MAPS.length) await loadMaps();
  try { const j = await api('/auth/users'); _users = j.users || []; _pwMin = j.min || 8; } catch (e) { box.innerHTML = `<div class="maps-empty">Не удалось загрузить учётки: ${esc(e.message)}</div>`; return; }
  box.innerHTML = _users.map(userRowHtml).join('') || '<div class="maps-empty">Учёток нет</div>';
  box.querySelectorAll('[data-urole]').forEach(sel => sel.addEventListener('change', () => {
    const username = sel.dataset.urole, role = sel.value;
    const warn = role === 'admin' ? `«${username}» получит полные права админа. ` : '';
    if (!confirm(`${warn}Сменить роль «${username}» на «${ROLE_NAMES[role]}»? Его сессии завершатся.`)) { renderUsers(); return; }
    act(() => post('/auth/role', { username, role }), `Роль «${username}»: ${ROLE_NAMES[role]}`, renderUsers);
  }));
  box.querySelectorAll('[data-permuser]').forEach(sw => wireSwitch(sw, on =>
    act(() => post('/auth/perms', { username: sw.dataset.permuser, perms: { [sw.dataset.perm]: on } }), 'Права сохранены', renderUsers)));
  box.querySelectorAll('[data-upreset]').forEach(b => b.addEventListener('click', () =>
    act(() => post('/auth/perms', { username: b.dataset.upreset, reset: true }), 'Права — как в правиле роли', renderUsers)));
  box.querySelectorAll('[data-umuser]').forEach(cb => cb.addEventListener('change', () => {
    const username = cb.dataset.umuser;
    const maps = [...box.querySelectorAll('[data-umuser]')].filter(x => x.dataset.umuser === username && x.checked).map(x => x.value);
    act(() => post('/auth/maps', { username, maps }), `Карты «${username}» сохранены`, renderUsers);
  }));
  box.querySelectorAll('[data-umreset]').forEach(b => b.addEventListener('click', () =>
    act(() => post('/auth/maps', { username: b.dataset.umreset, maps: null }), 'Карты — по роли', renderUsers)));
  box.querySelectorAll('[data-userdel]').forEach(b => b.addEventListener('click', () => {
    const username = b.dataset.userdel;
    if (!confirm(`Удалить учётку «${username}»? Человек сразу выйдет и больше не сможет войти.`)) return;
    act(() => post('/auth/users/delete', { username }), `Учётка «${username}» удалена`, renderUsers);
  }));
  box.querySelectorAll('[data-pwtoggle]').forEach(b => b.addEventListener('click', () => {
    _pwOpen = _pwOpen === b.dataset.pwtoggle ? null : b.dataset.pwtoggle;
    renderUsers().then(() => { const i = box.querySelector('[data-pw1]'); if (i) i.focus(); });
  }));
  const form = box.querySelector('.user-pw-form');
  if (!form) return;
  const p1 = form.querySelector('[data-pw1]'), p2 = form.querySelector('[data-pw2]'), save = form.querySelector('[data-pwsave]');
  form.querySelector('[data-pwshow]').addEventListener('click', () => { const t = p1.type === 'password' ? 'text' : 'password'; p1.type = t; p2.type = t; });
  form.querySelector('[data-pwgen]').addEventListener('click', () => {
    const v = genPassword(); p1.value = v; p2.value = v; p1.type = 'text'; p2.type = 'text';
    toast('Пароль сгенерирован — скопируйте и передайте его владельцу логина', 'info', 4500);
  });
  const submit = async () => {
    const username = save.dataset.pwsave;
    if (p1.value.length < _pwMin) { toast(`Пароль должен быть не короче ${_pwMin} символов`, 'warn'); p1.focus(); return; }
    if (p1.value !== p2.value) { toast('Пароли не совпадают', 'warn'); p2.focus(); return; }
    const self = username === ME.username;
    if (!confirm(self ? 'Сменить ваш пароль? Остальные ваши сессии будут завершены.' : `Сменить пароль «${username}»? Все его сессии будут завершены.`)) return;
    save.disabled = true;
    try {
      const j = await post('/auth/password', { username, password: p1.value }, 30000);
      if (j.self) { SESSION_TOKEN = j.token || SESSION_TOKEN; WRITE_KEY = j.writeKey || WRITE_KEY; }
      _pwOpen = null;
      toast(`Пароль «${username}» изменён`, 'ok', 4000);
      renderUsers();
    } catch (e) { toast(e.message, 'err', 5000); save.disabled = false; }
  };
  save.addEventListener('click', submit);
  p2.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
}
$('acc-role').innerHTML = Object.entries(ROLE_NAMES).map(([r, n]) => `<option value="${r}"${r === 'other' ? ' selected' : ''}>${esc(n)}</option>`).join('');
$('acc-gen').addEventListener('click', () => { $('acc-pass').value = genPassword(); });
$('acc-create').addEventListener('click', async () => {
  const username = $('acc-name').value.trim().toLowerCase(), password = $('acc-pass').value, role = $('acc-role').value;
  if (!username) { toast('Укажите логин', 'warn'); $('acc-name').focus(); return; }
  if (password.length < 8) { toast('Пароль — от 8 символов', 'warn'); $('acc-pass').focus(); return; }
  if (role === 'admin' && !confirm(`Учётка «${username}» получит полные права админа. Продолжить?`)) return;
  await act(async () => {
    await post('/auth/users/create', { username, role, password }, 30000);
    $('acc-name').value = ''; $('acc-pass').value = ''; $('acc-form-group').open = false;
  }, `Учётка «${username}» создана — передайте логин и пароль`, renderUsers);
});

/* ── Роли и правила ─────────────────────────────────────────────────── */
async function renderRules() {
  const t = $('rules-table');
  let j, users = [];
  try { [j, users] = await Promise.all([api('/auth/rules'), api('/auth/users').then(x => x.users || [])]); if (!MAPS.length) await loadMaps(); } catch (e) { t.innerHTML = `<tbody><tr><td>Не удалось загрузить: ${esc(e.message)}</td></tr></tbody>`; return; }
  const count = r => users.filter(u => u.role === r).length;
  t.innerHTML = `<thead><tr><th>Роль</th><th class="num">Учёток</th>${PERM_LABELS.map(([, l]) => `<th>${esc(l)}</th>`).join('')}</tr></thead><tbody>` +
    `<tr><td>${esc(ROLE_NAMES.admin)}</td><td class="num">${count('admin')}</td>${PERM_LABELS.map(() => '<td class="dim">всегда</td>').join('')}</tr>` +
    Object.entries(j.rules).map(([role, perms]) => `<tr><td>${esc(ROLE_NAMES[role] || role)}</td><td class="num">${count(role)}</td>` +
      PERM_LABELS.map(([p, l]) => `<td>${switchHtml(perms[p], `data-rule="${esc(role)}" data-perm="${p}"`, l + ' — ' + (ROLE_NAMES[role] || role))}</td>`).join('') + '</tr>').join('') + '</tbody>';
  t.querySelectorAll('[data-rule]').forEach(sw => wireSwitch(sw, on =>
    act(() => post('/auth/rules', { role: sw.dataset.rule, perms: { [sw.dataset.perm]: on } }), 'Правило роли сохранено', renderRules)));
  $('rules-maps').innerHTML = MAP_ROLES.map(r => {
    const open = MAPS.filter(m => m.id === r || (m.viewers || []).includes(r)).map(m => m.name);
    return `<div class="ad-layer"><div class="user-main"><b>${esc(ROLE_NAMES[r])}</b><small>${open.length ? esc(open.join(', ')) : 'ни одной карты'}</small></div></div>`;
  }).join('') + '<p class="ad-hint">Какие роли видят карту, задаётся в разделе «Карты» (правка карты). Учётке можно выбрать карты вручную в разделе «Учётки».</p>';
}

boot();
