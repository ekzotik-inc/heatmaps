/* Общие помощники карты (index.html) и страницы «Админ» (admin.html):
   экранирование, иконки Lucide, значки карт, уведомления, разбор Excel/CSV
   в записи слоёв. Подключается раньше app.js / admin.js. Правишь файл —
   подними его ?v= в обоих HTML. */
/* exported capFirst, esc, plural, uiIcon, toCustomPtRecs, mergeFields, toast,
   LAYER_PALETTE, ensureSheetLibs, parseSheet, toRecs, slimRecs, MAP_ICONS, mapIconHtml, sharedOnMap, fmtBytes */
/* global cityOf */
'use strict';

// Названия слоёв и зон всегда с заглавной буквы (решение владельца): так они
// выглядят одинаково в карточках, легенде, списках и выгрузках.
function capFirst(v) {
  const t = String(v == null ? '' : v).trim();
  return t ? t.charAt(0).toLocaleUpperCase('ru') + t.slice(1) : t;
}
function esc(s) {
  return ('' + (s == null ? '' : s)).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}


function plural(n, one, few, many) {
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}
/* ── ИКОНКИ ИНТЕРФЕЙСА (Lucide, ISC) ─────────────────────────────────── */
const UI_ICONS = {
  pencil: '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/>',
  download: '<path d="M12 15V3"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/>',
  upload: '<path d="M12 3v12"/><path d="m17 8-5-5-5 5"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>',
  trash: '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><path d="M10 11v6"/><path d="M14 11v6"/>',
  chevron: '<path d="m6 9 6 6 6-6"/>',
  eye: '<path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  camera: '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/>',
  share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" x2="15.42" y1="13.51" y2="17.49"/><line x1="15.41" x2="8.59" y1="6.51" y2="10.49"/>',
  flame: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
  pin: '<path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/>',
  sheet: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M8 13h2"/><path d="M14 13h2"/><path d="M8 17h2"/><path d="M14 17h2"/>',
};
function uiIcon(name, size = 15) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${UI_ICONS[name] || ''}</svg>`;
}

function toCustomPtRecs(rows) {
  const out = [];
  const fields = [];
  for (const r of rows) {
    const kLat = pickKey(r, COL_LAT), kLon = pickKey(r, COL_LON);
    const la = parseFloat(('' + r[kLat]).replace(',', '.'));
    const lo = parseFloat(('' + r[kLon]).replace(',', '.'));
    if (!isFinite(la) || !isFinite(lo)) continue;
    const used = [kLat, kLon];
    const rec = { ...recTextFields(r, used), lat: la, lon: lo };
    const x = recExtras(r, used, fields);
    if (x) rec.x = x;
    out.push(rec);
  }
  Object.defineProperty(out, '_fields', { value: fields, enumerable: false });
  return out;
}

// Поля слоя: заданные при создании + найденные в загруженном файле.
function mergeFields(cur, add) {
  const out = Array.isArray(cur) ? cur.slice() : [];
  (add || []).forEach(f => { if (f && !out.includes(f)) out.push(f); });
  return out.slice(0, EXTRA_MAX_COLS);
}

/* ── TOAST NOTIFICATIONS ─────────────────────────────────────────────── */
function toast(msg, type = 'info', ms = 2800) {
  const c = document.getElementById('toast-container');
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = msg;
  c.appendChild(t);
  setTimeout(() => {
    t.classList.add('out');
    t.addEventListener('animationend', () => t.remove(), { once: true });
  }, ms);
}

const LAYER_PALETTE = ['#E63946', '#457B9D', '#2DC653', '#FF9F1C', '#9B59B6', '#00B4D8', '#FF6B6B', '#06D6A0'];


// Lazily load the CSV/XLSX parsers — ~900 KB most sessions never need, so they
// are fetched on first upload/export instead of blocking the initial load.
let _sheetLibsP = null;
function ensureSheetLibs() {
  if (window.Papa && window.XLSX) return Promise.resolve();
  if (_sheetLibsP) return _sheetLibsP;
  const load = src => new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = src; s.onload = res; s.onerror = () => rej(new Error('load failed: ' + src));
    document.head.appendChild(s);
  });
  _sheetLibsP = Promise.all([
    window.Papa ? Promise.resolve() : load('https://cdnjs.cloudflare.com/ajax/libs/PapaParse/5.4.1/papaparse.min.js'),
    window.XLSX ? Promise.resolve() : load('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'),
  ]);
  return _sheetLibsP;
}

// Parse a CSV/XLSX file into row objects → cb(rows). Loads parsers on demand,
// shows a brief "processing" hint, and surfaces read/parse errors as toasts.
function parseSheet(file, cb) {
  const ext  = (file.name.split('.').pop() || '').toLowerCase();
  const fail = msg => toast(msg || 'Не удалось прочитать файл', 'err', 4500);
  ensureSheetLibs().then(() => {
    toast('Обработка файла…', 'info', 1500);
    if (ext === 'csv') {
      Papa.parse(file, {
        header: true, skipEmptyLines: true,
        complete: r => { try { cb(r.data || []); } catch (e) { fail('Ошибка обработки: ' + e.message); } },
        error: e => fail('Ошибка чтения CSV: ' + ((e && e.message) || e)),
      });
    } else {
      const rd = new FileReader();
      rd.onerror = () => fail('Не удалось прочитать файл');
      // setTimeout lets the "processing" toast paint before the blocking parse
      rd.onload = e => setTimeout(() => {
        try {
          const wb = XLSX.read(e.target.result, { type: 'array' });
          cb(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]) || []);
        } catch (err) { fail('Ошибка чтения XLSX: ' + err.message); }
      }, 20);
      rd.readAsArrayBuffer(file);
    }
  }).catch(() => fail('Не удалось загрузить обработчик файлов (проверьте сеть)'));
}

/* ── DATA UPLOAD ─────────────────────────────────────────────────────── */
// Колонка по ключевым словам: сначала точное совпадение заголовка, потом
// вхождение (для слов от трёх букв), ключи — по приоритету. `skip` — колонки,
// уже занятые другим полем: «Код точки» не должен стать названием из-за «точк».
function pickKey(o, keys, skip) {
  const cols = Object.keys(o).filter(k => !(skip && skip.includes(k)));
  const low = cols.map(k => ('' + k).toLowerCase().trim());
  for (const w of keys) { const i = low.indexOf(w); if (i >= 0) return cols[i]; }
  for (const w of keys) {
    if (w.length < 3) continue;
    const i = low.findIndex(k => k.includes(w));
    if (i >= 0) return cols[i];
  }
  return undefined;
}
const COL_CODE  = ['code', 'код', 'id', 'dms', 'дмс', 'sap'];
const COL_NAME  = ['name', 'назв', 'наимен', 'точк', 'title'];
const COL_ADDR  = ['addr', 'address', 'адрес'];
const COL_HOURS = ['hours', 'часы', 'время', 'график'];
const COL_LAT = ['lat', 'latitude', 'широт'];
const COL_LON = ['lon', 'lng', 'longitude', 'долгот'];
const COL_VAL = ['value', 'знач', 'объ', 'vol', 'amount', 'итог'];
// Служебные колонки, которые не стоит показывать как поля точки.
const COL_SKIP = /^(№|#|n|no|п\/п|fil|город|city|region|регион|область)$/i;
const EXTRA_MAX_COLS = 15, EXTRA_MAX_LEN = 300;
// Дополнительные поля точки — все колонки файла сверх стандартных (название,
// координаты, значение, код, адрес, часы). Их задаёт сам пользователь при
// создании слоя, они попадают в шаблон, карточку точки и выгрузку.
function recExtras(r, used, fieldsOut) {
  let x = null, n = 0;
  for (const k of Object.keys(r)) {
    if (used.includes(k)) continue;
    const label = String(k).trim();
    if (!label || COL_SKIP.test(label) || /^__empty/i.test(label)) continue;
    if (++n > EXTRA_MAX_COLS) break;
    if (fieldsOut && !fieldsOut.includes(label)) fieldsOut.push(label);
    const v = r[k] == null ? '' : String(r[k]).trim();
    if (!v) continue;
    (x || (x = {}))[label] = v.slice(0, EXTRA_MAX_LEN);
  }
  return x;
}
// Текстовые поля точки из строки файла: код, название, адрес, часы.
function recTextFields(r, usedOut) {
  const used = usedOut || [];
  const take = keys => {
    const k = pickKey(r, keys, used);
    if (k === undefined) return '';
    used.push(k);
    const v = r[k];
    return v == null ? '' : String(v).trim();
  };
  const code = take(COL_CODE);
  const addr = take(COL_ADDR);
  const hours = take(COL_HOURS);
  const name = take(COL_NAME);
  return { name, addr, code, hours };
}

function toRecs(rows) {
  const out = [];
  const fields = [];
  let percent = false;
  for (const r of rows) {
    const kLat = pickKey(r, COL_LAT), kLon = pickKey(r, COL_LON);
    const kVal = pickKey(r, COL_VAL, [kLat, kLon]);
    const la = parseFloat(('' + r[kLat]).replace(',', '.'));
    const lo = parseFloat(('' + r[kLon]).replace(',', '.'));
    const raw = kVal === undefined ? undefined : r[kVal];
    // Значение можно писать процентом: «0,356%». Храним само число (0.356),
    // а знак запоминаем на уровне слоя — так показываем его везде одинаково.
    const text = '' + (raw == null ? 1 : raw);
    // «%» в ячейке или в заголовке («Значение, %» — так её пишет наша выгрузка).
    if (/%/.test(text) || (kVal !== undefined && /%/.test(kVal))) percent = true;
    let v = parseFloat(text.replace('%', '').replace(/\s/g, '').replace(',', '.'));
    if (!isFinite(v) || v <= 0) v = 1;
    if (!isFinite(la) || !isFinite(lo)) continue;
    // Код, адрес и часы раньше отбрасывались здесь — и пропадали из карточки
    // точки и из выгрузок, хотя дальше по цепочке их всё поддерживает.
    const used = [kLat, kLon, kVal].filter(k => k !== undefined);
    const t = recTextFields(r, used);
    const rec = { name: t.name, fil: typeof cityOf === 'function' ? cityOf(la, lo) : '', lat: la, lon: lo, vol: v };
    if (t.addr) rec.addr = t.addr;
    if (t.code) rec.code = t.code;
    if (t.hours) rec.hours = t.hours;
    const x = recExtras(r, used, fields);
    if (x) rec.x = x;
    out.push(rec);
  }
  // Флаг читают места, где слой создаётся или перезаливается из файла.
  Object.defineProperty(out, '_percent', { value: percent, enumerable: false });
  Object.defineProperty(out, '_fields', { value: fields, enumerable: false });
  return out;
}


function slimRecs(recs) {
  return recs.map(r => {
    const m = { lat: +(+r.lat).toFixed(5), lon: +(+r.lon).toFixed(5), vol: r.vol };
    if (r.name)  m.name  = r.name;
    if (r.addr)  m.addr  = r.addr;
    if (r.code)  m.code  = r.code;
    if (r.hours) m.hours = r.hours;
    if (r.x) m.x = r.x;
    return m;
  });
}


const MAP_ICONS = ['🗺', '🗂', '🏙', '🏪', '📦', '🚚', '⭐', '🎯', '🇺🇿', '🇰🇬'];
/* Значок карты хранится как раньше — строкой-эмодзи из MAP_ICONS (реестр на
   сервере не меняется), а рисуется SVG-иконкой Lucide: эмодзи в интерфейсе
   выглядят по-разному на каждой системе (чек-лист ui-ux-pro-max: «No emojis
   as icons»). Флаги — подписью страны. */
const MAP_ICON_SVG = {
  '🗺': '<path d="M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0z"/><path d="M15 5.764v15"/><path d="M9 3.236v15"/>',
  '🗂': '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
  '🏙': '<path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/><path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/><path d="M10 18h4"/>',
  '🏪': '<path d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7"/><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4"/><path d="M2 7h20"/><path d="M22 7v3a2 2 0 0 1-2 2a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 16 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 12 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 8 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 4 12a2 2 0 0 1-2-2V7"/>',
  '📦': '<path d="M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z"/><path d="M12 22V12"/><path d="m3.3 7 8.7 5 8.7-5"/>',
  '🚚': '<path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/>',
  '⭐': '<path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.12 2.12 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.12 2.12 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.12 2.12 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.12 2.12 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.12 2.12 0 0 0 1.597-1.16z"/>',
  '🎯': '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
};
const MAP_ICON_FLAG = { '🇺🇿': 'UZ', '🇰🇬': 'KG' };
function mapIconHtml(ic, size = 18) {
  if (MAP_ICON_FLAG[ic]) return `<span class="map-flag" aria-hidden="true">${MAP_ICON_FLAG[ic]}</span>`;
  const d = MAP_ICON_SVG[ic] || MAP_ICON_SVG['🗺'];
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
}

// Карты, где общий слой виден: '*' — все (кроме except), иначе перечисленные.
function sharedOnMap(l, mapId) {
  return (l.maps.includes('*') || l.maps.includes(mapId)) && !(l.except || []).includes(mapId);
}

// Размер для людей: КБ / МБ / ГБ.
function fmtBytes(b) {
  b = Number(b) || 0;
  if (b >= 1073741824) return (b / 1073741824).toLocaleString('ru-RU', { maximumFractionDigits: 2 }) + ' ГБ';
  if (b >= 1048576) return (b / 1048576).toLocaleString('ru-RU', { maximumFractionDigits: 1 }) + ' МБ';
  return b ? Math.max(1, Math.round(b / 1024)) + ' КБ' : '0 КБ';
}
