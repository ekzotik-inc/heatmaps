/* ── ERROR SURFACE ───────────────────────────────────────────────────────
   Lightweight global handler until real monitoring (Sentry) is wired with a
   DSN. Logs everything to the console and shows a rate-limited toast so silent
   failures become visible to users. */
let _lastErrToast = 0;
function _reportError(label, err) {
  console.error('[hm] ' + label + ':', err);
  const now = Date.now();
  if (now - _lastErrToast > 5000 && typeof toast === 'function') {
    _lastErrToast = now;
    try { toast('Произошла ошибка — подробности в консоли', 'err', 4000); } catch (_) {}
  }
}
window.addEventListener('error', e => _reportError('error', e.error || e.message));
window.addEventListener('unhandledrejection', e => _reportError('unhandled promise', e.reason));

/* Escape user-supplied text before inserting into innerHTML / Leaflet popups
   and tooltips. Layer names and point fields come from uploaded files and free
   text, so they must never be rendered as raw HTML (XSS guard). */
function esc(s) {
  return ('' + (s == null ? '' : s)).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ── UTILS: COLOUR ───────────────────────────────────────────────────── */
function h2r(h) {
  h = h.replace('#', '');
  return { r: parseInt(h.substr(0, 2), 16), g: parseInt(h.substr(2, 2), 16), b: parseInt(h.substr(4, 2), 16) };
}
function r2h(o) {
  const t = v => ('0' + Math.round(Math.max(0, Math.min(255, v))).toString(16)).slice(-2);
  return '#' + t(o.r) + t(o.g) + t(o.b);
}
function mix(hex, t, a) {
  const c = h2r(hex);
  return r2h({ r: c.r + (t.r - c.r) * a, g: c.g + (t.g - c.g) * a, b: c.b + (t.b - c.b) * a });
}
const W = { r: 255, g: 255, b: 255 }, K = { r: 0, g: 0, b: 0 };
const lighten = (h, a) => mix(h, W, a);
const darken  = (h, a) => mix(h, K, a);
const mixHex  = (a, b, t) => mix(a, h2r(b), t);

function heatGrad(hex) {
  // Single-hue ramp: light→hue→dark, perceptually smoother stops
  return { 0.1: mix(hex, W, .78), 0.32: mix(hex, W, .45), 0.55: mix(hex, W, .15), 0.78: hex, 1.0: darken(hex, .38) };
}

/* Perceptually-uniform scientific colormaps (matplotlib/CARTO standards).
   Low values stay light/transparent, high values dark & saturated —
   reads naturally on a light basemap and is colorblind-safe (viridis). */
const HEAT_RAMPS = {
  warm:    { 0.10: '#ffffb2', 0.32: '#fed976', 0.55: '#fd8d3c', 0.78: '#e31a1c', 1.0: '#800026' }, // YlOrRd — классика тепла
  cool:    { 0.10: '#e0f3f8', 0.32: '#abd9e9', 0.55: '#41b6c4', 0.78: '#2c7fb8', 1.0: '#253494' }, // Blues — холодная
  viridis: { 0.10: '#fde725', 0.32: '#5ec962', 0.55: '#21918c', 0.78: '#3b528b', 1.0: '#440154' },
  inferno: { 0.10: '#fcffa4', 0.32: '#f98e09', 0.55: '#bc3754', 0.78: '#57106e', 1.0: '#000004' },
  magma:   { 0.10: '#fcfdbf', 0.32: '#fc8961', 0.55: '#b73779', 0.78: '#51127c', 1.0: '#000004' },
  turbo:   { 0.10: '#28bbec', 0.32: '#a4fc3c', 0.55: '#fb7e21', 0.78: '#d23105', 1.0: '#7a0403' },
};
const RAMP_NAMES = {
  custom:  'Свой цвет',
  warm:    'Классика (жёлто-красная)',
  cool:    'Холодная (синяя)',
  viridis: 'Viridis (научная)',
  inferno: 'Inferno',
  magma:   'Magma',
  turbo:   'Turbo (контрастная)',
};
function gradOf(d) {
  return (d.ramp && d.ramp !== 'custom' && HEAT_RAMPS[d.ramp]) ? HEAT_RAMPS[d.ramp] : heatGrad(d.color);
}
function rampColor(t) {
  t = Math.max(0, Math.min(1, t));
  return t < 0.5 ? mixHex(incCol.low, incCol.mid, t / 0.5) : mixHex(incCol.mid, incCol.high, (t - 0.5) / 0.5);
}

/* ── UTILS: GEO ──────────────────────────────────────────────────────── */
function hav(a, b, c, d) {
  const R = 6371000, r = Math.PI / 180,
        dla = (c - a) * r, dlo = (d - b) * r,
        l1 = a * r, l2 = c * r,
        x = Math.sin(dla / 2) ** 2 + Math.cos(l1) * Math.cos(l2) * Math.sin(dlo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
// Distances can be "unknown" (no reference points at all — e.g. the KG map has
// no own IQOS points yet). Show a dash instead of «1000000000000 км».
function fmtD(m) {
  if (m == null || !isFinite(m)) return '—';
  return m >= 1000 ? (m / 1000).toFixed(1) + ' км' : Math.round(m) + ' м';
}

/* ── SPATIAL INDEX (nearest-point lookups) ────────────────────────────────
   Наивный поиск ближайшей точки — O(записей × наших точек); при 20k записей и
   1k точек это десятки миллионов haversine на каждую загрузку слоя И на каждую
   гидрацию состояния. Грид по ~0.05° (≈5,5 км) сводит это к нескольким ячейкам
   вокруг запроса. Обход по «кольцам» останавливается, только когда найденное
   расстояние заведомо меньше всего, что может лежать за кольцом, — результат
   совпадает с брутфорсом. */
const IX_CELL = 0.05, M_PER_DEG = 111320;
function buildPtIndex(pts) {
  const cells = new Map(), arr = [];
  let maxAbsLat = 0;
  for (const p of pts) {
    const la = Array.isArray(p) ? p[0] : p.lat, lo = Array.isArray(p) ? p[1] : p.lon;
    if (!isFinite(la) || !isFinite(lo)) continue;
    if (Math.abs(la) > maxAbsLat) maxAbsLat = Math.abs(la);
    const i = arr.push({ lat: la, lon: lo, ref: p }) - 1;
    const key = Math.floor(la / IX_CELL) + '|' + Math.floor(lo / IX_CELL);
    const c = cells.get(key);
    if (c) c.push(i); else cells.set(key, [i]);
  }
  // Самая «северная» точка индекса задаёт минимальный масштаб долготы — только
  // с ним нижняя оценка расстояния до следующих колец остаётся корректной.
  return { cells, arr, minCos: Math.cos(maxAbsLat * Math.PI / 180) };
}
function nearestPt(ix, lat, lon) {
  const { cells, arr } = ix;
  if (!arr.length) return null;
  const ci = Math.floor(lat / IX_CELL), cj = Math.floor(lon / IX_CELL);
  // Долгота «сжимается» с широтой — берём самый слабый (безопасный) масштаб
  // из широты запроса и самой северной точки индекса.
  const lonScale = Math.max(Math.min(Math.cos(lat * Math.PI / 180), ix.minCos), 0.05);
  let best = Infinity, bestRef = null, settled = false;
  const scan = c => {
    for (const idx of c) {
      const p = arr[idx], d = hav(lat, lon, p.lat, p.lon);
      if (d < best) { best = d; bestRef = p.ref; }
    }
  };
  for (let ring = 0; ring <= 60 && !settled; ring++) {
    if (ring === 0) {
      const c = cells.get(ci + '|' + cj); if (c) scan(c);
    } else {
      // Обходим только рамку кольца: на верхней/нижней строке — все столбцы,
      // на остальных — лишь два крайних (иначе обход стал бы O(ring³)).
      for (let di = -ring; di <= ring; di++) {
        const edge = Math.abs(di) === ring;
        for (let dj = -ring; dj <= ring; dj += edge ? 1 : 2 * ring) {
          const c = cells.get((ci + di) + '|' + (cj + dj)); if (c) scan(c);
        }
      }
    }
    // Всё, что дальше этого кольца, отстоит минимум на ring ячеек по одной из
    // осей — если найденное ближе, дальше искать нечего.
    if (bestRef && best <= ring * IX_CELL * M_PER_DEG * lonScale) settled = true;
  }
  // Оценка не сомкнулась за 60 колец (~330 км) — точки разрежены, считаем
  // честно по всем: гарантируем тот же ответ, что и брутфорс.
  if (!settled) {
    best = Infinity; bestRef = null;
    for (const p of arr) { const d = hav(lat, lon, p.lat, p.lon); if (d < best) { best = d; bestRef = p.ref; } }
  }
  return bestRef ? { dist: best, ref: bestRef } : null;
}

/* ── DATA SETUP ──────────────────────────────────────────────────────── */
const own    = DATA.own;
const OWN_RU = { Tashkent: 'Ташкент', Samarkand: 'Самарканд', Andijan: 'Андижан',
                 Bukhara: 'Бухара', Fergana: 'Фергана', Kokand: 'Коканд', Margilan: 'Фергана' };
own.forEach(o => { o.cityRu = OWN_RU[o.city] || o.city; o.chk = o.ch === 'BR' ? 'BR' : 'SE'; });
const ownC = own.map(o => [o.lat, o.lon]);

// City config is PER-MAP (Узбекистан vs Кыргызстан) — see COUNTRIES /
// applyCountry() below. Declared here so cityOf()/renderCityInfo() can
// reference them; actual values are set when a map is chosen (start of startApp).
let CITIES = [], CITY_STATS = {}, CC = {};
let SMOKE_M = 0.194, SMOKE_F = 0.009, SMOKE_AVG = (SMOKE_M + SMOKE_F) / 2;
let WAGE_UNIT = 'млн', WAGE_CUR = 'сум/мес (2025)';
function cityOf(lat, lon) {
  let best = CITIES[0], bd = 1e9;
  for (const c in CC) {
    const d = (lat - CC[c][0]) ** 2 + (lon - CC[c][1]) ** 2;
    if (d < bd) { bd = d; best = c; }
  }
  return best;
}

/* ── LAYER STATE ─────────────────────────────────────────────────────── */
const DS = {
  cig:      Object.assign({ key: 'cig',      name: 'Сигареты', color: '#F4685C', intensity: 1, visible: true  }, DATA.cig),
  sticks:   Object.assign({ key: 'sticks',   name: 'Стики',    color: '#4C8DFF', intensity: 1, visible: false }, DATA.sticks),
};
DS.cig.ramp      = 'warm';
DS.sticks.ramp   = 'cool';
Object.values(DS).forEach(d => { d.opacity = 1; });

// Layers shown on the map are user-uploaded only (custom_*). cig/sticks stay in
// DS purely as data for the Analysis tab and city lookup, not as layers.
let heatKeys = [];
let heatBoost = 1;
let heatBlend = 'multiply';   // multiply makes overlapping layers mix like ink on a light basemap
let heatRadius = 28;

// UI state
let city = '', covR = 600, topN = 12, recShow = true, recBasis = '';

// Address-program state
let addrSrcKey  = ''; // uploaded heat-layer key or '__cpt__<id>' (set to first layer at boot)
let addrRefKey  = '__own__';      // reference points key: '__own__' = BR/IQOS, '__cpt__<id>' = custom layer
let rtRadius    = 1000;           // distance threshold (m)
let rtRadiusOp  = 'lte';         // lte ≤ | lt < | gte ≥ | gt >
let rtVolOp     = 'gte';         // volume operator (shipment mode only)
let rtVolMode   = 'avg';         // 'avg' | 'custom'
let rtVolCustom = 0;             // custom volume threshold
let rtExclRadius = 150;          // exclusion proximity (m)
let rtExclOp    = 'lt';          // exclusion operator
let rtExclKeys  = [];            // layer keys to exclude (shipment mode)

// Custom point layers (user-uploaded marker sets)
let customPtLayers = [];      // [{ id, name, color, visible, recs: [], _group: L.LayerGroup }]
let _cptUploadTarget = null;  // id of layer awaiting file upload

/* ── MAP INIT ────────────────────────────────────────────────────────── */
const map = L.map('map', { preferCanvas: true, zoomControl: false, minZoom: 5, zoomSnap: .5 })
              .setView([41, 67], 6);

// Базовая карта — ТОЛЬКО 2ГИС. Правило проекта (см. CLAUDE.md): никогда не
// менять подложку на другую (CARTO/OSM и т.п.) без прямой просьбы владельца.
L.tileLayer('https://tile{s}.maps.2gis.com/tiles?x={x}&y={y}&z={z}&v=1', {
  attribution: '&copy; <a href="https://2gis.ru">2ГИС</a>', subdomains: '0123', maxZoom: 18,
}).addTo(map);

map.createPane('districts'); map.getPane('districts').style.zIndex = 460;
map.createPane('income');    map.getPane('income').style.zIndex = 445;
map.getPane('income').style.pointerEvents = 'none';
map.createPane('ptradius');  map.getPane('ptradius').style.zIndex = 448; // coverage circles under markers

const distRenderer  = L.svg({ pane: 'districts' });
const radiusRenderer = L.svg({ pane: 'ptradius' });
const districtGroup = L.layerGroup().addTo(map);
const coresGroup    = L.layerGroup().addTo(map);
const radiusGroup   = L.layerGroup().addTo(map); // coverage radius around own points
const pointsGroup   = L.layerGroup().addTo(map);
const recLayer      = L.layerGroup().addTo(map);
const addrLayer     = L.layerGroup().addTo(map); // address-program preview markers
const cptRoot       = L.layerGroup().addTo(map); // parent for ALL custom-point layer groups

/* ── INCOME / DISTRICTS ──────────────────────────────────────────────── */
const incCol = { high: '#C0392B', mid: '#F39C12', low: '#1F9E5A' };
let districtsOn = false, incomeHeatOn = false, coresOn = false;
let fieldOverlay = null;

const TIER_NAME = { high: 'High income', mid: 'Middle income', low: 'Lower / emerging' };
const CX = {
  high: 'Premium engagement · KPI: ARPU, retention · формат: flagship / lounge',
  mid:  'Value proposition · KPI: conversion / frequency · формат: retail + акции + bundle',
  low:  'Цена-чувствительный сегмент · KPI: охват / трафик · формат: эконом + промо',
};
const ZONES = [
  { n:  1, tier: 'high', name: 'CBD / Golden core',          lat: 41.3110, lon: 69.2810, pl: 'Сквер Амира Тимура – Ц1 – Ц2 – Broadway' },
  { n:  2, tier: 'high', name: 'Tashkent City cluster',      lat: 41.3165, lon: 69.2685, pl: 'Tashkent City + север Шайхантахура' },
  { n:  3, tier: 'high', name: 'Мирабад premium belt',       lat: 41.2960, lon: 69.2860, pl: 'Айбек – Госпитальный – Mirabad Avenue' },
  { n:  4, tier: 'high', name: 'Яккасарай luxury strip',     lat: 41.2905, lon: 69.2680, pl: 'Руставели – Космонавтов – центр' },
  { n:  5, tier: 'high', name: 'Юнусабад centrified',        lat: 41.3380, lon: 69.2880, pl: 'Шахристан – Minor – Алайский' },
  { n:  6, tier: 'high', name: 'Мирзо-Улугбек elite pockets',lat: 41.3250, lon: 69.3300, pl: 'Ц1 / Ц2 / Карасу-2' },
  { n:  7, tier: 'mid',  name: 'Чиланзар core',              lat: 41.2835, lon: 69.2050, pl: '1–9 кварталы / Новза' },
  { n:  8, tier: 'mid',  name: 'Юнусабад outer',             lat: 41.3640, lon: 69.2930, pl: '6–19 кварталы' },
  { n:  9, tier: 'mid',  name: 'Мирзо-Улугбек mass zone',    lat: 41.3120, lon: 69.3150, pl: 'Хамза / Феруза / Луначарского' },
  { n: 10, tier: 'mid',  name: 'Яшнабад active growth',      lat: 41.2880, lon: 69.3150, pl: 'Кадышева – Авиасозлар' },
  { n: 11, tier: 'mid',  name: 'Алмазар mixed',              lat: 41.3280, lon: 69.2250, pl: 'Сабир Рахимов – Кукча' },
  { n: 12, tier: 'low',  name: 'Сергели (new city)',         lat: 41.2250, lon: 69.2200, pl: 'Сергели 5–8 / Янги Сергели' },
  { n: 13, tier: 'low',  name: 'Янгихаёт (fast-growing)',    lat: 41.2400, lon: 69.2700, pl: 'Спутник / новые массивы' },
  { n: 14, tier: 'low',  name: 'Учтепа',                     lat: 41.2880, lon: 69.1850, pl: 'Фархадский массив' },
  { n: 15, tier: 'low',  name: 'Бектемир / промзона',        lat: 41.2000, lon: 69.3350, pl: 'industrial clusters' },
];

function coreIcon(z) {
  const col = incCol[z.tier];
  return L.divIcon({
    className: '',
    html: `<div class="core-pin" style="background:radial-gradient(circle at 34% 30%,${lighten(col, .35)},${col} 60%,${darken(col, .18)})">${z.n}</div>`,
    iconSize: [26, 26], iconAnchor: [13, 13],
  });
}

function renderDistricts() {
  districtGroup.clearLayers();
  if (!districtsOn) return;
  const tn = { high: 'Высокий доход', mid: 'Средний доход', low: 'Ниже / растущий' };
  (DATA.districts || []).forEach(f => {
    const fill = incCol[f.tier];
    try {
      L.polygon(llswap(f.mp), { renderer: distRenderer, color: darken(fill, .2), weight: 2.2,
                                fillColor: fill, fillOpacity: .16, opacity: .9 })
       .bindTooltip(`<b style="font-weight:700">${f.ru}</b><br>${tn[f.tier]}`, { className: 'tt', sticky: true })
       .addTo(districtGroup);
    } catch (e) { console.warn('District render error:', e); }
  });
}
function llswap(mp) { return mp.map(poly => poly.map(ring => ring.map(c => [c[1], c[0]]))); }

function renderIncome() {
  if (fieldOverlay) { map.removeLayer(fieldOverlay); fieldOverlay = null; }
  coresGroup.clearLayers();
  const f = DATA.field;
  if (incomeHeatOn && f) {
    const cv  = document.createElement('canvas');
    cv.width  = f.nx; cv.height = f.ny;
    const ctx = cv.getContext('2d'), img = ctx.createImageData(f.nx, f.ny);
    let mn = 1e9, mx = -1e9;
    for (const v of f.grid) { if (v >= 0) { if (v < mn) mn = v; if (v > mx) mx = v; } }
    const rng = Math.max(mx - mn, 1);
    for (let i = 0; i < f.grid.length; i++) {
      const v = f.grid[i], o = i * 4;
      if (v < 0) { img.data[o + 3] = 0; continue; }
      const col = h2r(rampColor((v - mn) / rng));
      img.data[o] = col.r; img.data[o + 1] = col.g; img.data[o + 2] = col.b; img.data[o + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    fieldOverlay = L.imageOverlay(cv.toDataURL(), [[f.s, f.w], [f.n, f.e]],
                                  { opacity: 0.62, interactive: false, pane: 'income' }).addTo(map);
  }
  if (coresOn) {
    ZONES.forEach(z => {
      L.marker([z.lat, z.lon], { icon: coreIcon(z), zIndexOffset: 1800 })
       .bindTooltip(`<b style="font-weight:700">${z.n}. ${z.name}</b><br>${TIER_NAME[z.tier]}`,
                    { className: 'tt', direction: 'top', offset: [0, -12] })
       .bindPopup(`<div class="pp-title">${z.n}. ${z.name}</div>
                   <div class="pp-row"><span>Уровень</span><b>${TIER_NAME[z.tier]}</b></div>
                   <div class="pp-row"><span>Ориентиры</span><b style="font-family:Manrope;font-weight:500;text-align:right">${z.pl}</b></div>
                   <div class="pp-why">${CX[z.tier]}</div>`)
       .addTo(coresGroup);
    });
  }
}

/* ── POINT MARKERS ───────────────────────────────────────────────────── */
const SHAPES = [
  ['teardrop', 'Капля'], ['hex', 'Гексагон'], ['beacon', 'Маяк'], ['shield', 'Щит'],
  ['pin', 'Булавка'], ['circle', 'Круг'], ['square', 'Квадрат'],
  ['diamond', 'Ромб'], ['triangle', 'Треугольник'], ['star', 'Звезда'], ['ring', 'Кольцо'],
];

// Наши точки · IQOS (BR / 2nd SE) — display layers over the shared `own`
// dataset. The same data drives recommendation distances, the address-program
// reference and «Курильщиков на 1 нашу точку» in the City tab.
const pointLayers = [
  { id: 'br', name: 'IQOS — BR',     color: '#12ADC1', shape: 'teardrop', visible: true, radiusOn: false, radiusM: 1500, radiusColor: '#12ADC1', radiusOpacity: 0.15, data: own.filter(o => o.chk === 'BR') },
  { id: 'se', name: 'IQOS — 2nd SE', color: '#14B87D', shape: 'hex',      visible: true, radiusOn: false, radiusM: 1500, radiusColor: '#14B87D', radiusOpacity: 0.15, data: own.filter(o => o.chk === 'SE') },
];

function starPath(h, s) {
  let p = '';
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? s * 0.16 : s * 0.36, a = -Math.PI / 2 + i * Math.PI / 5;
    p += (i ? ' L' : 'M') + (h + r * Math.cos(a)).toFixed(1) + ' ' + (h + r * Math.sin(a)).toFixed(1);
  }
  return p + ' Z';
}

function shp(shape, color, s) {
  const h = s / 2, sw = Math.max(2, s * 0.085), gid = 'g' + color.replace('#', '') + shape;
  const defs = `<defs><radialGradient id="${gid}" cx="36%" cy="30%">
    <stop offset="0%"   stop-color="${lighten(color, .5)}"/>
    <stop offset="62%"  stop-color="${color}"/>
    <stop offset="100%" stop-color="${darken(color, .14)}"/>
  </radialGradient></defs>`;
  const st = `stroke="#fff" stroke-width="${sw}" stroke-linejoin="round"`;
  const f  = `fill="url(#${gid})"`;
  let body, anchor = [h, h];
  switch (shape) {
    case 'square':
      body = `<rect x="${s*.2}" y="${s*.2}" width="${s*.6}" height="${s*.6}" rx="${s*.15}" ${f} ${st}/>`;
      break;
    case 'diamond':
      body = `<rect x="${s*.24}" y="${s*.24}" width="${s*.52}" height="${s*.52}" rx="${s*.1}" transform="rotate(45 ${h} ${h})" ${f} ${st}/>`;
      break;
    case 'triangle':
      body = `<polygon points="${h},${s*.18} ${s*.84},${s*.8} ${s*.16},${s*.8}" ${f} ${st}/>`;
      break;
    case 'star':
      body = `<path d="${starPath(h, s)}" ${f} ${st}/>`;
      break;
    case 'ring':
      body = `<circle cx="${h}" cy="${h}" r="${s*.3}" fill="none" stroke="${color}" stroke-width="${s*.17}"/>
              <circle cx="${h}" cy="${h}" r="${s*.38}" fill="none" stroke="#fff" stroke-width="${s*.05}"/>`;
      break;
    case 'pin':
      body   = `<path d="M ${h} ${s*.94} C ${s*.16} ${s*.56},${s*.18} ${s*.14},${h} ${s*.14} C ${s*.82} ${s*.14},${s*.84} ${s*.56},${h} ${s*.94} Z" ${f} ${st}/><circle cx="${h}" cy="${s*.38}" r="${s*.12}" fill="#fff" opacity=".92"/>`;
      anchor = [h, s * .94];
      break;
    case 'teardrop':
      body   = `<path d="M ${h} ${s*.95} C ${s*.18} ${s*.6},${s*.2} ${s*.1},${h} ${s*.1} C ${s*.8} ${s*.1},${s*.82} ${s*.6},${h} ${s*.95} Z" ${f} ${st}/><circle cx="${h}" cy="${s*.39}" r="${s*.135}" fill="#fff"/>`;
      anchor = [h, s * .95];
      break;
    case 'hex': {
      const hp = [];
      for (let i = 0; i < 6; i++) {
        const a = -Math.PI / 2 + i * Math.PI / 3;
        hp.push((h + s * .37 * Math.cos(a)).toFixed(1) + ',' + (h + s * .37 * Math.sin(a)).toFixed(1));
      }
      body = `<polygon points="${hp.join(' ')}" ${f} ${st}/><circle cx="${h}" cy="${h}" r="${s*.13}" fill="#fff" opacity=".92"/>`;
      break;
    }
    case 'shield':
      body   = `<path d="M ${h} ${s*.14} L ${s*.79} ${s*.27} L ${s*.79} ${s*.54} C ${s*.79} ${s*.75},${h} ${s*.88},${h} ${s*.88} C ${h} ${s*.88},${s*.21} ${s*.75},${s*.21} ${s*.54} L ${s*.21} ${s*.27} Z" ${f} ${st}/><circle cx="${h}" cy="${s*.46}" r="${s*.1}" fill="#fff" opacity=".9"/>`;
      anchor = [h, s * .88];
      break;
    case 'beacon':
      body = `<circle cx="${h}" cy="${h}" r="${s*.35}" ${f} ${st}/><circle cx="${h}" cy="${h}" r="${s*.145}" fill="#fff"/>`;
      break;
    default:
      body = `<circle cx="${h}" cy="${h}" r="${s*.32}" ${f} ${st}/><circle cx="${h*.82}" cy="${h*.78}" r="${s*.08}" fill="#fff" opacity=".5"/>`;
  }
  return { html: `<svg class="pt-pin" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">${defs}${body}</svg>`, anchor };
}

function renderRadii() {
  radiusGroup.clearLayers();
  pointLayers.forEach(L0 => {
    if (!L0.visible || !L0.radiusOn) return;
    const col = L0.radiusColor || L0.color;
    const op  = L0.radiusOpacity == null ? 0.15 : L0.radiusOpacity;
    L0.data.filter(o => !city || o.cityRu === city).forEach(o => {
      L.circle([o.lat, o.lon], {
        renderer: radiusRenderer, pane: 'ptradius',
        radius: L0.radiusM, color: col, weight: 1.2,
        opacity: Math.min(op + 0.35, 0.9), fillColor: col, fillOpacity: op,
        interactive: false,
      }).addTo(radiusGroup);
    });
  });
}

function renderPoints() {
  renderRadii();
  pointsGroup.clearLayers();
  pointLayers.forEach(L0 => {
    if (!L0.visible) return;
    const ic = shp(L0.shape, L0.color, 32);
    L0.data.filter(o => !city || o.cityRu === city).forEach(o => {
      L.marker([o.lat, o.lon], {
        icon: L.divIcon({ className: '', html: ic.html, iconSize: [32, 32], iconAnchor: ic.anchor }),
        zIndexOffset: 1500,
      })
      .bindTooltip(`<b style="font-weight:700">${esc(o.name)}</b><br>${esc(L0.name)}`,
                   { className: 'tt', direction: 'top', offset: [0, -ic.anchor[1] + 4] })
      .bindPopup(`<div class="pp-title">${esc(o.name)}</div>
                  <div class="pp-row"><span>Канал</span><b>${esc(o.ch)}</b></div>
                  <div class="pp-row"><span>Город</span><b>${esc(o.cityRu)}</b></div>
                  ${o.addr  ? `<div class="pp-row"><span>Адрес</span><b style="font-family:Manrope;font-weight:500;text-align:right">${esc(o.addr)}</b></div>` : ''}
                  ${o.hours ? `<div class="pp-row"><span>Часы</span><b>${esc(o.hours)}</b></div>` : ''}
                  <span class="pp-tag" style="background:var(--acc-l);color:var(--acc-d);border:1px solid rgba(18,173,193,.35)">ТОЧКА IQOS</span>`)
      .addTo(pointsGroup);
    });
  });
}

/* ── HEAT LAYERS ─────────────────────────────────────────────────────── */
function applyHeatCanvas(d) {
  const canvas = d._leaf && d._leaf._canvas;
  if (!canvas) return;
  canvas.style.pointerEvents = 'none'; // prevent canvas from blocking tooltips on markers/polygons below
  canvas.style.mixBlendMode = heatBlend === 'normal' ? '' : heatBlend;
  canvas.style.filter = heatBoost === 1 ? '' : `brightness(${heatBoost}) saturate(${Math.max(heatBoost * .8 + .2, 0)})`;
  const op = (d.opacity == null ? 1 : d.opacity) * (heatBoost < 1 ? heatBoost : 1);
  canvas.style.opacity = op >= 1 ? '' : String(op);
}
function restyleHeatCanvases() {
  heatKeys.forEach(k => { const d = DS[k]; if (d) applyHeatCanvas(d); });
}

// leaflet.heat piles up the intensities of overlapping points, so a 50 000-point
// layer saturates the gradient while a 100-point layer never accumulates and
// stays washed out. Estimate each layer's own typical peak stacking at the
// current zoom (p97 of per-cell intensity sums on a radius-sized pixel grid)
// and use it as that layer's `max` — every layer then spans its full gradient
// independently of how many points it has.
function heatCellMax(pts, zoom) {
  if (!pts.length) return 1;
  const scale = 256 * Math.pow(2, zoom) / heatRadius;
  const bins = new Map();
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const s = Math.sin(p[0] * Math.PI / 180);
    const x = Math.floor((p[1] + 180) / 360 * scale);
    const y = Math.floor((0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * scale);
    const key = x * 4194304 + y;
    bins.set(key, (bins.get(key) || 0) + p[2]);
  }
  const sums = [...bins.values()].sort((a, b) => a - b);
  return Math.max(sums[Math.min(sums.length - 1, Math.floor(sums.length * 0.97))], 1);
}

function refreshHeatMax() {
  heatKeys.forEach(k => {
    const d = DS[k];
    if (!d || !d._leaf || !d._pts || !d._pts.length) return;
    d._leaf.setOptions({ max: heatCellMax(d._pts, map.getZoom()) });
    requestAnimationFrame(() => applyHeatCanvas(d));
  });
}

function renderHeat() {
  let total = 0;
  heatKeys.forEach(k => {
    const d = DS[k];
    if (!d) return;
    if (d._leaf) { map.removeLayer(d._leaf); d._leaf = null; }
    if (!d.visible) return;
    const recs  = d.recs.filter(r => !city || r.fil === city);
    const sorted = recs.map(r => r.vol).sort((a, b) => a - b);
    const p90idx = Math.max(0, Math.floor(sorted.length * 0.9) - 1);
    const p90    = sorted.length ? (sorted[p90idx] || 0.01) : (d.stats.p90 || 0.01);
    const scale  = Math.max(p90, 0.01);
    const boost = Math.max(d.intensity || 1, 0.1);
    // Auto per-layer normalisation: each layer is scaled to its own p90 so the
    // absolute magnitude of `value` doesn't matter — a layer of tiny values
    // looks as strong as one of huge values. A gamma lift + floor keep the
    // faintest points visible instead of washing out to nothing.
    const pts = recs.map(r => {
      const t = Math.min(r.vol / scale, 1);          // relative within layer (p90 → 1)
      const g = Math.pow(t, 0.55);                    // lift low values
      return [r.lat, r.lon, Math.min(Math.max(g, 0.18) * boost, 1)];
    });
    total += recs.length;
    d._pts = pts;
    // Sparse layers get a wider brush so isolated points read as heat, not specks.
    const rMul = Math.min(Math.max(Math.pow(600 / Math.max(recs.length, 1), 0.18), 1), 1.6);
    const rad  = Math.round(heatRadius * rMul);
    d._leaf = L.heatLayer(pts, {
      radius: rad, blur: Math.round(rad * .8), minOpacity: .22,
      max: heatCellMax(pts, map.getZoom()),
      gradient: gradOf(d),
    }).addTo(map);
    requestAnimationFrame(() => applyHeatCanvas(d));
  });
  document.getElementById('b-count').textContent = total.toLocaleString('ru-RU');
  updateLayerLegend();
}

function updateLayerLegend() {
  const el = document.getElementById('layer-legend');
  if (!el) return;
  const items = [];
  heatKeys.forEach(k => {
    const d = DS[k];
    if (d && d.visible && d.recs && d.recs.length) items.push({ color: d.color, name: d.name });
  });
  pointLayers.forEach(p => {
    if (p.visible && p.data && p.data.length) items.push({ color: p.color, name: p.name });
  });
  customPtLayers.forEach(l => {
    if (l.visible && l.recs && l.recs.length) items.push({ color: l.color, name: l.name });
  });
  if (recShow && lastRecs.length) items.push({ color: '#14B87D', name: 'Рекомендации' });
  if (!items.length) { el.style.display = 'none'; return; }
  el.style.display = '';
  el.innerHTML = '<div class="legend-title">Легенда</div>' + items.map(it =>
    `<div class="legend-item"><div class="legend-dot" style="background:${it.color}"></div><span class="legend-name">${esc(it.name)}</span></div>`
  ).join('');
}

/* ── RECOMMENDATIONS ─────────────────────────────────────────────────── */
const SUPPRESS = 1100;
const PREVIEW  = 3;
let lastRecs = [], lastBasisName = '';

function mkRecItem(s, idx) {
  const x = document.createElement('div');
  x.className = 'rec-item';
  x.innerHTML = `
    <div class="rec-rank">${idx}</div>
    <div class="rec-main">
      <b>${esc(s.name)}</b>
      <div class="meta"><span class="hi">спрос ${Math.round(s.ld)}</span> · ${s.lc} тч · ${esc(s.fil)} · ${fmtD(s.nd)}</div>
    </div>
    <div class="rec-demand">
      <div class="dv">${Math.round(s.ld)}</div>
      <div class="dl">ед/км²</div>
    </div>`;
  x.addEventListener('click', () => {
    map.flyTo([s.lat, s.lon], 15, { duration: .8 });
    setTimeout(() => openRec(s, idx), 700);
  });
  return x;
}

function openRec(s, rank) {
  const d = DS[recBasis];
  if (!d) return;
  L.popup({ maxWidth: 260 })
   .setLatLng([s.lat, s.lon])
   .setContent(`
     <div class="pp-title">Зона #${rank} — кандидат на ТТ BR</div>
     <div class="pp-row"><span>Основа</span><b>${esc(d.name)}</b></div>
     <div class="pp-row"><span>Город</span><b>${esc(s.fil)}</b></div>
     <div class="pp-row"><span>Спрос рядом</span><b>${Math.round(s.ld)} ед.</b></div>
     <div class="pp-row"><span>Точек рынка в зоне</span><b>${s.lc}</b></div>
     <div class="pp-row"><span>До ближайшей ТТ</span><b>${fmtD(s.nd)}</b></div>
     <div class="pp-why">Высокий спрос (${esc(d.name).toLowerCase()}) в радиусе ~700 м без нашей ТТ ближе ${fmtD(covR)}. Ориентир — «${esc(s.name)}». Рекомендуется открытие BR.</div>
     <span class="pp-tag" style="background:var(--rec-l);color:var(--rec-ink);border:1px solid rgba(20,184,125,.35)">РЕКОМЕНДАЦИЯ BR</span>`)
   .openOn(map);
}

/* Populate the recommendation-basis dropdown from uploaded layers */
function buildRecBasisSel() {
  const sel = document.getElementById('rec-basis-sel');
  if (!sel) return;
  if (!heatKeys.includes(recBasis)) recBasis = heatKeys[0] || '';
  sel.innerHTML = heatKeys.length
    ? heatKeys.map(k => `<option value="${k}"${k === recBasis ? ' selected' : ''}>${esc(DS[k] ? DS[k].name : k)}</option>`).join('')
    : '<option value="">Нет слоёв — загрузите на вкладке «Карта»</option>';
}

function renderRecs() {
  recLayer.clearLayers();
  const d = DS[recBasis];
  if (!d) {
    lastRecs = [];
    const rc = document.getElementById('rec-count'); if (rc) rc.textContent = '—';
    const rl = document.getElementById('rec-lbl'); if (rl) rl.innerHTML = 'Загрузите слой на вкладке «Карта», чтобы получить рекомендации';
    const list = document.getElementById('rec-list'); if (list) list.innerHTML = '';
    const tgl = document.getElementById('rec-toggle'); if (tgl) tgl.style.display = 'none';
    updateAccBadges(); updateLayerLegend();
    return;
  }
  lastBasisName = d.name;

  // Compute candidates
  const cand = d.recs
    .filter(s => (!city || s.fil === city) && s.nd > covR)
    .sort((a, b) => b.ld - a.ld || b.vol - a.vol);

  // Greedy suppression O(n log n) via Set
  const recs = [], used = new Set();
  for (const s of cand) {
    if (used.has(s)) continue;
    recs.push(s);
    for (const o of cand) {
      if (!used.has(o) && hav(s.lat, s.lon, o.lat, o.lon) <= SUPPRESS) used.add(o);
    }
    if (recs.length >= topN) break;
  }
  lastRecs = recs;
  updateAccBadges(); updateLayerLegend();

  // Summary
  const uncSum    = cand.reduce((a, s) => a + s.vol, 0);
  const cityTotal = d.recs.filter(s => !city || s.fil === city).reduce((a, s) => a + s.vol, 0) || 1;
  document.getElementById('rec-count').textContent = recs.length;
  document.getElementById('rec-lbl').innerHTML =
    `зон для новой <b>BR</b> · основа: <b>${esc(d.name).toLowerCase()}</b> · вне покрытия <b>${Math.round(uncSum).toLocaleString('ru-RU')}</b> ед. (<b>${Math.round(uncSum / cityTotal * 100)}%</b>)`;

  // Render list
  const el = document.getElementById('rec-list');
  el.innerHTML = '';

  const preview = document.createElement('div');
  preview.className = 'rec-preview';
  recs.slice(0, PREVIEW).forEach((s, i) => preview.appendChild(mkRecItem(s, i + 1)));
  el.appendChild(preview);

  const tog = document.getElementById('rec-toggle');
  if (recs.length > PREVIEW) {
    const wrap  = document.createElement('div');
    const inner = document.createElement('div');
    wrap.className  = 'rec-expand-wrap';
    inner.className = 'rec-expand-inner';
    recs.slice(PREVIEW).forEach((s, i) => inner.appendChild(mkRecItem(s, i + PREVIEW + 1)));
    wrap.appendChild(inner);
    el.appendChild(wrap);

    const rest = recs.length - PREVIEW;
    const plural = n => n === 1 ? 'зону' : n < 5 ? 'зоны' : 'зон';
    tog.style.display = '';
    tog.className = 'rec-toggle';
    tog.innerHTML = `<span>Показать ещё ${rest} ${plural(rest)}</span><span class="arrow">▼</span>`;
    tog.onclick = () => {
      const open = wrap.classList.toggle('open');
      tog.className = 'rec-toggle' + (open ? ' open' : '');
      tog.innerHTML  = open
        ? `<span>Скрыть</span><span class="arrow">▼</span>`
        : `<span>Показать ещё ${rest} ${plural(rest)}</span><span class="arrow">▼</span>`;
    };
  } else {
    tog.style.display = 'none';
  }

  // Map pins
  if (!recShow) return;
  recs.forEach((s, i) => {
    const m = L.marker([s.lat, s.lon], {
      icon: L.divIcon({
        className: '',
        html: `<div class="rec-pin"><div class="ring"></div><div class="core"></div><span>${i + 1}</span></div>`,
        iconSize: [30, 30], iconAnchor: [15, 15],
      }),
      zIndexOffset: 2000,
    });
    m.bindTooltip(
      `<b style="font-weight:700">Зона #${i + 1} · ${esc(s.fil)}</b><br>спрос ${Math.round(s.ld)} (${esc(d.name).toLowerCase()})`,
      { className: 'tt', direction: 'top', offset: [0, -14] }
    );
    m.on('click', () => openRec(s, i + 1));
    recLayer.addLayer(m);
  });
}

/* ── SLIDER FILL HELPER ──────────────────────────────────────────────── */
function fillSlider(el) {
  if (!el) return;
  const min = +el.min || 0, max = +el.max || 100, val = +el.value;
  el.style.setProperty('--pct', ((val - min) / (max - min) * 100).toFixed(1) + '%');
}
function fillAllSliders() {
  document.querySelectorAll('input[type=range]').forEach(fillSlider);
}

/* ── ДОСТУПНОСТЬ: кастомные тумблеры ──────────────────────────────────────
   `.cbx` — это <div>, поэтому по умолчанию он не получает фокус, не работает
   с клавиатуры и никак не объявляется скринридером. Помечаем как
   role="switch", даём tabindex и держим aria-checked в актуальном состоянии.
   Вызывается после каждой пересборки списков (разметка там перерисовывается). */
function a11ySwitches() {
  document.querySelectorAll('.cbx').forEach(el => {
    el.setAttribute('role', 'switch');
    if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '0');
    el.setAttribute('aria-checked', el.classList.contains('on') ? 'true' : 'false');
  });
}
// Пробел / Enter переключают тумблер под фокусом.
document.addEventListener('keydown', e => {
  const t = e.target;
  if (!t || !t.classList || !t.classList.contains('cbx')) return;
  if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); t.click(); }
});
document.addEventListener('click', e => {
  const t = e.target.closest ? e.target.closest('.cbx') : null;
  // Обработчики самих тумблеров навешаны прямо на элемент, поэтому к моменту
  // всплытия сюда класс .on уже актуален — читаем его синхронно.
  if (t) t.setAttribute('aria-checked', t.classList.contains('on') ? 'true' : 'false');
});
// Клик по подписи рядом с тумблером тоже переключает: <label> без `for` не
// делает ничего, и текст «Показывать на карте» выглядел неработающим.
document.addEventListener('click', e => {
  const lab = e.target.closest ? e.target.closest('label.chk') : null;
  if (!lab || e.target.closest('.cbx')) return;
  const cb = lab.querySelector('.cbx');
  if (cb) cb.click();
});

/* ── ACCORDION BADGE UPDATER ─────────────────────────────────────────── */
function updateAccBadges() {
  // Heat layers badge: visible / total
  const heatBadge = document.getElementById('acc-badge-heat');
  if (heatBadge) {
    const vis = heatKeys.filter(k => DS[k] && DS[k].visible).length;
    heatBadge.textContent = heatKeys.length ? `${vis}/${heatKeys.length}` : '';
  }
  // Custom point layers badge
  const cptBadge = document.getElementById('acc-badge-cpt');
  if (cptBadge) {
    const cptVis = customPtLayers.filter(l => l.visible).length;
    cptBadge.textContent = customPtLayers.length ? `${cptVis}/${customPtLayers.length}` : '';
  }
  // Rec badge — очищаем, когда рекомендаций нет (иначе висит старое число)
  const recBadge = document.getElementById('acc-badge-rec');
  if (recBadge) recBadge.textContent = lastRecs.length ? lastRecs.length : '';
  // City summary tab depends on the same inputs (city, layers, recs)
  renderCityInfo();
}

/* Solo / isolate a single heat layer to fix the "overlap mush" problem */
let _soloKey = null, _preSolo = null;
function toggleSolo(k) {
  if (_soloKey === k) {
    // restore previous visibility
    if (_preSolo) heatKeys.forEach(kk => { if (DS[kk] && _preSolo[kk] != null) DS[kk].visible = _preSolo[kk]; });
    _soloKey = null; _preSolo = null;
  } else {
    if (!_preSolo) { _preSolo = {}; heatKeys.forEach(kk => { if (DS[kk]) _preSolo[kk] = DS[kk].visible; }); }
    heatKeys.forEach(kk => { if (DS[kk]) DS[kk].visible = (kk === k); });
    _soloKey = k;
  }
  buildHeatUI(); renderHeat(); updateAccBadges();
}

/* ── UI BUILDERS ─────────────────────────────────────────────────────── */
const _lyrOpen = new Set();   // keys of layer cards whose settings are expanded

function buildHeatUI() {
  const el = document.getElementById('heat-list');
  el.innerHTML = '';
  if (!heatKeys.length) {
    el.innerHTML = '<div class="cpt-empty">Слоёв пока нет. Нажмите «Загрузить слой» и выберите CSV/XLSX с колонками name, lat, lon, value.</div>';
  }
  heatKeys.forEach(k => {
    const d = DS[k];
    if (!d) return;
    const custom = k.startsWith('custom_');
    const card   = document.createElement('div');
    card.className = 'lyr' + (_lyrOpen.has(k) ? ' open' : '');
    card.innerHTML = `
      <div class="lyr-head">
        <span class="lyr-dot" style="background:${d.color}"></span>
        <div class="nm">${esc(d.name)}
          <small>${d.stats.n.toLocaleString('ru-RU')} точек</small>
        </div>
        <svg class="lyr-chev" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
        <div class="cbx${d.visible ? ' on' : ''}" aria-label="Показывать слой «${esc(d.name)}» на карте"></div>
      </div>
      <div class="lyr-body">
        <div class="lyr-ctl">
          <div class="grp" style="flex:1">Палитра
            <select class="ramp-sel" style="flex:1">${Object.keys(RAMP_NAMES).map(r =>
              `<option value="${r}"${(d.ramp || 'custom') === r ? ' selected' : ''}>${RAMP_NAMES[r]}</option>`).join('')}</select>
            <input type="color" value="${d.color}" style="display:${(d.ramp || 'custom') === 'custom' ? '' : 'none'}">
          </div>
        </div>
        <div class="ramp-preview"></div>
        <div class="lyr-ctl">
          <div class="grp" style="flex:1">Интенс. <input type="range" class="r-int" min="0.2" max="4" step="0.1" value="${d.intensity || 1}" style="flex:1"><span class="sl-val">${(d.intensity || 1).toFixed(1)}×</span></div>
          <div class="grp" style="flex:1">Прозр. <input type="range" class="r-op" min="0.05" max="1" step="0.05" value="${d.opacity == null ? 1 : d.opacity}" style="flex:1"><span class="sl-val">${Math.round((d.opacity == null ? 1 : d.opacity) * 100)}%</span></div>
        </div>
        <div class="lyr-meta">Объём слоя: ${Math.round(d.stats.sum).toLocaleString('ru-RU')}</div>
        <div class="lyr-actions">
          <button class="lyr-act lyr-rename" title="Переименовать слой">✎ Имя</button>
          <button class="lyr-act lyr-solo${_soloKey === k ? ' on' : ''}" title="Показать только этот слой">◉ Соло</button>
          <button class="lyr-act lyr-update" title="Перезалить файл в этот слой">⬆ Данные</button>
          ${custom ? `<button class="lyr-act lyr-del" title="Удалить слой">&times;</button>` : ''}
        </div>
      </div>`;

    // Header click expands / collapses the settings (except the toggle pill)
    card.querySelector('.lyr-head').addEventListener('click', e => {
      if (e.target.closest('.cbx') || e.target.tagName === 'INPUT') return;
      const open = card.classList.toggle('open');
      if (open) _lyrOpen.add(k); else _lyrOpen.delete(k);
    });

    const colorInp = card.querySelector('input[type=color]');
    const rampSel  = card.querySelector('.ramp-sel');
    const preview  = card.querySelector('.ramp-preview');
    const drawPreview = () => {
      const g = gradOf(d);
      const stops = Object.keys(g).map(Number).sort((a, b) => a - b)
        .map(s => `${g[s]} ${Math.round(s * 100)}%`).join(', ');
      preview.style.background = `linear-gradient(90deg, transparent 0%, ${stops})`;
    };
    drawPreview();

    card.querySelector('.cbx').addEventListener('click', e => {
      d.visible = !d.visible; e.target.classList.toggle('on', d.visible); renderHeat(); updateAccBadges();
    });
    card.querySelector('.lyr-solo').addEventListener('click', () => toggleSolo(k));
    rampSel.addEventListener('change', e => {
      d.ramp = e.target.value;
      colorInp.style.display = d.ramp === 'custom' ? '' : 'none';
      drawPreview(); renderHeat();
    });
    colorInp.addEventListener('input', e => { d.color = e.target.value; card.querySelector('.lyr-dot').style.background = d.color; drawPreview(); renderHeat(); });
    card.querySelector('.r-int').addEventListener('input', e => {
      d.intensity = +e.target.value;
      fillSlider(e.target);
      e.target.nextElementSibling.textContent = d.intensity.toFixed(1) + '×';
      renderHeat();
    });
    card.querySelector('.r-op').addEventListener('input', e => {
      d.opacity = +e.target.value;
      fillSlider(e.target);
      e.target.nextElementSibling.textContent = Math.round(d.opacity * 100) + '%';
      renderHeat();
    });

    // Rename — swap the name for an inline input
    const nmEl = card.querySelector('.nm');
    const renameBtn = card.querySelector('.lyr-rename');
    renameBtn.addEventListener('click', () => {
      const cur = d.name;
      const inp = document.createElement('input');
      inp.type = 'text'; inp.value = cur; inp.maxLength = 40;
      inp.style.cssText = 'flex:1;min-width:0;font-family:Manrope;font-size:13px;font-weight:700;color:var(--ink);background:var(--card2);border:1.5px solid var(--acc);border-radius:8px;padding:5px 8px;outline:none';
      nmEl.replaceWith(inp); inp.focus(); inp.select();
      let done = false;
      const commit = save => {
        if (done) return; done = true;
        if (save) { const v = inp.value.trim(); if (v) d.name = v; }
        buildHeatUI(); buildAddrSrcSel(); buildRecBasisSel(); rebuildUpTarget(); if (save) saveState();
      };
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') commit(true); else if (e.key === 'Escape') commit(false); });
      inp.addEventListener('blur', () => commit(true));
    });

    // Update — re-upload a file into this layer, replacing its data
    card.querySelector('.lyr-update').addEventListener('click', () => {
      _heatUpdateTarget = k;
      document.getElementById('heat-update-file').click();
    });

    if (custom) {
      const del = card.querySelector('.lyr-del');
      del.addEventListener('click', () => {
        if (!confirm(`Удалить слой «${d.name}»? Данные слоя будут потеряны.`)) return;
        if (d._leaf) { map.removeLayer(d._leaf); d._leaf = null; }
        delete DS[k];
        heatKeys = heatKeys.filter(x => x !== k);
        buildHeatUI(); buildAddrSrcSel(); buildRecBasisSel(); rebuildUpTarget(); renderHeat(); renderRecs(); saveState();
      });
    }
    el.appendChild(card);
    card.querySelectorAll('input[type=range]').forEach(fillSlider);
  });
  a11ySwitches();
}

function buildPtUI() {
  const el = document.getElementById('pt-list');
  el.innerHTML = '';
  if (!own.length) {
    el.innerHTML = '<div class="cpt-empty">Точек IQOS пока нет. Нажмите «Загрузить наши точки» и выберите CSV/XLSX по шаблону (ch, name, city, code, addr, hours, lat, lon)</div>';
    return;
  }
  pointLayers.forEach(L0 => {
    const card = document.createElement('div');
    card.className = 'lyr';
    const opts = SHAPES.map(s => `<option value="${s[0]}"${s[0] === L0.shape ? ' selected' : ''}>${s[1]}</option>`).join('');
    const rPct = (L0.radiusM - 200) / (5000 - 200) * 100;
    const oPct = (L0.radiusOpacity || .15) / .5 * 100;
    card.innerHTML = `
      <div class="lyr-top">
        <div class="nm">${esc(L0.name)}</div>
        <span class="cpt-count">${L0.data.length}</span>
        <div class="cbx${L0.visible ? ' on' : ''}" aria-label="Показывать «${esc(L0.name)}» на карте"></div>
      </div>
      <div class="lyr-ctl">
        <div class="grp">Цвет <input type="color" class="pt-col" value="${L0.color}"></div>
        <div class="grp">Иконка <select class="pt-shape">${opts}</select></div>
      </div>
      <div class="pt-radius-block">
        <div class="lyr-top" style="margin-top:10px">
          <div class="cbx green pt-rad-cbx${L0.radiusOn ? ' on' : ''}" style="width:34px;height:19px" aria-label="Радиус охвата для «${esc(L0.name)}»"></div>
          <div class="nm" style="font-size:11.5px;color:var(--mut)">Радиус охвата</div>
        </div>
        <div class="pt-radius-ctl" style="${L0.radiusOn ? '' : 'display:none'}">
          <div class="grp full">
            <span>Радиус</span>
            <input type="range" class="full pt-rad-r" min="200" max="5000" step="100" value="${L0.radiusM}" style="--pct:${rPct}%">
            <span class="sl-val pt-rad-rv">${fmtD(L0.radiusM)}</span>
          </div>
          <div class="grp full" style="margin-top:7px">
            <span>Заливка</span>
            <input type="range" class="full green pt-rad-o" min="0.03" max="0.5" step="0.01" value="${L0.radiusOpacity || .15}" style="--pct:${oPct}%">
            <span class="sl-val pt-rad-ov">${Math.round((L0.radiusOpacity || .15) * 100)}%</span>
          </div>
          <div class="grp" style="margin-top:7px">Цвет радиуса <input type="color" class="pt-rad-col" value="${L0.radiusColor || L0.color}"></div>
        </div>
      </div>`;
    card.querySelector('.cbx:not(.pt-rad-cbx)').addEventListener('click', e => { L0.visible = !L0.visible; e.target.classList.toggle('on', L0.visible); renderPoints(); saveState(); });
    card.querySelector('.pt-col').addEventListener('input', e => { L0.color = e.target.value; renderPoints(); saveState(); });
    card.querySelector('.pt-shape').addEventListener('change', e => { L0.shape = e.target.value; renderPoints(); saveState(); });
    const radCtl = card.querySelector('.pt-radius-ctl');
    card.querySelector('.pt-rad-cbx').addEventListener('click', e => {
      L0.radiusOn = !L0.radiusOn; e.target.classList.toggle('on', L0.radiusOn);
      radCtl.style.display = L0.radiusOn ? '' : 'none';
      renderRadii(); saveState();
    });
    const rr = card.querySelector('.pt-rad-r'), rv = card.querySelector('.pt-rad-rv');
    rr.addEventListener('input', e => {
      L0.radiusM = +e.target.value; rv.textContent = fmtD(L0.radiusM);
      e.target.style.setProperty('--pct', (L0.radiusM - 200) / (5000 - 200) * 100 + '%');
      renderRadii(); saveState();
    });
    const ro = card.querySelector('.pt-rad-o'), ov = card.querySelector('.pt-rad-ov');
    ro.addEventListener('input', e => {
      L0.radiusOpacity = +e.target.value; ov.textContent = Math.round(L0.radiusOpacity * 100) + '%';
      e.target.style.setProperty('--pct', L0.radiusOpacity / .5 * 100 + '%');
      renderRadii(); saveState();
    });
    card.querySelector('.pt-rad-col').addEventListener('input', e => { L0.radiusColor = e.target.value; renderRadii(); saveState(); });
    el.appendChild(card);
  });
  a11ySwitches();
}

function buildCityUI() {
  const el = document.getElementById('seg-city');
  el.innerHTML = '';
  const mk = (val, lab, on) => {
    const b = document.createElement('button');
    b.dataset.city = val; b.textContent = lab;
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
    if (on) b.classList.add('on');
    b.addEventListener('click', () => {
      el.querySelectorAll('button').forEach(x => { x.classList.remove('on'); x.setAttribute('aria-pressed', 'false'); });
      b.classList.add('on'); b.setAttribute('aria-pressed', 'true');
      city = val;
      renderHeat(); renderPoints(); renderRecs();
      fitView();
    });
    el.appendChild(b);
  };
  mk('', 'Все', !city);
  CITIES.forEach(c => mk(c, c, city === c));
}

/* ══════════════════════════════════════════════════════════════════════
   СВОДКА ПО ГОРОДУ (вкладка «Город»)
   Справочные данные: Нацкомстат РУз (stat.uz) — население городов на
   01.10.2025 и средняя номинальная зарплата по регионам за 2025 год;
   ВОЗ/Нацкомстат — доля курящих среди взрослых (2024): мужчины 19,4%,
   женщины 0,9%. Доля населения 21+ — оценка по возрастной структуре
   Нацкомстата (~57% по стране, ~64% в Ташкенте). Продажа табака — 21+.
   ══════════════════════════════════════════════════════════════════════ */
// Узбекистан — справочник городов (SMOKE_* и CITY_STATS выбираются по карте
// через applyCountry(); см. COUNTRIES ниже).
const UZ_STATS = {
  'Ташкент': {
    pop: 3095000, popNote: 'stat.uz, 2025', adult: 0.64, wage: 10.75,
    region: 'г. Ташкент — столица',
    tags: [
      'Крупнейший рынок страны: ~8% всего населения Узбекистана в одном городе',
      'Максимальная покупательная способность: зарплата 10,75 млн сум — в 1,7 раза выше средней по стране',
      'Высокий трафик деловых районов, ТЦ и транспортных узлов — лучший город для премиального сегмента (стики)',
    ],
  },
  'Самарканд': {
    pop: 604000, popNote: 'stat.uz, 01.10.2025', adult: 0.57, wage: 4.74,
    region: 'Самаркандская область',
    tags: [
      '2-й по населению город страны — 604 тыс. человек',
      'Туристическая столица: дополнительный спрос от туристов, потенциал travel-retail в центре',
      'Зарплаты ниже средних по стране (4,74 млн сум) — важно держать доступный ценовой сегмент',
    ],
  },
  'Андижан': {
    pop: 501000, popNote: 'stat.uz, 01.10.2025', adult: 0.56, wage: 5.24,
    region: 'Андижанская область (Ферганская долина)',
    tags: [
      'Центр самого плотнонаселённого региона страны — Ферганской долины',
      'Зарплата 5,24 млн сум — самая высокая в долине: покупательная способность выше соседей',
      'Компактный город: полное покрытие достигается небольшим числом правильно размещённых точек',
    ],
  },
  'Фергана': {
    pop: 299000, popNote: 'stat.uz, 2025', adult: 0.56, wage: 4.73,
    region: 'Ферганская область',
    tags: [
      'Административный центр области, агломерация Фергана–Маргилан',
      'Молодое население долины: аудитория 21+ будет расти быстрее, чем в среднем по стране',
      'Чувствительность к цене (зарплата 4,73 млн сум) — фокус на средний и доступный сегмент',
    ],
  },
  'Бухара': {
    pop: 280000, popNote: 'stat.uz, 2025', adult: 0.57, wage: 5.09,
    region: 'Бухарская область',
    tags: [
      'Крупный туристический центр — устойчивый дополнительный спрос от туристов круглый год',
      'Высокий пеший трафик исторического центра — приоритет точкам у достопримечательностей и базаров',
      'Зарплата по области 5,09 млн сум — близко к средней по стране',
    ],
  },
  'Коканд': {
    pop: 260000, popNote: 'stat.uz, 2025', adult: 0.56, wage: 4.73,
    region: 'Ферганская область',
    tags: [
      'Исторический торговый хаб Ферганской долины — сильная базарная и придорожная торговля',
      'Транзитный узел между Ташкентом и долиной — трафик АЗС и трасс',
      'Чувствительность к цене (зарплата 4,73 млн сум) — фокус на доступный сегмент',
    ],
  },
  'Навои': {
    pop: 155000, popNote: 'оценка, 2025', adult: 0.58, wage: 7.87,
    region: 'Навоийская область',
    tags: [
      'Промышленный центр (НГМК, химия): 2-е место по зарплатам в стране — 7,87 млн сум',
      'Высокая доля работающих мужчин — ядро целевой аудитории, потенциал премиального сегмента',
      'Небольшой город: полное покрытие достижимо очень быстро, важно занять его первыми',
    ],
  },
};

/* ── COUNTRIES (per-map city config) ─────────────────────────────────────
   Каждая карта привязана к стране: свой список городов (плашка сверху),
   центроиды (cityOf), справочник (вкладка «Город»), доля курящих и валюта
   зарплаты. UZ — Узбекистан, KG — Кыргызстан. */
const UZ_CENTERS = {
  'Ташкент':   [41.311, 69.280], 'Андижан': [40.783, 72.344], 'Бухара': [39.768, 64.421],
  'Самарканд': [39.654, 66.975], 'Коканд':  [40.529, 70.943], 'Фергана': [40.389, 71.783],
  'Навои':     [40.104, 65.373],
};
const KG_CENTERS = {
  'Бишкек':      [42.874, 74.598], 'Ош':      [40.529, 72.796], 'Джалал-Абад': [40.933, 72.997],
  'Каракол':     [42.490, 78.394], 'Токмок':  [42.842, 75.290], 'Узген':       [40.769, 73.300],
  'Нарын':       [41.428, 76.000], 'Талас':   [42.521, 72.243], 'Баткен':      [40.062, 70.818],
};

/* Кыргызстан — справочник городов. Источники: население — Нацстатком КР
   (stat.gov.kg), начало 2025; зарплата — средняя номинальная по регионам за
   2025 (тыс. сом/мес, Нацстатком КР); курение — ВОЗ 2024 (муж. 32,8%,
   жен. 2,9%). Доля 21+ — оценка по возрастной структуре (~56%, Бишкек ~0,62). */
const KG_STATS = {
  'Бишкек': {
    pop: 1300000, popNote: 'stat.gov.kg, 2025', adult: 0.62, wage: 56.94,
    region: 'г. Бишкек — столица',
    tags: [
      'Крупнейший рынок страны: ~1,3 млн человек, ~19% населения Кыргызстана',
      'Самые высокие зарплаты в стране (56,9 тыс. сом) — приоритет премиального сегмента (стики)',
      'Деловые районы, ТЦ и транспортные узлы — максимальный трафик для флагманских точек',
    ],
  },
  'Ош': {
    pop: 473500, popNote: 'stat.gov.kg, 2025', adult: 0.56, wage: 34.0,
    region: 'г. Ош + Ошская область (юг)',
    tags: [
      '2-й город страны и столица юга — 473 тыс. человек',
      'Крупнейший рынок Ферганской долины КР, мощная базарная торговля (Ошский базар)',
      'Зарплаты ниже столичных — держать доступный ценовой сегмент',
    ],
  },
  'Джалал-Абад': {
    pop: 184400, popNote: 'stat.gov.kg, 2025', adult: 0.55, wage: 35.39,
    region: 'Джалал-Абадская область',
    tags: [
      '3-й по населению город, центр густонаселённого юга',
      'Молодое население долины — аудитория 21+ будет расти',
      'Чувствительность к цене — фокус на средний и доступный сегмент',
    ],
  },
  'Каракол': {
    pop: 90700, popNote: 'stat.gov.kg, 2025', adult: 0.56, wage: 48.04,
    region: 'Иссык-Кульская область',
    tags: [
      'Центр Иссык-Кульской области — 2-е место по зарплатам (48,0 тыс. сом)',
      'Сильный сезонный туризм на Иссык-Куле — доп. спрос летом, потенциал travel-retail',
      'Компактный город: полное покрытие достигается небольшим числом точек',
    ],
  },
  'Токмок': {
    pop: 76200, popNote: 'stat.gov.kg, 2025', adult: 0.56, wage: 42.0,
    region: 'Чуйская область',
    tags: [
      'Промышленный город Чуйской области рядом с Бишкеком',
      'Транзитный узел — трафик трасс и АЗС',
      'Близость к столичной агломерации — общий с Бишкеком поток',
    ],
  },
  'Узген': {
    pop: 65500, popNote: 'stat.gov.kg, 2025', adult: 0.54, wage: 30.0,
    region: 'Ошская область',
    tags: [
      'Исторический торговый город на юге, плотная базарная торговля',
      'Молодое сельское окружение — растущая база потребителей',
      'Ценовая чувствительность — доступный сегмент',
    ],
  },
  'Нарын': {
    pop: 52000, popNote: 'stat.gov.kg, 2025', adult: 0.55, wage: 41.06,
    region: 'Нарынская область',
    tags: [
      'Административный центр обширной горной области',
      'Зарплата 41,1 тыс. сом — выше средней по стране',
      'Транзит на трассе в Китай (Торугарт) — трафик дальнобоя',
    ],
  },
  'Талас': {
    pop: 44000, popNote: 'stat.gov.kg, 2025', adult: 0.55, wage: 39.6,
    region: 'Таласская область',
    tags: [
      'Центр аграрной Таласской области (фасоль на экспорт)',
      'Небольшой рынок — важно занять его первыми',
      'Сезонность доходов от урожая',
    ],
  },
  'Баткен': {
    pop: 29000, popNote: 'stat.gov.kg, 2025', adult: 0.54, wage: 28.0,
    region: 'Баткенская область',
    tags: [
      'Самый южный областной центр, приграничный регион',
      'Небольшое, но растущее население; невысокие зарплаты',
      'Фокус на доступный сегмент',
    ],
  },
};

const COUNTRIES = {
  uz: { centers: UZ_CENTERS, stats: UZ_STATS, smokeM: 0.194, smokeF: 0.009, wageUnit: 'млн', wageCur: 'сум/мес (2025)' },
  kg: { centers: KG_CENTERS, stats: KG_STATS, smokeM: 0.328, smokeF: 0.029, wageUnit: 'тыс', wageCur: 'сом/мес (2025)' },
};
const MAP_COUNTRY = { comdep: 'uz', other: 'uz', main: 'uz', kg: 'kg' };
let COUNTRY = 'uz';

// Activate a map's country: set city list, centroids, stats, smoking rates,
// wage units. Called at the start of startApp() once the map is known.
function applyCountry(mapId) {
  COUNTRY = MAP_COUNTRY[mapId] || 'uz';
  const co = COUNTRIES[COUNTRY];
  CITY_STATS   = co.stats;
  SMOKE_M = co.smokeM; SMOKE_F = co.smokeF; SMOKE_AVG = (SMOKE_M + SMOKE_F) / 2;
  WAGE_UNIT = co.wageUnit; WAGE_CUR = co.wageCur;
  CITIES = Object.keys(co.centers);
  CC = {};
  CITIES.forEach(c => {
    const a = (DATA.cig && DATA.cig.recs) ? DATA.cig.recs.filter(s => s.fil === c) : [];
    CC[c] = a.length
      ? [a.reduce((x, s) => x + s.lat, 0) / a.length, a.reduce((x, s) => x + s.lon, 0) / a.length]
      : co.centers[c];
  });
}

function renderCityInfo() {
  const el = document.getElementById('city-info');
  if (!el) return;
  if (!city) {
    el.innerHTML = `<div class="ci-hint">
      <div class="ci-hint-icon">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18"/><path d="M5 21V7l8-4v18"/><path d="M19 21V11l-6-4"/><line x1="9" y1="9" x2="9" y2="9.01"/><line x1="9" y1="12" x2="9" y2="12.01"/><line x1="9" y1="15" x2="9" y2="15.01"/><line x1="9" y1="18" x2="9" y2="18.01"/></svg>
      </div>
      Выберите город на плашке сверху карты, чтобы получить краткую
      информацию о населении этого города и потенциале рынка.</div>`;
    return;
  }
  const s   = CITY_STATS[city];
  const fmt = n => Math.round(n).toLocaleString('ru-RU');

  // live-метрика: число наших точек в городе (для «Курильщиков на 1 нашу точку»)
  const ownN = (typeof own !== 'undefined' && own) ? own.filter(o => o.cityRu === city).length : 0;

  let html = '';
  if (s) {
    const adults  = s.pop * s.adult;
    const smokers = adults * SMOKE_AVG;
    const smMen   = adults * 0.5 * SMOKE_M;
    html += `
    <div class="ci-card">
      <div class="ci-head">
        <div>
          <div class="ci-city">${esc(city)}</div>
          <div class="ci-region">${esc(s.region)}</div>
        </div>
      </div>
      <div class="ci-pop">
        <div class="v">${fmt(s.pop)}</div>
        <div class="l">население города · ${esc(s.popNote)}</div>
      </div>
      <div class="ci-grid">
        <div class="ci-tile"><div class="v">${fmt(adults)}</div><div class="l">население 21+ (оценка)</div></div>
        <div class="ci-tile hot"><div class="v">≈ ${fmt(smokers)}</div><div class="l">курильщиков 21+ — потенциальная аудитория</div></div>
        <div class="ci-tile"><div class="v">${s.wage.toFixed(2).replace('.', ',')} ${WAGE_UNIT}</div><div class="l">средняя зарплата, ${WAGE_CUR}</div></div>
        <div class="ci-tile"><div class="v">${fmt(smMen)}</div><div class="l">курящих мужчин 21+ — ядро ЦА (${(SMOKE_M * 100).toFixed(1).replace('.', ',')}%)</div></div>
      </div>
    </div>`;
  } else {
    html += `
    <div class="ci-card">
      <div class="ci-head"><div>
        <div class="ci-city">${esc(city)}</div>
        <div class="ci-region">нет справочных данных по этому городу</div>
      </div></div>
    </div>`;
  }

  html += `
  <div class="ci-card">
    <div class="ci-sec">На карте сейчас</div>
    <div class="ci-row"><span>Курильщиков на 1 нашу точку</span><b>${s && ownN ? '≈ ' + fmt(s.pop * s.adult * SMOKE_AVG / ownN) : '—'}</b></div>
  </div>`;

  if (s) {
    html += `
    <div class="ci-card">
      <div class="ci-sec">Выводы для бизнеса</div>
      ${s.tags.map(t => `<div class="ci-tag"><span class="ci-dot"></span><span>${t}</span></div>`).join('')}
    </div>`;
  }

  const mPct = (SMOKE_M * 100).toFixed(1).replace('.', ','), fPct = (SMOKE_F * 100).toFixed(1).replace('.', ',');
  html += COUNTRY === 'kg'
    ? `<div class="ci-note">Источники: Нацстатком КР (stat.gov.kg) — население городов (2025)
      и средняя зарплата по регионам (2025); ВОЗ — доля курящих среди взрослых (2024):
      мужчины ${mPct}%, женщины ${fPct}%. Население 21+ и число курильщиков — оценка по
      возрастной структуре.</div>`
    : `<div class="ci-note">Источники: Нацкомстат РУз (stat.uz) — население городов (2025)
      и средняя зарплата по регионам (2025); ВОЗ — доля курящих среди взрослых (2024):
      мужчины ${mPct}%, женщины ${fPct}%. Население 21+ и число курильщиков — оценка по
      возрастной структуре. Продажа табачной продукции в РУз — только лицам 21+.</div>`;

  el.innerHTML = html;
}

/* Coordinates of everything currently drawn on the map (heat layers, own IQOS
   points, custom point layers), filtered by the selected city where the layer
   has a city tag. Used to frame the view — «по размеру» must show what the
   user actually sees, not the base dataset that isn't drawn at all. */
function visiblePts() {
  const out = [];
  heatKeys.forEach(k => {
    const d = DS[k];
    if (!d || !d.visible || !d.recs) return;
    for (const r of d.recs) if (!city || r.fil === city) out.push([r.lat, r.lon]);
  });
  pointLayers.forEach(p => {
    if (!p.visible) return;
    for (const o of p.data) {
      // База наших точек — узбекистанская и общая для всех карт. На карте другой
      // страны она не должна утаскивать вид к Ташкенту: учитываем только точки,
      // привязанные к городу активной страны.
      if (city ? o.cityRu !== city : (COUNTRY !== 'uz' && !CITIES.includes(o.cityRu))) continue;
      out.push([o.lat, o.lon]);
    }
  });
  customPtLayers.forEach(l => {
    if (!l.visible) return;
    for (const r of l.recs) out.push([r.lat, r.lon]);
  });
  return out;
}

/* Fit the map to what is visible (or the city centre when nothing is drawn). */
function fitView() {
  const pts = visiblePts();
  if (pts.length) {
    map.flyToBounds(L.latLngBounds(pts).pad(.12), { duration: .6 });
  } else if (city && CC[city]) {
    map.flyTo(CC[city], 12, { duration: .6 });   // no data yet — centre on city
  } else if (CITIES[0] && CC[CITIES[0]]) {
    map.flyTo(CC[CITIES[0]], 11, { duration: .6 });
  }
}

/* ── CUSTOM POINT LAYERS ─────────────────────────────────────────────── */
function renderCustomPoints() {
  // Wipe EVERYTHING under the parent group — including any groups whose layer
  // object was replaced (e.g. by applySnapshot). Prevents orphaned markers that
  // can't be toggled off because nothing references their old group anymore.
  cptRoot.clearLayers();
  customPtLayers.forEach(l => {
    l._group = L.layerGroup();
    cptRoot.addLayer(l._group);
    if (!l.visible || !l.recs.length) return;
    const shape = l.shape || 'teardrop';
    const ic = shp(shape, l.color, 30);
    // coverage radius circles (under markers)
    if (l.radiusOn) {
      const rc = l.radiusColor || l.color, rop = l.radiusOpacity == null ? 0.15 : l.radiusOpacity;
      l.recs.forEach(r => {
        L.circle([r.lat, r.lon], {
          renderer: radiusRenderer, pane: 'ptradius',
          radius: l.radiusM || 1500, color: rc, weight: 1.2,
          opacity: Math.min(rop + 0.35, 0.9), fillColor: rc, fillOpacity: rop,
          interactive: false,
        }).addTo(l._group);
      });
    }
    l.recs.forEach(r => {
      const m = L.marker([r.lat, r.lon], {
        icon: L.divIcon({ className: '', html: ic.html, iconSize: [30, 30], iconAnchor: ic.anchor }),
        zIndexOffset: 1500,
      });
      const parts = [r.name ? `<div class="pp-title">${esc(r.name)}</div>` : ''];
      if (r.addr)  parts.push(`<div class="pp-row"><span>Адрес</span><b style="font-family:Manrope;font-weight:500;text-align:right">${esc(r.addr)}</b></div>`);
      if (r.hours) parts.push(`<div class="pp-row"><span>Часы</span><b>${esc(r.hours)}</b></div>`);
      if (r.code)  parts.push(`<div class="pp-row"><span>Код</span><b>${esc(r.code)}</b></div>`);
      m.bindPopup(parts.filter(Boolean).join(''));
      if (r.name) m.bindTooltip(`<b style="font-weight:700">${esc(r.name)}</b><br>${esc(l.name)}`, { className: 'tt', direction: 'top', offset: [0, -ic.anchor[1] + 4] });
      m.addTo(l._group);
    });
  });
  updateLayerLegend();
}

function buildCustomPtUI() {
  const box   = document.getElementById('custom-pt-list');
  const badge = document.getElementById('acc-badge-cpt');
  if (!box) return;

  const vis = customPtLayers.filter(l => l.visible).length;
  if (badge) badge.textContent = customPtLayers.length ? `${vis}/${customPtLayers.length}` : '';

  if (!customPtLayers.length) {
    box.innerHTML = '<div class="cpt-empty">Добавьте слой и загрузите CSV/XLSX с колонками name, lat, lon (опц.: addr, hours, code)</div>';
    return;
  }

  box.innerHTML = customPtLayers.map(l => {
    const shape = l.shape || 'teardrop';
    const opts = SHAPES.map(s => `<option value="${s[0]}"${s[0] === shape ? ' selected' : ''}>${s[1]}</option>`).join('');
    const rPct = ((l.radiusM || 1500) - 200) / (5000 - 200) * 100;
    const oPct = (l.radiusOpacity == null ? .15 : l.radiusOpacity) / .5 * 100;
    return `
    <div class="cpt-layer" data-cpid="${l.id}">
      <div class="cpt-top">
        <span class="cpt-name">${esc(l.name)}</span>
        <span class="cpt-count">${l.recs.length}</span>
        <div class="cbx${l.visible ? ' on' : ''}" style="border-color:${l.color};${l.visible ? 'background:' + l.color : ''}" data-cpvis="${l.id}" aria-label="Показывать слой «${esc(l.name)}» на карте"></div>
        <button class="cpt-del" data-cpdel="${l.id}" title="Удалить слой">✕</button>
      </div>
      <div class="lyr-ctl">
        <div class="grp">Цвет <input type="color" class="cpt-color" value="${l.color}" data-cpcol="${l.id}" title="Цвет маркеров"/></div>
        <div class="grp">Иконка <select class="cpt-shape" data-cpshape="${l.id}">${opts}</select></div>
      </div>
      <div class="cpt-row" style="margin-top:8px">
        <button class="cpt-upload" data-cpup="${l.id}">⬆ Загрузить данные</button>
      </div>
      <div class="pt-radius-block">
        <div class="lyr-top" style="margin-top:10px">
          <div class="cbx green cpt-rad-cbx${l.radiusOn ? ' on' : ''}" style="width:34px;height:19px" data-cprad="${l.id}" aria-label="Радиус охвата для «${esc(l.name)}»"></div>
          <div class="nm" style="font-size:11.5px;color:var(--mut)">Радиус охвата</div>
        </div>
        <div class="pt-radius-ctl" data-cpradctl="${l.id}" style="${l.radiusOn ? '' : 'display:none'}">
          <div class="grp full"><span>Радиус</span>
            <input type="range" class="full cpt-rad-r" data-cpradr="${l.id}" min="200" max="5000" step="100" value="${l.radiusM || 1500}" style="--pct:${rPct}%">
            <span class="sl-val cpt-rad-rv">${fmtD(l.radiusM || 1500)}</span></div>
          <div class="grp full" style="margin-top:7px"><span>Заливка</span>
            <input type="range" class="full green cpt-rad-o" data-cprado="${l.id}" min="0.03" max="0.5" step="0.01" value="${l.radiusOpacity == null ? .15 : l.radiusOpacity}" style="--pct:${oPct}%">
            <span class="sl-val cpt-rad-ov">${Math.round((l.radiusOpacity == null ? .15 : l.radiusOpacity) * 100)}%</span></div>
          <div class="grp" style="margin-top:7px">Цвет радиуса <input type="color" class="cpt-rad-col" data-cpradcol="${l.id}" value="${l.radiusColor || l.color}"></div>
        </div>
      </div>
    </div>`;
  }).join('');

  // Shape selector
  box.querySelectorAll('[data-cpshape]').forEach(el => {
    el.addEventListener('change', () => {
      const l = customPtLayers.find(x => x.id === el.dataset.cpshape); if (!l) return;
      l.shape = el.value; renderCustomPoints(); saveState();
    });
  });

  // Radius toggle + sliders + color
  box.querySelectorAll('[data-cprad]').forEach(el => {
    el.addEventListener('click', () => {
      const l = customPtLayers.find(x => x.id === el.dataset.cprad); if (!l) return;
      l.radiusOn = !l.radiusOn; el.classList.toggle('on', l.radiusOn);
      const ctl = box.querySelector(`[data-cpradctl="${l.id}"]`); if (ctl) ctl.style.display = l.radiusOn ? '' : 'none';
      renderCustomPoints(); saveState();
    });
  });
  box.querySelectorAll('[data-cpradr]').forEach(el => {
    el.addEventListener('input', () => {
      const l = customPtLayers.find(x => x.id === el.dataset.cpradr); if (!l) return;
      l.radiusM = +el.value; el.style.setProperty('--pct', (l.radiusM - 200) / (5000 - 200) * 100 + '%');
      const v = el.parentElement.querySelector('.cpt-rad-rv'); if (v) v.textContent = fmtD(l.radiusM);
      renderCustomPoints(); saveState();
    });
  });
  box.querySelectorAll('[data-cprado]').forEach(el => {
    el.addEventListener('input', () => {
      const l = customPtLayers.find(x => x.id === el.dataset.cprado); if (!l) return;
      l.radiusOpacity = +el.value; el.style.setProperty('--pct', l.radiusOpacity / .5 * 100 + '%');
      const v = el.parentElement.querySelector('.cpt-rad-ov'); if (v) v.textContent = Math.round(l.radiusOpacity * 100) + '%';
      renderCustomPoints(); saveState();
    });
  });
  box.querySelectorAll('[data-cpradcol]').forEach(el => {
    el.addEventListener('input', () => {
      const l = customPtLayers.find(x => x.id === el.dataset.cpradcol); if (!l) return;
      l.radiusColor = el.value; renderCustomPoints(); saveState();
    });
  });

  // Toggle visibility
  box.querySelectorAll('[data-cpvis]').forEach(el => {
    el.addEventListener('click', () => {
      const l = customPtLayers.find(x => x.id === el.dataset.cpvis); if (!l) return;
      l.visible = !l.visible;
      el.classList.toggle('on', l.visible);
      el.style.background = l.visible ? l.color : '';
      el.style.borderColor = l.color;
      renderCustomPoints(); buildCustomPtUI(); buildAddrSrcSel(); buildRtExclUI(); saveState();
    });
  });

  // Color change
  box.querySelectorAll('[data-cpcol]').forEach(el => {
    el.addEventListener('input', () => {
      const l = customPtLayers.find(x => x.id === el.dataset.cpcol); if (!l) return;
      l.color = el.value;
      renderCustomPoints(); buildCustomPtUI(); buildAddrSrcSel(); buildRtExclUI(); saveState();
    });
  });

  // Upload trigger
  box.querySelectorAll('[data-cpup]').forEach(el => {
    el.addEventListener('click', () => {
      _cptUploadTarget = el.dataset.cpup;
      document.getElementById('cpt-file').click();
    });
  });

  // Delete layer
  box.querySelectorAll('[data-cpdel]').forEach(el => {
    el.addEventListener('click', () => {
      const id = el.dataset.cpdel;
      const l  = customPtLayers.find(x => x.id === id); if (!l) return;
      if (!confirm(`Удалить слой «${l.name}»? Данные слоя будут потеряны.`)) return;
      customPtLayers = customPtLayers.filter(x => x.id !== id);
      addrLayer.clearLayers();
      renderCustomPoints(); buildCustomPtUI(); buildAddrSrcSel(); buildRtExclUI(); saveState();
      toast(`Слой «${l.name}» удалён`, 'info');
    });
  });
  a11ySwitches();
}

function toCustomPtRecs(rows) {
  const out = [];
  for (const r of rows) {
    const la = parseFloat(('' + pick(r, ['lat', 'широт'])).replace(',', '.'));
    const lo = parseFloat(('' + pick(r, ['lon', 'lng', 'долгот'])).replace(',', '.'));
    if (!isFinite(la) || !isFinite(lo)) continue;
    out.push({
      name: '' + (pick(r, ['name', 'назв', 'точк', 'title']) || ''),
      addr: '' + (pick(r, ['addr', 'address', 'адрес']) || ''),
      code: '' + (pick(r, ['code', 'код', 'id']) || ''),
      hours: '' + (pick(r, ['hours', 'часы', 'время', 'график']) || ''),
      lat: la, lon: lo,
    });
  }
  return out;
}

function rebuildUpTarget() {
  const sel = document.getElementById('up-target');
  const cur = sel.value;
  const heatOpts = heatKeys.map(k => `<option value="${k}">${esc(DS[k] ? DS[k].name : k)}</option>`).join('');
  sel.innerHTML = heatOpts + '<option value="__own__">Наши точки · IQOS (BR / SE)</option>';
  if (cur && (heatKeys.includes(cur) || cur === '__own__')) sel.value = cur;
}

// Parse uploaded rows into the "own" point format. Channel from a ch/канал
// column (BR/SE); rows default to SE when unspecified.
function toOwnRecs(rows) {
  const out = [];
  for (const r of rows) {
    const la = parseFloat(('' + pick(r, ['lat', 'широт'])).replace(',', '.'));
    const lo = parseFloat(('' + pick(r, ['lon', 'lng', 'долгот'])).replace(',', '.'));
    if (!isFinite(la) || !isFinite(lo)) continue;
    const chRaw = ('' + (pick(r, ['ch', 'channel', 'канал', 'тип']) || '')).toUpperCase();
    const ch = chRaw.indexOf('BR') >= 0 ? 'BR' : 'SE';
    const city = '' + (pick(r, ['city', 'город']) || '');
    out.push({
      ch, name: '' + (pick(r, ['name', 'назв', 'точк', 'title']) || ''),
      city, code: '' + (pick(r, ['code', 'код', 'id']) || ''),
      addr: '' + (pick(r, ['addr', 'address', 'адрес']) || ''),
      hours: '' + (pick(r, ['hours', 'часы', 'время']) || ''),
      lat: la, lon: lo,
    });
  }
  return out;
}

// City tag for own points: explicit city column first, otherwise the nearest
// map city — but only within 60 km, so points from another country's dataset
// don't get glued to the wrong city bar / stats.
function retagOwnCities() {
  own.forEach(o => {
    o.cityRu = OWN_RU[o.city] || o.city || '';
    if (!CITIES.includes(o.cityRu)) {
      const c = cityOf(o.lat, o.lon);
      if (c && CC[c] && hav(o.lat, o.lon, CC[c][0], CC[c][1]) < 60000) o.cityRu = c;
    }
  });
}

// Replace the global own-points dataset in place and refresh derived state.
function setOwn(newArr) {
  own.length = 0; newArr.forEach(o => own.push(o));
  own.forEach(o => { o.chk = o.ch === 'BR' ? 'BR' : 'SE'; });
  retagOwnCities();
  ownC.length = 0; own.forEach(o => ownC.push([o.lat, o.lon]));
  const br = pointLayers.find(p => p.id === 'br'); if (br) br.data = own.filter(o => o.chk === 'BR');
  const se = pointLayers.find(p => p.id === 'se'); if (se) se.data = own.filter(o => o.chk === 'SE');
}

// One shared entry point for uploading own IQOS points — used by both the
// Points tab and the Данные tab so the flow and the template are identical.
function applyOwnUpload(rows) {
  const arr = toOwnRecs(rows);
  if (!arr.length) { toast('Не найдено строк с lat/lon', 'err'); return false; }
  setOwn(arr);
  buildPtUI(); renderPoints(); renderRecs(); renderCityInfo();
  saveState();
  const br = own.filter(o => o.chk === 'BR').length;
  toast(`Наши точки обновлены: ${own.length} (BR ${br}, 2nd SE ${own.length - br})`, 'ok', 4000);
  if (isAdmin() && SERVER_KEY) pushDataset(null); // share the new base with everyone
  else if (isAdmin()) toast('Чтобы сохранить точки для всех — введите ключ в «Данные → Доступ к записи»', 'err', 5500);
  return true;
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

/* ── CREATE LAYER MODAL ──────────────────────────────────────────────── */
const LAYER_PALETTE = ['#E63946', '#457B9D', '#2DC653', '#FF9F1C', '#9B59B6', '#00B4D8', '#FF6B6B', '#06D6A0'];

let pendingHeatRows = null;     // parsed rows awaiting name/colour confirmation
let _heatUpdateTarget = null;   // layer key being re-uploaded with fresh data

function openLayerModal(prefillName) {
  const overlay  = document.getElementById('layer-modal-overlay');
  const input    = document.getElementById('layer-modal-input');
  const colorInp = document.getElementById('layer-modal-color');
  input.value = prefillName || '';
  const usedColors = heatKeys.map(k2 => DS[k2] && DS[k2].color).filter(Boolean);
  colorInp.value = LAYER_PALETTE.find(c => !usedColors.includes(c)) || LAYER_PALETTE[heatKeys.length % LAYER_PALETTE.length];
  overlay.classList.add('open');
  setTimeout(() => { input.focus(); input.select(); }, 150);
}
function closeLayerModal() {
  document.getElementById('layer-modal-overlay').classList.remove('open');
}
function confirmLayerModal() {
  const name  = document.getElementById('layer-modal-input').value.trim();
  const color = document.getElementById('layer-modal-color').value;
  if (!name) { document.getElementById('layer-modal-input').focus(); return; }
  closeLayerModal();
  const rows = pendingHeatRows; pendingHeatRows = null;
  const recs = rows ? enrich(toRecs(rows)) : [];
  const key  = 'custom_' + Date.now();
  DS[key] = { key, name, color, ramp: 'custom', opacity: 1, intensity: 1, visible: true,
              recs, stats: statsOf(recs), _userData: true };
  heatKeys.push(key);
  focusNewLayer(key);
  toast(recs.length ? `Слой «${name}» загружен (${recs.length} точек)` : `Слой «${name}» создан`, 'ok');
}

// Re-render everything after a layer's data changes, then fly the map to it.
function focusNewLayer(key) {
  const d = DS[key]; if (!d) return;
  if (city && d.recs.length && !d.recs.some(r => r.fil === city)) { city = ''; buildCityUI(); }
  buildHeatUI(); rebuildUpTarget(); buildAddrSrcSel(); buildRecBasisSel(); renderHeat(); renderRecs(); saveState();
  const bpts = d.recs.filter(r => !city || r.fil === city).map(r => [r.lat, r.lon]);
  if (bpts.length) map.flyToBounds(L.latLngBounds(bpts).pad(.15), { duration: .6 });
}

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
function pick(o, keys) {
  for (const k in o) {
    const lk = ('' + k).toLowerCase().trim();
    for (const w of keys) if (lk === w || lk.includes(w)) return o[k];
  }
  return undefined;
}

function toRecs(rows) {
  const out = [];
  for (const r of rows) {
    const la = parseFloat(('' + pick(r, ['lat', 'широт'])).replace(',', '.'));
    const lo = parseFloat(('' + pick(r, ['lon', 'lng', 'долгот'])).replace(',', '.'));
    let v = pick(r, ['value', 'объ', 'vol', 'amount', 'итог']);
    v = parseFloat(('' + (v == null ? 1 : v)).replace(',', '.'));
    if (!isFinite(v) || v <= 0) v = 1;
    const nm = pick(r, ['name', 'назв', 'точк']) || '';
    if (isFinite(la) && isFinite(lo)) out.push({ name: '' + nm, fil: cityOf(la, lo), lat: la, lon: lo, vol: v });
  }
  return out;
}

function enrich(recs) {
  // nd — расстояние до ближайшей нашей точки. Если наших точек нет вообще
  // (KG-карта до загрузки точек) — расстояние неизвестно: Infinity честно
  // означает «не покрыто», а в интерфейсе печатается как «—».
  const ix = buildPtIndex(ownC);
  for (const s of recs) {
    const n = nearestPt(ix, s.lat, s.lon);
    s.nd = n ? Math.round(n.dist) : Infinity;
  }
  const grid = {};
  recs.forEach((s, i) => {
    const k = Math.round(s.lat * 100) + '_' + Math.round(s.lon * 100);
    (grid[k] = grid[k] || []).push(i);
  });
  for (const s of recs) {
    let ld = 0, lc = 0;
    const kla = Math.round(s.lat * 100), klo = Math.round(s.lon * 100);
    for (let dla = -1; dla <= 1; dla++) {
      for (let dlo = -1; dlo <= 1; dlo++) {
        const arr = grid[(kla + dla) + '_' + (klo + dlo)];
        if (!arr) continue;
        for (const j of arr) {
          const t = recs[j];
          if (hav(s.lat, s.lon, t.lat, t.lon) <= 700) { ld += t.vol; lc++; }
        }
      }
    }
    s.ld = Math.round(ld * 100) / 100;
    s.lc = lc;
  }
  return recs;
}

function statsOf(recs) {
  const v = recs.map(r => r.vol).sort((a, b) => a - b), n = v.length;
  return { n, sum: Math.round(v.reduce((a, b) => a + b, 0) * 10) / 10, max: v[n - 1] || 0, p50: v[Math.floor(n * 0.5)] || 0, p90: v[Math.floor(n * 0.9)] || 0.01 };
}

/* ── SHARE STATE (export / import JSON) ──────────────────────────────── */
// Persist only the essential input fields — derived nd/ld/lc/fil and stats are
// recomputed on load (enrich + cityOf + statsOf). Coords rounded to ~1 m. This
// keeps the saved per-map state small enough to POST reliably (the full recs
// grew past ~7 MB and saves started failing).
function slimRecs(recs) {
  return recs.map(r => {
    const m = { lat: +(+r.lat).toFixed(5), lon: +(+r.lon).toFixed(5), vol: r.vol };
    if (r.name)  m.name  = r.name;
    if (r.addr)  m.addr  = r.addr;
    if (r.code)  m.code  = r.code;
    if (r.hours) m.hours = r.hours;
    return m;
  });
}

function buildStateSnapshot() {
  const layers = {};
  heatKeys.forEach(k => {
    const d = DS[k]; if (!d) return;
    const o = { name: d.name, color: d.color, ramp: d.ramp, opacity: d.opacity, intensity: d.intensity, visible: d.visible };
    if (k.startsWith('custom_') || d._userData) { o.recs = slimRecs(d.recs); o._userData = true; }
    layers[k] = o;
  });
  const pts = {};
  pointLayers.forEach(p => pts[p.id] = { color: p.color, shape: p.shape, visible: p.visible, radiusOn: p.radiusOn, radiusM: p.radiusM, radiusColor: p.radiusColor, radiusOpacity: p.radiusOpacity });
  return {
    _v: 1, _app: 'hm-br', _savedAt: new Date().toISOString(), _date: new Date().toISOString().slice(0, 10),
    heatKeys, layers, pts, incCol: { ...incCol },
    city, covR, topN, recBasis, recShow, heatBoost, heatBlend, heatRadius, districtsOn, incomeHeatOn, coresOn,
    addrSrcKey, addrRefKey, rtRadius, rtRadiusOp, rtVolOp, rtVolMode, rtVolCustom, rtExclRadius, rtExclOp, rtExclKeys,
    customPtLayers: customPtLayers.map(l => ({ id: l.id, name: l.name, color: l.color, visible: l.visible, shape: l.shape, radiusOn: l.radiusOn, radiusM: l.radiusM, radiusColor: l.radiusColor, radiusOpacity: l.radiusOpacity, recs: l.recs })),
  };
}

function exportState() {
  const snap = buildStateSnapshot();
  const json = JSON.stringify(snap, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const a    = document.createElement('a');
  a.href     = URL.createObjectURL(blob);
  a.download = 'heatmap_settings_' + snap._date + '.json';
  a.click();
  URL.revokeObjectURL(a.href);
  toast('Настройки сохранены в файл', 'ok');
}

function importState(file) {
  const rd = new FileReader();
  rd.onload = e => {
    let st;
    try { st = JSON.parse(e.target.result); } catch (_) { toast('Файл повреждён или неверный формат', 'err'); return; }
    if (st._app !== 'hm-br') { toast('Это не файл настроек Heat Map', 'err'); return; }
    // Apply — reuse loadState logic
    applySnapshot(st);
    buildCityUI(); buildHeatUI(); buildPtUI(); buildCustomPtUI(); rebuildUpTarget(); syncControls();
    renderHeat(); renderPoints(); renderCustomPoints(); renderRecs(); renderDistricts(); renderIncome();
    doSave(); // persist locally too
    toast('Настройки загружены', 'ok');
  };
  rd.readAsText(file);
}

function applySnapshot(st) {
  // Only user-uploaded layers are shown; drop legacy cig/sticks/combined keys
  // that older saved states may still carry.
  if (Array.isArray(st.heatKeys)) heatKeys = st.heatKeys.filter(k => k.startsWith('custom_'));
  if (st.layers) {
    for (const k of heatKeys) {
      const sv = st.layers[k]; if (!sv) continue;
      if (!DS[k]) DS[k] = { key: k };
      Object.assign(DS[k], { name: sv.name, color: sv.color, intensity: sv.intensity, visible: sv.visible });
      if (typeof sv.ramp    === 'string') DS[k].ramp    = sv.ramp;
      if (typeof sv.opacity === 'number') DS[k].opacity = sv.opacity;
      if (sv.recs) {
        // Saved recs are slim (see slimRecs) — rebuild derived fields:
        // fil (city) from coords, nd/ld/lc via enrich, and stats.
        sv.recs.forEach(r => { r.fil = cityOf(r.lat, r.lon); });
        DS[k].recs = enrich(sv.recs);
        DS[k].stats = statsOf(DS[k].recs);
        DS[k]._userData = true;
      } else if (!DS[k].recs) {
        DS[k].recs = []; DS[k].stats = { n: 0, sum: 0, max: 0, p50: 0, p90: 0.01 };
      }
    }
  }
  if (st.pts)              pointLayers.forEach(p => { const sv = st.pts[p.id]; if (sv) Object.assign(p, sv); });
  if (st.incCol)           Object.assign(incCol, st.incCol);
  if (typeof st.city       === 'string')  city         = st.city;
  if (typeof st.covR       === 'number')  covR         = st.covR;
  if (typeof st.topN       === 'number')  topN         = st.topN;
  if (typeof st.recBasis   === 'string' && DS[st.recBasis]) recBasis = st.recBasis;
  if (typeof st.recShow    === 'boolean') recShow      = st.recShow;
  if (typeof st.heatBoost  === 'number')  heatBoost    = st.heatBoost;
  if (typeof st.heatBlend  === 'string')  heatBlend    = st.heatBlend;
  if (typeof st.heatRadius === 'number')  heatRadius   = st.heatRadius;
  if (typeof st.districtsOn  === 'boolean') districtsOn  = st.districtsOn;
  if (typeof st.incomeHeatOn === 'boolean') incomeHeatOn = st.incomeHeatOn;
  if (typeof st.coresOn      === 'boolean') coresOn      = st.coresOn;
  if (typeof st.addrSrcKey   === 'string')  addrSrcKey   = st.addrSrcKey;
  if (typeof st.addrRefKey   === 'string')  addrRefKey   = st.addrRefKey;
  if (typeof st.rtRadius     === 'number')  rtRadius     = st.rtRadius;
  if (typeof st.rtRadiusOp   === 'string')  rtRadiusOp   = st.rtRadiusOp;
  if (typeof st.rtVolOp      === 'string')  rtVolOp      = st.rtVolOp;
  if (typeof st.rtVolMode    === 'string')  rtVolMode    = st.rtVolMode;
  if (typeof st.rtVolCustom  === 'number')  rtVolCustom  = st.rtVolCustom;
  if (typeof st.rtExclRadius === 'number')  rtExclRadius = st.rtExclRadius;
  if (typeof st.rtExclOp     === 'string')  rtExclOp     = st.rtExclOp;
  if (Array.isArray(st.rtExclKeys))         rtExclKeys   = st.rtExclKeys.slice();
  if (Array.isArray(st.customPtLayers)) {
    // Wipe all existing custom-point markers — otherwise old groups stay
    // orphaned on the map (overlapping new ones / impossible to toggle off).
    cptRoot.clearLayers();
    // Restore custom point layers without their Leaflet groups (re-created on render)
    customPtLayers = st.customPtLayers.map(l => ({ ...l, _group: null }));
  }
}

/* ── EXPORT RECS ─────────────────────────────────────────────────────── */
function exportRecs() {
  if (!lastRecs.length) { toast('Нет рекомендаций для экспорта', 'err'); return; }
  if (!window.XLSX) { ensureSheetLibs().then(exportRecs).catch(() => toast('Не удалось загрузить XLSX', 'err')); return; }
  const header = ['Ранг', 'Название зоны', 'Город', 'Широта', 'Долгота', 'Спрос (ед/км²)', 'Точек рядом', 'Объём', 'До ближайшей ТТ, м'];
  const rows   = [header];
  lastRecs.forEach((s, i) => rows.push([
    i + 1, s.name || ('Зона ' + (i + 1)), s.fil || '',
    +s.lat.toFixed(6), +s.lon.toFixed(6),
    Math.round(s.ld), s.lc, Math.round(s.vol * 100) / 100,
    isFinite(s.nd) ? s.nd : '',
  ]));
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 6 }, { wch: 30 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 15 }, { wch: 12 }, { wch: 10 }, { wch: 20 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Рекомендации BR');
  XLSX.writeFile(wb, 'rekomendacii_BR_' + lastBasisName.toLowerCase() + '_' + new Date().toISOString().slice(0, 10) + '.xlsx');
  toast('Файл скачан', 'ok');
}

/* ── RETRAFFIC FILTERED EXPORT ───────────────────────────────────────── */
// Layers eligible for use as "exclusions" — custom layers, not base shipment layers
function rtExclLayerKeys() {
  const hk = heatKeys.filter(k => k !== 'cig' && k !== 'sticks' && DS[k] && (DS[k].recs || []).length);
  const ck = customPtLayers.filter(l => l.recs.length).map(l => '__cpt__' + l.id);
  return [...hk, ...ck];
}
function rtExclLayerName(k) {
  if (DS[k]) return DS[k].name || k;
  const cpt = customPtLayers.find(l => '__cpt__' + l.id === k);
  return cpt ? cpt.name : k;
}

// Build the exclusion-layer checkbox list. Default-selects any Re-traffic layer.
function buildRtExclUI() {
  const box = document.getElementById('rt-excl-list');
  if (!box) return;
  const keys = rtExclLayerKeys();

  // Auto-select Re-traffic layer the first time
  if (!rtExclKeys.length) {
    const rt = keys.find(k => /re.?traffic|ретрафик/i.test(rtExclLayerName(k)));
    if (rt) rtExclKeys = [rt];
  }
  rtExclKeys = rtExclKeys.filter(k => keys.includes(k));

  if (!keys.length) {
    box.innerHTML = '<div class="rt-excl-empty">Нет дополнительных слоёв. Загрузите слой Re-traffic через «Свои точки».</div>';
    return;
  }
  box.innerHTML = keys.map(k =>
    `<label class="chk rt-excl-item"><div class="cbx${rtExclKeys.includes(k) ? ' on' : ''}" data-rtx="${esc(k)}" aria-label="Исключать точки рядом со слоем «${esc(rtExclLayerName(k))}»"></div><span>${esc(rtExclLayerName(k))}</span></label>`
  ).join('');
  a11ySwitches();
  box.querySelectorAll('[data-rtx]').forEach(cb => {
    cb.addEventListener('click', () => {
      const k = cb.dataset.rtx;
      if (rtExclKeys.includes(k)) rtExclKeys = rtExclKeys.filter(x => x !== k);
      else rtExclKeys.push(k);
      cb.classList.toggle('on');
      saveState();
    });
  });
}

const OP_LABELS = { lte: '≤', lt: '<', gte: '≥', gt: '>' };
function opLabel(op) { return OP_LABELS[op] || op; }
const cmpDist = (d, thresh, op) =>
  op === 'lte' ? d <= thresh : op === 'lt' ? d < thresh : op === 'gte' ? d >= thresh : d > thresh;

/* Returns all available source layers for address program (name → key map) */
function addrSrcOptions() {
  const opts = [];
  heatKeys.forEach(k => { if (DS[k]) opts.push({ key: k, name: DS[k].name || k }); });
  customPtLayers.forEach(l => opts.push({ key: '__cpt__' + l.id, name: l.name }));
  return opts;
}

/* Rebuilds the source selector dropdown */
function buildAddrSrcSel() {
  const sel = document.getElementById('addr-src-sel');
  if (!sel) return;
  const opts = addrSrcOptions();
  // If current key no longer exists, reset to the first available layer
  if (!opts.find(o => o.key === addrSrcKey)) addrSrcKey = opts[0] ? opts[0].key : '';
  sel.innerHTML = opts.length
    ? opts.map(o => `<option value="${o.key}"${o.key === addrSrcKey ? ' selected' : ''}>${esc(o.name)}</option>`).join('')
    : '<option value="">Нет слоёв — загрузите на вкладке «Карта»</option>';
  const isCpt = addrSrcKey.startsWith('__cpt__');
  const volBlock  = document.getElementById('addr-vol-block');
  const exclBlock = document.getElementById('addr-excl-block');
  if (volBlock)  volBlock.style.display  = isCpt ? 'none' : '';   // volume only for heat layers
  if (exclBlock) exclBlock.style.display = isCpt ? 'none' : '';   // exclusions for heat layers
  buildAddrRefSel();
}

/* Rebuilds the reference-points selector dropdown */
function buildAddrRefSel() {
  const sel = document.getElementById('addr-ref-sel');
  if (!sel) return;
  const opts = [{ key: '__own__', name: 'BR / IQOS (наши точки)' }];
  customPtLayers.forEach(l => {
    if (l.recs.length) opts.push({ key: '__cpt__' + l.id, name: l.name });
  });
  // If current ref key no longer valid, reset
  if (!opts.find(o => o.key === addrRefKey)) addrRefKey = '__own__';
  sel.innerHTML = opts.map(o =>
    `<option value="${o.key}"${o.key === addrRefKey ? ' selected' : ''}>${esc(o.name)}</option>`
  ).join('');
}

/* Returns reference layer name for display */
function addrRefName() {
  if (addrRefKey === '__own__') return 'BR/IQOS';
  const layer = customPtLayers.find(l => '__cpt__' + l.id === addrRefKey);
  return layer ? layer.name : 'BR/IQOS';
}

/* Returns reference points array for distance calculation */
function addrRefPoints() {
  if (addrRefKey === '__own__') return own;
  const id = addrRefKey.slice(7);
  const layer = customPtLayers.find(l => l.id === id);
  return layer ? layer.recs : [];
}

/* Get source records for current addrSrcKey */
function addrSrcRecs() {
  if (addrSrcKey.startsWith('__cpt__')) {
    const id = addrSrcKey.slice(7);
    const layer = customPtLayers.find(l => l.id === id);
    return layer ? layer.recs.map(r => ({ ...r, vol_total: null })) : [];
  }
  const d = DS[addrSrcKey];
  return d && d.recs ? d.recs.map(r => ({ ...r, vol_total: r.vol || 0 })) : [];
}

/* Core filter: returns { points, excluded, avg, srcName } */
function runAddrFilter() {
  const hasVol = !addrSrcKey.startsWith('__cpt__');   // heat layers carry volume + support exclusions
  const srcName = addrSrcOptions().find(o => o.key === addrSrcKey)?.name || addrSrcKey;

  let points = addrSrcRecs();
  if (city) points = points.filter(p => p.fil === city || !p.fil);

  const refPts = addrRefKey === '__own__'
    ? (city ? own.filter(o => o.cityRu === city) : own)
    : addrRefPoints();

  // Attach nearest reference-point distance AND the ref point itself
  const refIx = buildPtIndex(refPts);
  points.forEach(p => {
    const n = nearestPt(refIx, p.lat, p.lon);
    p._distOwn = n ? Math.round(n.dist) : Infinity;
    p._nearRef = n ? n.ref : null;   // reference point object
  });

  // Volume filter (heat layers; skip for custom point layers)
  let avg = 0, volThresh = 0;
  if (hasVol) {
    avg = points.reduce((s, p) => s + (p.vol_total || 0), 0) / (points.length || 1);
    volThresh = rtVolMode === 'custom' ? rtVolCustom : avg;
    points = points.filter(p => cmpDist(p.vol_total || 0, volThresh, rtVolOp));
  }

  // Distance to BR/IQOS filter
  points = points.filter(p => cmpDist(p._distOwn, rtRadius, rtRadiusOp));

  // Exclusion (heat-layer sources)
  let excluded = 0;
  if (hasVol) {
    const exclRecs = [];
    rtExclKeys.forEach(k => {
      if (DS[k] && DS[k].recs) exclRecs.push(...DS[k].recs);
      const cpt = customPtLayers.find(l => '__cpt__' + l.id === k);
      if (cpt) exclRecs.push(...cpt.recs);
    });
    if (exclRecs.length) {
      const isExcl = p => exclRecs.some(r => {
        if (r.code && p.code && r.code === p.code) return true;
        return cmpDist(hav(p.lat, p.lon, r.lat, r.lon), rtExclRadius, rtExclOp);
      });
      excluded = points.filter(isExcl).length;
      points = points.filter(p => !isExcl(p));
    }
  }

  return { points, excluded, avg, volThresh, srcName, hasVol, noRef: !refPts.length };
}

/* Show filtered points on map */
function previewAddrOnMap() {
  addrLayer.clearLayers();
  const { points, noRef } = runAddrFilter();
  // Без референсных точек фильтр по расстоянию не имеет смысла — говорим прямо,
  // а не «нет точек по фильтрам» (частый случай на карте KG).
  if (noRef) { toast(`Нет точек-ориентиров («${addrRefName()}») — загрузите их во вкладке «Точки»`, 'err', 5000); return; }
  if (!points.length) { toast('Нет точек по текущим фильтрам', 'warn'); return; }

  const refLabel = addrRefName();

  // Collect unique nearest-ref points to highlight
  const usedRefs = new Map(); // key = 'lat|lon' → ref object
  points.forEach(p => {
    if (p._nearRef) {
      const key = p._nearRef.lat.toFixed(6) + '|' + p._nearRef.lon.toFixed(6);
      usedRefs.set(key, p._nearRef);
    }
  });

  // Draw dashed lines from source point to nearest ref
  points.forEach(p => {
    if (!p._nearRef) return;
    const line = L.polyline(
      [[p.lat, p.lon], [p._nearRef.lat, p._nearRef.lon]],
      { color: '#FF8C00', weight: 1.2, opacity: 0.45, dashArray: '5 6' }
    );
    addrLayer.addLayer(line);
  });

  // Draw ref point markers (blue)
  usedRefs.forEach(ref => {
    const refName = ref.name || ref.ch || ref.id || refLabel;
    const m = L.circleMarker([ref.lat, ref.lon], {
      radius: 6, fillColor: '#6C8EFF', color: '#fff', weight: 2,
      fillOpacity: 1, pane: 'markerPane',
    });
    m.bindTooltip(
      `<b style="color:#6C8EFF">${esc(refLabel)}</b><br>${esc(refName)}`,
      { className: 'tt', direction: 'top', offset: [0, -8] }
    );
    addrLayer.addLayer(m);
  });

  // Draw result markers (orange) — on top of lines
  points.forEach((p, i) => {
    const m = L.circleMarker([p.lat, p.lon], {
      radius: 8, fillColor: '#FF8C00', color: '#fff', weight: 2,
      fillOpacity: 0.92, pane: 'markerPane',
    });
    const nearName = p._nearRef ? (p._nearRef.name || p._nearRef.ch || '') : '';
    const lines = [`<b style="color:#FF8C00">#${i + 1} ${esc(p.name || '—')}</b>`];
    if (p.addr) lines.push(esc(p.addr));
    if (p.fil)  lines.push(esc(p.fil));
    lines.push(`До ${esc(refLabel)}${nearName ? ' (' + esc(nearName) + ')' : ''}: <b>${fmtD(p._distOwn)}</b>`);
    if (p.vol_total != null) lines.push(`Объём: ${Math.round(p.vol_total)}`);
    m.bindPopup(lines.join('<br>'));
    addrLayer.addLayer(m);
  });

  const allPts = [...points.map(p => [p.lat, p.lon]),
                  ...[...usedRefs.values()].map(r => [r.lat, r.lon])];
  map.flyToBounds(L.latLngBounds(allPts).pad(.12), { duration: .7 });
  toast(`На карте: ${points.length} точек · ${usedRefs.size} ориентиров`, 'ok');
}

function exportRetraffic() {
  if (!window.XLSX) { ensureSheetLibs().then(exportRetraffic).catch(() => toast('Не удалось загрузить XLSX', 'err')); return; }
  const { points, excluded, avg, volThresh, srcName, hasVol, noRef } = runAddrFilter();
  const refName = addrRefName();

  if (noRef) {
    toast(`Нет точек-ориентиров («${refName}») — загрузите их во вкладке «Точки»`, 'err', 5000);
    return;
  }
  if (!points.length) {
    toast('Нет точек по текущим фильтрам', 'err');
    return;
  }

  points.sort((a, b) => (b.vol_total || 0) - (a.vol_total || 0));

  const distCol = `До ${refName}, м`;
  const rows = [['№', 'Название', 'Город', 'Адрес', 'Широта', 'Долгота', 'Объём', distCol, 'Код']];
  points.forEach((p, i) => {
    rows.push([
      i + 1, p.name || '', p.fil || '', p.addr || '',
      +p.lat.toFixed(6), +p.lon.toFixed(6),
      p.vol_total != null ? Math.round((p.vol_total || 0) * 100) / 100 : '',
      isFinite(p._distOwn) ? p._distOwn : '', p.code || '',
    ]);
  });

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 4 }, { wch: 38 }, { wch: 12 }, { wch: 36 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 18 }, { wch: 10 }];

  const exclNames = rtExclKeys.map(k => {
    if (DS[k]) return DS[k].name;
    const cpt = customPtLayers.find(l => '__cpt__' + l.id === k);
    return cpt ? cpt.name : null;
  }).filter(Boolean);

  // Параметры объёма и исключений применяются к тепловым слоям (hasVol) —
  // раньше этот блок был привязан к удалённому режиму «отгрузки» и в файл не
  // попадал, из-за чего в выгрузке не было видно, какие фильтры отработали.
  const infoData = [
    ['Параметры фильтра'],
    ['Исходный слой', srcName],
    ['Расстояние до ' + refName, opLabel(rtRadiusOp) + ' ' + fmtD(rtRadius)],
    ...(hasVol ? [
      ['Объём', opLabel(rtVolOp) + ' ' + (rtVolMode === 'avg' ? `среднего (${avg.toFixed(1)} ед.)` : volThresh)],
      ['Исключаемые слои', exclNames.length ? exclNames.join(', ') : 'не выбраны'],
      ['Расстояние до исключ. слоя', opLabel(rtExclOp) + ' ' + fmtD(rtExclRadius)],
      ['Исключено точек', excluded],
    ] : []),
    ['Город', city || 'все'],
    ['Дата выгрузки', new Date().toLocaleDateString('ru')],
    [],
    ['Итого точек в файле', points.length],
  ];
  const wsInfo = XLSX.utils.aoa_to_sheet(infoData);
  wsInfo['!cols'] = [{ wch: 28 }, { wch: 42 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Адресная программа');
  XLSX.utils.book_append_sheet(wb, wsInfo, 'Параметры');

  const fname = 'BR_adresa_' + new Date().toISOString().slice(0, 10) + '.xlsx';
  XLSX.writeFile(wb, fname);
  toast(`Скачано ${points.length} точек` + (excluded ? ` (исключено: ${excluded})` : ''), 'ok');
}

/* ── ROLE / MAP ──────────────────────────────────────────────────────── */
// currentMap: 'comdep' | 'other'  ·  currentRole: 'admin' | 'comdep' | 'other'
let currentMap  = sessionStorage.getItem('hm_map')  || null;
let currentRole = sessionStorage.getItem('hm_role') || null;
const isAdmin = () => currentRole === 'admin';

/* ── PERSISTENCE ─────────────────────────────────────────────────────── */
// State is stored per-map so the two departments never overwrite each other.
const storeKey = () => 'hm_state_' + (currentMap || 'main');

// ── Server sync config ───────────────────────────────────────────────────
// Set SERVER_URL to your VPS API root, e.g. 'https://api.example.com'
// Set SERVER_KEY to the API_KEY you configured in server/.env
// Leave SERVER_URL empty to skip server sync and use localStorage only.
const SERVER_URL = window._HM_SERVER_URL || '';
// Write key is never bundled — the owner enters it once and it lives only in
// this browser's localStorage. Without it, this client can only read + edit
// locally; it cannot write shared data to the server.
let SERVER_KEY = '';
try { SERVER_KEY = localStorage.getItem('hm_admin_key') || ''; } catch (e) {}

let stateReady = false, _saveTimer = null;

function setSyncBadge(state, label) {
  if (!SERVER_URL) return;
  const badge = document.getElementById('sync-badge');
  const lbl   = document.getElementById('sync-label');
  if (!badge) return;
  badge.style.display = '';
  badge.className = 'sync-badge ' + state;
  lbl.textContent = label;
}

// Build the full base dataset from the current in-memory layers and POST it
// to the server. This becomes the new base for every user on next load.
async function pushDataset(btn) {
  if (!SERVER_URL) { toast('Сервер не настроен', 'err'); return; }
  if (!isAdmin()) { toast('Недостаточно прав', 'err'); return; }
  if (!SERVER_KEY) { toast('Введите ключ администратора в «Данные → Доступ к записи»', 'err', 4500); return; }
  const dataset = {
    _app: 'hm-data', _v: 1,
    own: DATA.own, cities: DATA.cities,
    cig:      { recs: DS.cig.recs,      stats: DS.cig.stats },
    sticks:   { recs: DS.sticks.recs,   stats: DS.sticks.stats },
    // combined is derived (cig + sticks) on the client — not stored.
    districts: DATA.districts, field: DATA.field,
  };
  const old = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = 'Сохранение…'; }
  try {
    const res = await postJson(SERVER_URL + '/data', dataset, 90000);
    if (res.status === 415) { _gzipOk = false; throw new Error('gzip не поддержан сервером — повторите'); }
    if (!res.ok) throw new Error('HTTP ' + res.status);
    toast('База данных сохранена на сервере', 'ok');
  } catch (e) {
    toast('Не удалось сохранить базу: ' + (e.name === 'TimeoutError' ? 'таймаут' : e.message), 'err');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = old; }
  }
}

// Multi-MB uploads travel ~6× faster gzipped. If the server (or an old deploy)
// rejects a compressed request, we fall back to plain JSON for the session.
let _gzipOk = typeof CompressionStream !== 'undefined';
async function postJson(url, obj, timeoutMs) {
  const json = JSON.stringify(obj);
  const headers = { 'Content-Type': 'application/json', 'X-API-Key': SERVER_KEY };
  let body = json;
  if (_gzipOk) {
    try {
      body = await new Response(new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'))).blob();
      headers['Content-Encoding'] = 'gzip';
    } catch (e) { _gzipOk = false; body = json; }
  }
  try {
    return await fetch(url, { method: 'POST', headers, body, signal: AbortSignal.timeout(timeoutMs) });
  } catch (e) {
    if (headers['Content-Encoding']) _gzipOk = false; // CORS/proxy may not accept gzip — retry plain
    throw e;
  }
}

// Single-flight upload: the state can be several MB (many uploaded points), so
// overlapping POSTs on rapid edits (slider drags) pile up and get dropped
// («Failed to fetch»). Only one push runs at a time; edits during a push set a
// pending flag and trigger exactly one more push (with a fresh snapshot) after.
let _pushing = false, _pushPending = false;

async function pushToServer(snapshot, isRetry = false) {
  if (!SERVER_URL) return;
  if (!isAdmin() || !SERVER_KEY) return; // only the owner (admin + key) writes the shared map
  if (_pushing) { _pushPending = true; return; }   // coalesce concurrent saves
  _pushing = true;
  setSyncBadge('syncing', isRetry ? 'Повтор…' : 'Сохранение…');
  try {
    const res = await postJson(SERVER_URL + '/state?map=' + encodeURIComponent(currentMap), snapshot, 120000);
    if (res.status === 415) { _gzipOk = false; throw new Error('gzip не поддержан сервером'); }
    if (!res.ok) {
      setSyncBadge('err', res.status === 413 ? 'Данные слишком большие' : 'Ошибка сохранения');
      console.warn('Server sync error:', res.status);
      if (res.status === 413) toast('Данные слишком большие для сервера', 'err');
    } else {
      const now = new Date().toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' });
      setSyncBadge('ok', 'Сохранено ' + now);
    }
  } catch (e) {
    setSyncBadge('err', isRetry ? 'Сервер недоступен' : 'Сервер недоступен — повтор через 6 с');
    console.warn('Server unreachable, saved locally only:', e.message);
    if (!isRetry) setTimeout(() => pushToServer(buildStateSnapshot(), true), 6000);
  } finally {
    _pushing = false;
    if (_pushPending) { _pushPending = false; setTimeout(() => pushToServer(buildStateSnapshot()), 100); }
  }
}

async function fetchFromServer() {
  if (!SERVER_URL) return null;
  // Render free tier wakes up on first request and can take ~45s to respond.
  // We show a "waking up" hint after 5s so the user knows it's not frozen.
  setSyncBadge('syncing', 'Загрузка…');
  const wakeHint = setTimeout(() => setSyncBadge('syncing', 'Сервер пробуждается…'), 5000);
  try {
    const res = await fetch(SERVER_URL + '/state?map=' + encodeURIComponent(currentMap), {
      signal: AbortSignal.timeout(55000),
    });
    clearTimeout(wakeHint);
    if (!res.ok) { setSyncBadge('err', 'Ошибка загрузки'); return null; }
    const data = await res.json();
    if (!data || data.empty || data._app !== 'hm-br') {
      setSyncBadge('ok', 'Нет данных на сервере');
      return null;
    }
    return data;
  } catch (e) {
    clearTimeout(wakeHint);
    const msg = e.name === 'TimeoutError' ? 'Сервер не отвечает (перезагрузите)' : 'Сервер недоступен';
    setSyncBadge('err', msg);
    console.warn('Could not load from server, using local state:', e.message);
    return null;
  }
}

function doSave() {
  const snapshot = buildStateSnapshot();
  snapshot._clientTs = Date.now(); // local edit timestamp (used to resolve vs server)
  try {
    localStorage.setItem(storeKey(), JSON.stringify(snapshot));
  } catch (e) { /* quota exceeded or private mode */ }
  pushToServer(snapshot);
}

function saveState() {
  if (!stateReady) return;
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(doSave, 1500);   // batch rapid edits — state can be several MB
}

function loadState() {
  let st;
  try { const raw = localStorage.getItem(storeKey()); if (!raw) return; st = JSON.parse(raw); } catch (e) { return; }
  applySnapshot(st);
}

function syncControls() {
  const $ = id => document.getElementById(id);
  $('s-cov').value         = covR;  $('v-cov').textContent  = fmtD(covR);
  $('s-top').value         = topN;  $('v-top').textContent  = topN;
  $('s-heat-boost').value  = heatBoost; $('v-heat-boost').textContent = Math.round(heatBoost * 100) + '%';
  $('s-heat-radius').value = heatRadius; $('v-heat-radius').textContent = heatRadius + ' px';
  $('heat-blend').value    = heatBlend;
  $('rec-show').classList.toggle('on', recShow);
  buildRecBasisSel();
  const distBtn = $('districts-toggle'); if (distBtn) distBtn.classList.toggle('on', districtsOn);
  $('s-rt-radius').value  = rtRadius;     $('v-rt-radius').textContent = fmtD(rtRadius);
  $('op-rt-radius').value = rtRadiusOp;
  $('s-rt-excl').value    = rtExclRadius; $('v-rt-excl').textContent   = fmtD(rtExclRadius);
  $('op-rt-excl').value   = rtExclOp;
  $('op-rt-vol').value    = rtVolOp;
  $('vol-mode').value     = rtVolMode;
  $('vol-custom-val').value = rtVolCustom;
  $('vol-custom-val').style.display = rtVolMode === 'custom' ? '' : 'none';
  buildAddrSrcSel();
  buildRtExclUI();
  fillAllSliders();
  a11ySwitches();
  updateAccBadges();
}

/* ── EVENT WIRING ────────────────────────────────────────────────────── */
function wireEvents() {
  const $ = id => document.getElementById(id);

  // Rec basis — pick which uploaded layer drives the recommendations
  $('rec-basis-sel').addEventListener('change', e => { recBasis = e.target.value; renderRecs(); });

  $('rec-show').addEventListener('click', e => { recShow = !recShow; e.target.classList.toggle('on', recShow); renderRecs(); });
  $('s-cov').addEventListener('input', e => { covR = +e.target.value; $('v-cov').textContent = fmtD(covR); fillSlider(e.target); renderRecs(); });
  $('s-top').addEventListener('input', e => { topN = +e.target.value; $('v-top').textContent = topN; fillSlider(e.target); renderRecs(); });

  // Heat brightness (fast path — no full re-render)
  $('s-heat-boost').addEventListener('input', e => {
    heatBoost = +e.target.value;
    $('v-heat-boost').textContent = Math.round(heatBoost * 100) + '%';
    fillSlider(e.target); restyleHeatCanvases();
  });

  // Heat spot radius
  $('s-heat-radius').addEventListener('input', e => {
    heatRadius = +e.target.value;
    $('v-heat-radius').textContent = heatRadius + ' px';
    fillSlider(e.target); renderHeat();
  });

  // Blend mode (fast path)
  $('heat-blend').addEventListener('change', e => {
    heatBlend = e.target.value;
    restyleHeatCanvases();
  });

  // Create layer
  // Upload a file → then ask name/colour → create the layer from its data
  $('add-layer-btn').addEventListener('click', () => $('heat-file').click());
  const heatFileInp = $('heat-file');
  heatFileInp.addEventListener('change', () => {
    const f = heatFileInp.files[0]; if (!f) return;
    parseSheet(f, rows => {
      pendingHeatRows = rows;
      openLayerModal(f.name.replace(/\.(csv|xlsx|xls)$/i, ''));
    });
    heatFileInp.value = '';
  });
  // Re-upload data into an existing layer (per-layer "Обновить данные")
  const heatUpdInp = $('heat-update-file');
  heatUpdInp.addEventListener('change', () => {
    const f = heatUpdInp.files[0]; const k = _heatUpdateTarget;
    heatUpdInp.value = ''; _heatUpdateTarget = null;
    if (!f || !k || !DS[k]) return;
    parseSheet(f, rows => {
      const recs = enrich(toRecs(rows));
      if (!recs.length) { toast('Не найдено строк с lat/lon', 'err'); return; }
      DS[k].recs = recs; DS[k].stats = statsOf(recs); DS[k].visible = true; DS[k]._userData = true;
      focusNewLayer(k);
      toast(`Слой «${DS[k].name}» обновлён (${recs.length} точек)`, 'ok');
    });
  });
  $('layer-modal-cancel').addEventListener('click', () => { pendingHeatRows = null; closeLayerModal(); });
  $('layer-modal-confirm').addEventListener('click', confirmLayerModal);
  $('layer-modal-input').addEventListener('keydown', e => { if (e.key === 'Enter') confirmLayerModal(); if (e.key === 'Escape') closeLayerModal(); });
  $('layer-modal-overlay').addEventListener('click', e => { if (e.target === $('layer-modal-overlay')) { pendingHeatRows = null; closeLayerModal(); } });

  // Template downloads — one generator for all three upload flows, so the
  // sample files always match what the corresponding parser expects.
  const TEMPLATES = {
    own: {
      rows: [['ch', 'name', 'city', 'code', 'addr', 'hours', 'lat', 'lon'],
             ['BR', 'Пример BR', 'Tashkent', '1137', 'г.Ташкент, ул. Пример 1', '10:00-22:00', 41.311100, 69.279700],
             ['SE', 'Пример SE', 'Samarkand', '2201', 'г.Самарканд, ул. Пример 2', '09:00-21:00', 39.654000, 66.959700]],
      cols: [6, 20, 14, 8, 30, 14, 12, 12], file: 'shablon_nashi_tochki.xlsx',
    },
    heat: {
      rows: [['name', 'lat', 'lon', 'value'], ['Пример ТТ', 41.311100, 69.279700, 12.5], ['Пример ТТ 2', 41.299000, 69.240000, 8]],
      cols: [22, 12, 12, 10], file: 'shablon_sloy_heatmap.xlsx',
    },
    cpt: {
      rows: [['name', 'lat', 'lon', 'addr', 'hours', 'code'],
             ['Пример точки', 41.311100, 69.279700, 'г.Ташкент, ул. Пример 1', '10:00-22:00', 'A-01'],
             ['Пример точки 2', 41.299000, 69.240000, 'г.Ташкент, ул. Пример 2', '', '']],
      cols: [22, 12, 12, 30, 14, 8], file: 'shablon_svoi_tochki.xlsx',
    },
  };
  function downloadTemplate(kind) {
    const t = TEMPLATES[kind];
    ensureSheetLibs().then(() => {
      const ws = XLSX.utils.aoa_to_sheet(t.rows);
      ws['!cols'] = t.cols.map(w => ({ wch: w }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Данные');
      XLSX.writeFile(wb, t.file);
    }).catch(() => toast('Не удалось загрузить XLSX', 'err'));
  }
  $('dl-tpl').addEventListener('click', () =>
    downloadTemplate($('up-target').value === '__own__' ? 'own' : 'heat'));
  const ownTpl = $('own-tpl'); if (ownTpl) ownTpl.addEventListener('click', () => downloadTemplate('own'));
  const cptTpl = $('cpt-tpl'); if (cptTpl) cptTpl.addEventListener('click', () => downloadTemplate('cpt'));

  // Upload own IQOS points straight from the Points tab (same flow as Данные)
  const ownFileInp = $('own-file');
  if (ownFileInp) {
    $('own-upload-btn').addEventListener('click', () => ownFileInp.click());
    ownFileInp.addEventListener('change', () => {
      const f = ownFileInp.files[0];
      ownFileInp.value = '';
      if (!f) return;
      parseSheet(f, rows => applyOwnUpload(rows));
    });
  }

  // File upload (click + drag&drop)
  const fileInp = $('file'), fileBox = $('filebox');
  fileBox.addEventListener('click', () => fileInp.click());
  ['dragenter', 'dragover'].forEach(ev =>
    fileBox.addEventListener(ev, e => { e.preventDefault(); fileBox.classList.add('drag'); }));
  ['dragleave', 'drop'].forEach(ev =>
    fileBox.addEventListener(ev, e => { e.preventDefault(); fileBox.classList.remove('drag'); }));
  fileBox.addEventListener('drop', e => {
    const f = e.dataTransfer.files[0];
    if (f) handleDataFile(f);
  });
  fileInp.addEventListener('change', () => {
    const f = fileInp.files[0]; if (!f) return;
    handleDataFile(f);
  });
  function handleDataFile(f) {
    parseSheet(f, rows => {
      // Keep raw rows; final parse happens at "Обновить карту" once the
      // target layer is known (heat layers vs own IQOS points differ).
      const probe = toRecs(rows);
      if (!probe.length) { toast('Не найдено строк с lat/lon', 'err'); return; }
      pendingUpload = rows;
      const fn = $('fname'); fn.style.display = 'block';
      fn.textContent = '✓ ' + f.name + ' — ' + probe.length + ' точек';
      $('btn-update').disabled = false;
      toast(`Загружено ${probe.length} точек — нажмите «Обновить карту»`, 'ok');
    });
  }

  $('btn-update').addEventListener('click', e => {
    e.stopPropagation(); // prevent sidebar's saveState() from firing before recs are set
    if (!pendingUpload) return;
    const tk = $('up-target').value;
    const reset = () => {
      pendingUpload = null;
      $('btn-update').disabled = true;
      $('fname').style.display = 'none';
      fileInp.value = '';
    };

    if (tk === '__own__') {
      if (applyOwnUpload(pendingUpload)) reset();
      return;
    }

    const d = DS[tk]; if (!d) return;
    d.recs = enrich(toRecs(pendingUpload)); d.stats = statsOf(d.recs); d.visible = true; d._userData = true;
    reset();
    // The selected-city filter would otherwise silently hide points that fall
    // in other cities — reset to "Все" so the freshly uploaded layer is visible.
    if (city && !d.recs.some(r => r.fil === city)) { city = ''; buildCityUI(); }
    buildHeatUI(); renderHeat(); renderRecs(); buildRtExclUI();
    // Frame the map on the new data so it's obvious it loaded.
    const bpts = d.recs.filter(r => !city || r.fil === city).map(r => [r.lat, r.lon]);
    if (bpts.length) map.flyToBounds(L.latLngBounds(bpts).pad(.15), { duration: .6 });
    saveState();
    toast(`Слой «${d.name}» обновлён (${d.stats.n} точек)`, 'ok');
  });

  // Admin write key — stored only in this browser, never in the bundle
  const keyInp = $('admin-key-input');
  if (keyInp) {
    keyInp.value = SERVER_KEY;
    $('admin-key-save').addEventListener('click', () => {
      SERVER_KEY = keyInp.value.trim();
      try { SERVER_KEY ? localStorage.setItem('hm_admin_key', SERVER_KEY) : localStorage.removeItem('hm_admin_key'); } catch (e) {}
      toast(SERVER_KEY ? 'Ключ сохранён — запись на сервер включена' : 'Ключ удалён — запись отключена', SERVER_KEY ? 'ok' : 'info');
    });
  }

  // Save current layers back to the server as the new base dataset (admin)
  const saveDsBtn = $('btn-save-dataset');
  if (saveDsBtn) saveDsBtn.addEventListener('click', () => {
    if (!isAdmin()) { toast('Только администратор может менять базу', 'err'); return; }
    pushDataset(saveDsBtn);
  });

  // Districts borders toggle (next to cities on the map)
  $('districts-toggle').addEventListener('click', e => {
    districtsOn = !districtsOn;
    e.currentTarget.classList.toggle('on', districtsOn);
    renderDistricts(); saveState();
  });

  // Custom zoom controls
  const zc = $('zoom-ctl');
  if (zc) {
    L.DomEvent.disableClickPropagation(zc);
    L.DomEvent.disableScrollPropagation(zc);
    $('zoom-in').addEventListener('click',  () => map.zoomIn());
    $('zoom-out').addEventListener('click', () => map.zoomOut());
    $('zoom-fit').addEventListener('click', fitView);
    const syncZoomBtns = () => {
      $('zoom-in').classList.toggle('disabled',  map.getZoom() >= map.getMaxZoom());
      $('zoom-out').classList.toggle('disabled', map.getZoom() <= map.getMinZoom());
    };
    map.on('zoomend', syncZoomBtns);
    syncZoomBtns();
  }
  // Point stacking depends on zoom — re-normalise each layer's max after zooming.
  map.on('zoomend', refreshHeatMax);

  // Export recs
  $('rec-export').addEventListener('click', exportRecs);
  $('btn-retraffic-export').addEventListener('click', exportRetraffic);
  $('btn-addr-preview').addEventListener('click', previewAddrOnMap);

  $('addr-src-sel').addEventListener('change', e => {
    addrSrcKey = e.target.value; buildAddrSrcSel(); addrLayer.clearLayers(); saveState();
  });
  $('addr-ref-sel').addEventListener('change', e => {
    addrRefKey = e.target.value; addrLayer.clearLayers(); saveState();
  });

  $('op-rt-vol').addEventListener('change', e => { rtVolOp = e.target.value; saveState(); });
  $('vol-mode').addEventListener('change', e => {
    rtVolMode = e.target.value;
    $('vol-custom-val').style.display = rtVolMode === 'custom' ? '' : 'none';
    saveState();
  });
  $('vol-custom-val').addEventListener('input', e => { rtVolCustom = +e.target.value; saveState(); });

  $('s-rt-radius').addEventListener('input', e => {
    rtRadius = +e.target.value; $('v-rt-radius').textContent = fmtD(rtRadius); fillSlider(e.target); saveState();
  });
  $('op-rt-radius').addEventListener('change', e => { rtRadiusOp = e.target.value; saveState(); });
  $('s-rt-excl').addEventListener('input', e => {
    rtExclRadius = +e.target.value; $('v-rt-excl').textContent = fmtD(rtExclRadius); fillSlider(e.target); saveState();
  });
  $('op-rt-excl').addEventListener('change', e => { rtExclOp = e.target.value; saveState(); });

  // Share / import state
  $('btn-export-state').addEventListener('click', exportState);
  const stateFileInp = $('state-file');
  $('btn-import-state').addEventListener('click', () => stateFileInp.click());
  stateFileInp.addEventListener('change', () => {
    const f = stateFileInp.files[0];
    if (!f) return;
    importState(f);
    stateFileInp.value = '';
  });

  // Mobile burger + backdrop
  const sideEl = $('side'), backdrop = $('side-backdrop');
  const isMobile = () => window.innerWidth <= 780;
  const setSide = open => {
    sideEl.classList.toggle('open', open);
    backdrop.classList.toggle('show', open);
    document.body.classList.toggle('side-open', open); // prevent body scroll behind drawer
  };
  $('burger').addEventListener('click', () => setSide(!sideEl.classList.contains('open')));
  backdrop.addEventListener('click', () => setSide(false));
  // Keyboard shortcuts: Esc closes drawer; 1-4 switch tabs (when not typing)
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && isMobile()) { setSide(false); return; }
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'select' || tag === 'textarea' || e.metaKey || e.ctrlKey || e.altKey) return;
    // Порядок как в нижней навигации — иначе «Город» недостижим с клавиатуры,
    // а «4» открывает не то, что подписано.
    const tabs = ['tab-map', 'tab-points', 'tab-analysis', 'tab-city', 'tab-data'];
    if (e.key >= '1' && e.key <= '5') {
      const t = document.querySelector(`.side-tab[data-tab="${tabs[+e.key - 1]}"]`);
      if (t && t.offsetParent !== null) t.click(); // skip if hidden (e.g. data tab for viewers)
    }
  });

  // Desktop collapse — slide sidebar away, map reflows to full width
  const appEl = $('app');
  const SIDE_HIDDEN_KEY = 'hm_side_hidden';
  const setDesktopSide = hidden => {
    appEl.classList.toggle('side-hidden', hidden);
    try { localStorage.setItem(SIDE_HIDDEN_KEY, hidden ? '1' : '0'); } catch (e) {}
    // Let Leaflet re-measure after the slide transition completes
    setTimeout(() => { if (typeof map !== 'undefined' && map.invalidateSize) map.invalidateSize(); }, 360);
  };
  if (localStorage.getItem(SIDE_HIDDEN_KEY) === '1') appEl.classList.add('side-hidden');
  $('side-collapse').addEventListener('click', () => setDesktopSide(true));
  $('side-reopen').addEventListener('click', () => setDesktopSide(false));

  // Tab navigation
  document.querySelectorAll('.side-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.side-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      const panel = document.getElementById(tab.dataset.tab);
      if (panel) panel.classList.add('active');
      // On mobile: don't auto-close — let user see the panel they just opened
    });
  });

  // Custom point layers — modal
  $('add-custom-pt-btn').addEventListener('click', () => {
    $('cpt-modal-name').value = '';
    $('cpt-modal-color').value = '#E84393';
    $('cpt-modal-overlay').classList.add('open');
    setTimeout(() => $('cpt-modal-name').focus(), 150);
  });
  $('cpt-modal-cancel').addEventListener('click', () => {
    $('cpt-modal-overlay').classList.remove('open');
  });
  $('cpt-modal-confirm').addEventListener('click', () => {
    const name = $('cpt-modal-name').value.trim();
    if (!name) { $('cpt-modal-name').focus(); return; }
    const color = $('cpt-modal-color').value;
    $('cpt-modal-overlay').classList.remove('open');
    const id = 'cpt_' + Date.now();
    customPtLayers.push({ id, name, color, visible: true, shape: 'teardrop', radiusOn: false, radiusM: 1500, radiusColor: color, radiusOpacity: 0.15, recs: [], _group: null });
    buildCustomPtUI(); buildAddrSrcSel(); buildRtExclUI(); saveState();
    toast(`Слой «${name}» создан — загрузите данные`, 'ok');
  });
  $('cpt-modal-overlay').addEventListener('click', e => {
    if (e.target === $('cpt-modal-overlay')) $('cpt-modal-overlay').classList.remove('open');
  });

  // Custom point layers — file upload
  const cptFileInp = $('cpt-file');
  cptFileInp.addEventListener('change', () => {
    const f = cptFileInp.files[0]; if (!f) return;
    const l = customPtLayers.find(x => x.id === _cptUploadTarget); if (!l) return;
    cptFileInp.value = '';
    _cptUploadTarget = null;
    parseSheet(f, rows => {
      const recs = toCustomPtRecs(rows);
      if (!recs.length) { toast('Не найдено строк с lat/lon', 'err'); return; }
      l.recs = recs;
      buildCustomPtUI(); buildAddrSrcSel(); buildRtExclUI(); renderCustomPoints(); saveState();
      toast(`Слой «${l.name}» — загружено ${recs.length} точек`, 'ok');
    });
  });

  // Autosave — delegated on sidebar, captures all interactions
  document.getElementById('side').addEventListener('input',  saveState);
  document.getElementById('side').addEventListener('change', saveState);
  document.getElementById('side').addEventListener('click',  saveState);
}

/* ── PENDING UPLOAD ──────────────────────────────────────────────────── */
let pendingUpload = null;

/* ── ROLE UI ─────────────────────────────────────────────────────────── */
const MAP_LABEL = { comdep: 'Com Dep', other: 'Другая', kg: 'Кыргызстан' };

function showRoleBadge() {
  const badge = document.getElementById('mode-badge');
  if (!badge) return;
  badge.style.display = '';
  const mapName = MAP_LABEL[currentMap] || '';
  if (isAdmin()) {
    badge.textContent = '✏ Админ · ' + mapName;
    badge.className = 'mode-badge mode-edit';
  } else {
    badge.textContent = '👁 ' + mapName;
    badge.className = 'mode-badge mode-view';
  }
}

// Viewers may freely tune the view (colours, layers, cities) but cannot
// upload, create or delete data — those controls are hidden via `body.viewer`.
function applyRoleUI() { document.body.classList.toggle('viewer', !isAdmin()); }

/* ── START APP (runs once a map is chosen) ───────────────────────────── */
let _appStarted = false;
async function startApp() {
  applyRoleUI();
  showRoleBadge();
  if (_appStarted) return;
  _appStarted = true;

  // Activate this map's country (cities, centroids, city stats) BEFORE any
  // state restore / render — cityOf() and the city bar depend on it.
  applyCountry(currentMap);
  // Cities are known only now — tag own points so the city filter and
  // «Курильщиков на 1 нашу точку» work even when the city column was empty.
  retagOwnCities();
  const brL = pointLayers.find(p => p.id === 'br'); if (brL) brL.data = own.filter(o => o.chk === 'BR');
  const seL = pointLayers.find(p => p.id === 'se'); if (seL) seL.data = own.filter(o => o.chk === 'SE');
  // The «Районы» overlay (Tashkent districts) is Uzbekistan-only.
  const distBtn = document.getElementById('districts-toggle');
  if (distBtn) distBtn.style.display = COUNTRY === 'uz' ? '' : 'none';

  // Load local state first so UI is immediately responsive
  loadState();
  buildCityUI(); buildHeatUI(); buildPtUI(); buildCustomPtUI(); rebuildUpTarget(); syncControls();
  renderHeat(); renderPoints(); renderCustomPoints(); renderRecs(); renderDistricts(); renderIncome();
  wireEvents();
  stateReady = true;
  setTimeout(() => { if (map && map.invalidateSize) map.invalidateSize(); }, 60);

  // Only fit bounds on first load (no saved city): frame what is actually drawn
  // (uploaded layers + our points); fall back to the country's first city.
  if (!city) {
    const framePts = visiblePts();
    if (framePts.length) map.fitBounds(L.latLngBounds(framePts).pad(.05));
    else if (CITIES[0] && CC[CITIES[0]]) map.setView(CC[CITIES[0]], 11);
  }

  // Hydrate from server. Newer local edits (by timestamp) win over the server.
  const serverState = await fetchFromServer();
  let local = null;
  try { local = JSON.parse(localStorage.getItem(storeKey())); } catch (e) {}
  const serverTs = serverState && serverState._savedAt ? Date.parse(serverState._savedAt) : 0;
  const localTs  = local && local._clientTs ? local._clientTs : 0;
  const hasLayers = st => !!(st && Array.isArray(st.heatKeys) && st.heatKeys.some(k => k.startsWith('custom_')));
  const localHasLayers  = hasLayers(local);
  const serverHasLayers = hasLayers(serverState);
  // Guard against the last-write-wins trap: a stale/empty local snapshot must
  // not clobber a server state that still holds the uploaded layers (and vice
  // versa). Only fall back to timestamps when both (or neither) have layers.
  let chosen;
  if (serverHasLayers && !localHasLayers)      chosen = serverState;
  else if (localHasLayers && !serverHasLayers) chosen = local;
  else chosen = (localTs > serverTs && local) ? local : (serverState || null);

  if (chosen) {
    applySnapshot(chosen);
    try { localStorage.setItem(storeKey(), JSON.stringify(chosen)); } catch (e) {}
    buildCityUI(); buildHeatUI(); buildPtUI(); buildCustomPtUI(); rebuildUpTarget(); syncControls();
    renderHeat(); renderPoints(); renderCustomPoints(); renderRecs(); renderDistricts(); renderIncome();
    if (chosen === serverState) {
      const savedAt = serverState._savedAt
        ? new Date(serverState._savedAt).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })
        : '';
      setSyncBadge('ok', 'Обновлено' + (savedAt ? ' ' + savedAt : ''));
      toast('Настройки загружены с сервера', 'ok');
    } else {
      // local data was used (server unavailable or newer local edit) — update badge
      setSyncBadge('ok', 'Локальные данные');
    }
  } else if (SERVER_URL && local && isAdmin()) {
    // Server is empty (e.g. restarted) but admin has a local copy — restore it
    pushToServer(buildStateSnapshot());
  }
}

/* ── AUTH ────────────────────────────────────────────────────────────── */
(function initAuth() {
  // NOTE: client-side credentials are a light gate, not real security — they
  // are visible in the bundle. The server API key protects writes to the map.
  const CREDS = [
    { u: 'hm_root', p: 'Zx7$Kp9-Lm2@Rt',   role: 'admin'  },
    { u: 'comdep',  p: 'ComDep-2026!view',  role: 'comdep' },
    { u: 'otdel',   p: 'Otdel-2026!view',   role: 'other'  },
    { u: 'kg',      p: 'KG-2026!view',      role: 'kg'     },
  ];
  const SK = 'hm_auth_ok';

  // Год в подвале экрана входа — из системной даты, иначе он молча устаревает.
  const year = new Date().getFullYear();
  document.querySelectorAll('.auth-footer').forEach(el => {
    el.textContent = 'Аналитика торговых точек · ' + year;
  });

  const screen    = document.getElementById('auth-screen');
  const stepLogin = document.getElementById('auth-step-login');
  const stepMap   = document.getElementById('auth-step-map');
  const form      = document.getElementById('auth-form');
  const errEl     = document.getElementById('auth-err');
  const submitBtn = document.getElementById('auth-submit');
  const logoutBtn = document.getElementById('logout-btn');

  const unlock = () => { screen.classList.add('hidden'); document.body.style.overflow = ''; };
  const lock   = () => {
    screen.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    stepLogin.style.display = '';
    stepMap.style.display = 'none';
  };

  const mapCards = () => Array.from(document.querySelectorAll('#auth-step-map .map-card'));

  // Show the map picker; enable only the cards this role may open (admin = both)
  const showMapStep = () => {
    stepLogin.style.display = 'none';
    stepMap.style.display = '';
    mapCards().forEach(card => {
      const allowed = isAdmin() || currentRole === card.dataset.map;
      card.classList.toggle('locked', !allowed);
      card.disabled = !allowed;
    });
  };

  const enterMap = m => {
    currentMap = m;
    sessionStorage.setItem('hm_map', m);
    unlock();
    startApp();
  };

  // Restore session
  if (sessionStorage.getItem(SK) === '1' && currentRole) {
    if (currentMap) { unlock(); startApp(); }
    else showMapStep();
  } else {
    currentRole = null; currentMap = null;
    lock();
  }

  form.addEventListener('submit', e => {
    e.preventDefault();
    const u   = document.getElementById('auth-user').value.trim().toLowerCase();
    const p   = document.getElementById('auth-pass').value;
    const hit = CREDS.find(c => c.u === u && c.p === p);
    if (hit) {
      currentRole = hit.role;
      sessionStorage.setItem(SK, '1');
      sessionStorage.setItem('hm_role', hit.role);
      submitBtn.disabled = true; submitBtn.textContent = 'Входим…';
      setTimeout(showMapStep, 320);
    } else {
      errEl.classList.add('show');
      ['auth-user', 'auth-pass'].forEach(id => {
        const inp = document.getElementById(id);
        inp.classList.remove('err'); void inp.offsetWidth; // force reflow so shake re-fires on repeat attempts
        inp.classList.add('err');
      });
      document.getElementById('auth-pass').value = '';
      document.getElementById('auth-pass').focus();
      setTimeout(() => {
        errEl.classList.remove('show');
        ['auth-user', 'auth-pass'].forEach(id => document.getElementById(id).classList.remove('err'));
      }, 3000);
    }
  });

  ['auth-user', 'auth-pass'].forEach(id => {
    document.getElementById(id).addEventListener('input', function () {
      this.classList.remove('err'); errEl.classList.remove('show');
    });
  });

  mapCards().forEach(card => {
    card.addEventListener('click', () => { if (!card.disabled) enterMap(card.dataset.map); });
  });

  logoutBtn.addEventListener('click', () => {
    sessionStorage.removeItem(SK);
    sessionStorage.removeItem('hm_role');
    sessionStorage.removeItem('hm_map');
    currentRole = null; currentMap = null;
    location.reload(); // cleanest full reset of in-memory state
  });
})();
