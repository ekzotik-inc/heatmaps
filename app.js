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

// The HTML shell loads the application before login with an empty, safe shape.
// The real dataset is fetched only after /auth/me or /auth/login succeeds.
let DATA = window.DATA || {
  cities: [],
  cig: { recs: [], stats: {} },
  sticks: { recs: [], stats: {} },
  districts: [],
  field: null,
};

/* Escape user-supplied text before inserting into innerHTML / Leaflet popups
   and tooltips. Layer names and point fields come from uploaded files and free
   text, so they must never be rendered as raw HTML (XSS guard). */
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
  cividis: { 0.10: '#fee838', 0.32: '#bbaf71', 0.55: '#7c7b78', 0.78: '#3c4d6e', 1.0: '#00224e' }, // безопасна при дальтонизме
  inferno: { 0.10: '#fcffa4', 0.32: '#f98e09', 0.55: '#bc3754', 0.78: '#57106e', 1.0: '#000004' },
  magma:   { 0.10: '#fcfdbf', 0.32: '#fc8961', 0.55: '#b73779', 0.78: '#51127c', 1.0: '#000004' },
  plasma:  { 0.10: '#f0f921', 0.32: '#fca636', 0.55: '#e16462', 0.78: '#b12a90', 1.0: '#0d0887' },
  turbo:   { 0.10: '#28bbec', 0.32: '#a4fc3c', 0.55: '#fb7e21', 0.78: '#d23105', 1.0: '#7a0403' },
  teal:    { 0.10: '#e1f5f8', 0.32: '#94dfe8', 0.55: '#12ADC1', 0.78: '#0E96A8', 1.0: '#07485a' }, // фирменная бирюза
  forest:  { 0.10: '#e8f6e3', 0.32: '#a8ddb5', 0.55: '#43a2ca', 0.78: '#0868ac', 1.0: '#084081' },
  rose:    { 0.10: '#fde0dd', 0.32: '#fa9fb5', 0.55: '#dd3497', 0.78: '#7a0177', 1.0: '#49006a' },
  mono:    { 0.10: '#e8ecf2', 0.32: '#b7c0cd', 0.55: '#78879c', 0.78: '#3f4c60', 1.0: '#161d28' }, // нейтральная подложка
  eco:     { 0.10: '#d9f0c4', 0.32: '#a6d96a', 0.55: '#fee08b', 0.78: '#fdae61', 1.0: '#d73027' }, // зелёный → жёлтый → красный (RdYlGn)
};
const RAMP_NAMES = {
  custom:  'Свой цвет',
  warm:    'Классика',
  cool:    'Холодная',
  viridis: 'Viridis',
  cividis: 'Cividis',
  inferno: 'Inferno',
  magma:   'Magma',
  plasma:  'Plasma',
  turbo:   'Turbo',
  teal:    'Бирюза',
  forest:  'Зелёно-синяя',
  rose:    'Розово-пурпурная',
  mono:    'Серая',
  eco:     'Светофор',
};
// Быстрые цвета для «своего цвета» и для слоёв точек: намеренно далеко
// разнесённые оттенки, чтобы включённые слои не сливались друг с другом.
const SWATCHES = [
  '#E63946', '#F4685C', '#FF9F1C', '#F1C40F', '#2DC653', '#14B87D',
  '#12ADC1', '#00B4D8', '#457B9D', '#4C8DFF', '#9B59B6', '#E84393',
  '#8D6E63', '#5B6A82',
];
// Свой градиент из двух цветов: светлый край первого → второй → тёмный край.
function grad2(c1, c2) {
  return { 0.1: mix(c1, W, .7), 0.32: c1, 0.55: mixHex(c1, c2, .5), 0.78: c2, 1.0: darken(c2, .3) };
}
function gradOf(d) {
  if (d.ramp === 'custom2' && d.color2) return grad2(d.color, d.color2);
  return (d.ramp && d.ramp !== 'custom' && HEAT_RAMPS[d.ramp]) ? HEAT_RAMPS[d.ramp] : heatGrad(d.color);
}
// Четыре готовых набора в окне выбора цвета. Остальные палитры остаются
// рабочими для старых слоёв, но в выбор не выносятся — так проще.
const PRESET_RAMPS = [
  { id: 'warm',    name: 'Тёплый' },
  { id: 'cool',    name: 'Холодный' },
  { id: 'viridis', name: 'Изумрудный' },
  { id: 'rose',    name: 'Пурпурный' },
  { id: 'eco',     name: 'Светофор' },   // зоны «как на погодной карте»
];
// Цвет приходит из сохранённого состояния и попадает в SVG/стили — только hex.
function safeColor(c, fallback = '#12ADC1') {
  return typeof c === 'string' && /^#[0-9a-f]{3,8}$/i.test(c) ? c : fallback;
}

/* Метки на карте: форма + значок, из Map Icons (marker-icons.js, MIT / SIL OFL).
   Форма и значок выбираются у слоя отдельно; цвет — цвет или градиент слоя. */
const HM_MARKERS = window.HM_MARKERS || { shapes: [], icons: [] };
const MARKER_SHAPES = HM_MARKERS.shapes;
const MARKER_SHAPE_MAP = Object.fromEntries(MARKER_SHAPES.map(sh => [sh.id, sh]));
const PIN_ICONS = HM_MARKERS.icons;
const PIN_ICON_MAP = Object.fromEntries(PIN_ICONS.map(i => [i.id, i]));
const DEFAULT_PIN_ICON = 'store';
const DEFAULT_SHAPE = 'map-pin';
// Значки прежнего набора (Lucide) → ближайшие из Map Icons, чтобы сохранённые
// слои не потеряли выбор.
const LEGACY_ICON = {
  'shopping-cart': 'grocery-or-supermarket', 'shopping-bag': 'department-store', coffee: 'cafe',
  utensils: 'restaurant', fuel: 'gas-station', house: 'lodging', 'circle-dot': 'none', 'map-pin': 'none', circle: 'none',
};
// Формы прежних наборов → ближайшая классическая.
const LEGACY_SHAPE = {
  square: 'square-rounded', 'square-pin': 'square-rounded', diamond: 'square-rounded', hex: 'square-rounded',
  ring: 'circle', beacon: 'circle', triangle: 'map-pin', shield: 'map-pin', route: 'map-pin', teardrop: 'map-pin', pin: 'map-pin',
};
function markerIcon(id) {
  if (id === 'none') return 'none';
  return PIN_ICON_MAP[id] ? id : (LEGACY_ICON[id] || DEFAULT_PIN_ICON);
}
function markerShape(id) { return MARKER_SHAPE_MAP[id] ? id : (LEGACY_SHAPE[id] || DEFAULT_SHAPE); }
// CSS-градиент палитры — используется в чипах выбора, превью и легенде.
function rampCss(grad, from = 'transparent') {
  const stops = Object.keys(grad).map(Number).sort((a, b) => a - b)
    .map(s => `${grad[s]} ${Math.round(s * 100)}%`).join(', ');
  return `linear-gradient(90deg, ${from} 0%, ${stops})`;
}
// Цвет-представитель палитры (для точки в заголовке карточки и легенды).
function layerKeyColor(d) {
  const g = gradOf(d);
  return g[0.78] || g[1.0] || d.color;
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
// no points of ours loaded yet). Show a dash instead of «1000000000000 км».
function fmtD(m) {
  if (m == null || !isFinite(m)) return '—';
  return m >= 1000 ? (m / 1000).toFixed(1) + ' км' : Math.round(m) + ' м';
}

/* ── SPATIAL INDEX (nearest-point lookups) ────────────────────────────────
   Hydrating a saved map needs the nearest of our points for every heat record.
   The old degree-grid fell back to a full scan whenever a record was far from
   our network, which turned 64k records into millions of Haversine calls. A
   VP-tree uses Haversine itself as the metric: triangle-inequality pruning keeps
   the nearest result exact while making sparse, far-away records inexpensive. */
function buildVpTree(points) {
  if (!points.length) return null;
  const point = points[points.length - 1];
  if (points.length === 1) return { point, radius: 0, inner: null, outer: null };
  const ranked = points.slice(0, -1)
    .map(p => ({ point: p, dist: hav(point.lat, point.lon, p.lat, p.lon) }))
    .sort((a, b) => a.dist - b.dist);
  const mid = Math.floor(ranked.length / 2);
  return {
    point,
    radius: ranked[mid].dist,
    inner: buildVpTree(ranked.slice(0, mid + 1).map(x => x.point)),
    outer: buildVpTree(ranked.slice(mid + 1).map(x => x.point)),
  };
}
function buildPtIndex(pts) {
  const arr = [];
  for (const p of pts) {
    const la = Array.isArray(p) ? p[0] : p.lat, lo = Array.isArray(p) ? p[1] : p.lon;
    if (isFinite(la) && isFinite(lo)) arr.push({ lat: la, lon: lo, ref: p });
  }
  return { arr, tree: buildVpTree(arr) };
}
function nearestPt(ix, lat, lon) {
  if (!ix.arr.length) return null;
  let best = Infinity, bestRef = null;
  const visit = node => {
    if (!node) return;
    const dist = hav(lat, lon, node.point.lat, node.point.lon);
    if (dist < best) { best = dist; bestRef = node.point.ref; }
    // Visit the more promising half first, then only the other half when the
    // current best-radius circle can still intersect it. This is exact for the
    // Haversine metric and avoids a distance scan through every own point.
    if (dist < node.radius) {
      if (dist - best <= node.radius) visit(node.inner);
      if (dist + best >= node.radius) visit(node.outer);
    } else {
      if (dist + best >= node.radius) visit(node.outer);
      if (dist - best <= node.radius) visit(node.inner);
    }
  };
  visit(ix.tree);
  return bestRef ? { dist: best, ref: bestRef } : null;
}

/* ── DATA SETUP ──────────────────────────────────────────────────────── */
/* НАШИ ТОЧКИ — это все слои вкладки «Точки» (`customPtLayers`). Отдельного
   зашитого в базу набора IQOS BR/SE больше нет: пользователь загружает свои
   слои сам, и всё, что там лежит, считается нашей сетью. От этих точек
   считаются: покрытие в рекомендациях (`nd`), расстояния в адресной программе
   и метрика «Курильщиков на 1 нашу точку».
   Видимость слоя на карте на расчёты НЕ влияет — скрытый слой всё равно наш. */
function ourPts() {
  const out = [];
  customPtLayers.forEach(l => { for (const r of l.recs) out.push(r); });
  return out;
}

/* Сколько наших точек в выбранном городе. У слоёв точек нет колонки города,
   поэтому определяем по ближайшему центру и только в пределах 60 км — иначе
   точки другого региона приписались бы городу. */
function ourPtsInCity(c) {
  if (!c || !CC[c]) return 0;
  let n = 0;
  for (const r of ourPts()) {
    if (cityOf(r.lat, r.lon) === c && hav(r.lat, r.lon, CC[c][0], CC[c][1]) < 60000) n++;
  }
  return n;
}

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

// Uploaded point layers have no city column, so use the same nearest-centre
// rule as the city summary and keep a 60 km guard against cross-city bleed.
function pointInCity(r, c) {
  if (!c || !CC[c] || !r) return !c;
  return cityOf(r.lat, r.lon) === c && hav(r.lat, r.lon, CC[c][0], CC[c][1]) < 60000;
}

/* ── ОХВАТ ГОРОДА: город или город + область ─────────────────────────────
   Правило «ближайший центр» относит к городу и его окрестности. Для режима
   «только город» берём НАСТОЯЩИЕ границы, а не радиус:
   - Ташкент — объединение полигонов районов из `/data` (те же, что рисует
     кнопка «Районы»);
   - Самарканд, Андижан, Коканд, Фергана, Бухара — административные границы
     из OpenStreetMap, файл `city-bounds.js` (`window.HM_CITY_BOUNDS`).
   Режим один на все выбранные города, у которых граница есть; остальные
   выбранные города фильтруются как раньше. */
const TSHK = 'Ташкент';
let cityScope = 'region';   // 'region' — город + область; 'city' — только город

let _tshkRings = null;
function tashkentRings() {
  if (_tshkRings) return _tshkRings;
  const out = [];
  (DATA.districts || []).forEach(f => {
    (f.mp || []).forEach(poly => {
      const ring = poly && poly[0];           // внешнее кольцо, координаты [lon, lat]
      if (!Array.isArray(ring) || ring.length < 4) return;
      let minLat = 90, maxLat = -90, minLon = 180, maxLon = -180;
      for (const c of ring) {
        const lon = +c[0], lat = +c[1];
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
        if (lon < minLon) minLon = lon;
        if (lon > maxLon) maxLon = lon;
      }
      out.push({ ring, minLat, maxLat, minLon, maxLon });
    });
  });
  // Кэшируем только непустой результат: районы приезжают с `/data` позже, и
  // пустой кэш навсегда отключил бы режим «только город».
  if (out.length) _tshkRings = out;
  return out;
}
function pointInRing(lat, lon, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = +ring[i][0], yi = +ring[i][1], xj = +ring[j][0], yj = +ring[j][1];
    if (((yi > lat) !== (yj > lat)) && (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}
// Кэш по координатам: тепловой слой может содержать десятки тысяч точек, а
// фильтр пересчитывается на каждый рендер. Ключ — округлённые координаты, так
// результат переиспользуется и между слоями. Записи точек не засоряем.
function ringWithBox(ring) {
  let minLat = 90, maxLat = -90, minLon = 180, maxLon = -180;
  for (const c of ring) {
    const lon = +c[0], lat = +c[1];
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
  }
  return { ring, minLat, maxLat, minLon, maxLon };
}
const _cityRings = new Map();
function cityRings(c) {
  if (COUNTRY !== 'uz') return [];
  if (c === TSHK) return tashkentRings();
  if (_cityRings.has(c)) return _cityRings.get(c);
  const src = (window.HM_CITY_BOUNDS || {})[c];
  const out = Array.isArray(src) ? src.filter(r => Array.isArray(r) && r.length >= 4).map(ringWithBox) : [];
  _cityRings.set(c, out);
  return out;
}
function cityScopeAvailable(c) { return cityRings(c).length > 0; }
function citiesWithBounds(list) { return (list || []).filter(cityScopeAvailable); }
const _cityProperCache = new Map();
function inCityProper(c, lat, lon) {
  const rings = cityRings(c);
  if (!rings.length) return null;            // границ нет — решает вызывающий
  const key = c + '|' + lat.toFixed(5) + '|' + lon.toFixed(5);
  const hit = _cityProperCache.get(key);
  if (hit !== undefined) return hit;
  let inside = false;
  for (const r of rings) {
    if (lat < r.minLat || lat > r.maxLat || lon < r.minLon || lon > r.maxLon) continue;
    if (pointInRing(lat, lon, r.ring)) { inside = true; break; }
  }
  _cityProperCache.set(key, inside);
  return inside;
}

// Одна проверка принадлежности для ВСЕХ слоёв: у точек тепловых слоёв есть
// готовая метка `fil`, у слоёв точек её нет. Раньше это были два независимых
// пути, и охват Ташкента применился бы только к одному из них.
function cityHolds(r, c) {
  if (cityScope === 'city') {
    const v = inCityProper(c, +r.lat, +r.lon);
    if (v !== null) return v;
  }
  if (r.fil) return r.fil === c;
  return pointInCity(r, c);
}
function recInCities(r) {
  return !hasCityFilter() || allCitiesSelected() || selectedCities.some(c => cityHolds(r, c));
}
// Единая проверка «точка видна при текущем отборе»: города + «Границы».
function recInSelection(r) { return recInCities(r) && boundsHold(r); }
function selectionActive() { return (hasCityFilter() && !allCitiesSelected()) || boundsActive(); }
function selectionKey() {
  return (hasCityFilter() && !allCitiesSelected() ? selectedCities.join('|') : '*') + '#' + boundFilterKey();
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
let heatBoost = 1;           // общая яркость убрана из интерфейса; держим 1 для старых состояний
// Что показывать для включённых тепловых слоёв: пятна плотности и/или метки точек.
let showHeatAll = true;
// Вид тепловых слоёв: 'spots' — пятна leaflet.heat; 'zones' — сглаженные
// пояса плотности (как на погодных картах), цвета — палитра слоя.
let heatStyle = 'spots';
let showPointsAll = false;
let heatBlend = 'multiply';   // multiply makes overlapping layers mix like ink on a light basemap
let heatRadius = 28;

// UI state
// An empty selection means «Все города»; otherwise the array contains the
// explicitly selected city names. This keeps multi-select semantics unambiguous.
let selectedCities = [], covR = 600, topN = 12, recShow = true, recBasis = '';
function hasCityFilter() { return selectedCities.length > 0; }
function allCitiesSelected() {
  return CITIES.length > 0 && selectedCities.length === CITIES.length;
}
function canonicalCities(list) {
  const ordered = CITIES.filter(c => list.includes(c));
  return ordered.length === CITIES.length ? [] : ordered;
}
function selectedPointMatches(r) { return recInSelection(r); }
function cityPlural(n) { return n === 1 ? 'город' : n < 5 ? 'города' : 'городов'; }
function selectedCityLabel() {
  if (!hasCityFilter()) return 'Все города';
  if (selectedCities.length === 1) return selectedCities[0];
  return `${selectedCities.length} ${cityPlural(selectedCities.length)}`;
}

// Address-program state
let addrSrcKeys = []; // ключи слоёв-основ: 'custom_*' и/или '__cpt__<id>' (можно несколько)
let addrRefKeys = [];             // слои-ориентиры: ['__cpt__<id>', …] (можно несколько)
let rtRadius    = 1000;           // distance threshold (m)
let rtRadiusOp  = 'lte';         // lte ≤ | lt < | gte ≥ | gt >
let rtExclRadius = 150;          // exclusion proximity (m)
let rtExclOp    = 'lt';          // exclusion operator
let rtExclKeys  = [];            // layer keys to exclude (shipment mode)

// Custom point layers (user-uploaded marker sets)
let customPtLayers = [];      // [{ id, name, color, visible, recs: [], _group: L.LayerGroup }]
let _cptUploadTarget = null;  // id of layer awaiting file upload

/* Слой с ручным вводом — обычный слой точек (`manual: true`), поэтому у него
   те же инструменты, что у DS/IPSE: цвет, иконка, размер, радиус охвата, соло.
   Отличие только в способе наполнения: точки заводятся по одной через форму и
   несут карточку — ДМС-код, оборудование, продажи, комментарий и до трёх фото.
   Фото в состоянии НЕ хранятся — только идентификаторы; байты лежат на сервере
   (/photo), иначе снимок раздул бы каждое сохранение карты на мегабайты. */
const RETAIL_MAX_PHOTOS = 3;
function manualLayers() { return customPtLayers.filter(l => l.manual); }
// Точка считается «карточной», если в ней есть что показать сверх имени.
function isManualRec(r) {
  return !!(r && (r.dms || r.equip || r.comment || (r.photos && r.photos.length) ||
                  (r.sales != null && r.sales !== '')));
}

/* ── MAP INIT ────────────────────────────────────────────────────────── */
// Карточки точек не должны уходить под фильтр городов сверху карты: при
// открытии карта сдвигается так, чтобы карточка была видна целиком.
L.Popup.mergeOptions({ autoPanPaddingTopLeft: L.point(16, 84), autoPanPaddingBottomRight: L.point(16, 24) });
// maxZoom обязателен: у векторной подложки его нет, и flyToBounds по слою из
// одной точки (рамка нулевого размера) считал зум бесконечным и падал на NaN.
const map = L.map('map', { preferCanvas: true, zoomControl: false, minZoom: 5, maxZoom: 19, zoomSnap: .5 })
              .setView([41, 67], 6);

/* ── ПОДЛОЖКА ────────────────────────────────────────────────────────────
   Октябрь 2026: 2ГИС вывел старый эндпоинт тайлов из эксплуатации и подменяет
   их заглушкой, а поддерживаемый Raster Tiles API требует платный ключ.
   По решению владельца переходим на бесплатную подложку — **OpenFreeMap**
   (векторные тайлы OSM): без ключа, без лимитов, коммерческое использование
   разрешено. Данные планеты пересобираются каждые несколько дней — проверено,
   что по Ташкенту и Бишкеку застройка и дороги на месте, включая новые
   кварталы, где у глобальных растровых провайдеров пусто.

   Если владелец когда-нибудь заведёт ключ 2ГИС и положит его в
   `window._HM_2GIS_KEY`, подложка вернётся к 2ГИС без других правок.
   Если MapLibre не загрузился, падаем на растровые тайлы OSM, чтобы карта
   никогда не осталась пустой. */
const TG_KEY = (window._HM_2GIS_KEY || '').trim();
const OFM_STYLE = 'https://tiles.openfreemap.org/styles/liberty';
const OSM_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · ' +
                 '<a href="https://openfreemap.org">OpenFreeMap</a> · ' +
                 '<a href="https://www.openmaptiles.org/">OpenMapTiles</a>';

function addRasterBasemap() {
  // Запасной путь: растровые тайлы OSM. Используются, только если векторная
  // подложка не поднялась, — чтобы карта никогда не осталась пустой.
  L.tileLayer('https://tile.openstreetmap.de/{z}/{x}/{y}.png',
    { attribution: OSM_ATTR, maxZoom: 18 }).addTo(map);
}

/* Плагин maplibre-gl-leaflet 0.1.4 моргает при зуме. Во время анимации он
   растягивает CSS-трансформом старый кадр подложки, а в конце сбрасывает
   трансформ и только *просит* MapLibre перерисоваться — кадр приходит позже.
   Хуже того, сброс висит и на `transitionend` прокси-элемента, который может
   сработать раньше конца зума Leaflet: тогда подложка на кадр отскакивает к
   старому масштабу и прыгает обратно (поймано покадровой записью).
   Чиним так: позицию контейнера, вид MapLibre и сброс трансформа меняем в
   одной задаче, отрисовывая подложку синхронно (`redraw()`), — браузер
   показывает уже готовый новый кадр. `transitionend` больше не слушаем:
   конец зума ловит `zoomend`. */
function patchGlLayer() {
  const P = L.MaplibreGL && L.MaplibreGL.prototype;
  if (!P || P._hmSync) return;
  P._hmSync = true;
  P._syncGL = function () {
    const m = this._map, gl = this._glMap;
    if (!m || !gl) return;
    const c = m.getCenter();
    gl.jumpTo({ center: [c.lng, c.lat], zoom: m.getZoom() - 1 });
    try { gl.redraw(); } catch (_) { /* стиль ещё грузится — MapLibre дорисует сам */ }
    const topLeft = m.containerPointToLayerPoint([0, 0]).subtract(m.getSize().multiplyBy(this.options.padding));
    L.DomUtil.setPosition(this._container, this._roundPoint(topLeft));
    L.DomUtil.setTransform(gl._actualCanvas, L.point(0, 0), 1);
  };
  P._update = function () {
    if (!this._map) return;
    this._offset = this._map.containerPointToLayerPoint([0, 0]);
    if (this._zooming) return;
    this._syncGL();
  };
  P._pinchZoom = function () {
    if (!this._map) return;
    this._offset = this._map.containerPointToLayerPoint([0, 0]);
    this._syncGL();
  };
  P._zoomEnd = function () { this._zooming = false; this._update(); };
  P._transitionEnd = function () {};
  P._resize = function () {
    if (!this._map || !this._glMap) return;
    this._resizeContainer();
    try { this._glMap.resize(); } catch (_) {}
    this._update();
  };
}

function addBasemap() {
  if (TG_KEY) {
    L.tileLayer('https://tile{s}.maps.2gis.com/v2/tiles/online_hd/{z}/{x}/{y}.png?key=' + encodeURIComponent(TG_KEY),
      { subdomains: '01234', attribution: '&copy; 2ГИС', maxZoom: 18 }).addTo(map);
    return;
  }
  let gl = null;
  if (typeof L.maplibreGL === 'function' && window.maplibregl) {
    try { patchGlLayer(); gl =L.maplibreGL({ style: OFM_STYLE, attribution: OSM_ATTR }).addTo(map); }
    catch (e) { console.warn('MapLibre basemap failed:', e && e.message); gl = null; }
  }
  if (!gl) { addRasterBasemap(); return; }

  // Сторож: нет WebGL, не открылся стиль, не дошёл ни один тайл — через 12 с
  // молча уходим на растр. Пустая карта хуже любой подложки.
  // Смотрим на факты «стиль загрузился» и «пришёл хотя бы один тайл», а не на
  // isStyleLoaded(): тот возвращает false всё время, пока догружаются тайлы,
  // и сторож выкидывал живую подложку, если на 12-й секунде пользователь зумил.
  let styleOk = false, tileOk = false;
  const m = gl._glMap;
  if (m && typeof m.on === 'function') {
    m.once('style.load', () => { styleOk = true; });
    m.on('sourcedata', function onTile(e) {
      if (e && e.tile) { tileOk = true; m.off('sourcedata', onTile); }
    });
  }
  setTimeout(() => {
    if (styleOk && tileOk) return;
    console.warn('Vector basemap did not render — switching to raster tiles');
    try { map.removeLayer(gl); } catch (_) {}
    addRasterBasemap();
  }, 12000);
}
addBasemap();

map.createPane('districts'); map.getPane('districts').style.zIndex = 460;
map.createPane('income');    map.getPane('income').style.zIndex = 445;
map.getPane('income').style.pointerEvents = 'none';
map.createPane('ptradius');  map.getPane('ptradius').style.zIndex = 448; // coverage circles under markers
map.createPane('tags');      map.getPane('tags').style.zIndex = 470;     // тачпоинты тепловых слоёв, под маркерами точек

const distRenderer  = L.svg({ pane: 'districts' });
const radiusRenderer = L.svg({ pane: 'ptradius' });
const districtGroup = L.layerGroup().addTo(map);
const coresGroup    = L.layerGroup().addTo(map);
const recLayer      = L.layerGroup().addTo(map);
const addrLayer     = L.layerGroup().addTo(map); // address-program preview markers
const cptRoot       = L.layerGroup().addTo(map); // parent for ALL custom-point layer groups
const tagRoot       = L.layerGroup().addTo(map); // «Ярлыки»: тачпоинты тепловых слоёв
const tagRenderer   = L.canvas({ pane: 'tags', padding: .3 });

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

/* ── ГРАНИЦЫ: районы города и свои зоны ──────────────────────────────────
   Вкладка «Границы» в нижней навигации (после «Точек»). Два вида слоёв:
   - «Районы города» — полигоны районов Ташкента из `/data` (districtsOn);
   - свои границы — слои владельца, в каждом одна или несколько зон,
     нарисованных на карте или загруженных из GeoJSON.
   Клик по зоне на карте выбирает её (можно несколько) — у выбранной светится
   контур её же цвета. Включён «Отбор точек» — все слои показывают только
   точки внутри выбранных зон (или только снаружи). Отбор встроен в
   recInSelection(), поэтому действует везде, где действует фильтр городов.
   Геометрия зоны — как у районов: мультиполигон [полигон][кольцо][lon, lat]. */
let distOpacity = .16;                   // яркость заливки границ, 0.04–0.6
let boundLayers = [];                    // свои границы
let boundSel = [];                       // ключи выбранных зон: 'city:<район>' / '<слой>:<зона>'
let boundFilter = { on: true, mode: 'in' };
let _bzNew = '';                         // только что выбранная зона — контур прорисовывается
const BZ_MAX_VERTICES = 20000;           // ≈400 КБ: состояние уходит целиком на каждое сохранение
const DIST_TIER_NAME = { high: 'Высокий доход', mid: 'Средний доход', low: 'Ниже / растущий' };

// Районы — ташкентские: на картах других стран их не показываем.
function cityDistricts() { return COUNTRY === 'uz' ? (DATA.districts || []).filter(f => f && f.ru && Array.isArray(f.mp)) : []; }
function boundColor(c) { return typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c) ? c : '#12ADC1'; }
function mpBoxes(mp) {
  return mp.map(poly => ({ poly, ...ringWithBox(poly[0] || []) }))
           .filter(p => Array.isArray(p.ring) && p.ring.length >= 4);
}
// Все зоны включённых слоёв в порядке отрисовки: сверху — последние.
let _bzZones = null;
function boundZones() {
  if (_bzZones) return _bzZones;
  const out = [];
  if (districtsOn) cityDistricts().forEach(f => out.push({
    key: 'city:' + f.ru, name: f.ru, sub: DIST_TIER_NAME[f.tier] || '', color: incCol[f.tier] || '#12ADC1', mp: f.mp,
  }));
  boundLayers.forEach(l => {
    if (!l.visible) return;
    l.zones.forEach(z => out.push({ key: l.id + ':' + z.id, name: z.name, sub: l.name, color: boundColor(l.color), mp: z.mp }));
  });
  out.forEach(z => { z.boxes = mpBoxes(z.mp); });
  return (_bzZones = out);
}
function zoneHas(z, lat, lon) {
  for (const b of z.boxes) {
    if (lat < b.minLat || lat > b.maxLat || lon < b.minLon || lon > b.maxLon) continue;
    if (!pointInRing(lat, lon, b.ring)) continue;
    // Дырки (внутренние кольца) — не зона.
    if (!b.poly.slice(1).some(h => pointInRing(lat, lon, h))) return true;
  }
  return false;
}
function zoneAt(lat, lon) {
  const zs = boundZones();
  for (let i = zs.length - 1; i >= 0; i--) if (zoneHas(zs[i], lat, lon)) return zs[i];
  return null;
}
// Площадь зоны на сфере, м²: внешние кольца минус дырки. Формула та же, что
// у Leaflet.draw (geodesicArea); для районов города расхождение с
// проекционной площадью — доли процента.
const _zoneArea = new WeakMap();
function ringArea(ring) {
  const R = 6378137, d2r = Math.PI / 180;
  let a = 0;
  for (let i = 0, n = ring.length; i < n; i++) {
    const p1 = ring[i], p2 = ring[(i + 1) % n];
    a += (p2[0] - p1[0]) * d2r * (2 + Math.sin(p1[1] * d2r) + Math.sin(p2[1] * d2r));
  }
  return Math.abs(a * R * R / 2);
}
function zoneArea(mp) {
  if (_zoneArea.has(mp)) return _zoneArea.get(mp);
  let a = 0;
  mp.forEach(poly => poly.forEach((ring, i) => { a += (i ? -1 : 1) * ringArea(ring); }));
  a = Math.max(0, a);
  _zoneArea.set(mp, a);
  return a;
}
function fmtArea(m2) {
  const km = m2 / 1e6;
  if (km < 0.01) return Math.round(m2).toLocaleString('ru-RU') + ' м²';
  const digits = km < 1 ? 2 : km < 100 ? 1 : 0;
  return km.toLocaleString('ru-RU', { minimumFractionDigits: digits, maximumFractionDigits: digits }) + ' км²';
}
// Выбранные зоны, которые сейчас на карте: скрытый слой отбор не держит.
// boundsHold() зовёт это на каждую точку — список кэшируется до bzInvalidate().
let _bzActive = null;
function activeBoundZones() {
  if (_bzActive) return _bzActive;
  const sel = new Set(boundSel);
  return (_bzActive = boundZones().filter(z => sel.has(z.key)));
}
function boundsActive() { return !!boundFilter.on && activeBoundZones().length > 0; }
function boundFilterKey() {
  return boundsActive() ? boundFilter.mode + ':' + activeBoundZones().map(z => z.key).join(',') : '';
}
const _bhCache = new Map();
function bzInvalidate() { _bzZones = null; _bzActive = null; _bhCache.clear(); }
function boundsHold(r) {
  if (!boundsActive()) return true;
  const lat = +r.lat, lon = +r.lon;
  const key = lat.toFixed(5) + '|' + lon.toFixed(5);
  let inside = _bhCache.get(key);
  if (inside === undefined) {
    inside = activeBoundZones().some(z => zoneHas(z, lat, lon));
    _bhCache.set(key, inside);
  }
  return boundFilter.mode === 'out' ? !inside : inside;
}

function renderDistricts() {
  districtGroup.clearLayers();
  const zones = boundZones();
  if (!zones.length) return;
  const sel = new Set(boundSel);
  const anySel = zones.some(z => sel.has(z.key));
  const op = Math.min(.6, Math.max(.04, +distOpacity || .16));
  const edgeOp = Math.min(1, .45 + op * 1.6);
  const picked = [];
  zones.forEach(z => {
    const on = sel.has(z.key);
    if (on) picked.push(z);
    try {
      L.polygon(llswap(z.mp), {
        renderer: distRenderer, color: darken(z.color, .2), weight: on ? 1.5 : 2,
        fillColor: z.color, opacity: anySel && !on ? edgeOp * .6 : edgeOp,
        // Выбор подсвечивает зону, остальные чуть уходят в тень.
        fillOpacity: on ? Math.min(.7, op + .1) : anySel ? op * .6 : op,
      }).bindTooltip(`<b style="font-weight:700">${esc(z.name)}</b>${z.sub ? '<br>' + esc(z.sub) : ''}<br><span class="tt-hint">${on ? 'Клик — снять выбор' : 'Клик — выбрать'}</span>`,
                     { className: 'tt', sticky: true })
       .addTo(districtGroup);
    } catch (e) { console.warn('Boundary render error:', e); }
  });
  // Контур выбранных — поверх всех: свечение цвета зоны, яркая линия и
  // тонкий светлый блик по центру, как неоновая трубка.
  picked.forEach(z => {
    const ll = llswap(z.mp);
    L.polygon(ll, { renderer: distRenderer, fill: false, color: z.color, weight: 9, opacity: .9, interactive: false, className: 'bz-glow' }).addTo(districtGroup);
    const edge = L.polygon(ll, { renderer: distRenderer, fill: false, color: z.color, weight: 3.5, opacity: 1, interactive: false, className: 'bz-edge' + (z.key === _bzNew ? ' bz-new' : '') }).addTo(districtGroup);
    L.polygon(ll, { renderer: distRenderer, fill: false, color: '#ffffff', weight: 1, opacity: .85, interactive: false, className: 'bz-core' }).addTo(districtGroup);
    // pathLength=1 — прорисовка контура одной анимацией независимо от длины.
    const el = edge.getElement(); if (el) el.setAttribute('pathLength', '1');
  });
}
function llswap(mp) { return mp.map(poly => poly.map(ring => ring.map(c => [c[1], c[0]]))); }

// Любая правка видимости, выбора или режима отбора — пересчёт всех слоёв.
function boundsChanged(save = true, rebuildUI = true) {
  bzInvalidate();
  // Удалённые зоны из выбора убираем; скрытые оставляем — включат слой, выбор
  // вернётся. Районы города могут ещё не приехать с `/data` — их не трогаем.
  const dists = cityDistricts();
  const known = new Set([...dists.map(f => 'city:' + f.ru), ...boundLayers.flatMap(l => l.zones.map(z => l.id + ':' + z.id))]);
  boundSel = boundSel.filter(k => known.has(k) || (!dists.length && k.startsWith('city:')));
  _bzActive = null;
  renderDistricts();
  renderHeat(); renderCustomPoints(); renderRecs();
  if (rebuildUI) buildBoundsUI(); else syncBoundsStatus();
  updateLayerLegend();   // блок «районы» в легенде — площади выбранных
  syncBoundsBadge();
  if (save) saveState();
}
// Состояние приходит с сервера/из файла — проверяем форму и числа. Чего нет
// в состоянии — сбрасываем: иначе при смене карты остались бы зоны прошлой.
function cleanMp(mp) {
  if (!Array.isArray(mp)) return null;
  const okRing = r => Array.isArray(r) && r.length >= 4 && r.every(c => Array.isArray(c) && Number.isFinite(+c[0]) && Number.isFinite(+c[1]));
  const out = mp.map(poly => Array.isArray(poly) && okRing(poly[0]) ? poly.filter(okRing).map(r => r.map(c => [+c[0], +c[1]])) : null).filter(Boolean);
  return out.length ? out : null;
}
const bzId = v => String(v == null ? '' : v).replace(/[^\w-]/g, '').slice(0, 40);
function applyBoundsState(st) {
  distOpacity = typeof st.distOpacity === 'number' && Number.isFinite(st.distOpacity) ? Math.min(.6, Math.max(.04, st.distOpacity)) : .16;
  boundLayers = (Array.isArray(st.boundLayers) ? st.boundLayers : []).filter(l => l && bzId(l.id)).map(l => ({
    id: bzId(l.id), name: String(l.name || 'Граница').slice(0, 40), color: boundColor(l.color), visible: l.visible !== false,
    zones: (Array.isArray(l.zones) ? l.zones : [])
      .map(z => z && { id: bzId(z.id), name: String(z.name || 'Зона').slice(0, 60), mp: cleanMp(z.mp) })
      .filter(z => z && z.id && z.mp),
  }));
  boundSel = Array.isArray(st.boundSel) ? st.boundSel.filter(k => typeof k === 'string').slice(0, 500) : [];
  const f = st.boundFilter && typeof st.boundFilter === 'object' ? st.boundFilter : {};
  boundFilter = { on: f.on !== false, mode: f.mode === 'out' ? 'out' : 'in' };
  bzInvalidate();
}
function toggleBoundZone(key) {
  const i = boundSel.indexOf(key);
  if (i >= 0) { boundSel.splice(i, 1); _bzNew = ''; }
  else { boundSel.push(key); _bzNew = key; setTimeout(() => { if (_bzNew === key) _bzNew = ''; }, 1200); }
  boundsChanged();
}

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
                   <div class="pp-row"><span>Ориентиры</span><b style="font-family:Inter;font-weight:500;text-align:right">${z.pl}</b></div>
                   <div class="pp-why">${CX[z.tier]}</div>${yandexLinkHtml(z.lat, z.lon)}`)
       .addTo(coresGroup);
    });
  }
}

/* ── POINT MARKERS ───────────────────────────────────────────────────── */


/* Метка: SVG для DOM-маркеров (слои точек) и canvas для меток тепловых
   слоёв, где точек бывает больше тысячи. Привязка — нижняя точка формы. */
const _pinSvgCache = new Map();
let _pinGradSeq = 0;
function glyphMarkup(icId, cx, cy, is, color) {
  const ic = PIN_ICON_MAP[icId];
  if (!ic) return '';
  const x = (cx - is / 2).toFixed(2), y = (cy - is / 2).toFixed(2);
  return ic.stroke
    ? `<path d="${ic.d}" transform="translate(${x} ${y}) scale(${(is / 24).toFixed(4)})" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>`
    : `<path d="${ic.d}" transform="translate(${x} ${y}) scale(${(is / 50).toFixed(4)})" fill="${color}"/>`;
}
// Значок отдельно — для сетки выбора.
function glyphSvg(icId, size) {
  const ic = PIN_ICON_MAP[icId];
  if (!ic) return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19 19 5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
  return ic.stroke
    ? `<svg width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true"><path d="${ic.d}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`
    : `<svg width="${size}" height="${size}" viewBox="0 0 50 50" aria-hidden="true"><path d="${ic.d}" fill="currentColor"/></svg>`;
}
function pinSvg(iconId, color, color2, size, shapeId) {
  color = safeColor(color); color2 = color2 ? safeColor(color2, '') : '';
  const sh = MARKER_SHAPE_MAP[markerShape(shapeId)];
  const icId = markerIcon(iconId);
  const key = [icId, sh ? sh.id : '', color, color2, size].join('|');
  if (_pinSvgCache.has(key)) return _pinSvgCache.get(key);
  if (!sh) return { html: '', w: size, h: size, anchor: [size / 2, size] };
  const gid = color2 ? 'pg' + (++_pinGradSeq) : '';
  const defs = color2 ? `<defs><linearGradient id="${gid}" gradientUnits="userSpaceOnUse" x1="0" y1="-48" x2="0" y2="0"><stop offset="0" stop-color="${color}"/><stop offset="1" stop-color="${color2}"/></linearGradient></defs>` : '';
  const html = `<svg class="pin2" width="${size}" height="${size}" viewBox="-25 -49 50 50" aria-hidden="true">${defs}` +
    `<path d="${sh.d}" fill="${color2 ? `url(#${gid})` : color}" stroke="#fff" stroke-width="2.2" stroke-linejoin="round"/>` +
    glyphMarkup(icId, 0, sh.cy, sh.is, '#fff') + `</svg>`;
  // Капля привязана нижней точкой, круг/квадрат/звезда — центром (ay = -24).
  const out = { html, w: size, h: size, anchor: [size / 2, Math.round(size * (49 + (sh.ay || 0)) / 50)] };
  _pinSvgCache.set(key, out);
  return out;
}

/* ── HEAT LAYERS ─────────────────────────────────────────────────────── */
function applyHeatCanvas(d) {
  const canvas = d._leaf && d._leaf._canvas;
  if (!canvas) return;
  canvas.style.pointerEvents = 'none'; // prevent canvas from blocking tooltips on markers/polygons below
  canvas.style.mixBlendMode = heatBlend === 'normal' ? '' : heatBlend;
  canvas.style.display = showHeatAll ? '' : 'none';
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
    d._heatMaxCache ||= new Map();
    const key = `${d._heatRenderKey || ''}|${map.getZoom()}|${heatRadius}|${d._pts.length}`;
    let heatMax = d._heatMaxCache.get(key);
    if (heatMax == null) {
      heatMax = heatCellMax(d._pts, map.getZoom());
      d._heatMaxCache.set(key, heatMax);
    }
    d._leaf.setOptions({ max: heatMax });
    requestAnimationFrame(() => applyHeatCanvas(d));
  });
}

function renderHeat() {
  let total = 0;
  let needsUiRefresh = false;
  const selKey = selectionKey();
  heatKeys.forEach(k => {
    const d = DS[k];
    if (!d) return;
    const sourceRef = d.recs;
    if (d._heatMaxCacheSource !== sourceRef) {
      d._heatMaxCache = new Map();
      d._heatMaxCacheSource = sourceRef;
    }
    const renderKey = [selKey, d.intensity || 1, heatRadius, d.ramp || '', d.color || '', d.opacity == null ? 1 : d.opacity, heatStyle].join('|');
    const legendKey = [d.name || '', d.color || '', d.visible ? 1 : 0, d.recs.length].join('|');
    if (d._legendKey !== legendKey) {
      d._legendKey = legendKey;
      needsUiRefresh = true;
    }
    const cached = d._heatCache;
    const layerAlive = d._leaf && map.hasLayer(d._leaf);
    if (!d.visible) {
      if (d._leaf) { map.removeLayer(d._leaf); d._leaf = null; needsUiRefresh = true; }
      d._heatCache = null;
      d._zone = null;
      d._shownCount = 0;
      return;
    }
    // В режиме «Зоны» пятен leaflet.heat нет — живым считается слой с зоной.
    const alive = heatStyle === 'zones' ? !!d._zone : layerAlive;
    // Reuse the existing Leaflet heat layer when neither the source records nor
    // the visual/filter inputs changed. This is the hot path for all-cities
    // selection and avoids rebuilding canvases during repeated UI updates.
    if (cached && cached.sourceRef === sourceRef && cached.key === renderKey && alive) {
      total += cached.count;
      d._shownCount = cached.count;
      return;
    }
    needsUiRefresh = true;
    const fullSelection = !selectionActive();
    const recs = fullSelection ? d.recs : d.recs.filter(recInSelection);
    let scale;
    if (fullSelection && d.stats && d.stats.p90) {
      // Full-layer p90 is already available from the server/local stats; avoid
      // sorting thousands of volumes again on the all-cities hot path.
      scale = Math.max(d.stats.p90, 0.01);
    } else {
      const sorted = recs.map(r => r.vol).sort((a, b) => a - b);
      const p90idx = Math.max(0, Math.floor(sorted.length * 0.9) - 1);
      scale = Math.max(sorted.length ? (sorted[p90idx] || 0.01) : (d.stats.p90 || 0.01), 0.01);
    }
    const boost = Math.max(d.intensity || 1, 0.1);
    // Auto per-layer normalisation: each layer is scaled to its own p90 so the
    // absolute magnitude of `value` doesn't matter — a layer of tiny values
    // looks as strong as one of huge values. A gamma lift + floor keep the
    // faintest points visible instead of washing out to nothing.
    let pts;
    const fullPtsCache = fullSelection && d._fullPtsCache;
    if (fullPtsCache && fullPtsCache.sourceRef === sourceRef && fullPtsCache.scale === scale && fullPtsCache.boost === boost) {
      pts = fullPtsCache.pts;
    } else {
      pts = recs.map(r => {
        const t = Math.min(r.vol / scale, 1);
        const g = Math.pow(t, 0.55);
        return [r.lat, r.lon, Math.min(Math.max(g, 0.18) * boost, 1)];
      });
      if (fullSelection) d._fullPtsCache = { sourceRef, scale, boost, pts };
    }
    total += recs.length;
    d._shownCount = recs.length;   // ровно столько нарисовано — это же число в легенде
    d._pts = pts;
    if (heatStyle === 'zones') {
      if (d._leaf) { map.removeLayer(d._leaf); d._leaf = null; }
      d._zone = { recs, pts };
      d._heatCache = { sourceRef, key: renderKey, count: recs.length };
      return;
    }
    d._zone = null;
    // Sparse layers get a wider brush so isolated points read as heat, not specks.
    const rMul = Math.min(Math.max(Math.pow(600 / Math.max(recs.length, 1), 0.18), 1), 1.6);
    const rad = Math.round(heatRadius * rMul);
    d._heatRenderKey = renderKey;
    const maxKey = `${renderKey}|${map.getZoom()}|${heatRadius}|${pts.length}`;
    d._heatMaxCache ||= new Map();
    let heatMax = d._heatMaxCache.get(maxKey);
    if (heatMax == null) {
      heatMax = heatCellMax(pts, map.getZoom());
      d._heatMaxCache.set(maxKey, heatMax);
    }
    const options = {
      radius: rad, blur: Math.round(rad * .8), minOpacity: .22,
      max: heatMax, gradient: gradOf(d),
    };
    if (d._leaf && map.hasLayer(d._leaf) && typeof d._leaf.setLatLngs === 'function') {
      d._leaf.setOptions(options);
      d._leaf.setLatLngs(pts);
    } else {
      d._leaf = L.heatLayer(pts, options).addTo(map);
    }
    d._heatCache = { sourceRef, key: renderKey, count: recs.length };
    requestAnimationFrame(() => applyHeatCanvas(d));
  });
  updateCountBadge();
  if (needsUiRefresh) updateLayerLegend();
  renderTags(); // ярлыки следуют за видимостью слоёв и фильтром городов
  scheduleZones();
}

/* ── ЗОНЫ ПЛОТНОСТИ ──────────────────────────────────────────────────────
   Вместо пятен — сглаженные вложенные пояса, как на погодных картах: по
   точкам слоя строится плотность (ядро Гаусса, d3-contour), и она режется
   на 6 уровней. Нижний — широкий бледный край, верхний — яркое ядро; цвета
   берутся из палитры слоя (готовые наборы или свой цвет/градиент).
   Работает для тепловых слоёв (режим «Зоны» в «Размере пятна») и для любого
   слоя точек (переключатель «Зона плотности» в настройках слоя).
   Размер зоны задаётся в метрах (ползунок «Размер пятна» × 30 м), поэтому
   форма не «рассыпается» при зуме; пороги — от максимума плотности всего
   слоя, поэтому цвета не прыгают при сдвиге карты. Рисуется SVG поверх
   области карты с запасом: при зуме Leaflet масштабирует его сам, после —
   перестраиваем. */
map.createPane('zones'); map.getPane('zones').style.zIndex = 430;
map.getPane('zones').style.pointerEvents = 'none';
const zoneRoot = L.layerGroup().addTo(map);
const ZONE_BANDS = 6, ZONE_M_PER_PX = 30;
let _contourLibP = null;
function ensureContourLib() {
  if (window.d3 && window.d3.contourDensity) return Promise.resolve();
  if (_contourLibP) return _contourLibP;
  const load = src => new Promise((res, rej) => {
    const sc = document.createElement('script');
    sc.src = src; sc.onload = res; sc.onerror = () => rej(new Error('load failed: ' + src));
    document.head.appendChild(sc);
  });
  _contourLibP = load('https://cdn.jsdelivr.net/npm/d3-array@3.2.4/dist/d3-array.min.js')
    .then(() => load('https://cdn.jsdelivr.net/npm/d3-contour@4.0.2/dist/d3-contour.min.js'))
    .catch(e => { _contourLibP = null; throw e; });
  return _contourLibP;
}
// Цвет палитры в точке t ∈ [0,1] — линейно между опорными цветами.
function sampleGrad(g, t) {
  const stops = Object.keys(g).map(Number).sort((a, b) => a - b);
  if (t <= stops[0]) return g[stops[0]];
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i]) return mixHex(g[stops[i - 1]], g[stops[i]], (t - stops[i - 1]) / (stops[i] - stops[i - 1]));
  }
  return g[stops[stops.length - 1]];
}
function layerZoneGrad(l) {
  if (l.ramp && HEAT_RAMPS[l.ramp]) return HEAT_RAMPS[l.ramp];
  return l.color2 ? grad2(safeColor(l.color), safeColor(l.color2)) : heatGrad(safeColor(l.color));
}
function zoneSources() {
  const out = [];
  if (heatStyle === 'zones' && showHeatAll) {
    heatKeys.forEach(k => {
      const d = DS[k];
      if (!d || !d.visible || !d._zone || !d._zone.pts.length) return;
      out.push({ key: 'h:' + k, name: d.name, pts: d._zone.pts, grad: gradOf(d), opacity: d.opacity == null ? 1 : d.opacity, blend: true, boost: d.intensity || 1 });
    });
  }
  customPtLayers.forEach(l => {
    if (!l.visible || !l.density || !(l._shownRecs || []).length) return;
    out.push({ key: 'p:' + l.id, name: l.name, pts: l._shownRecs.map(r => [r.lat, r.lon, 1]), grad: layerZoneGrad(l), opacity: 1, blend: false, boost: 1 });
  });
  return out;
}
// Максимум плотности слоя в «точках под ядром» — по всему слою, а не по
// видимой части: иначе пороги и цвета менялись бы при каждом сдвиге карты.
// Ячейки размером с ядро, пик ≈ ячейка + 0.61 × соседи по стороне + 0.37 × углы.
const _zoneMax = new Map();
function zoneLayerMax(src, sigmaM) {
  const key = src.key + '|' + Math.round(sigmaM);
  const hit = _zoneMax.get(key);
  if (hit && hit.pts === src.pts) return hit.max;
  const cell = sigmaM / 111320, bins = new Map();
  src.pts.forEach(p => {
    const k = Math.floor(p[0] / cell) + ':' + Math.floor(p[1] / (cell / Math.max(.2, Math.cos(p[0] * Math.PI / 180))));
    bins.set(k, (bins.get(k) || 0) + p[2]);
  });
  let max = 0;
  bins.forEach((v, k) => {
    const [a, b] = k.split(':').map(Number);
    let s = v;
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      if (!i && !j) continue;
      const n = bins.get((a + i) + ':' + (b + j));
      if (n) s += n * (i && j ? .37 : .61);
    }
    if (s > max) max = s;
  });
  _zoneMax.set(key, { pts: src.pts, max });
  return max;
}
// Пороги от 7 % до 85 % максимума слоя, гуще к краю: внешний пояс очерчивает
// всю область присутствия, внутренние — ядра. Ниже ~0.3 «точки под ядром»
// не опускаемся: иначе одиночная точка рисует огромный бледный круг.
function zoneThresholds(maxD) {
  const hi = Math.max(.85 * maxD, .3), lo = Math.max(.3, .07 * maxD);
  if (hi / lo < 1.6) return [lo];
  return Array.from({ length: ZONE_BANDS }, (_, i) => lo + (hi - lo) * Math.pow(i / (ZONE_BANDS - 1), 1.35));
}
function ringsToPath(coords) {
  let d = '';
  coords.forEach(poly => poly.forEach(ring => {
    ring.forEach((c, i) => { d += (i ? 'L' : 'M') + c[0].toFixed(1) + ' ' + c[1].toFixed(1); });
    d += 'Z';
  }));
  return d;
}
let _zoneRaf = 0, _zoneToken = 0;
function scheduleZones() {
  if (_zoneRaf) return;
  _zoneRaf = requestAnimationFrame(() => { _zoneRaf = 0; renderZones(); });
}
/* Шкала интенсивности под каждый слой с зонами (как на погодной карте):
   «Мало» — «Много», полоса в цветах поясов, под ней ⓘ и название слоя.
   Подписи окрашены краями палитры, но затемнены до контраста ≥ 4.5:1. */
function relLum(hex) {
  const c = h2r(hex), f = v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); };
  return .2126 * f(c.r) + .7152 * f(c.g) + .0722 * f(c.b);
}
function readableOnWhite(hex) {
  let c = hex;
  for (let i = 0; i < 12 && 1.05 / (relLum(c) + .05) < 4.5; i++) c = darken(c, .12);
  return c;
}
function zoneScaleBar(g) {
  const stops = [0, .2, .4, .6, .8, 1].map(t => `${sampleGrad(g, .22 + .78 * t)} ${Math.round(t * 100)}%`);
  return `linear-gradient(90deg, ${stops.join(', ')})`;
}
let _zoneScaleSig = '';
function renderZoneScales(sources) {
  const box = document.getElementById('zone-scales');
  if (!box) return;
  const sig = sources.map(s => s.key + ':' + s.name + ':' + JSON.stringify(s.grad)).join('|');
  if (sig === _zoneScaleSig) return;
  _zoneScaleSig = sig;
  box.hidden = !sources.length;
  box.innerHTML = sources.map(s => `
    <div class="zs">
      <div class="zs-ends"><span style="color:${readableOnWhite(sampleGrad(s.grad, .3))}">Мало</span><span style="color:${readableOnWhite(sampleGrad(s.grad, 1))}">Много</span></div>
      <i class="zs-bar" style="background:${zoneScaleBar(s.grad)}"></i>
      <div class="zs-name"><span class="tip-icon" data-tip="Плотность точек слоя: от бледного края зоны к яркому ядру. «Много» — самые плотные места слоя, «Мало» — край, где точки ещё есть.">ⓘ</span><span class="zs-t" title="${esc(s.name)}">${esc(s.name)}</span></div>
    </div>`).join('');
  wireTips(box);
  syncZoneScalesPos();
}
// Шкалы стоят над легендой: её высота меняется — следим.
function syncZoneScalesPos() {
  const lg = document.getElementById('layer-legend');
  const h = lg && lg.style.display !== 'none' ? lg.offsetHeight : 0;
  document.documentElement.style.setProperty('--legend-h', h + 'px');
}
if (window.ResizeObserver) {
  const lg = document.getElementById('layer-legend');
  if (lg) new ResizeObserver(syncZoneScalesPos).observe(lg);
}
async function renderZones() {
  const token = ++_zoneToken;
  const sources = zoneSources();
  renderZoneScales(sources);
  if (!sources.length) { zoneRoot.clearLayers(); return; }
  try { await ensureContourLib(); } catch (_) {
    toast('Не удалось загрузить построитель зон — проверьте интернет', 'err');
    return;
  }
  if (token !== _zoneToken) return;           // пока грузилось, карта уже изменилась
  const zoom = map.getZoom();
  const bounds = map.getBounds().pad(.3);
  const nw = map.latLngToLayerPoint(bounds.getNorthWest());
  const se = map.latLngToLayerPoint(bounds.getSouthEast());
  const W = Math.ceil(se.x - nw.x), H = Math.ceil(se.y - nw.y);
  const mpp = 40075016.686 * Math.cos(map.getCenter().lat * Math.PI / 180) / (256 * Math.pow(2, zoom));
  const sigmaPx = Math.min(160, Math.max(8, heatRadius * ZONE_M_PER_PX / mpp));
  const sigmaM = sigmaPx * mpp;
  let cell = Math.pow(2, Math.max(1, Math.floor(Math.log2(sigmaPx / 4))));
  while ((W / cell) * (H / cell) > 260000) cell *= 2;
  const reach = 3 * sigmaPx;
  const layers = [];
  sources.forEach(src => {
    const pts = [];
    for (const p of src.pts) {
      const q = map.latLngToLayerPoint([p[0], p[1]]);
      const x = q.x - nw.x, y = q.y - nw.y;
      if (x < -reach || y < -reach || x > W + reach || y > H + reach) continue;
      pts.push([x, y, p[2]]);
    }
    if (!pts.length) return;
    const thresholds = zoneThresholds(zoneLayerMax(src, sigmaM));
    // d3 даёт плотность «точек на пиксель²»; × 2πσ² — «точек под ядром»,
    // та же единица, что у порогов, и она не зависит от зума.
    const norm = 2 * Math.PI * sigmaPx * sigmaPx;
    const contours = window.d3.contourDensity()
      .x(p => p[0]).y(p => p[1]).weight(p => p[2])
      .size([W, H]).cellSize(cell).bandwidth(sigmaPx)
      .thresholds(thresholds.map(t => t / norm))(pts);
    if (!contours.length) return;
    const n = contours.length;
    const bands = contours.map((c, i) => {
      const color = sampleGrad(src.grad, .22 + .78 * (n > 1 ? i / (n - 1) : 1));
      return { d: ringsToPath(c.coordinates), color };
    });
    layers.push({ src, bands });
  });
  if (token !== _zoneToken) return;
  zoneRoot.clearLayers();
  const blur = Math.max(1.5, Math.min(6, sigmaPx / 10)).toFixed(1);
  layers.forEach(({ src, bands }, li) => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('class', 'zone-svg');
    svg.style.opacity = String(src.opacity);
    if (src.blend && heatBlend !== 'normal') svg.style.mixBlendMode = heatBlend;
    const fid = 'zsoft' + li;
    // Пороги считаются от максимума слоя, поэтому «Интенсивность» в зонах —
    // это насыщенность заливки, а не размер поясов.
    const fk = Math.min(1.8, Math.max(.5, Math.sqrt(src.boost || 1)));
    svg.innerHTML = `<defs><filter id="${fid}" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="${blur}"/></filter></defs>` +
      `<g filter="url(#${fid})">${bands.map((b, i) => `<path d="${b.d}" fill="${b.color}" fill-opacity="${Math.min(.9, (i ? .2 : .34) * fk).toFixed(2)}" fill-rule="evenodd"/>`).join('')}</g>` +
      `<g fill="none" stroke-linejoin="round">${bands.map(b => `<path d="${b.d}" stroke="${darken(b.color, .12)}" stroke-opacity=".55" stroke-width="1.2" vector-effect="non-scaling-stroke"/>`).join('')}</g>`;
    L.svgOverlay(svg, bounds, { pane: 'zones', interactive: false }).addTo(zoneRoot);
  });
}
map.on('moveend', () => { if (zoneSources().length || zoneRoot.getLayers().length) scheduleZones(); });

/* Одно число — один смысл: «сколько точек этого слоя сейчас на карте».
   Раньше бейдж считал отфильтрованные записи, легенда — весь размер слоя
   (`stats.n`), а подпись ярлыков — только видимую область. При включённом
   фильтре городов все трое показывали разное. */
function shownCount(x) {
  if (!x) return 0;
  const n = x._shownCount;
  if (Number.isFinite(n)) return Math.max(0, n);
  // Легенду могут собрать до первой отрисовки слоя. Без фильтра городов
  // «нарисовано» равно всему слою; с фильтром честнее показать 0 и дождаться
  // рендера, чем вывести неотфильтрованное число.
  if (!selectionActive()) return (x.recs || []).length;
  return 0;
}
function updateCountBadge() {
  let total = 0;
  heatKeys.forEach(k => { const d = DS[k]; if (d && d.visible) total += shownCount(d); });
  customPtLayers.forEach(l => { if (l.visible) total += shownCount(l); });
  const el = document.getElementById('b-count');
  if (el) el.textContent = total.toLocaleString('ru-RU');
  const lbl = document.getElementById('b-count-label');
  if (lbl) lbl.textContent = plural(total, 'точка', 'точки', 'точек') + ' на карте';
}

function updateLayerLegend() {
  const el = document.getElementById('layer-legend');
  if (!el) return;
  updateCountBadge();   // бейдж = сумма строк легенды, иначе они разойдутся
  const items = [];
  heatKeys.forEach(k => {
    const d = DS[k];
    if (!d || !d.visible || !d.recs || !d.recs.length) return;
    // Слой без точек в выбранных городах ничего не рисует — в легенде не нужен.
    if (!shownCount(d)) return;
    // Тепловой слой показывается своей полосой-градиентом: когда включено
    // несколько слоёв, полоса отличает их надёжнее, чем одна точка цвета.
    items.push({
      key: k, ramp: rampCss(gradOf(d), '#ffffff'), name: d.name,
      count: shownCount(d), tags: !!d.showTags,
    });
  });
  customPtLayers.forEach(l => {
    if (l.visible && l.recs && l.recs.length && shownCount(l)) {
      items.push({ color: l.color, pin: pinSvg(l.icon, l.color, l.color2, 18, l.shape).html, name: l.name, count: shownCount(l) });
    }
  });
  if (recShow && lastRecs.length) items.push({ color: '#14B87D', name: 'Рекомендации' });
  // Превью адресной программы рисуется поверх слоёв (оранжевые кандидаты и
  // синие ориентиры) — без строк в легенде было непонятно, что это за точки.
  if (addrPreview) {
    items.push({ color: '#FF8C00', name: 'Адресная программа', count: addrPreview.count });
    if (addrPreview.refs) items.push({ color: '#6C8EFF', name: addrPreview.refLabel, count: addrPreview.refs });
  }
  // Выбранные районы и свои зоны: имя и площадь каждой, ниже — сумма.
  const zones = activeBoundZones();
  if (!items.length && !zones.length) { el.style.display = 'none'; return; }
  el.style.display = '';
  const folded = legendFolded();
  const total = zones.reduce((a, z) => a + zoneArea(z.mp), 0);
  const zoneHtml = !zones.length ? '' :
    `<div class="legend-sep" role="separator"><span>Районы</span></div>` +
    zones.map(z => `<div class="legend-item legend-zone"><span class="legend-zdot" style="--c:${boundColor(z.color)}"></span>` +
      `<span class="legend-name" title="${esc(z.name)}">${esc(z.name)}</span><span class="legend-area">${fmtArea(zoneArea(z.mp))}</span></div>`).join('') +
    (zones.length > 1 ? `<div class="legend-item legend-total"><span class="legend-name">Всего, ${zones.length} ${plural(zones.length, 'район', 'района', 'районов')}</span><span class="legend-area">${fmtArea(total)}</span></div>` : '');
  el.classList.toggle('folded', folded);
  el.innerHTML = `<button type="button" class="legend-head" aria-expanded="${!folded}" title="${folded ? 'Развернуть легенду' : 'Свернуть легенду'}">
      <span class="legend-title">Легенда</span><span class="legend-n">${items.length + zones.length}</span>${uiIcon('chevron', 13)}</button>
    <div class="legend-body">` + items.map(it => {
    const mark = it.ramp
      ? `<span class="legend-ramp" style="background:${it.ramp}"></span>`
      : it.pin ? `<span class="legend-pin">${it.pin}</span>`
      : `<span class="legend-dot" style="background:${safeColor(it.color, '#888')}"></span>`;
    const count = it.count ? `<span class="legend-count">${it.count.toLocaleString('ru-RU')}</span>` : '';
    return `<div class="legend-item">${mark}<span class="legend-name" title="${esc(it.name)}">${esc(it.name)}</span>${count}</div>`;
  }).join('') + zoneHtml + '</div>';
  el.querySelector('.legend-head').addEventListener('click', () => {
    const f = !legendFolded();
    try { localStorage.setItem('hm_legend_folded', f ? '1' : ''); } catch (_) {}
    updateLayerLegend();
  });
}
function legendFolded() {
  try { return localStorage.getItem('hm_legend_folded') === '1'; } catch (_) { return false; }
}

/* ── ЯРЛЫКИ: тачпоинты тепловых слоёв ────────────────────────────────── */
// Тепловой слой показывает плотность, но не отдельные адреса. «Ярлыки» рисуют
// сами точки слоя с карточкой из загруженного файла. Точек бывают десятки
// тысяч, поэтому рисуем только видимую часть карты, canvas-рендерером и с
// потолком — иначе вкладка встаёт.
const TAG_LIMIT = 1200;
function tagLayerKeys() {
  return showPointsAll ? heatKeys.filter(k => DS[k] && DS[k].visible) : [];
}
/* «Открыть в Яндекс Картах» — у каждой точки на карте. Открывается режим
   «Что здесь?» (`whatshere`): точка выбрана как локация, с карточкой адреса и
   кнопками «Маршрут» / «Поделиться», а не просто метка `pt` на карте. На
   телефоне ссылка открывает приложение Яндекс Карт. */
function yandexMapsUrl(lat, lon) {
  const la = (+lat).toFixed(6), lo = (+lon).toFixed(6);
  return `https://yandex.ru/maps/?ll=${lo}%2C${la}&z=17&mode=whatshere&whatshere%5Bpoint%5D=${lo}%2C${la}&whatshere%5Bzoom%5D=17`;
}
function yandexLinkHtml(lat, lon) {
  if (!isFinite(+lat) || !isFinite(+lon)) return '';
  return `<a class="pp-ymaps" href="${yandexMapsUrl(lat, lon)}" target="_blank" rel="noopener noreferrer">` +
    `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 10c0 7-9 12-9 12s-9-5-9-12a9 9 0 0 1 18 0Z"/><circle cx="12" cy="10" r="3"/></svg>` +
    `Открыть в Яндекс Картах</a>`;
}

function tagPopupHtml(d, r) {
  const rows = [];
  if (r.addr)  rows.push(['Адрес', r.addr]);
  if (r.hours) rows.push(['Часы', r.hours]);
  if (r.code)  rows.push(['Код', r.code]);
  if (r.fil)   rows.push(['Город', r.fil]);
  rows.push([volUnitOf(d) ? 'Значение, %' : 'Значение', fmtVol(d, r.vol)]);
  return `<div class="pp-title">${esc(r.name || 'Точка без названия')}</div>` +
    rows.map(([k, v]) =>
      `<div class="pp-row"><span>${esc(k)}</span><b style="font-family:Inter;font-weight:600;text-align:right">${esc(String(v))}</b></div>`
    ).join('') + extraRowsHtml(r) +
    `<span class="pp-tag" style="background:var(--acc-l);color:var(--acc-d);border:1px solid rgba(18,173,193,.35)">${esc(d.name)}</span>` +
    yandexLinkHtml(r.lat, r.lon);
}
// renderHeat() дёргается на каждое движение ползунка. Пересобирать до 1200
// маркеров на каждый кадр незачем — сверяем сигнатуру входных данных.
let _tagSig = '';
function renderTags(force) {
  const keys = tagLayerKeys();
  const b = map.getBounds();
  const sig = keys.map(k => k + ':' + layerKeyColor(DS[k]) + ':' + (DS[k]._recordsLoaded ? DS[k].recs.length : -1)).join('|')
    + '|' + selectionKey() + cityScope
    + '|' + [b.getSouth(), b.getWest(), b.getNorth(), b.getEast()].map(v => v.toFixed(4)).join(',');
  if (!force && sig === _tagSig) return;
  _tagSig = sig;

  tagRoot.clearLayers();
  const note = document.getElementById('tag-note');
  if (!keys.length) { if (note) note.style.display = 'none'; return; }
  const bounds = b.pad(.08);
  let shown = 0, inViewTotal = 0;
  keys.forEach(k => {
    const d = DS[k];
    if (!d._recordsLoaded || !d.recs.length) return;
    const inView = [];
    for (const r of d.recs) {
      if (!selectedPointMatches(r)) continue;
      if (bounds.contains([r.lat, r.lon])) inView.push(r);
    }
    inViewTotal += inView.length;
    // При переполнении оставляем самые крупные точки слоя — они и нужны.
    const pick = inView.length > TAG_LIMIT
      ? inView.slice().sort((a, b) => (+b.vol || 0) - (+a.vol || 0)).slice(0, TAG_LIMIT)
      : inView;
    shown += pick.length;
    // Ярлыки тепловых слоёв — простые кружки цвета слоя (решение владельца):
    // значки-метки остаются у слоёв точек, так их не спутать.
    const color = layerKeyColor(d);
    const withTooltip = pick.length <= 300;
    pick.forEach(r => {
      const m = L.circleMarker([r.lat, r.lon], {
        renderer: tagRenderer, pane: 'tags',
        radius: 5, weight: 2, color: '#ffffff', opacity: .95,
        fillColor: color, fillOpacity: .95,
      });
      // Содержимое собирается по клику — 1200 готовых строк HTML не нужны.
      m.bindPopup(() => tagPopupHtml(d, r));
      if (withTooltip && r.name) {
        m.bindTooltip(esc(r.name), { className: 'tt', direction: 'top', offset: [0, -6] });
      }
      m.addTo(tagRoot);
    });
  });
  // Подпись всегда говорит «в этой области»: число ярлыков считается по
  // видимой части карты и потому меньше счётчиков в легенде — без этой
  // оговорки расхождение выглядело ошибкой.
  if (note) {
    if (inViewTotal > shown) {
      note.style.display = '';
      note.textContent = `Ярлыки: ${shown.toLocaleString('ru-RU')} из ${inViewTotal.toLocaleString('ru-RU')} в этой области — приблизьте карту`;
    } else if (shown) {
      note.style.display = '';
      note.textContent = `Ярлыки: ${shown.toLocaleString('ru-RU')} в этой области`;
    } else {
      note.style.display = 'none';
    }
  }
}
// Видимая часть карты меняется — пересобираем только когда ярлыки включены.
map.on('moveend zoomend', () => { if (tagLayerKeys().length) renderTags(); });

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
     <span class="pp-tag" style="background:var(--rec-l);color:var(--rec-ink);border:1px solid rgba(20,184,125,.35)">РЕКОМЕНДАЦИЯ BR</span>
     ${yandexLinkHtml(s.lat, s.lon)}`)
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
  // `ld/lc` is needed only for the currently selected recommendation basis.
  // Deferred hydration keeps hidden layers from blocking the first map paint.
  ensureLayerDensity(d);

  // Compute candidates
  const cand = d.recs
    .filter(s => recInSelection(s) && s.nd > covR)
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
  const cityTotal = d.recs.filter(recInSelection).reduce((a, s) => a + s.vol, 0) || 1;
  document.getElementById('rec-count').textContent = recs.length;
  document.getElementById('rec-lbl').innerHTML =
    // Доля от общего объёма понятна всегда; абсолютную сумму для процентных
    // слоёв не печатаем — сумма процентов ничего не значит.
    `зон для новой <b>BR</b> · основа: <b>${esc(d.name).toLowerCase()}</b> · вне покрытия <b>${Math.round(uncSum / cityTotal * 100)}%</b>${
      volUnitOf(d) ? '' : ` (${Math.round(uncSum).toLocaleString('ru-RU')} ед.)`}`;

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
/* Закраска ползунка до центра кружка. `--f` — доля 0…1, CSS переводит её в
   позицию с поправкой на ширину кружка: иначе у краёв полоса уходила за
   кружок (на 17 % закрашено до 25 %). Ползунки обновляются сами — на любой
   ввод и при появлении в DOM, — без этого новые ползунки стояли на 50 %. */
function fillSlider(el) {
  if (!el) return;
  const min = +el.min || 0, max = el.max === '' ? 100 : +el.max, val = +el.value;
  const f = max > min ? Math.min(1, Math.max(0, (val - min) / (max - min))) : 0;
  el.style.setProperty('--f', f.toFixed(4));
}
function fillAllSliders(root) {
  (root || document).querySelectorAll('input[type=range]').forEach(fillSlider);
}
document.addEventListener('input', e => { if (e.target && e.target.type === 'range') fillSlider(e.target); }, true);
new MutationObserver(muts => {
  for (const m of muts) for (const n of m.addedNodes) {
    if (n.nodeType !== 1) continue;
    if (n.matches && n.matches('input[type=range]')) fillSlider(n);
    else if (n.querySelector && n.querySelector('input[type=range]')) fillAllSliders(n);
  }
}).observe(document.documentElement, { childList: true, subtree: true });

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
async function toggleSolo(k) {
  if (_soloKey === k) {
    // restore previous visibility
    if (_preSolo) heatKeys.forEach(kk => { if (DS[kk] && _preSolo[kk] != null) DS[kk].visible = _preSolo[kk]; });
    _soloKey = null; _preSolo = null;
  } else {
    try { await ensureLayerRecords(k); } catch (_) { toast('Не удалось загрузить данные слоя', 'err'); return; }
    if (!_preSolo) { _preSolo = {}; heatKeys.forEach(kk => { if (DS[kk]) _preSolo[kk] = DS[kk].visible; }); }
    heatKeys.forEach(kk => { if (DS[kk]) DS[kk].visible = (kk === k); });
    _soloKey = k;
  }
  buildHeatUI(); renderHeat(); updateAccBadges(); saveState();
}

/* Solo / isolate a single custom-point layer with the same semantics as heat layers */
let _cptSoloId = null, _cptPrevVisible = null;
function toggleCustomPtSolo(id) {
  const layer = customPtLayers.find(l => l.id === id);
  if (!layer) return;
  if (_cptSoloId === id) {
    if (_cptPrevVisible) customPtLayers.forEach(l => {
      if (_cptPrevVisible[l.id] != null) l.visible = _cptPrevVisible[l.id];
    });
    _cptSoloId = null; _cptPrevVisible = null;
  } else {
    if (!_cptPrevVisible) {
      _cptPrevVisible = Object.fromEntries(customPtLayers.map(l => [l.id, Boolean(l.visible)]));
    }
    customPtLayers.forEach(l => { l.visible = l.id === id; });
    _cptSoloId = id;
  }
  renderCustomPoints(); buildCustomPtUI(); updateAccBadges(); saveState();
}

/* ── UI BUILDERS ─────────────────────────────────────────────────────── */
const _lyrOpen = new Set();
const _cptOpen = new Set();   // keys of layer cards whose settings are expanded
// Свёрнут ли список точек в карточке ручного слоя. Явный выбор пользователя
// помним в этом браузере; без выбора короткий список открыт, длинный свёрнут.
const RP_LIST_AUTO_OPEN = 5;
const _rpListChoice = (() => {
  try { return new Map(Object.entries(JSON.parse(localStorage.getItem('hm_rplist') || '{}'))); }
  catch (_) { return new Map(); }
})();
function rpListOpen(l) {
  return _rpListChoice.has(l.id) ? !!_rpListChoice.get(l.id) : l.recs.length <= RP_LIST_AUTO_OPEN;
}
function setRpListOpen(id, open) {
  _rpListChoice.set(id, open);
  try { localStorage.setItem('hm_rplist', JSON.stringify(Object.fromEntries(_rpListChoice))); } catch (_) {}
}

// Русское склонение по числу: plural(5, 'точка', 'точки', 'точек') → «точек».
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
  sheet: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M8 13h2"/><path d="M14 13h2"/><path d="M8 17h2"/><path d="M14 17h2"/>',
};
function uiIcon(name, size = 15) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${UI_ICONS[name] || ''}</svg>`;
}
// Плашка цвета слоя: квадрат с градиентом палитры (или сплошной цвет).
function paintSwatchCss(p) {
  if (p.ramp && p.ramp !== 'custom') {
    const g = p.ramp === 'custom2' ? grad2(safeColor(p.color), safeColor(p.color2)) : (HEAT_RAMPS[p.ramp] || heatGrad(safeColor(p.color)));
    return `linear-gradient(135deg, ${g[0.32]} 0%, ${g[0.55]} 45%, ${g[1.0]} 100%)`;
  }
  return safeColor(p.color);
}

/* ── ОКНО ВЫБОРА ЦВЕТА ──────────────────────────────────────────────────
   Четыре готовых градиента или свой цвет: один оттенок либо градиент из
   двух. Одно окно на тепловые слои и слои точек. */
let _paintPop = null;
function closePaintPop() {
  if (_paintPop) { _paintPop.el.remove(); _paintPop.anchor.setAttribute('aria-expanded', 'false'); _paintPop = null; }
}
function openPaintPop(anchor, current, onPick) {
  if (_paintPop && _paintPop.anchor === anchor) { closePaintPop(); return; }
  closePaintPop();
  const st = { ramp: current.ramp || 'custom', color: safeColor(current.color), color2: safeColor(current.color2 || darken(safeColor(current.color), .35)) };
  let mode = st.ramp === 'custom2' ? 'grad' : 'one';
  const el = document.createElement('div');
  el.className = 'paint-pop';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', 'Цвет слоя');
  const legacy = st.ramp && !['custom', 'custom2'].includes(st.ramp) && !PRESET_RAMPS.some(p => p.id === st.ramp);
  const draw = () => {
    el.innerHTML = `
      <div class="pp2-h">Готовые наборы</div>
      <div class="pp2-presets">
        ${legacy ? `<button type="button" class="pp2-preset on" data-ramp="${esc(st.ramp)}"><i style="background:${paintSwatchCss({ ramp: st.ramp, color: st.color })}"></i><span>${esc(RAMP_NAMES[st.ramp] || 'Текущая')}</span></button>` : ''}
        ${PRESET_RAMPS.map(p => `<button type="button" class="pp2-preset${st.ramp === p.id ? ' on' : ''}" data-ramp="${p.id}"><i style="background:${paintSwatchCss({ ramp: p.id })}"></i><span>${esc(p.name)}</span></button>`).join('')}
      </div>
      <div class="pp2-h">Свой цвет</div>
      <div class="pp2-seg" role="tablist">
        <button type="button" role="tab" aria-selected="${mode === 'one'}" class="${mode === 'one' ? 'on' : ''}" data-mode="one">Один цвет</button>
        <button type="button" role="tab" aria-selected="${mode === 'grad'}" class="${mode === 'grad' ? 'on' : ''}" data-mode="grad">Градиент</button>
      </div>
      ${mode === 'one' ? `
        <div class="pp2-sw">${SWATCHES.map(c => `<button type="button" class="sw${st.ramp === 'custom' && c.toLowerCase() === st.color.toLowerCase() ? ' on' : ''}" data-sw="${c}" style="background:${c}" aria-label="Цвет ${c}"></button>`).join('')}
          <input type="color" class="sw-pick" data-one value="${st.color}" title="Любой оттенок"/></div>` : `
        <div class="pp2-grad">
          <label>От <input type="color" data-g1 value="${st.color}"/></label>
          <i class="pp2-gbar" style="background:linear-gradient(90deg, ${st.color}, ${st.color2})"></i>
          <label>До <input type="color" data-g2 value="${st.color2}"/></label>
        </div>
        <button type="button" class="pp2-apply" data-gapply>Применить градиент</button>`}`;
    el.querySelectorAll('[data-ramp]').forEach(b => b.addEventListener('click', () => {
      st.ramp = b.dataset.ramp; onPick({ ramp: st.ramp, color: st.color }); draw();
    }));
    el.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => { mode = b.dataset.mode; draw(); }));
    el.querySelectorAll('[data-sw]').forEach(b => b.addEventListener('click', () => {
      st.ramp = 'custom'; st.color = b.dataset.sw; onPick({ ramp: 'custom', color: st.color }); draw();
    }));
    const one = el.querySelector('[data-one]');
    if (one) one.addEventListener('input', e => { st.ramp = 'custom'; st.color = e.target.value; onPick({ ramp: 'custom', color: st.color }, true); });
    if (one) one.addEventListener('change', () => onPick({ ramp: 'custom', color: st.color }));
    const g1 = el.querySelector('[data-g1]'), g2 = el.querySelector('[data-g2]'), bar = el.querySelector('.pp2-gbar');
    const sync = () => { if (bar) bar.style.background = `linear-gradient(90deg, ${g1.value}, ${g2.value})`; };
    if (g1) { g1.addEventListener('input', sync); g2.addEventListener('input', sync); }
    const ap = el.querySelector('[data-gapply]');
    if (ap) ap.addEventListener('click', () => {
      st.ramp = 'custom2'; st.color = g1.value; st.color2 = g2.value;
      onPick({ ramp: 'custom2', color: st.color, color2: st.color2 });
      closePaintPop();
    });
  };
  draw();
  document.body.appendChild(el);
  const r = anchor.getBoundingClientRect();
  const w = el.offsetWidth, h = el.offsetHeight;
  el.style.left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8)) + 'px';
  el.style.top = (r.bottom + 8 + h < window.innerHeight ? r.bottom + 8 : Math.max(8, r.top - h - 8)) + 'px';
  anchor.setAttribute('aria-expanded', 'true');
  _paintPop = { el, anchor };
}
document.addEventListener('pointerdown', e => {
  if (_paintPop && !_paintPop.el.contains(e.target) && !_paintPop.anchor.contains(e.target)) closePaintPop();
});
document.addEventListener('keydown', e => { if (e.key === 'Escape' && _paintPop) closePaintPop(); });

/* ── ШАБЛОН EXCEL ДЛЯ СЛОЯ ─────────────────────────────────────────────
   Колонки: стандартные + поля слоя. Формат .xlsx (Excel 2007 и новее). */
function layerTemplateColumns(kind, fields) {
  const base = kind === 'heat'
    ? ['Название', 'Широта', 'Долгота', 'Значение']
    : ['Название', 'Широта', 'Долгота', 'Адрес', 'Часы работы', 'Код'];
  return base.concat((fields || []).filter(f => !base.some(b => b.toLowerCase() === String(f).toLowerCase())));
}
// Сохранение .xlsx с нужным именем файла. XLSX.writeFile в браузере не всегда
// передаёт имя (в Chrome файл приходил как «download»), поэтому сохраняем сами.
function translit(text) {
  const map = { а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ё:'yo',ж:'zh',з:'z',и:'i',й:'y',к:'k',л:'l',м:'m',н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',х:'h',ц:'ts',ч:'ch',ш:'sh',щ:'sch',ъ:'',ы:'y',ь:'',э:'e',ю:'yu',я:'ya',ў:'o',қ:'q',ғ:'g',ҳ:'h' };
  const out = String(text).toLowerCase().split('').map(ch => map[ch] ?? ch).join('')
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 50);
  return out || 'sloy';
}
function saveXlsx(wb, filename) {
  const data = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  const blob = new Blob([data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
}
function downloadLayerTemplate(kind, layer) {
  const cols = layerTemplateColumns(kind, layer.fields);
  const sample = cols.map(c => ({ 'Название': 'Пример точки', 'Широта': 41.3111, 'Долгота': 69.2797, 'Значение': 10, 'Адрес': 'г. Ташкент, ул. Примерная 1', 'Часы работы': '09:00–22:00', 'Код': 'TT-0001' }[c] ?? ''));
  ensureSheetLibs().then(() => {
    const ws = XLSX.utils.aoa_to_sheet([cols, sample]);
    ws['!cols'] = cols.map(c => ({ wch: Math.max(12, String(c).length + 4) }));
    const help = XLSX.utils.aoa_to_sheet([
      ['Как заполнить'],
      ['Одна строка — одна точка. Обязательно: Название, Широта, Долгота' + (kind === 'heat' ? ', Значение (число или процент, например 0,356%).' : '.')],
      ['Координаты — десятичные градусы, например 41.3111 и 69.2797 (можно с запятой).'],
      ['Остальные колонки необязательны и попадут в карточку точки на карте.'],
      ['Строку-пример можно удалить.'],
    ]);
    help['!cols'] = [{ wch: 110 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Данные');
    XLSX.utils.book_append_sheet(wb, help, 'Как заполнить');
    // Имя файла латиницей — как у остальных выгрузок приложения: некоторые
    // браузеры заменяют имя с кириллицей на безликое «download».
    saveXlsx(wb, `shablon_${translit(layer.name || 'sloy')}.xlsx`);
  }).catch(() => toast('Не удалось подготовить Excel — проверьте интернет', 'err'));
}

/* ── КАРТОЧКИ ТЕПЛОВЫХ СЛОЁВ ───────────────────────────────────────────
   Компактно: цвет, имя с карандашом, переключатель; ниже — число точек и
   иконки (шаблон, загрузка, удаление, настройки). В настройках — значок
   метки, интенсивность и прозрачность. */
/* Выбор метки: ряд форм (с текущим значком и цветом) и сетка значков. */
function markerPickerHtml(shape, icon, color, color2) {
  const sh = markerShape(shape), ic = markerIcon(icon);
  return `<div class="mk-shapes" data-liquid="on">${MARKER_SHAPES.map(x => `<button type="button" class="mk-shape${x.id === sh ? ' on' : ''}" data-mkshape="${x.id}" title="${esc(x.name)}" aria-label="Форма «${esc(x.name)}»" aria-pressed="${x.id === sh}">${pinSvg(ic, color, color2, 30, x.id).html}</button>`).join('')}</div>
    ${[['iqos', 'IQOS и сигареты', ['none']], ['retail', 'Торговые точки', []]].map(([g, title, extra]) => `
      <div class="lc-lbl lc-lbl2">${title}</div>
      <div class="mk-glyphs" data-liquid="on">${PIN_ICONS.filter(i => i.group === g).map(i => i.id).concat(extra).map(id => {
        const name = id === 'none' ? 'Без значка' : PIN_ICON_MAP[id].name;
        return `<button type="button" class="mk-glyph${id === ic ? ' on' : ''}" data-mkicon="${id}" title="${esc(name)}" aria-label="Значок «${esc(name)}»" aria-pressed="${id === ic}">${glyphSvg(id, 17)}</button>`;
      }).join('')}</div>`).join('')}`;
}
function refreshMarkerPicker(card, shape, icon, color, color2) {
  const sh = markerShape(shape), ic = markerIcon(icon);
  card.querySelectorAll('[data-mkshape]').forEach(b => {
    b.innerHTML = pinSvg(ic, color, color2, 30, b.dataset.mkshape).html;
    b.classList.toggle('on', b.dataset.mkshape === sh); b.setAttribute('aria-pressed', String(b.dataset.mkshape === sh));
  });
  card.querySelectorAll('[data-mkicon]').forEach(b => {
    b.classList.toggle('on', b.dataset.mkicon === ic); b.setAttribute('aria-pressed', String(b.dataset.mkicon === ic));
  });
}
function wireMarkerPicker(card, onPick) {
  card.querySelectorAll('[data-mkshape]').forEach(b => b.addEventListener('click', () => onPick(b.dataset.mkshape, null)));
  card.querySelectorAll('[data-mkicon]').forEach(b => b.addEventListener('click', () => onPick(null, b.dataset.mkicon)));
}

function syncViewToggles() {
  [['vt-points', showPointsAll], ['vt-heat', showHeatAll]].forEach(([id, on]) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.setAttribute('aria-checked', on ? 'true' : 'false');
    el.classList.toggle('on', on);
    const c = el.querySelector('.cbx'); if (c) c.classList.toggle('on', on);
  });
}
async function setShowPoints(on) {
  showPointsAll = on;
  syncViewToggles();
  if (on) {
    const keys = heatKeys.filter(k => DS[k] && DS[k].visible);
    try { await ensureLayerRecords(keys); } catch (_) { toast('Не удалось загрузить точки слоёв', 'err'); }
  }
  renderTags(true); updateLayerLegend(); saveState();
}
function syncHeatStyleBtns() {
  document.querySelectorAll('[data-hstyle]').forEach(b => {
    const on = b.dataset.hstyle === heatStyle;
    b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on));
  });
}
function setShowHeat(on) {
  showHeatAll = on;
  syncViewToggles();
  restyleHeatCanvases(); scheduleZones(); updateLayerLegend(); saveState();
}

function buildHeatUI() {
  const el = document.getElementById('heat-list');
  el.innerHTML = '';
  syncViewToggles();
  if (!heatKeys.length) {
    el.innerHTML = `<div class="lc-empty">${isAdmin()
      ? 'Слоёв пока нет. Нажмите «Создать слой», задайте поля, скачайте шаблон Excel и загрузите его заполненным.'
      : 'Слоёв пока нет — их добавляет владелец карты.'}</div>`;
  }
  heatKeys.forEach(k => {
    const d = DS[k];
    if (!d) return;
    const open = _lyrOpen.has(k);
    const n = layerRecordCount(d);
    const fields = d.fields || [];
    const card = document.createElement('div');
    card.className = 'lc' + (open ? ' open' : '') + (d.visible ? '' : ' off');
    card.innerHTML = `
      <div class="lc-row">
        <button type="button" class="lc-sw" aria-haspopup="dialog" aria-expanded="false" title="Цвет слоя" aria-label="Цвет слоя «${esc(d.name)}»" style="background:${paintSwatchCss(d)}"></button>
        <div class="lc-name"><span class="lc-t" title="${esc(d.name)}">${esc(d.name)}</span><button type="button" class="lc-ic lc-ren" title="Переименовать" aria-label="Переименовать слой «${esc(d.name)}»">${uiIcon('pencil', 13)}</button></div>
        <div class="cbx sm${d.visible ? ' on' : ''}" role="switch" tabindex="0" aria-checked="${d.visible}" aria-label="Показывать слой «${esc(d.name)}» на карте"></div>
      </div>
      <div class="lc-sub">
        <span class="lc-n">${n.toLocaleString('ru-RU')} ${plural(n, 'точка', 'точки', 'точек')}${fields.length ? ' · ' + fields.length + ' ' + plural(fields.length, 'поле', 'поля', 'полей') : ''}</span>
        <div class="lc-tools">
          <button type="button" class="lc-ic lc-xls" title="Выгрузить точки слоя в Excel — те же колонки, что в шаблоне, со всеми вашими полями" aria-label="Выгрузить в Excel">${uiIcon('sheet')}</button>
          <button type="button" class="lc-ic lc-tpl admin-only" title="Скачать шаблон Excel для этого слоя" aria-label="Скачать шаблон">${uiIcon('download')}</button>
          <button type="button" class="lc-ic lc-up admin-only" title="Загрузить или обновить данные из файла" aria-label="Загрузить данные">${uiIcon('upload')}</button>
          <button type="button" class="lc-ic lc-del admin-only" title="Удалить слой" aria-label="Удалить слой">${uiIcon('trash')}</button>
          <button type="button" class="lc-ic lc-more" title="Настройки слоя" aria-label="Настройки слоя" aria-expanded="${open}">${uiIcon('chevron')}</button>
        </div>
      </div>
      <div class="lc-body">
        <div class="lc-sl"><span>Интенсивность</span><input type="range" class="r-int" min="0.2" max="4" step="0.1" value="${d.intensity || 1}"/><b>${(d.intensity || 1).toFixed(1)}×</b></div>
        <div class="lc-sl"><span>Прозрачность</span><input type="range" class="r-op" min="0.05" max="1" step="0.05" value="${d.opacity == null ? 1 : d.opacity}"/><b>${Math.round((d.opacity == null ? 1 : d.opacity) * 100)}%</b></div>
        ${fields.length ? `<div class="lc-fields">${fields.map(f => `<span>${esc(f)}</span>`).join('')}</div>` : ''}
        <div class="lc-foot">
          <span>${volUnitOf(d) ? 'Среднее: ' + fmtVol(d, d.stats.n ? d.stats.sum / d.stats.n : 0) : 'Сумма значений: ' + Math.round(d.stats.sum || 0).toLocaleString('ru-RU')}</span>
          <button type="button" class="lc-link lc-solo${_soloKey === k ? ' on' : ''}">${uiIcon('eye', 13)} ${_soloKey === k ? 'Показать все' : 'Только этот'}</button>
        </div>
      </div>`;

    const setOpen = v => {
      card.classList.toggle('open', v);
      card.querySelector('.lc-more').setAttribute('aria-expanded', String(v));
      if (v) _lyrOpen.add(k); else _lyrOpen.delete(k);
    };
    card.querySelector('.lc-more').addEventListener('click', () => setOpen(!card.classList.contains('open')));
    card.querySelector('.lc-n').addEventListener('click', () => setOpen(!card.classList.contains('open')));

    const sw = card.querySelector('.lc-sw');
    sw.addEventListener('click', () => openPaintPop(sw, d, (p, live) => {
      d.ramp = p.ramp;
      if (p.color) d.color = p.color;
      d.color2 = p.ramp === 'custom2' ? p.color2 : '';
      sw.style.background = paintSwatchCss(d);
      renderHeat(); renderTags(true); updateLayerLegend();
      if (!live) saveState();
    }));

    const tog = card.querySelector('.cbx');
    const toggle = async () => {
      if (!d.visible) {
        tog.classList.add('loading');
        try { await ensureLayerRecords(k); } catch (_) { toast('Не удалось загрузить данные слоя', 'err'); tog.classList.remove('loading'); return; }
        tog.classList.remove('loading');
      }
      d.visible = !d.visible;
      tog.classList.toggle('on', d.visible);
      tog.setAttribute('aria-checked', String(d.visible));
      card.classList.toggle('off', !d.visible);
      renderHeat(); renderTags(true); updateAccBadges(); saveState();
    };
    tog.addEventListener('click', toggle);
    tog.addEventListener('keydown', e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggle(); } });

    card.querySelector('.lc-solo').addEventListener('click', () => toggleSolo(k));
    card.querySelector('.r-int').addEventListener('input', e => {
      d.intensity = +e.target.value; fillSlider(e.target);
      e.target.nextElementSibling.textContent = d.intensity.toFixed(1) + '×';
      renderHeat();
    });
    card.querySelector('.r-op').addEventListener('input', e => {
      d.opacity = +e.target.value; fillSlider(e.target);
      e.target.nextElementSibling.textContent = Math.round(d.opacity * 100) + '%';
      renderHeat();
    });

    // Переименование — поле прямо на месте имени.
    card.querySelector('.lc-ren').addEventListener('click', () => {
      const nm = card.querySelector('.lc-name');
      const inp = document.createElement('input');
      inp.type = 'text'; inp.value = d.name; inp.maxLength = 40; inp.className = 'lc-rename';
      nm.replaceWith(inp); inp.focus(); inp.select();
      let done = false;
      const commit = save => {
        if (done) return; done = true;
        if (save) { const v = capFirst(inp.value); if (v) d.name = v; }
        buildHeatUI(); buildAddrSrcSel(); buildRecBasisSel(); rebuildUpTarget(); updateLayerLegend(); if (save) saveState();
      };
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') commit(true); else if (e.key === 'Escape') commit(false); });
      inp.addEventListener('blur', () => commit(true));
    });

    card.querySelector('.lc-tpl').addEventListener('click', () => downloadLayerTemplate('heat', d));
    card.querySelector('.lc-xls').addEventListener('click', () => exportLayerXlsx('heat', k));
    card.querySelector('.lc-up').addEventListener('click', () => {
      _heatUpdateTarget = k;
      document.getElementById('heat-update-file').click();
    });
    card.querySelector('.lc-del').addEventListener('click', () => {
      if (!confirm(`Удалить слой «${d.name}»? Его точки будут удалены с карты у всех пользователей.`)) return;
      if (d._leaf) { map.removeLayer(d._leaf); d._leaf = null; }
      delete DS[k];
      heatKeys = heatKeys.filter(x => x !== k);
      buildHeatUI(); buildAddrSrcSel(); buildRecBasisSel(); buildRtExclUI(); rebuildUpTarget(); renderHeat(); renderTags(true); renderRecs(); saveState();
    });
    el.appendChild(card);
    card.querySelectorAll('input[type=range]').forEach(fillSlider);
  });
  a11ySwitches();
}

/* ── ОКНО «СОЗДАТЬ СЛОЙ» ────────────────────────────────────────────────
   Шаг 1: название и поля. Шаг 2: скачать шаблон и загрузить файл. */
const FIELD_SUGGEST = ['Код', 'Адрес', 'Телефон', 'Категория', 'Часы работы', 'Менеджер', 'Канал', 'Комментарий'];
let _cl = { kind: 'heat', fields: [], key: null };
function clRenderFields() {
  const fixed = document.getElementById('cl-fixed');
  const base = layerTemplateColumns(_cl.kind, []);
  fixed.innerHTML = base.map(c => `<span class="cl-chip fixed">${esc(c)}</span>`).join('');
  const box = document.getElementById('cl-fields');
  box.innerHTML = _cl.fields.map((f, i) => `<span class="cl-chip">${esc(f)}<button type="button" data-rm="${i}" aria-label="Убрать поле ${esc(f)}">${uiIcon('x', 11)}</button></span>`).join('');
  box.querySelectorAll('[data-rm]').forEach(b => b.addEventListener('click', () => { _cl.fields.splice(+b.dataset.rm, 1); clRenderFields(); }));
  const sug = document.getElementById('cl-suggest');
  const taken = new Set(base.concat(_cl.fields).map(x => x.toLowerCase()));
  const left = FIELD_SUGGEST.filter(f => !taken.has(f.toLowerCase()));
  sug.innerHTML = left.length ? '<span>Часто добавляют:</span>' + left.map(f => `<button type="button" data-sg="${esc(f)}">+ ${esc(f)}</button>`).join('') : '';
  sug.querySelectorAll('[data-sg]').forEach(b => b.addEventListener('click', () => clAddField(b.dataset.sg)));
}
function clAddField(name) {
  const v = String(name || '').replace(/\s+/g, ' ').trim().slice(0, 40);
  if (!v) return;
  const base = layerTemplateColumns(_cl.kind, []);
  if (base.concat(_cl.fields).some(x => x.toLowerCase() === v.toLowerCase())) { toast('Такое поле уже есть', 'info'); return; }
  if (_cl.fields.length >= EXTRA_MAX_COLS) { toast(`Не больше ${EXTRA_MAX_COLS} своих полей`, 'warn'); return; }
  _cl.fields.push(v);
  clRenderFields();
}
function openCreateLayer(kind) {
  _cl = { kind, fields: [], key: null };
  document.getElementById('cl-title').textContent = kind === 'heat' ? 'Новый слой' : 'Новый слой точек';
  document.getElementById('cl-sub').textContent = kind === 'heat'
    ? 'Тепловой слой: точки рынка со значением. Задайте название и поля — соберём шаблон Excel.'
    : 'Слой наших точек: они рисуются метками и служат ориентиром для рекомендаций и адрески.';
  document.getElementById('cl-name').value = '';
  document.getElementById('cl-field-inp').value = '';
  document.getElementById('cl-step1').hidden = false;
  document.getElementById('cl-step2').hidden = true;
  clRenderFields();
  document.getElementById('cl-modal').hidden = false;
  setTimeout(() => document.getElementById('cl-name').focus(), 60);
}
function closeCreateLayer() { document.getElementById('cl-modal').hidden = true; }
function clCreate() {
  const name = capFirst(document.getElementById('cl-name').value);
  if (!name) { toast('Укажите название слоя', 'warn'); document.getElementById('cl-name').focus(); return; }
  const pending = document.getElementById('cl-field-inp').value.trim();
  if (pending) clAddField(pending);
  if (_cl.kind === 'heat') {
    const used = heatKeys.map(k2 => DS[k2] && DS[k2].color).filter(Boolean);
    const color = LAYER_PALETTE.find(c => !used.includes(c)) || LAYER_PALETTE[heatKeys.length % LAYER_PALETTE.length];
    const key = 'custom_' + Date.now();
    DS[key] = { key, name, color, color2: '', ramp: 'custom', icon: DEFAULT_PIN_ICON, shape: DEFAULT_SHAPE, fields: _cl.fields.slice(),
      opacity: 1, intensity: 1, visible: true, volUnit: '', recs: [], stats: statsOf([]), _userData: true, _recordsLoaded: true };
    heatKeys.push(key);
    _lyrOpen.add(key);
    _cl.key = key;
    focusNewLayer(key);
  } else {
    const id = 'cpt_' + Date.now();
    const used = customPtLayers.map(l => String(l.color).toLowerCase());
    const color = SWATCHES.find(c => !used.includes(c.toLowerCase())) || SWATCHES[customPtLayers.length % SWATCHES.length];
    customPtLayers.push({ id, name, color, icon: DEFAULT_PIN_ICON, fields: _cl.fields.slice(), visible: true, shape: DEFAULT_SHAPE, size: 32, opacity: 1,
      radiusOn: false, radiusM: 1500, radiusColor: color, radiusOpacity: 0.15, recs: [], _group: null });
    _cptOpen.add(id);
    _cl.key = id;
    buildCustomPtUI(); buildAddrSrcSel(); buildRtExclUI(); saveState();
  }
  document.getElementById('cl-done-title').textContent = `Слой «${name}» создан`;
  document.getElementById('cl-step1').hidden = true;
  document.getElementById('cl-step2').hidden = false;
}
function clLayer() {
  return _cl.kind === 'heat' ? DS[_cl.key] : customPtLayers.find(l => l.id === _cl.key);
}
function wireCreateLayer() {
  const $ = id => document.getElementById(id);
  if (!$('cl-modal') || $('cl-modal')._wired) return;
  $('cl-modal')._wired = true;
  $('cl-cancel').addEventListener('click', closeCreateLayer);
  $('cl-done').addEventListener('click', closeCreateLayer);
  $('cl-create').addEventListener('click', clCreate);
  $('cl-name').addEventListener('keydown', e => { if (e.key === 'Enter') clCreate(); });
  $('cl-field-add').addEventListener('click', () => { clAddField($('cl-field-inp').value); $('cl-field-inp').value = ''; $('cl-field-inp').focus(); });
  $('cl-field-inp').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); $('cl-field-add').click(); } });
  $('cl-tpl').addEventListener('click', () => { const l = clLayer(); if (l) downloadLayerTemplate(_cl.kind, l); });
  $('cl-upload').addEventListener('click', () => {
    if (_cl.kind === 'heat') { _heatUpdateTarget = _cl.key; $('heat-update-file').click(); }
    else { _cptUploadTarget = _cl.key; $('cpt-file').click(); }
    closeCreateLayer();
  });
  $('cl-modal').addEventListener('keydown', e => { if (e.key === 'Escape') closeCreateLayer(); });
}

let cityRenderSeq = 0;
let cityFlyTimer = null;

function scheduleCityRender(after) {
  const seq = ++cityRenderSeq;
  const run = () => {
    if (seq !== cityRenderSeq) return;
    renderHeat(); renderCustomPoints(); renderRecs(); renderCityInfo(); saveState();
    if (after) after();
  };
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(run, { timeout: 180 });
  } else {
    window.setTimeout(run, 0);
  }
}

function selectedFramePoints() {
  const pts = visiblePts();
  // Always include every selected city centroid. This guarantees that a city
  // with no currently loaded records is still inside the automatic frame.
  if (hasCityFilter()) selectedCities.forEach(c => { if (CC[c]) pts.push(CC[c]); });
  return pts;
}

function focusCityView(pulse = true) {
  const bar = document.getElementById('city-bar');
  if (pulse && bar) {
    bar.classList.remove('is-flying');
    // Restart the short focus pulse even when the same selection is clicked again.
    void bar.offsetWidth;
    bar.classList.add('is-flying');
    window.clearTimeout(cityFlyTimer);
    cityFlyTimer = window.setTimeout(() => bar.classList.remove('is-flying'), 760);
  }

  map.stop();
  const pts = selectedFramePoints();
  const opts = { duration: .62, easeLinearity: .18, animate: true };
  window.requestAnimationFrame(() => {
    if (pts.length) {
      map.flyToBounds(L.latLngBounds(pts).pad(.12), {
        ...opts,
        paddingTopLeft: [24, 92], paddingBottomRight: [24, 24], maxZoom: 13.5,
      });
      return;
    }
    const centers = selectedCities.map(c => CC[c]).filter(Boolean);
    if (centers.length > 1) {
      map.flyToBounds(L.latLngBounds(centers).pad(.25), {
        ...opts,
        paddingTopLeft: [24, 92], paddingBottomRight: [24, 24], maxZoom: 11.5,
      });
    } else if (centers.length === 1) {
      map.flyTo(centers[0], 12, opts);
    } else if (CITIES[0] && CC[CITIES[0]]) {
      map.flyTo(CC[CITIES[0]], 6, opts);
    }
  });
}

let cityFilterBound = false;

/* ── БЕЗОПАСНЫЙ ТРЕУГОЛЬНИК: меню и подсказки по наведению ───────────────
   На компьютере с мышью меню открывается наведением (после короткой паузы,
   чтобы не всплывать от случайного пролёта курсора). Пока курсор едет от
   кнопки к меню, он проходит над «ничьим» местом — без защиты меню бы
   закрылось. Защита — треугольник: вершина в точке, где курсор покинул
   кнопку, основание — ближняя к ней сторона меню. Пока курсор внутри
   треугольника и движется, меню открыто; застыл в нём или вышел — меню
   закрывается после короткой паузы.
   Клик по кнопке, клик или ввод внутри меню «закрепляют» его: дальше оно
   закрывается только как раньше — кликом снаружи или Esc. Меню, открытые
   кликом, этот механизм не трогает. На сенсорных экранах всё по-старому. */
const HOVER_CAPABLE = !!(window.matchMedia && matchMedia('(hover: hover) and (pointer: fine)').matches);
function triArea(a, b, c) { return (a.x - c.x) * (b.y - c.y) - (b.x - c.x) * (a.y - c.y); }
function pointInTri(p, a, b, c) {
  const d1 = triArea(p, a, b), d2 = triArea(p, b, c), d3 = triArea(p, c, a);
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
}
function pointInRect(p, r, pad = 0) {
  return p.x >= r.left - pad && p.x <= r.right + pad && p.y >= r.top - pad && p.y <= r.bottom + pad;
}
// Основание треугольника — сторона меню, обращённая к вершине; чуть шире
// меню, чтобы край не «обрезал» траекторию.
function safeTriangle(apex, r, pad = 8) {
  if (apex.y <= r.top)    return [apex, { x: r.left - pad, y: r.top },    { x: r.right + pad, y: r.top }];
  if (apex.y >= r.bottom) return [apex, { x: r.left - pad, y: r.bottom }, { x: r.right + pad, y: r.bottom }];
  if (apex.x <= r.left)   return [apex, { x: r.left, y: r.top - pad },    { x: r.left, y: r.bottom + pad }];
  return [apex, { x: r.right, y: r.top - pad }, { x: r.right, y: r.bottom + pad }];
}
function hoverMenu(o) {
  const trigger = o.trigger;
  if (!HOVER_CAPABLE || !trigger) return null;
  const openDelay = o.openDelay ?? 160, closeDelay = o.closeDelay ?? 260, stallMs = o.stallMs ?? 420;
  let openT = 0, closeT = 0, stallT = 0, managed = false, pinned = false, apex = null, lastIn = null;
  const clearClose = () => { clearTimeout(closeT); closeT = 0; clearTimeout(stallT); stallT = 0; };
  const stop = () => { managed = false; pinned = false; apex = null; lastIn = null; clearClose(); document.removeEventListener('pointermove', onMove, true); };
  const closeNow = () => { if (managed && !pinned && o.isOpen()) o.close(); stop(); };
  const closeSoon = ms => { if (!closeT) closeT = setTimeout(() => { closeT = 0; closeNow(); }, ms); };
  function onMove(e) {
    if (e.pointerType && e.pointerType !== 'mouse') return;
    if (!managed || pinned || !o.isOpen()) { stop(); return; }
    const panel = o.panel();
    if (!panel) return;
    const p = { x: e.clientX, y: e.clientY };
    const pr = panel.getBoundingClientRect();
    if (pointInRect(p, trigger.getBoundingClientRect(), 1)) { lastIn = p; apex = null; clearClose(); return; }
    if (pointInRect(p, pr, 1)) { lastIn = null; apex = null; clearClose(); return; }
    // Вне кнопки и меню. Вышли из кнопки — проверяем треугольник к меню.
    if (!apex && lastIn) apex = lastIn;
    lastIn = null;
    if (apex && pointInTri(p, ...safeTriangle(apex, pr))) {
      clearTimeout(closeT); closeT = 0;
      clearTimeout(stallT); stallT = setTimeout(closeNow, stallMs);   // застыл по пути — закрываем
      return;
    }
    apex = null;
    clearTimeout(stallT); stallT = 0;
    closeSoon(closeDelay);
  }
  const pin = () => { if (managed) { pinned = true; clearClose(); } };
  trigger.addEventListener('pointerenter', e => {
    if (e.pointerType !== 'mouse' || o.isOpen() || (o.canOpen && !o.canOpen())) return;
    clearTimeout(openT);
    openT = setTimeout(async () => {
      openT = 0;
      if (o.isOpen()) return;
      managed = true; pinned = false; apex = null; lastIn = null;
      document.addEventListener('pointermove', onMove, true);
      await o.open();
    }, openDelay);
  });
  trigger.addEventListener('pointerleave', () => { clearTimeout(openT); openT = 0; });
  // Клик по кнопке открытого наведением меню закрепляет его, а не закрывает.
  trigger.addEventListener('click', e => {
    if (managed && !pinned && o.isOpen()) { e.preventDefault(); e.stopImmediatePropagation(); pin(); }
    else if (!o.isOpen()) stop();   // откроется кликом — это не наше меню
  }, true);
  const bindPanel = () => {
    const panel = o.panel();
    if (!panel || panel._hmHoverBound) return;
    panel._hmHoverBound = true;
    panel.addEventListener('pointerdown', () => pin(), true);
    panel.addEventListener('focusin', () => pin());
    panel.addEventListener('keydown', () => pin(), true);
  };
  return { bindPanel, pin, stop };
}

/* ── «КАПЛЯ»: перетекающий индикатор выбора и всплеск при нажатии ─────────
   Контейнер с атрибутом data-liquid="<класс активного>" получает подложку,
   которая при смене выбора не прыгает, а перетекает: вытягивается между
   старым и новым местом, чуть сплющивается и мягко садится с отскоком.
   Классы активных пунктов меняет обычный код — подложку двигает наблюдатель,
   поэтому обработчики кликов трогать не нужно. */
const REDUCED_MOTION = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
function liquidRect(container, item) {
  const c = container.getBoundingClientRect(), r = item.getBoundingClientRect();
  return { x: r.left - c.left + container.scrollLeft, y: r.top - c.top + container.scrollTop, w: r.width, h: r.height };
}
function liquidSync(container, animate) {
  const cls = container.dataset.liquid;
  const active = [...container.children].find(el => !el.classList.contains('liquid') && el.classList.contains(cls));
  let blob = container.querySelector(':scope > .liquid');
  if (!active) { if (blob) blob.style.opacity = '0'; container._liqPrev = null; return; }
  const to = liquidRect(container, active);
  if (!to.w || !to.h) { container._liqPrev = null; return; }      // контейнер скрыт
  if (!blob) {
    blob = document.createElement('span');
    blob.className = 'liquid'; blob.setAttribute('aria-hidden', 'true');
    container.prepend(blob);
  }
  const from = container._liqPrev;
  blob.style.opacity = '1';
  blob.style.transform = `translate(${to.x}px, ${to.y}px)`;
  blob.style.width = to.w + 'px'; blob.style.height = to.h + 'px';
  if (animate && from && !REDUCED_MOTION && (Math.abs(from.x - to.x) > 1 || Math.abs(from.y - to.y) > 1) && blob.animate) {
    const sameRow = Math.abs(from.y - to.y) < 4;
    const left = Math.min(from.x, to.x), right = Math.max(from.x + from.w, to.x + to.w);
    const mid = sameRow
      ? { x: left, y: to.y + to.h * .1, w: right - left, h: to.h * .8 }                     // капля тянется вдоль ряда
      : { x: (from.x + to.x) / 2 - to.w * .1, y: (from.y + to.y) / 2, w: to.w * 1.2, h: to.h * .82 };
    blob.animate([
      { transform: `translate(${from.x}px, ${from.y}px)`, width: from.w + 'px', height: from.h + 'px' },
      { transform: `translate(${mid.x}px, ${mid.y}px)`, width: mid.w + 'px', height: mid.h + 'px', offset: .42 },
      { transform: `translate(${to.x}px, ${to.y}px)`, width: to.w + 'px', height: to.h + 'px' },
    ], { duration: 480, easing: 'cubic-bezier(.34,1.45,.64,1)' });
  }
  container._liqPrev = to;
}
const _liqQueue = new Map();
function liquidSchedule(container, animate) {
  if (!container || !container.dataset || !container.dataset.liquid) return;
  _liqQueue.set(container, (_liqQueue.get(container) || false) || animate);
  if (_liqQueue.size === 1) requestAnimationFrame(() => {
    const items = [..._liqQueue]; _liqQueue.clear();
    items.forEach(([c, a]) => { if (c.isConnected) liquidSync(c, a); });
  });
}
const _liqResize = typeof ResizeObserver !== 'undefined'
  ? new ResizeObserver(entries => entries.forEach(en => liquidSchedule(en.target, false))) : null;
function liquidRegister(root) {
  const list = root.matches && root.matches('[data-liquid]') ? [root] : [];
  if (root.querySelectorAll) list.push(...root.querySelectorAll('[data-liquid]'));
  list.forEach(c => {
    if (!c._liqObserved && _liqResize) { _liqResize.observe(c); c._liqObserved = true; }
    liquidSchedule(c, false);
  });
}
new MutationObserver(records => {
  for (const r of records) {
    const t = r.target;
    if (t.closest && t.closest('#map')) continue;            // карта меняет классы постоянно
    if (r.type === 'attributes') {
      const p = t.parentElement;
      if (p && p.dataset && p.dataset.liquid && !t.classList.contains('liquid')) liquidSchedule(p, true);
    } else {
      r.addedNodes.forEach(n => { if (n.nodeType === 1 && !n.classList.contains('liquid')) liquidRegister(n); });
    }
  }
}).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
document.addEventListener('DOMContentLoaded', () => liquidRegister(document.body));
if (document.readyState !== 'loading') liquidRegister(document.body);

// Всплеск-капля от точки нажатия.
const DROP_TARGETS = '.pick-row, .lc-ic, .create-btn, .addr-act, .vt, .city-option, .mk-shape, .mk-glyph, .side-tab, .map-menu-item, .map-menu-new, .pp2-preset, .lyr-act, .city-extra-btn, .zbtn, .cl-big, .modal-btn, .map-row, .city-filter-trigger, .lc-link, .pick-more, .rp-list-toggle, .btn';
document.addEventListener('pointerdown', e => {
  if (REDUCED_MOTION || e.button !== 0) return;
  const el = e.target.closest && e.target.closest(DROP_TARGETS);
  if (!el || el.disabled) return;
  const r = el.getBoundingClientRect();
  const d = Math.max(r.width, r.height) * 2.4;
  if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
  let wrap = el.querySelector(':scope > .drop-wrap');
  if (!wrap) { wrap = document.createElement('span'); wrap.className = 'drop-wrap'; wrap.setAttribute('aria-hidden', 'true'); el.appendChild(wrap); }
  const drop = document.createElement('span');
  drop.className = 'drop-ripple';
  drop.style.width = drop.style.height = d + 'px';
  drop.style.left = (e.clientX - r.left - d / 2) + 'px';
  drop.style.top = (e.clientY - r.top - d / 2) + 'px';
  wrap.appendChild(drop);
  drop.addEventListener('animationend', () => drop.remove(), { once: true });
}, { passive: true });

// Всплывающие подсказки «ⓘ». Раньше это был CSS ::after: его обрезала
// прокрутка боковой панели, до него нельзя было дотянуться курсором, а с
// клавиатуры и на телефоне он не открывался вовсе.
let _tipFor = null;
function tipBox() {
  let el = document.getElementById('hm-tip');
  if (!el) {
    el = document.createElement('div');
    el.id = 'hm-tip'; el.className = 'hm-tip'; el.setAttribute('role', 'tooltip'); el.hidden = true;
    document.body.appendChild(el);
  }
  return el;
}
function showTip(icon) {
  const el = tipBox();
  el.textContent = icon.dataset.tip || '';
  el.hidden = false;
  _tipFor = icon;
  icon.setAttribute('aria-describedby', 'hm-tip');
  icon.setAttribute('aria-expanded', 'true');
  const r = icon.getBoundingClientRect();
  const w = el.offsetWidth, h = el.offsetHeight;
  const left = Math.max(8, Math.min(r.left + r.width / 2 - w / 2, window.innerWidth - w - 8));
  const above = r.top - h - 8;
  el.style.left = left + 'px';
  el.style.top = (above >= 8 ? above : r.bottom + 8) + 'px';
  el.classList.toggle('below', above < 8);
}
function hideTip() {
  const el = document.getElementById('hm-tip');
  if (el) el.hidden = true;
  if (_tipFor) { _tipFor.removeAttribute('aria-describedby'); _tipFor.setAttribute('aria-expanded', 'false'); }
  _tipFor = null;
}
function wireTips(root = document) {
  root.querySelectorAll('.tip-icon[data-tip]').forEach(icon => {
    if (icon._tipWired) return;
    icon._tipWired = true;
    icon.tabIndex = 0;
    icon.setAttribute('role', 'button');
    icon.setAttribute('aria-label', 'Подсказка');
    icon.setAttribute('aria-expanded', 'false');
    const hm = hoverMenu({
      trigger: icon, openDelay: 80, closeDelay: 200,
      panel: () => (_tipFor === icon ? tipBox() : null),
      isOpen: () => _tipFor === icon && !tipBox().hidden,
      open: () => showTip(icon),
      close: hideTip,
    });
    if (hm) hm.bindPanel();
    icon.addEventListener('click', e => {
      e.preventDefault(); e.stopPropagation();
      if (_tipFor === icon) hideTip(); else showTip(icon);
    });
    icon.addEventListener('focus', () => showTip(icon));
    icon.addEventListener('blur', () => { if (_tipFor === icon) hideTip(); });
    icon.addEventListener('keydown', e => { if (e.key === 'Escape') hideTip(); });
  });
}
document.addEventListener('pointerdown', e => {
  if (_tipFor && !e.target.closest('.tip-icon') && !e.target.closest('#hm-tip')) hideTip();
});
window.addEventListener('scroll', () => { if (_tipFor) hideTip(); }, true);

/* Сводка по городу — кнопка «Город» на карте вместо отдельной вкладки.
   Наведение открывает (безопасный треугольник), клик закрепляет. */
function setCityInfoPop(open) {
  const pop = document.getElementById('city-pop');
  const btn = document.getElementById('city-info-btn');
  if (!pop || !btn) return;
  if (open) { renderCityInfo(); setCityPopover(false); }
  pop.hidden = !open;
  btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  btn.classList.toggle('on', open);
}
function wireCityInfoPop() {
  const btn = document.getElementById('city-info-btn');
  const pop = document.getElementById('city-pop');
  if (!btn || !pop || btn._wired) return;
  btn._wired = true;
  btn.addEventListener('click', () => setCityInfoPop(pop.hidden));
  document.addEventListener('pointerdown', e => {
    if (!pop.hidden && !e.target.closest('#city-info-wrap')) setCityInfoPop(false);
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !pop.hidden) setCityInfoPop(false); });
  const hm = hoverMenu({
    trigger: btn,
    panel: () => pop,
    isOpen: () => !pop.hidden,
    open: () => setCityInfoPop(true),
    close: () => setCityInfoPop(false),
  });
  if (hm) hm.bindPanel();
}

function setCityPopover(open, focusSearch = true) {
  const pop = document.getElementById('city-filter-popover');
  const trigger = document.getElementById('city-filter-trigger');
  if (!pop || !trigger) return;
  if (open && !document.getElementById('city-pop')?.hidden) setCityInfoPop(false);
  pop.hidden = !open;
  trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
  document.getElementById('city-filter')?.classList.toggle('open', open);
  // При открытии наведением фокус в поиск не ставим: это закрепило бы меню
  // и увело фокус у пользователя, который просто провёл мышью.
  if (open && focusSearch) window.setTimeout(() => document.getElementById('city-filter-search')?.focus(), 0);
}

function updateCityFilterSummary() {
  const label = document.getElementById('city-filter-label');
  const count = document.getElementById('city-filter-count');
  if (label) {
    const c0 = selectedCities[0];
    const first = cityScope === 'city' && cityScopeAvailable(c0) ? c0 + ' (город)' : c0;
    label.textContent = selectedCities.length === 0
      ? 'Все города'
      : selectedCities.length === 1 ? first : first + ` + ${selectedCities.length - 1}`;
  }
  if (count) count.textContent = selectedCities.length > 1 ? String(selectedCities.length) : '';
  document.querySelectorAll('#seg-city [data-city-option]').forEach(b => {
    const isAll = b.dataset.cityOption === '__all__';
    const active = isAll ? !hasCityFilter() : selectedCities.includes(b.dataset.cityOption);
    b.classList.toggle('on', active);
    b.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
  const sub = document.getElementById('city-filter-subtitle');
  if (sub) sub.textContent = hasCityFilter() ? `Выбрано: ${selectedCities.length} ${cityPlural(selectedCities.length)}` : 'Показываются все города';
}

function scheduleCityFilterUpdate() {
  renderCityInfo();
  // Frame only after the selected layers have been rebuilt; otherwise visiblePts()
  // still describes the previous city selection.
  scheduleCityRender(() => focusCityView(true));
}

function toggleCitySelection(name) {
  const next = selectedCities.includes(name)
    ? selectedCities.filter(c => c !== name)
    : [...selectedCities, name];
  selectedCities = canonicalCities(next);
  buildTshkScopeUI();
  updateCityFilterSummary();
  scheduleCityFilterUpdate();
}

function bindCityFilter() {
  if (cityFilterBound) return;
  cityFilterBound = true;
  document.getElementById('city-filter-trigger')?.addEventListener('click', () => {
    const pop = document.getElementById('city-filter-popover');
    setCityPopover(Boolean(pop?.hidden));
  });
  document.getElementById('city-filter-clear')?.addEventListener('click', () => {
    selectedCities = [];
    updateCityFilterSummary();
    scheduleCityFilterUpdate();
  });
  document.getElementById('city-filter-search')?.addEventListener('input', e => {
    const q = e.target.value.trim().toLocaleLowerCase('ru');
    document.querySelectorAll('#seg-city [data-city-option]:not([data-city-option="__all__"])').forEach(b => {
      b.hidden = q && !b.dataset.cityOption.toLocaleLowerCase('ru').includes(q);
    });
  });
  document.addEventListener('click', e => {
    const wrap = document.getElementById('city-filter');
    if (wrap && !wrap.contains(e.target)) setCityPopover(false);
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') setCityPopover(false);
  });
  wireCityInfoPop();
  const hm = hoverMenu({
    trigger: document.getElementById('city-filter-trigger'),
    panel: () => document.getElementById('city-filter-popover'),
    isOpen: () => !document.getElementById('city-filter-popover')?.hidden,
    open: () => setCityPopover(true, false),
    close: () => setCityPopover(false),
  });
  if (hm) hm.bindPanel();
}

function buildCityUI() {
  const el = document.getElementById('seg-city');
  if (!el) return;
  el.innerHTML = '';
  const mk = (val, lab, all = false) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'city-option';
    b.dataset.cityOption = all ? '__all__' : val;
    b.setAttribute('aria-pressed', all ? String(!hasCityFilter()) : String(selectedCities.includes(val)));
    b.innerHTML = `<span>${esc(lab)}</span>`;
    b.addEventListener('click', () => {
      if (all) selectedCities = [];
      else toggleCitySelection(val);
      updateCityFilterSummary();
      if (all) scheduleCityFilterUpdate();
    });
    el.appendChild(b);
  };
  mk('', 'Все города', true);
  CITIES.forEach(c => mk(c, c));
  buildTshkScopeUI();
  bindCityFilter();
  updateCityFilterSummary();
}

/* Переключатель охвата города. Виден только там, где он имеет смысл: выбран
   хотя бы один город, для которого есть граница. Подпись перечисляет, к каким
   из выбранных городов он применяется. */
function buildTshkScopeUI() {
  const box = document.getElementById('tshk-scope');
  if (!box) return;
  const bounded = citiesWithBounds(selectedCities);
  const show = bounded.length > 0;
  box.hidden = !show;
  if (!show) return;
  const label = box.querySelector('.city-scope-label');
  if (label) label.textContent = bounded.length === 1 ? 'Охват: ' + bounded[0] : 'Охват городов';
  let note = box.querySelector('.city-scope-note');
  if (!note) { note = document.createElement('span'); note.className = 'city-scope-note'; box.appendChild(note); }
  const rest = selectedCities.filter(c => !bounded.includes(c));
  note.textContent = [
    bounded.length > 1 ? 'Применяется к: ' + bounded.join(', ') + '.' : '',
    rest.length ? `${rest.join(', ')} — без границ города, учитываются с окрестностями.` : '',
  ].filter(Boolean).join(' ');
  note.hidden = !note.textContent;
  box.querySelectorAll('[data-tshk]').forEach(btn => {
    const on = btn.dataset.tshk === cityScope;
    btn.classList.toggle('on', on);
    btn.setAttribute('aria-pressed', String(on));
    if (btn._wired) return;
    btn._wired = true;
    btn.addEventListener('click', () => {
      if (cityScope === btn.dataset.tshk) return;
      cityScope = btn.dataset.tshk;
      buildTshkScopeUI();
      updateCityFilterSummary();
      scheduleCityFilterUpdate();
    });
  });
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
// через applyCountry(); см. COUNTRIES ниже). Население — городские значения из
// проверенных city-level источников с датой в popNote; wage — среднее по региону
// за январь–сентябрь 2025 из National Statistics Committee (stat.uz).
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
  'Гулистан': {
    pop: 99300, popNote: 'GoldenPages, 06.05.2024', adult: 0.57, wage: 4.93,
    region: 'Сырдарьинская область',
    tags: [
      'Административный центр Сырдарьинской области',
      'Главный городской рынок области в центральной части Мирзачульской зоны',
      'Региональная зарплата — 4,93 млн сум в месяц за январь–сентябрь 2025',
    ],
  },
  'Денау': {
    pop: 78300, popNote: 'Wikipedia, 2016', adult: 0.55, wage: 4.35,
    region: 'Сурхандарьинская область',
    tags: [
      'Крупный город Сурхандарьинской области и центр Денауского района',
      'Город расположен на юге страны, рядом с направлением к Душанбе',
      'Региональная зарплата — 4,35 млн сум в месяц за январь–сентябрь 2025',
    ],
  },
  'Джизак': {
    pop: 200600, popNote: 'Wikipedia, 2024', adult: 0.57, wage: 4.59,
    region: 'Джизакская область',
    tags: [
      'Административный центр Джизакской области',
      'Город расположен у северных предгорий Нуратау на пересечении региональных направлений',
      'Региональная зарплата — 4,59 млн сум в месяц за январь–сентябрь 2025',
    ],
  },
  'Зарафшан': {
    pop: 100000, popNote: 'оценка по городским источникам, 2024–2025', adult: 0.58, wage: 7.61,
    region: 'Навоийская область',
    tags: [
      'Промышленный город Навоийской области в Кызылкумском регионе',
      'Рынок с высокой ролью промышленной занятости и вахтового/транзитного спроса',
      'Региональная зарплата — 7,61 млн сум в месяц за январь–сентябрь 2025',
    ],
  },
  'Карши': {
    pop: 301000, popNote: 'Wikipedia, 2024', adult: 0.57, wage: 4.27,
    region: 'Кашкадарьинская область',
    tags: [
      'Административный центр Кашкадарьинской области',
      'Крупнейший городской рынок юга центральной части Узбекистана',
      'Региональная зарплата — 4,27 млн сум в месяц за январь–сентябрь 2025',
    ],
  },
  'Наманган': {
    pop: 713500, popNote: 'Wikipedia, 2024', adult: 0.56, wage: 4.54,
    region: 'Наманганская область',
    tags: [
      'Один из крупнейших городов страны и административный центр области',
      'Крупный рынок Ферганской долины с высокой плотностью городского населения',
      'Региональная зарплата — 4,54 млн сум в месяц за январь–сентябрь 2025',
    ],
  },
  'Нукус': {
    pop: 345000, popNote: 'Wikipedia, 2024', adult: 0.57, wage: 4.90,
    region: 'Республика Каракалпакстан',
    tags: [
      'Столица Республики Каракалпакстан и крупнейший город региона',
      'Главный административный, образовательный и культурный центр Каракалпакстана',
      'Региональная зарплата — 4,90 млн сум в месяц за январь–сентябрь 2025',
    ],
  },
  'Термез': {
    pop: 207000, popNote: 'Wikipedia, 2024', adult: 0.57, wage: 4.35,
    region: 'Сурхандарьинская область',
    tags: [
      'Административный центр Сурхандарьинской области',
      'Южный транспортный и туристический центр страны у границы с Афганистаном',
      'Региональная зарплата — 4,35 млн сум в месяц за январь–сентябрь 2025',
    ],
  },
  'Ургенч': {
    pop: 156000, popNote: 'Wikipedia, 2024', adult: 0.57, wage: 4.83,
    region: 'Хорезмская область',
    tags: [
      'Административный центр Хорезмской области',
      'Основной городской и транспортный узел Хорезма, связанный с туристическим потоком Хивы',
      'Региональная зарплата — 4,83 млн сум в месяц за январь–сентябрь 2025',
    ],
  },
  'Шахрисабз': {
    pop: 149000, popNote: 'Wikipedia, 2024', adult: 0.57, wage: 4.27,
    region: 'Кашкадарьинская область',
    tags: [
      'Исторический город Кашкадарьинской области',
      'Туристический и локальный торговый центр южной части области',
      'Региональная зарплата — 4,27 млн сум в месяц за январь–сентябрь 2025',
    ],
  },
  'Чирчик': {
    pop: 175000, popNote: 'Wikipedia, 2024', adult: 0.58, wage: 5.80,
    region: 'Ташкентская область',
    tags: [
      'Крупный город Ташкентской области к северо-востоку от Ташкента',
      'Промышленный и городской рынок в составе столичной агломерации',
      'Региональная зарплата — 5,80 млн сум в месяц за январь–сентябрь 2025',
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
  // Added from the Uzbekistan city request; coordinates are city centroids,
  // not regional centroids. DATA.cig.recs remains the source of truth when
  // records for a city are present.
  'Гулистан':  [40.522, 68.780], 'Денау': [38.267, 67.899], 'Джизак': [40.133, 67.823],
  'Зарафшан':  [41.572, 64.196], 'Карши': [38.841, 65.800], 'Наманган': [41.000, 71.673],
  'Нукус':     [42.460, 59.618], 'Термез': [37.244, 67.283], 'Ургенч': [41.552, 60.631],
  'Шахрисабз': [39.053, 66.828], 'Чирчик': [41.473, 69.581],
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
  uz: { centers: UZ_CENTERS, stats: UZ_STATS, smokeM: 0.194, smokeF: 0.009, wageUnit: 'млн', wageCur: 'сум/мес (янв–сен 2025)' },
  kg: { centers: KG_CENTERS, stats: KG_STATS, smokeM: 0.328, smokeF: 0.029, wageUnit: 'тыс', wageCur: 'сом/мес (2025)' },
};
let COUNTRY = 'uz';

// Activate a map's country: set city list, centroids, stats, smoking rates,
// wage units. Called at the start of startApp() once the map is known.
function applyCountry(mapId) {
  COUNTRY = mapInfo(mapId).country === 'kg' ? 'kg' : 'uz';
  bzInvalidate();   // районы Ташкента в «Границах» — только на картах UZ
  const co = COUNTRIES[COUNTRY];
  CITY_STATS   = co.stats;
  SMOKE_M = co.smokeM; SMOKE_F = co.smokeF; SMOKE_AVG = (SMOKE_M + SMOKE_F) / 2;
  WAGE_UNIT = co.wageUnit; WAGE_CUR = co.wageCur;
  CITIES = Object.keys(co.centers);
  selectedCities = canonicalCities(selectedCities);
  CC = {};
  CITIES.forEach(c => {
    const a = (DATA.cig && DATA.cig.recs) ? DATA.cig.recs.filter(s => s.fil === c) : [];
    CC[c] = a.length
      ? [a.reduce((x, s) => x + s.lat, 0) / a.length, a.reduce((x, s) => x + s.lon, 0) / a.length]
      : co.centers[c];
  });
}

function selectedStats() {
  if (selectedCities.length === 1) return CITY_STATS[selectedCities[0]] || null;
  if (!selectedCities.length) return null;
  const rows = selectedCities.map(c => CITY_STATS[c]).filter(Boolean);
  if (!rows.length) return null;
  const pop = rows.reduce((sum, r) => sum + r.pop, 0);
  const adult = rows.reduce((sum, r) => sum + r.pop * r.adult, 0) / pop;
  const wage = rows.reduce((sum, r) => sum + r.pop * r.wage, 0) / pop;
  const names = selectedCities.join(', ');
  return {
    pop, adult, wage,
    region: 'сводно по выбранным городам',
    popNote: `агрегация: ${rows.length} города`,
    tags: [
      `В выборке: ${names}`,
      `Суммарное население выбранных городов — ${Math.round(pop).toLocaleString('ru-RU')}`,
      `Средняя региональная зарплата по выборке — ${wage.toFixed(2).replace('.', ',')} млн сум/мес`,
    ],
  };
}

function renderCityInfo() {
  const el = document.getElementById('city-info');
  if (!el) return;
  if (!hasCityFilter()) {
    el.innerHTML = `<div class="ci-hint">
      <div class="ci-hint-icon">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18"/><path d="M5 21V7l8-4v18"/><path d="M19 21V11l-6-4"/><line x1="9" y1="9" x2="9" y2="9.01"/><line x1="9" y1="12" x2="9" y2="12.01"/><line x1="9" y1="15" x2="9" y2="15.01"/><line x1="9" y1="18" x2="9" y2="18.01"/></svg>
      </div>
      Выберите один или несколько городов в компактном фильтре сверху карты, чтобы получить краткую
      информацию о населении и потенциале выбранной территории.</div>`;
    return;
  }
  const s   = selectedStats();
  const fmt = n => Math.round(n).toLocaleString('ru-RU');

  // live-метрика: число наших точек в выбранном наборе городов
  const ownN = selectedCities.reduce((sum, c) => sum + ourPtsInCity(c), 0);

  let html = '';
  if (s) {
    const adults  = s.pop * s.adult;
    const smokers = adults * SMOKE_AVG;
    const smMen   = adults * 0.5 * SMOKE_M;
    html += `
    <div class="ci-card">
      <div class="ci-head">
        <div>
          <div class="ci-city">${esc(selectedCityLabel())}</div>
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
        <div class="ci-city">${esc(selectedCityLabel())}</div>
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
    : `<div class="ci-note">Источники: городские значения населения — указаны под карточкой и в журнале проекта; средняя зарплата — National Statistics Committee (stat.uz), среднее по региону за январь–сентябрь 2025. ВОЗ — доля курящих среди взрослых (2024): мужчины ${mPct}%, женщины ${fPct}%. Население 21+ и число курильщиков — оценка по возрастной структуре. Продажа табачной продукции в РУз — только лицам 21+.</div>`;

  el.innerHTML = html;
}

/* Coordinates of everything currently drawn on the map (heat layers and our
   point layers), filtered by the selected city where the layer has a city tag. Used to frame the view — «по размеру» must show what the
   user actually sees, not the base dataset that isn't drawn at all. */
function visiblePts() {
  const out = [];
  heatKeys.forEach(k => {
    const d = DS[k];
    if (!d || !d.visible || !d.recs) return;
    for (const r of d.recs) if (recInSelection(r)) out.push([r.lat, r.lon]);
  });
  customPtLayers.forEach(l => {
    if (!l.visible) return;
    for (const r of l.recs) if (selectedPointMatches(r)) out.push([r.lat, r.lon]);
  });
  return out;
}

/* Fit the map to what is visible (or the city centre when nothing is drawn). */
function fitView() {
  focusCityView(false);
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
    l._shownCount = 0;
    l._shownRecs = [];
    if (!l.visible || !l.recs.length) return;
    const pinIcon = l.icon, pinShape = l.shape;
    const markerSize = Math.min(44, Math.max(20, Number.isFinite(+l.size) ? +l.size : 30));
    const markerOpacity = Math.min(1, Math.max(.2, Number.isFinite(+l.opacity) ? +l.opacity : 1));
    // У точки может быть свой цвет (`r.color`) — тогда метка сплошная этого
    // цвета; иначе цвет (или градиент) слоя. SVG кэширует pinSvg.
    const iconFor = color => color ? pinSvg(pinIcon, color, '', markerSize, pinShape) : pinSvg(pinIcon, l.color, l.color2, markerSize, pinShape);
    const recs = l.recs.filter(r => selectedPointMatches(r));
    l._shownCount = recs.length;   // столько же показывает легенда
    l._shownRecs = recs;           // для подписей — ровно то, что нарисовано
    // coverage radius circles (under markers)
    if (l.radiusOn) {
      const rc = l.radiusColor || l.color, rop = l.radiusOpacity == null ? 0.15 : l.radiusOpacity;
      recs.forEach(r => {
        const col = r.color || rc;
        L.circle([r.lat, r.lon], {
          renderer: radiusRenderer, pane: 'ptradius',
          radius: l.radiusM || 1500, color: col, weight: 1.2,
          opacity: Math.min(rop + 0.35, 0.9), fillColor: col, fillOpacity: rop,
          interactive: false,
        }).addTo(l._group);
      });
    }
    recs.forEach(r => {
      const ic = iconFor(r.color);
      const m = L.marker([r.lat, r.lon], {
        icon: L.divIcon({
          className: '',
          html: `<span class="pt-marker-wrap" style="opacity:${markerOpacity}">${ic.html}</span>`,
          iconSize: [markerSize, markerSize], iconAnchor: ic.anchor,
        }),
        zIndexOffset: 1500,
      });
      const rich = l.manual || isManualRec(r);
      if (rich) {
        // Карточка с фото собирается при открытии — байты снимков до клика не нужны.
        m.bindPopup(() => manualPopupHtml(l, r), { maxWidth: 300, className: 'retail-popup' });
        m.on('popupopen', e => wireManualPopup(e.popup, l, r, m));
      } else {
        const parts = [r.name ? `<div class="pp-title">${esc(r.name)}</div>` : ''];
        if (r.addr)  parts.push(`<div class="pp-row"><span>Адрес</span><b style="font-family:Inter;font-weight:500;text-align:right">${esc(r.addr)}</b></div>`);
        if (r.hours) parts.push(`<div class="pp-row"><span>Часы</span><b>${esc(r.hours)}</b></div>`);
        if (r.code)  parts.push(`<div class="pp-row"><span>Код</span><b>${esc(r.code)}</b></div>`);
        parts.push(extraRowsHtml(r));
        parts.push(yandexLinkHtml(r.lat, r.lon));
        m.bindPopup(parts.filter(Boolean).join(''));
      }
      if (r.name) m.bindTooltip(`<b style="font-weight:700">${esc(r.name)}</b><br>${esc(l.name)}`, { className: 'tt', direction: 'top', offset: [0, -ic.anchor[1] + 4] });
      m.addTo(l._group);
    });
  });
  updateLayerLegend();
  scheduleLabels();
  scheduleZones();   // зоны плотности слоёв точек следуют за фильтром и видимостью
}

/* ── НАЗВАНИЯ ТОЧЕК НА КАРТЕ ─────────────────────────────────────────────
   Подписи слоёв вкладки «Точки» (флаг слоя `labels`). Раскладка жадная: для
   каждой точки пробуем четыре места вокруг маркера (справа, слева, сверху,
   снизу) и ставим подпись в первое, где она не задевает ни уже поставленные
   подписи, ни маркеры. Не влезла — не рисуем: при приближении место
   появится. Пересчёт после каждого сдвига/зума; во время анимации зума
   подписи скрыты, иначе они «плывут» мимо маркеров. */
map.createPane('ptlabels');
map.getPane('ptlabels').style.zIndex = 640;          // над маркерами (600), под всплывающими подсказками (650)
map.getPane('ptlabels').style.pointerEvents = 'none';
const lblBox = L.DomUtil.create('div', 'pt-labels', map.getPane('ptlabels'));
const LABEL_FONT = '600 11px Inter, sans-serif';
const LABEL_H = 18, LABEL_PAD = 15, LABEL_MAX = 28, LABEL_GAP = 2;
const _lblCtx = document.createElement('canvas').getContext('2d');
const _lblWidth = new Map();
const MAP_OVERLAYS = '#city-bar, #layer-legend, #zone-scales, #tag-note, #map-stat, #mode-badge, #update-banner, #zoom-ctl, #side-reopen, #ruler-hint, #bdraw-bar';
let _lblFrame = 0;

function labelText(name) {
  const t = String(name == null ? '' : name).replace(/\s+/g, ' ').trim();
  return t.length > LABEL_MAX ? t.slice(0, LABEL_MAX - 1) + '…' : t;
}
function labelWidth(text) {
  let w = _lblWidth.get(text);
  if (w == null) {
    _lblCtx.font = LABEL_FONT;
    w = Math.ceil(_lblCtx.measureText(text).width) + LABEL_PAD + 2;
    _lblWidth.set(text, w);
  }
  return w;
}
// Шрифт Inter догружается позже первой отрисовки — ширины надо перемерить.
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { _lblWidth.clear(); scheduleLabels(); });

function scheduleLabels() {
  if (_lblFrame) return;
  _lblFrame = requestAnimationFrame(() => { _lblFrame = 0; renderPointLabels(); });
}

function labelLayers() {
  return customPtLayers.filter(l => l.visible && l.labels && l._shownRecs && l._shownRecs.length);
}

function renderPointLabels() {
  const layers = labelLayers();
  const note = document.getElementById('pt-label-note');
  lblBox.style.display = '';
  if (!layers.length) {
    lblBox.innerHTML = '';
    if (note) note.textContent = 'Подписи рядом с метками — без наложений';
    return;
  }
  const size = map.getSize();
  const origin = map.containerPointToLayerPoint([0, 0]);
  const CELL = 64, cols = Math.ceil(size.x / CELL) + 1;
  const grid = new Map();
  const cellsOf = (x, y, w, h, fn) => {
    const c0 = Math.max(0, Math.floor(x / CELL)), c1 = Math.floor((x + w) / CELL);
    const r0 = Math.max(0, Math.floor(y / CELL)), r1 = Math.floor((y + h) / CELL);
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) if (fn(r * cols + c) === false) return false;
    return true;
  };
  const put = b => cellsOf(b[0], b[1], b[2], b[3], k => { let a = grid.get(k); if (!a) grid.set(k, a = []); a.push(b); });
  const free = (x, y, w, h) => cellsOf(x, y, w, h, k => {
    const a = grid.get(k); if (!a) return true;
    for (const b of a) if (x < b[0] + b[2] && x + w > b[0] && y < b[1] + b[3] && y + h > b[1]) return false;
    return true;
  });

  // Плавающие панели поверх карты (фильтр городов, легенда, счётчик, зум) —
  // тоже препятствия: подпись под панелью всё равно не прочитать.
  const mr = map.getContainer().getBoundingClientRect();
  document.querySelectorAll(MAP_OVERLAYS).forEach(el => {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return;
    put([r.left - mr.left - 4, r.top - mr.top - 4, r.width + 8, r.height + 8]);
  });

  // Маркеры всех видимых слоёв точек в кадре — препятствия для подписей.
  const pad = 40;
  const cands = [];
  customPtLayers.forEach((l, li) => {
    if (!l.visible || !l._shownRecs || !l._shownRecs.length) return;
    const ms = Math.min(44, Math.max(20, Number.isFinite(+l.size) ? +l.size : 30));
    const pin = pinSvg(l.icon, l.color, l.color2, ms, l.shape);
    const anc = pin.anchor;
    const inset = ms * .14;
    l._shownRecs.forEach(r => {
      const p = map.latLngToContainerPoint([r.lat, r.lon]);
      if (p.x < -pad || p.y < -pad || p.x > size.x + pad || p.y > size.y + pad) return;
      const box = [p.x - anc[0] + inset, p.y - anc[1] + inset * .5, ms - 2 * inset, pin.h - inset];
      put(box);
      if (l.labels && r.name) cands.push({ l, li, r, box });
    });
  });

  // Порядок важности: ручные точки, затем слои по порядку в списке, затем имя —
  // стабильно, чтобы при сдвиге карты подписи не перескакивали между точками.
  cands.sort((a, b) => (b.l.manual ? 1 : 0) - (a.l.manual ? 1 : 0) || a.li - b.li ||
    String(a.r.name).localeCompare(String(b.r.name), 'ru'));

  const html = [];
  let shown = 0;
  for (const c of cands) {
    const text = labelText(c.r.name);
    if (!text) continue;
    const w = labelWidth(text), h = LABEL_H;
    const [bx, by, bw, bh] = c.box;
    const cx = bx + bw / 2, cy = by + bh / 2;
    const spots = [
      [bx + bw + LABEL_GAP, cy - h / 2],       // справа
      [bx - LABEL_GAP - w, cy - h / 2],        // слева
      [cx - w / 2, by - LABEL_GAP - h],        // сверху
      [cx - w / 2, by + bh + LABEL_GAP],       // снизу
    ];
    for (const [x, y] of spots) {
      if (x < 0 || y < 0 || x + w > size.x || y + h > size.y) continue;
      if (!free(x - 1, y - 1, w + 2, h + 2)) continue;
      put([x, y, w, h]);
      const color = c.r.color || c.l.color || '#888';
      html.push(`<span class="pt-label" style="left:${Math.round(x + origin.x)}px;top:${Math.round(y + origin.y)}px;border-left-color:${esc(color)}">${esc(text)}</span>`);
      shown++;
      break;
    }
  }
  lblBox.innerHTML = html.join('');
  const total = cands.length;
  if (note) {
    note.textContent = !total ? 'В этой области нет точек с названиями'
      : shown < total
        ? `Подписано ${shown.toLocaleString('ru-RU')} из ${total.toLocaleString('ru-RU')} точек в этой области — остальные не помещаются без наложения, приблизьте карту`
        : `Подписаны все ${total.toLocaleString('ru-RU')} точек в этой области`;
  }
}
map.on('zoomstart', () => { if (labelLayers().length) lblBox.style.display = 'none'; });
map.on('moveend zoomend resize', scheduleLabels);

/* ── ЛИНЕЙКА ──────────────────────────────────────────────────────────────
   Зажали Ctrl — в руке линейка: клики по карте ставят точки, у каждой точки
   подписано расстояние от начала, у последней — итог; от последней точки к
   курсору тянется пунктир с текущим расстоянием. Отпустили Ctrl — замер
   остаётся на карте; следующий Ctrl+клик начинает новый. Esc или «×» на
   итоге — стереть. Кнопка-линейка у зума включает тот же режим без Ctrl
   (для тачпада и телефона), повторное нажатие — выключает.
   На Mac Ctrl+клик браузер превращает в правый клик — его тоже ловим. */
const ruler = {
  held: false, sticky: false, pts: [], fresh: true,
  group: L.layerGroup().addTo(map), live: null, liveTip: null,
};
function fmtKm(m) {
  if (!isFinite(m)) return '—';
  return m < 1000 ? Math.round(m) + ' м'
    : (m / 1000).toLocaleString('ru-RU', { maximumFractionDigits: m < 10000 ? 2 : 1 }) + ' км';
}
function rulerActive() { return ruler.held || ruler.sticky; }
function rulerTotal(pts) {
  let t = 0;
  for (let i = 1; i < pts.length; i++) t += map.distance(pts[i - 1], pts[i]);
  return t;
}
function rulerClear() {
  ruler.pts = []; ruler.fresh = true;
  ruler.group.clearLayers();
  ruler.live = null; ruler.liveTip = null;
}
function rulerDraw() {
  ruler.group.clearLayers();
  ruler.live = null; ruler.liveTip = null;
  const pts = ruler.pts;
  if (!pts.length) return;
  if (pts.length > 1) {
    L.polyline(pts, { color: '#ffffff', weight: 6, opacity: .9, interactive: false }).addTo(ruler.group);
    L.polyline(pts, { color: getComputedStyle(document.documentElement).getPropertyValue('--acc').trim() || '#12ADC1', weight: 3, dashArray: '8 6', interactive: false }).addTo(ruler.group);
  }
  let run = 0;
  pts.forEach((p, i) => {
    if (i) run += map.distance(pts[i - 1], p);
    const last = i === pts.length - 1;
    L.circleMarker(p, { radius: 5, weight: 2, color: '#fff', fillColor: '#0E96A8', fillOpacity: 1, interactive: false }).addTo(ruler.group);
    if (i === 0 && !last) return;
    const html = last
      ? `<span class="ruler-total">${i ? fmtKm(run) : 'Начало'}</span><button type="button" class="ruler-x" aria-label="Стереть замер">×</button>`
      : `<span>${fmtKm(run)}</span>`;
    const m = L.marker(p, {
      icon: L.divIcon({ className: 'ruler-label' + (last ? ' last' : ''), html, iconSize: null, iconAnchor: [-8, 12] }),
      interactive: last, keyboard: false, zIndexOffset: 3000,
    }).addTo(ruler.group);
    if (last) {
      m.on('click', e => {
        if (e.originalEvent && e.originalEvent.target.closest('.ruler-x')) { L.DomEvent.stop(e); rulerClear(); }
      });
    }
  });
}
function rulerAdd(latlng) {
  if (ruler.fresh) { ruler.pts = []; ruler.fresh = false; }
  ruler.pts.push(latlng);
  rulerDraw();
}
function rulerLive(latlng) {
  if (!rulerActive() || ruler.fresh || !ruler.pts.length) return;
  const last = ruler.pts[ruler.pts.length - 1];
  const d = rulerTotal(ruler.pts) + map.distance(last, latlng);
  if (!ruler.live) {
    ruler.live = L.polyline([last, latlng], { color: '#0E96A8', weight: 2, dashArray: '3 6', opacity: .9, interactive: false }).addTo(ruler.group);
    ruler.liveTip = L.marker(latlng, { icon: L.divIcon({ className: 'ruler-label live', html: '', iconSize: null, iconAnchor: [-12, 22] }), interactive: false, keyboard: false }).addTo(ruler.group);
  }
  ruler.live.setLatLngs([last, latlng]);
  ruler.liveTip.setLatLng(latlng);
  const el = ruler.liveTip.getElement();
  if (el) el.innerHTML = `<span>${fmtKm(d)}</span>`;
}
function rulerSync() {
  const on = rulerActive();
  map.getContainer().classList.toggle('ruler-mode', on);
  const btn = document.getElementById('ruler-btn');
  if (btn) { btn.classList.toggle('on', on); btn.setAttribute('aria-pressed', on ? 'true' : 'false'); }
  const hint = document.getElementById('ruler-hint');
  if (hint) hint.hidden = !on;
  if (!on) {
    // Отпустили — пунктир к курсору убираем, замер оставляем.
    if (ruler.live) { ruler.group.removeLayer(ruler.live); ruler.group.removeLayer(ruler.liveTip); ruler.live = null; ruler.liveTip = null; }
    ruler.fresh = true;
  }
}
function rulerBlocked() {
  const a = document.activeElement;
  if (a && (a.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName))) return true;
  const rp = document.getElementById('rp-modal');
  if (rp && !rp.hidden) return true;
  return typeof _rpPickingGeo !== 'undefined' && _rpPickingGeo;
}
document.addEventListener('keydown', e => {
  if (e.key === 'Control' && !e.repeat && !ruler.held && !rulerBlocked()) { ruler.held = true; rulerSync(); }
  else if (e.key === 'Escape' && (ruler.pts.length || ruler.sticky)) { rulerClear(); ruler.sticky = false; rulerSync(); }
  // Ctrl+C, Ctrl+V и прочие сочетания — не линейка.
  else if (ruler.held && e.key !== 'Control') { ruler.held = false; rulerSync(); }
});
document.addEventListener('keyup', e => { if (e.key === 'Control' && ruler.held) { ruler.held = false; rulerSync(); } });
window.addEventListener('blur', () => { if (ruler.held) { ruler.held = false; rulerSync(); } });
// Клики ловим на контейнере карты в фазе перехвата: точка ставится поверх
// чего угодно — маркера, района, круга охвата, — и не открывает их карточки.
// Перетаскивание карты (сдвиг больше 5 px) точкой не считается.
let _rulerDown = null;
const _mapEl = map.getContainer();
_mapEl.addEventListener('pointerdown', e => { _rulerDown = { x: e.clientX, y: e.clientY }; }, true);
function rulerTakeClick(e, viaContextMenu) {
  if (!rulerActive() || rulerBlocked()) return;
  if (!viaContextMenu && !(ruler.sticky || e.ctrlKey)) return;
  if (e.target.closest('.ruler-x') || e.target.closest('.leaflet-control-container') || e.target.closest('.leaflet-popup')) return;
  if (_rulerDown && Math.hypot(e.clientX - _rulerDown.x, e.clientY - _rulerDown.y) > 5) return;
  e.preventDefault(); e.stopPropagation();
  rulerAdd(map.mouseEventToLatLng(e));
}
_mapEl.addEventListener('click', e => rulerTakeClick(e, false), true);
// Mac: Ctrl+клик приходит как правый клик.
_mapEl.addEventListener('contextmenu', e => { if (e.ctrlKey && ruler.held) rulerTakeClick(e, true); }, true);
map.on('mousemove', e => rulerLive(e.latlng));
map.on('zoomend', () => { if (ruler.pts.length) rulerDraw(); });
(function wireRulerBtn() {
  const btn = document.getElementById('ruler-btn');
  if (!btn) return;
  btn.addEventListener('click', () => {
    ruler.sticky = !ruler.sticky;
    if (ruler.sticky) ruler.fresh = true;
    rulerSync();
  });
})();

/* ── «ГРАНИЦЫ»: выбор кликом, рисование зон, панель ─────────────────────
   Выбор — проверкой точки в полигоне по клику на карту, а не событиями SVG:
   холст меток лежит выше слоя границ и перехватил бы клики по районам.
   Клик, которым закрыли карточку точки, выбор не меняет. */
let _bzHadPopup = false;
map.on('preclick', () => { _bzHadPopup = !!(map._popup && map.hasLayer(map._popup)); });
map.on('click', e => {
  if (_bzHadPopup) { _bzHadPopup = false; return; }
  if (bdraw.on || rulerActive() || _rpPickingGeo) return;
  const z = zoneAt(e.latlng.lat, e.latlng.lng);
  if (z) toggleBoundZone(z.key);
});

// Рисование своей зоны. Три формы:
// - «Точками» — клики ставят вершины, замыкает клик по первой вершине,
//   двойной клик или Enter; Backspace — шаг назад;
// - «Прямоугольник» — клик в один угол, второй клик в противоположный;
// - «Круг» — клик в центр, второй клик задаёт радиус.
// Круг хранится многоугольником из 64 вершин — так он проходит те же
// проверки «точка в зоне» и площадь, что и остальные зоны. Esc — отмена.
const bdraw = { on: false, layerId: '', shape: 'free', pts: [], cursor: null, group: L.layerGroup().addTo(map) };
const BDRAW_HINT = {
  free: 'клик — точка, по первой — замкнуть',
  rect: 'клик — первый угол, второй клик — противоположный',
  circle: 'клик — центр, второй клик — радиус',
};
function bdrawLayer() { return boundLayers.find(l => l.id === bdraw.layerId); }
function bdrawStart(layerId) {
  setBoundsPop(false);
  if (ruler.sticky) { ruler.sticky = false; rulerSync(); }
  bdraw.on = true; bdraw.layerId = layerId; bdraw.pts = []; bdraw.cursor = null;
  map.doubleClickZoom.disable();
  bdrawRender();
}
function bdrawEnd() {
  bdraw.on = false; bdraw.pts = []; bdraw.cursor = null;
  map.doubleClickZoom.enable();
  bdrawRender();
}
function circleRing(c, r, n = 64) {
  const R = 6378137, d2r = Math.PI / 180, d = r / R;
  const la1 = c.lat * d2r, lo1 = c.lng * d2r, out = [];
  for (let i = 0; i < n; i++) {
    const brg = 2 * Math.PI * i / n;
    const la2 = Math.asin(Math.sin(la1) * Math.cos(d) + Math.cos(la1) * Math.sin(d) * Math.cos(brg));
    const lo2 = lo1 + Math.atan2(Math.sin(brg) * Math.sin(d) * Math.cos(la1), Math.cos(d) - Math.sin(la1) * Math.sin(la2));
    out.push(L.latLng(la2 / d2r, lo2 / d2r));
  }
  return out;
}
// Вершины фигуры по опорной точке и второй точке (клик или курсор).
function bdrawShapePts(a, b) {
  if (!a || !b) return [];
  if (bdraw.shape === 'rect') return [a, L.latLng(a.lat, b.lng), b, L.latLng(b.lat, a.lng)];
  if (bdraw.shape === 'circle') return circleRing(a, map.distance(a, b));
  return [];
}
function bdrawAddZone(pts) {
  const l = bdrawLayer();
  if (!l) { bdrawEnd(); return; }
  const ring = pts.map(p => [+p.lng.toFixed(5), +p.lat.toFixed(5)]);
  ring.push(ring[0].slice());
  l.zones.push({ id: 'z' + Date.now().toString(36), name: `Зона ${l.zones.length + 1}`, mp: [[ring]] });
  l.visible = true;
  _bzOpen.add(l.id);
  bdrawEnd();
  boundsChanged();
  toast(`Зона добавлена в «${l.name}»`, 'ok');
  setBoundsPop(true);
}
function bdrawCommit() {
  if (bdraw.shape !== 'free') return;
  // Двойной клик успевает поставить две вершины в одно место — склеиваем.
  const pts = [];
  bdraw.pts.forEach(p => {
    const last = pts[pts.length - 1];
    if (!last || map.latLngToContainerPoint(last).distanceTo(map.latLngToContainerPoint(p)) > 4) pts.push(p);
  });
  if (pts.length < 3) { toast('Для зоны нужно минимум 3 точки', 'err'); bdraw.pts = pts; bdrawRender(); return; }
  bdrawAddZone(pts);
}
function bdrawSize(pts) {
  if (pts.length < 3) return '';
  const m2 = ringArea(pts.map(p => [p.lng, p.lat]));
  if (m2 < 1) return '';   // курсор ещё в опорной точке — «0 м²» не показываем
  const area = fmtArea(m2);
  if (bdraw.shape === 'circle' && bdraw.pts[0] && bdraw.cursor) return 'R ' + fmtKm(map.distance(bdraw.pts[0], bdraw.cursor)) + ' · ' + area;
  if (bdraw.shape === 'rect') return fmtKm(map.distance(pts[0], pts[1])) + ' × ' + fmtKm(map.distance(pts[1], pts[2])) + ' · ' + area;
  return area;
}
function bdrawRender() {
  map.getContainer().classList.toggle('draw-mode', bdraw.on);
  const bar = document.getElementById('bdraw-bar');
  if (bar) {
    bar.hidden = !bdraw.on;
    const t = document.getElementById('bdraw-name');
    const l = bdrawLayer();
    if (t) t.textContent = l ? l.name : '';
    const h = document.getElementById('bdraw-hint'); if (h) h.textContent = BDRAW_HINT[bdraw.shape];
    bar.querySelectorAll('[data-bdshape]').forEach(b => {
      const on = b.dataset.bdshape === bdraw.shape;
      b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on));
    });
    const ok = document.getElementById('bdraw-done');
    if (ok) { ok.hidden = bdraw.shape !== 'free'; ok.disabled = bdraw.pts.length < 3; }
  }
  bdraw.group.clearLayers();
  if (!bdraw.on) return;
  const col = boundColor((bdrawLayer() || {}).color);
  const pts = bdraw.pts;
  const style = { color: col, weight: 2.5, dashArray: '6 6', fillColor: col, fillOpacity: .15, interactive: false };
  let shape = [];
  if (bdraw.shape === 'free') {
    // Фигура вместе с курсором: видно, какой получится зона.
    shape = bdraw.cursor && pts.length ? pts.concat([bdraw.cursor]) : pts;
    if (shape.length >= 3) L.polygon(shape, style).addTo(bdraw.group);
    else if (shape.length === 2) L.polyline(shape, style).addTo(bdraw.group);
    pts.forEach((p, i) => L.circleMarker(p, {
      radius: i === 0 && pts.length >= 3 ? 7 : 4.5, weight: 2, color: '#fff', fillColor: col, fillOpacity: 1, interactive: false,
      className: i === 0 && pts.length >= 3 ? 'bz-first' : '',
    }).addTo(bdraw.group));
  } else if (pts[0]) {
    shape = bdrawShapePts(pts[0], bdraw.cursor);
    if (shape.length >= 3) L.polygon(shape, style).addTo(bdraw.group);
    L.circleMarker(pts[0], { radius: 4.5, weight: 2, color: '#fff', fillColor: col, fillOpacity: 1, interactive: false }).addTo(bdraw.group);
    if (bdraw.shape === 'circle' && bdraw.cursor) L.polyline([pts[0], bdraw.cursor], { color: col, weight: 1.5, dashArray: '3 6', interactive: false }).addTo(bdraw.group);
  }
  const size = bdraw.cursor ? bdrawSize(shape) : '';
  if (size) {
    L.marker(bdraw.cursor, {
      icon: L.divIcon({ className: 'ruler-label live', html: `<span>${size}</span>`, iconSize: null, iconAnchor: [-12, 22] }),
      interactive: false, keyboard: false,
    }).addTo(bdraw.group);
  }
}
_mapEl.addEventListener('click', e => {
  if (!bdraw.on || rulerActive()) return;
  if (e.target.closest('.leaflet-control-container') || e.target.closest('.leaflet-popup')) return;
  if (_rulerDown && Math.hypot(e.clientX - _rulerDown.x, e.clientY - _rulerDown.y) > 5) return;
  e.preventDefault(); e.stopPropagation();
  const p = map.mouseEventToContainerPoint(e);
  const ll = map.containerPointToLatLng(p);
  if (bdraw.shape !== 'free') {
    if (!bdraw.pts.length) { bdraw.pts = [ll]; bdraw.cursor = ll; bdrawRender(); return; }
    // Второй клик почти в ту же точку — не фигура, а дрожание руки.
    if (map.latLngToContainerPoint(bdraw.pts[0]).distanceTo(p) < 6) return;
    bdrawAddZone(bdrawShapePts(bdraw.pts[0], ll));
    return;
  }
  if (bdraw.pts.length >= 3 && map.latLngToContainerPoint(bdraw.pts[0]).distanceTo(p) < 12) { bdrawCommit(); return; }
  bdraw.pts.push(ll);
  bdrawRender();
}, true);
_mapEl.addEventListener('dblclick', e => {
  if (!bdraw.on) return;
  e.preventDefault(); e.stopPropagation();
  bdrawCommit();
}, true);
let _bdrawRaf = 0;
map.on('mousemove', e => {
  if (!bdraw.on || !bdraw.pts.length) return;
  bdraw.cursor = e.latlng;
  if (!_bdrawRaf) _bdrawRaf = requestAnimationFrame(() => { _bdrawRaf = 0; if (bdraw.on) bdrawRender(); });
});
document.addEventListener('keydown', e => {
  if (!bdraw.on || rulerBlocked()) return;
  // stopImmediatePropagation: иначе тот же Esc сразу закрыл бы вернувшуюся панель.
  if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); bdrawEnd(); setBoundsPop(true); }
  else if (e.key === 'Enter') { e.preventDefault(); bdrawCommit(); }
  else if (e.key === 'Backspace' && bdraw.pts.length) { e.preventDefault(); bdraw.pts.pop(); bdrawRender(); }
});
(function wireBdrawBar() {
  const bar = document.getElementById('bdraw-bar');
  if (!bar) return;
  L.DomEvent.disableClickPropagation(bar);
  document.getElementById('bdraw-done')?.addEventListener('click', bdrawCommit);
  document.getElementById('bdraw-undo')?.addEventListener('click', () => { if (bdraw.pts.length) { bdraw.pts.pop(); bdrawRender(); } });
  document.getElementById('bdraw-cancel')?.addEventListener('click', () => { bdrawEnd(); setBoundsPop(true); });
  bar.querySelectorAll('[data-bdshape]').forEach(b => b.addEventListener('click', () => {
    bdraw.shape = b.dataset.bdshape; bdraw.pts = []; bdraw.cursor = null;
    bdrawRender();
  }));
})();

// GeoJSON: Polygon / MultiPolygon, имя зоны — из properties.name.
function geojsonZones(gj) {
  const feats = gj && gj.type === 'FeatureCollection' ? gj.features
    : gj && gj.type === 'Feature' ? [gj]
    : gj && gj.type ? [{ type: 'Feature', properties: {}, geometry: gj }] : [];
  const okRing = r => Array.isArray(r) && r.length >= 4 && r.every(c => Array.isArray(c) && isFinite(+c[0]) && isFinite(+c[1]) && Math.abs(+c[0]) <= 180 && Math.abs(+c[1]) <= 90);
  const cleanPoly = poly => Array.isArray(poly) && okRing(poly[0])
    ? poly.filter(okRing).map(r => r.map(c => [+(+c[0]).toFixed(5), +(+c[1]).toFixed(5)])) : null;
  const out = [];
  (feats || []).forEach((f, i) => {
    const g = f && f.geometry;
    if (!g) return;
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
    const mp = (polys || []).map(cleanPoly).filter(Boolean);
    if (!mp.length) return;
    const p = f.properties || {};
    const nm = [p.name_ru, p['name:ru'], p.name, p.NAME, p.Name, p.title].find(v => typeof v === 'string' && v.trim());
    out.push({ name: capFirst(nm || `Зона ${i + 1}`).slice(0, 60), mp });
  });
  return out;
}
function boundVertexCount() {
  return boundLayers.reduce((a, l) => a + l.zones.reduce((b, z) => b + z.mp.reduce((c, poly) => c + poly.reduce((d, r) => d + r.length, 0), 0), 0), 0);
}
function importGeojsonInto(layerId, file) {
  const l = boundLayers.find(x => x.id === layerId);
  if (!l || !file) return;
  const rd = new FileReader();
  rd.onload = () => {
    let zones;
    try { zones = geojsonZones(JSON.parse(rd.result)); } catch (_) { toast('Файл не похож на GeoJSON', 'err'); return; }
    if (!zones.length) { toast('В файле нет полигонов (Polygon / MultiPolygon)', 'err', 4000); return; }
    const add = zones.reduce((a, z) => a + z.mp.reduce((b, poly) => b + poly.reduce((c, r) => c + r.length, 0), 0), 0);
    if (boundVertexCount() + add > BZ_MAX_VERTICES) {
      toast(`Слишком подробные границы: ${add.toLocaleString('ru-RU')} вершин. Упростите файл (например, mapshaper.org) до ${BZ_MAX_VERTICES.toLocaleString('ru-RU')}.`, 'err', 6000);
      return;
    }
    const t = Date.now().toString(36);
    zones.forEach((z, i) => l.zones.push({ id: 'z' + t + i, name: z.name, mp: z.mp }));
    l.visible = true;
    _bzOpen.add(l.id);
    boundsChanged();
    const pts = zones.flatMap(z => z.mp.flatMap(poly => poly[0].map(c => [c[1], c[0]])));
    if (pts.length) map.flyToBounds(L.latLngBounds(pts).pad(.1), { duration: .6 });
    toast(`Добавлено ${zones.length} ${plural(zones.length, 'зона', 'зоны', 'зон')} в «${l.name}»`, 'ok');
  };
  rd.readAsText(file);
}

// Вкладка «Границы» в нижней навигации (после «Точек»).
const _bzOpen = new Set();
let _bzCreating = false, _bzNewColor = '';
// Боковая панель на телефоне — выдвижная: при рисовании зоны она убирается,
// чтобы освободить карту, а после — возвращается на вкладку «Границы».
function setSideDrawer(open) {
  const side = document.getElementById('side'), backdrop = document.getElementById('side-backdrop');
  if (!side) return;
  side.classList.toggle('open', open);
  if (backdrop) backdrop.classList.toggle('show', open);
  document.body.classList.toggle('side-open', open);
}
function setBoundsPop(open) {
  const mobile = window.innerWidth <= 780;
  if (!open) { _bzCreating = false; if (mobile) setSideDrawer(false); return; }
  const tab = document.getElementById('bounds-tab');
  if (tab && !tab.classList.contains('active')) tab.click();
  else buildBoundsUI();
  if (mobile) setSideDrawer(true);
}
// Число выбранных зон — на значке вкладки, как число слоёв у «Карты».
function syncBoundsBadge() {
  const badge = document.getElementById('acc-badge-bz');
  if (!badge) return;
  const n = activeBoundZones().length;
  badge.textContent = n ? String(n) : '';
}
function zonesWord(n) { return `${n} ${plural(n, 'зона', 'зоны', 'зон')}`; }
function buildBoundsUI() {
  const box = document.getElementById('bounds-ui');
  if (!box) return;
  const sel = new Set(boundSel);
  const admin = isAdmin();
  const dists = cityDistricts();
  const zoneRow = (key, name, color, delKey) => `
    <div class="bz-zone${sel.has(key) ? ' on' : ''}">
      <button type="button" class="bz-zbtn" data-bzsel="${esc(key)}" aria-pressed="${sel.has(key)}" title="${sel.has(key) ? 'Снять выбор' : 'Выбрать'}"><i style="--c:${color}"></i><span>${esc(name)}</span></button>
      ${delKey ? `<button type="button" class="lc-ic admin-only" data-bzzdel="${esc(delKey)}" title="Удалить зону" aria-label="Удалить зону «${esc(name)}»">${uiIcon('x', 13)}</button>` : ''}
    </div>`;
  const allSel = keys => keys.length && keys.every(k => sel.has(k));
  const pickAll = (id, keys) => keys.length ? `<button type="button" class="lc-link" data-bzall="${esc(id)}">${allSel(keys) ? 'Снять выбор' : 'Выбрать все'}</button>` : '<span></span>';
  let html = `<div class="bz-head"><span>Клик по району или зоне на карте — выбрать, можно несколько. Выбранные видны в легенде с площадью.</span></div>`;

  if (dists.length) {
    const keys = dists.map(f => 'city:' + f.ru);
    const open = _bzOpen.has('city');
    const nSel = keys.filter(k => sel.has(k)).length;
    html += `
    <div class="lc bz-layer${open ? ' open' : ''}${districtsOn ? '' : ' off'}" data-bzid="city">
      <div class="lc-row">
        <span class="lc-sw bz-sw-city" aria-hidden="true" style="background:linear-gradient(135deg, ${incCol.high}, ${incCol.mid} 50%, ${incCol.low})"></span>
        <div class="lc-name"><span class="lc-t">Районы Ташкента</span></div>
        <div class="cbx sm${districtsOn ? ' on' : ''}" data-bzvis="city" role="switch" tabindex="0" aria-checked="${districtsOn}" aria-label="Показывать районы Ташкента"></div>
      </div>
      <div class="lc-sub">
        <span class="lc-n" data-bzmore="city">${dists.length} ${plural(dists.length, 'район', 'района', 'районов')}${nSel ? ` · выбрано ${nSel}` : ''}</span>
        <div class="lc-tools"><button type="button" class="lc-ic lc-more" data-bzmore="city" title="Список районов" aria-label="Список районов" aria-expanded="${open}">${uiIcon('chevron')}</button></div>
      </div>
      <div class="lc-body">
        <div class="bz-zones">${dists.map(f => zoneRow('city:' + f.ru, f.ru, incCol[f.tier] || '#12ADC1', '')).join('')}</div>
        <div class="lc-foot"><span></span>${pickAll('city', keys)}</div>
      </div>
    </div>`;
  }

  html += `<div class="bz-sec">Свои границы</div>`;
  if (!boundLayers.length) {
    html += `<div class="lc-empty">${admin
      ? 'Своих границ пока нет. Создайте слой и нарисуйте зоны на карте или загрузите GeoJSON.'
      : 'Своих границ пока нет — их добавляет владелец карты.'}</div>`;
  }
  boundLayers.forEach(l => {
    const id = esc(l.id);
    const keys = l.zones.map(z => l.id + ':' + z.id);
    const open = _bzOpen.has(l.id);
    const nSel = keys.filter(k => sel.has(k)).length;
    const col = boundColor(l.color);
    html += `
    <div class="lc bz-layer${open ? ' open' : ''}${l.visible ? '' : ' off'}" data-bzid="${id}">
      <div class="lc-row">
        <label class="lc-sw bz-sw" style="background:${col}" title="${admin ? 'Цвет границы' : ''}">${admin ? `<input type="color" data-bzcol="${id}" value="${col}" aria-label="Цвет границы «${esc(l.name)}»"/>` : ''}</label>
        <div class="lc-name"><span class="lc-t" title="${esc(l.name)}">${esc(l.name)}</span>${admin ? `<button type="button" class="lc-ic lc-ren" data-bzren="${id}" title="Переименовать" aria-label="Переименовать «${esc(l.name)}»">${uiIcon('pencil', 13)}</button>` : ''}</div>
        <div class="cbx sm${l.visible ? ' on' : ''}" data-bzvis="${id}" role="switch" tabindex="0" aria-checked="${l.visible}" aria-label="Показывать «${esc(l.name)}» на карте"></div>
      </div>
      <div class="lc-sub">
        <span class="lc-n" data-bzmore="${id}">${zonesWord(l.zones.length)}${nSel ? ` · выбрано ${nSel}` : ''}</span>
        <div class="lc-tools">
          <button type="button" class="lc-ic admin-only" data-bzdraw="${id}" title="Нарисовать зону на карте" aria-label="Нарисовать зону">${uiIcon('plus')}</button>
          <button type="button" class="lc-ic admin-only" data-bzup="${id}" title="Загрузить зоны из GeoJSON" aria-label="Загрузить GeoJSON">${uiIcon('upload')}</button>
          <button type="button" class="lc-ic lc-del admin-only" data-bzdel="${id}" title="Удалить слой границ" aria-label="Удалить слой границ">${uiIcon('trash')}</button>
          <button type="button" class="lc-ic lc-more" data-bzmore="${id}" title="Список зон" aria-label="Список зон" aria-expanded="${open}">${uiIcon('chevron')}</button>
        </div>
      </div>
      <div class="lc-body">
        ${l.zones.length ? `<div class="bz-zones">${l.zones.map(z => zoneRow(l.id + ':' + z.id, z.name, col, l.id + ':' + z.id)).join('')}</div>`
          : `<div class="bz-none">Зон нет — нажмите «+» и обведите участок на карте.</div>`}
        <div class="lc-foot"><span></span>${pickAll(l.id, keys)}</div>
      </div>
    </div>`;
  });
  if (admin) {
    if (_bzCreating) {
      const c = boundColor(_bzNewColor || SWATCHES[(boundLayers.length + 6) % SWATCHES.length]);
      _bzNewColor = c;
      html += `
      <div class="bz-new">
        <input type="text" id="bz-new-name" maxlength="40" placeholder="Название, например «Зона доставки»"/>
        <div class="pp2-sw">${SWATCHES.map(s => `<button type="button" class="sw${s.toLowerCase() === c.toLowerCase() ? ' on' : ''}" data-bzsw="${s}" style="background:${s}" aria-label="Цвет ${s}"></button>`).join('')}</div>
        <div class="bz-new-act">
          <button type="button" class="create-btn" data-bznew="draw">${uiIcon('pencil', 14)} Нарисовать на карте</button>
          <button type="button" class="create-btn ghost" data-bznew="file">${uiIcon('upload', 14)} Из GeoJSON</button>
          <button type="button" class="lc-link" data-bznew="cancel">Отмена</button>
        </div>
      </div>`;
    } else {
      html += `<button type="button" class="create-btn ghost bz-add" data-bzcreate>${uiIcon('plus', 14)} Новая граница</button>`;
    }
  }

  const op = Math.min(.6, Math.max(.04, +distOpacity || .16));
  html += `
    <div class="bz-sec">Яркость заливки</div>
    <div class="lc-sl bz-op"><span>Заливка</span><input type="range" id="bz-opacity" min="0.04" max="0.6" step="0.02" value="${op}" aria-label="Яркость заливки границ"/><b id="bz-opacity-v">${Math.round(op * 100)}%</b></div>
    <div class="bz-filter" id="bz-filter">
      <div class="lc-opt"><div class="cbx sm${boundFilter.on ? ' on' : ''}" data-bzfilter role="switch" tabindex="0" aria-checked="${boundFilter.on}" aria-label="Отбирать точки по выбранным границам"></div><span>Отбирать точки по выбранным зонам</span></div>
      <div class="city-scope-btns bz-mode${boundFilter.on ? '' : ' dim'}" data-liquid="on" role="group" aria-label="Какие точки показывать">
        <button type="button" class="city-scope-btn${boundFilter.mode === 'in' ? ' on' : ''}" data-bzmode="in" aria-pressed="${boundFilter.mode === 'in'}">Только внутри</button>
        <button type="button" class="city-scope-btn${boundFilter.mode === 'out' ? ' on' : ''}" data-bzmode="out" aria-pressed="${boundFilter.mode === 'out'}">Только снаружи</button>
      </div>
      <div class="bz-status">${boundsStatusHtml()}</div>
    </div>`;
  // Перестройка (например, клик по зоне на карте) не стирает набранное имя.
  const typed = box.querySelector('#bz-new-name')?.value || '';
  box.innerHTML = html;
  if (typed && box.querySelector('#bz-new-name')) box.querySelector('#bz-new-name').value = typed;

  const toggleOpen = id => { if (_bzOpen.has(id)) _bzOpen.delete(id); else _bzOpen.add(id); buildBoundsUI(); };
  box.querySelectorAll('[data-bzmore]').forEach(el => el.addEventListener('click', () => toggleOpen(el.dataset.bzmore)));
  box.querySelectorAll('[data-bzvis]').forEach(el => {
    el.addEventListener('click', () => {
      const id = el.dataset.bzvis;
      if (id === 'city') districtsOn = !districtsOn;
      else { const l = boundLayers.find(x => x.id === id); if (!l) return; l.visible = !l.visible; }
      boundsChanged();
    });
    el.addEventListener('keydown', e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); el.click(); } });
  });
  box.querySelectorAll('[data-bzsel]').forEach(el => el.addEventListener('click', () => {
    const key = el.dataset.bzsel;
    // Выбор в списке скрытого слоя бессмыслен — сразу показываем слой.
    const lid = key.slice(0, key.indexOf(':'));
    if (lid === 'city') districtsOn = true;
    else { const l = boundLayers.find(x => x.id === lid); if (l) l.visible = true; }
    toggleBoundZone(key);
  }));
  box.querySelectorAll('[data-bzall]').forEach(el => el.addEventListener('click', () => {
    const id = el.dataset.bzall;
    const keys = id === 'city' ? cityDistricts().map(f => 'city:' + f.ru)
      : ((boundLayers.find(x => x.id === id) || { zones: [] }).zones.map(z => id + ':' + z.id));
    if (id === 'city') districtsOn = true;
    else { const l = boundLayers.find(x => x.id === id); if (l) l.visible = true; }
    if (allSel(keys)) boundSel = boundSel.filter(k => !keys.includes(k));
    else boundSel = boundSel.concat(keys.filter(k => !sel.has(k)));
    _bzNew = '';
    boundsChanged();
  }));
  box.querySelectorAll('[data-bzzdel]').forEach(el => el.addEventListener('click', () => {
    const key = el.dataset.bzzdel, i = key.indexOf(':');
    const l = boundLayers.find(x => x.id === key.slice(0, i)); if (!l) return;
    const z = l.zones.find(x => x.id === key.slice(i + 1)); if (!z) return;
    if (!confirm(`Удалить зону «${z.name}»?`)) return;
    l.zones = l.zones.filter(x => x !== z);
    boundsChanged();
  }));
  box.querySelectorAll('[data-bzdel]').forEach(el => el.addEventListener('click', () => {
    const l = boundLayers.find(x => x.id === el.dataset.bzdel); if (!l) return;
    if (!confirm(`Удалить слой границ «${l.name}» со всеми зонами (${l.zones.length})?`)) return;
    boundLayers = boundLayers.filter(x => x !== l);
    boundsChanged();
  }));
  box.querySelectorAll('[data-bzdraw]').forEach(el => el.addEventListener('click', () => bdrawStart(el.dataset.bzdraw)));
  box.querySelectorAll('[data-bzup]').forEach(el => el.addEventListener('click', () => pickGeojson(el.dataset.bzup)));
  box.querySelectorAll('[data-bzcol]').forEach(el => {
    el.addEventListener('input', () => { el.parentElement.style.background = el.value; });
    el.addEventListener('change', () => {
      const l = boundLayers.find(x => x.id === el.dataset.bzcol); if (!l) return;
      l.color = boundColor(el.value); boundsChanged();
    });
  });
  box.querySelectorAll('[data-bzren]').forEach(el => el.addEventListener('click', () => {
    const l = boundLayers.find(x => x.id === el.dataset.bzren); if (!l) return;
    const nmEl = el.closest('.lc-name'); if (!nmEl) return;
    const inp = document.createElement('input');
    inp.type = 'text'; inp.value = l.name; inp.maxLength = 40; inp.className = 'lc-rename';
    nmEl.replaceWith(inp); inp.focus(); inp.select();
    let done = false;
    const commit = save => {
      if (done) return; done = true;
      const v = capFirst(inp.value);
      if (save && v && v !== l.name) { l.name = v; boundsChanged(); } else buildBoundsUI();
    };
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') commit(true); else if (e.key === 'Escape') commit(false); });
    inp.addEventListener('blur', () => commit(true));
  }));
  const create = box.querySelector('[data-bzcreate]');
  if (create) create.addEventListener('click', () => { _bzCreating = true; _bzNewColor = ''; buildBoundsUI(); box.querySelector('#bz-new-name')?.focus(); });
  box.querySelectorAll('[data-bzsw]').forEach(el => el.addEventListener('click', () => {
    _bzNewColor = el.dataset.bzsw;
    box.querySelectorAll('[data-bzsw]').forEach(b => b.classList.toggle('on', b === el));
  }));
  box.querySelectorAll('[data-bznew]').forEach(el => el.addEventListener('click', () => {
    const act = el.dataset.bznew;
    if (act === 'cancel') { _bzCreating = false; buildBoundsUI(); return; }
    const nameEl = box.querySelector('#bz-new-name');
    const name = capFirst(nameEl && nameEl.value) || `Граница ${boundLayers.length + 1}`;
    const l = { id: 'b' + Date.now().toString(36), name: name.slice(0, 40), color: boundColor(_bzNewColor), visible: true, zones: [] };
    boundLayers.push(l);
    _bzCreating = false;
    _bzOpen.add(l.id);
    boundsChanged();
    if (act === 'draw') bdrawStart(l.id); else pickGeojson(l.id);
  }));
  const nm = box.querySelector('#bz-new-name');
  if (nm) nm.addEventListener('keydown', e => { if (e.key === 'Enter') box.querySelector('[data-bznew="draw"]')?.click(); });
  const opEl = box.querySelector('#bz-opacity');
  if (opEl) {
    opEl.addEventListener('input', () => {
      distOpacity = +opEl.value;
      const v = box.querySelector('#bz-opacity-v'); if (v) v.textContent = Math.round(distOpacity * 100) + '%';
      renderDistricts();
    });
    opEl.addEventListener('change', () => saveState());
  }
  const flt = box.querySelector('[data-bzfilter]');
  if (flt) {
    flt.addEventListener('click', () => { boundFilter.on = !boundFilter.on; boundsChanged(); });
    flt.addEventListener('keydown', e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); flt.click(); } });
  }
  box.querySelectorAll('[data-bzmode]').forEach(el => el.addEventListener('click', () => {
    if (boundFilter.mode === el.dataset.bzmode) return;
    boundFilter.mode = el.dataset.bzmode;
    // Кнопки меняем на месте — капля перетекает, а не появляется заново.
    box.querySelectorAll('[data-bzmode]').forEach(b => { const on = b === el; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
    boundsChanged(true, false);
  }));
  wireBoundsStatus(box);
}
function boundsStatusHtml() {
  const nAct = activeBoundZones().length, nAll = boundSel.length;
  if (!nAll) return 'Ничего не выбрано — кликните зону на карте или в списке.';
  const what = !boundFilter.on ? ' · отбор выключен' : nAct ? '' : ' · все скрыты';
  const area = nAct ? ' · ' + fmtArea(activeBoundZones().reduce((a, z) => a + zoneArea(z.mp), 0)) : '';
  return `Выбрано: ${zonesWord(nAll)}${nAct && nAct < nAll ? ` (на карте ${nAct})` : ''}${area}${what} <button type="button" class="lc-link" data-bzclear>Сбросить</button>` +
    (nAct ? `<button type="button" class="create-btn ghost bz-export" data-bzexport>${uiIcon('sheet', 14)} Выгрузить точки внутри выбранных в Excel</button>` : '');
}
function wireBoundsStatus(box) {
  const clr = box.querySelector('[data-bzclear]');
  if (clr) clr.addEventListener('click', () => { boundSel = []; _bzNew = ''; boundsChanged(); });
  const xls = box.querySelector('[data-bzexport]');
  if (xls) xls.addEventListener('click', exportZonePoints);
}
function syncBoundsStatus() {
  const st = document.querySelector('#bz-filter .bz-status');
  if (!st) return;
  st.innerHTML = boundsStatusHtml();
  wireBoundsStatus(st);
}
function pickGeojson(layerId) {
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = '.geojson,.json,application/geo+json,application/json';
  inp.addEventListener('change', () => { if (inp.files && inp.files[0]) importGeojsonInto(layerId, inp.files[0]); });
  inp.click();
}

function syncLabelAllBtn() {
  const btn = document.getElementById('pt-labels-all');
  if (!btn) return;
  const vis = customPtLayers.filter(l => l.visible);
  const on = vis.length > 0 && vis.every(l => l.labels);
  btn.classList.toggle('on', on);
  btn.setAttribute('aria-checked', on ? 'true' : 'false');
  const vt = document.getElementById('pt-labels-vt');
  if (vt) vt.classList.toggle('on', on);
  const row = document.getElementById('pt-label-row');
  if (row) row.style.display = customPtLayers.length ? '' : 'none';
}

/* ── ТОРГОВЫЕ ТОЧКИ (ручной ввод) ────────────────────────────────────── */
// Снимки тянутся по требованию и кэшируются как blob-URL. Через authFetch, а не
// через <img src>: у картинки нет заголовка авторизации, а сессия может жить
// не в cookie, а в памяти вкладки (кросс-доменный фронт на Pages).
const _photoUrls = new Map();
function photoUrl(id) {
  if (_photoUrls.has(id)) return _photoUrls.get(id);
  const pending = (async () => {
    const res = await authFetch(SERVER_URL + '/photo/' + encodeURIComponent(id));
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return URL.createObjectURL(await res.blob());
  })().catch(err => { _photoUrls.delete(id); throw err; });
  _photoUrls.set(id, pending);
  return pending;
}

// Сжатие на клиенте: снимок с телефона это 3–8 МБ, а для карточки хватает
// длинной стороны 1400 px. Без этого сервер и трафик получают лишние мегабайты.
const PHOTO_MAX_SIDE = 1400;
function compressImage(file) {
  return new Promise((resolve, reject) => {
    if (!/^image\//.test(file.type)) { reject(new Error('Это не изображение')); return; }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Не удалось прочитать файл'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Не удалось открыть изображение'));
      img.onload = () => {
        const scale = Math.min(1, PHOTO_MAX_SIDE / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        // Скриншоты из буфера — PNG с прозрачностью; в JPEG прозрачное стало бы
        // чёрным. Подкладываем белый фон.
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(img.src);
        resolve({ data: canvas.toDataURL('image/jpeg', 0.82), w, h });
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}
// Голый «HTTP 401» ничего не говорит: у сервера два разных 401 — нет ключа
// записи и нет сессии. Разворачиваем ответ в понятную причину с действием.
async function serverErrorText(res) {
  let msg = '';
  try { const j = await res.json(); msg = (j && j.error) || ''; } catch (_) {}
  if (res.status === 401 && /api-key/i.test(msg)) return 'не введён ключ записи';
  if (res.status === 401) return 'сессия истекла — войдите заново';
  if (res.status === 403) return 'нет доступа к этой карте';
  if (res.status === 413) return 'файл слишком большой';
  if (res.status === 415) return 'формат не поддерживается — нужен JPEG, PNG или WebP';
  return msg || ('HTTP ' + res.status);
}
async function uploadPhoto(file) {
  const { data, w, h } = await compressImage(file);
  const res = await postJson(SERVER_URL + '/photo?map=' + encodeURIComponent(currentMap), { data }, 90000);
  if (!res.ok) throw new Error(await serverErrorText(res));
  const saved = await res.json();
  return { id: saved.id, w, h };
}

/* Просмотр фото во весь экран. Открывается по клику на миниатюру в карточке. */
let _lightbox = { ids: [], i: 0 };
function openLightbox(ids, index) {
  const ov = document.getElementById('photo-lightbox');
  if (!ov || !ids.length) return;
  _lightbox = { ids: ids.slice(), i: Math.max(0, Math.min(index, ids.length - 1)) };
  ov.hidden = false;
  showLightboxPhoto();
}
function closeLightbox() {
  const ov = document.getElementById('photo-lightbox');
  if (ov) ov.hidden = true;
}
function moveLightbox(step) {
  if (_lightbox.ids.length < 2) return;
  _lightbox.i = (_lightbox.i + step + _lightbox.ids.length) % _lightbox.ids.length;
  showLightboxPhoto();
}
async function showLightboxPhoto() {
  const img = document.getElementById('lightbox-img');
  const cnt = document.getElementById('lightbox-count');
  const nav = document.getElementById('lightbox-nav');
  if (!img) return;
  const id = _lightbox.ids[_lightbox.i];
  if (cnt) cnt.textContent = `${_lightbox.i + 1} / ${_lightbox.ids.length}`;
  if (nav) nav.style.display = _lightbox.ids.length > 1 ? '' : 'none';
  img.classList.add('loading');
  try {
    const url = await photoUrl(id);
    if (_lightbox.ids[_lightbox.i] !== id) return; // успели пролистать дальше
    img.src = url;
  } catch (_) {
    toast('Не удалось загрузить фото', 'err');
  } finally {
    img.classList.remove('loading');
  }
}

function manualPopupHtml(layer, r) {
  const rows = [];
  if (r.dms)   rows.push(['ДМС-код', r.dms]);
  if (r.equip) rows.push(['Оборудование', r.equip]);
  if (r.sales != null && r.sales !== '' && isFinite(+r.sales)) {
    rows.push(['Продажи', (+r.sales).toLocaleString('ru-RU')]);
  }
  if (r.addr)  rows.push(['Адрес', r.addr]);
  if (r.hours) rows.push(['Часы', r.hours]);
  rows.push(['Координаты', `${(+r.lat).toFixed(5)}, ${(+r.lon).toFixed(5)}`]);
  const photos = (r.photos || []).filter(ph => ph && ph.id);
  const thumbs = photos.length
    ? `<div class="rp-thumbs">${photos.map((ph, i) =>
        `<button type="button" class="rp-thumb" data-photo-index="${i}" aria-label="Открыть фото ${i + 1}"><span class="rp-thumb-ph"></span></button>`).join('')}</div>`
    : '';
  return `<div class="pp-title">${esc(r.name || 'Точка')}</div>
    ${thumbs}
    ${rows.map(([k, v]) =>
      `<div class="pp-row"><span>${esc(k)}</span><b style="font-family:Inter;font-weight:600;text-align:right">${esc(String(v))}</b></div>`).join('')}
    ${r.comment ? `<div class="rp-comment">${esc(r.comment)}</div>` : ''}
    <span class="pp-tag rp-tag" style="background:${esc(r.color || layer.color)}22;color:var(--ink);border:1px solid ${esc(r.color || layer.color)}">${esc(layer.name)}</span>
    ${yandexLinkHtml(r.lat, r.lon)}
    ${isAdmin() && layer.manual ? `<button type="button" class="rp-edit" data-rpedit="1">${uiIcon('pencil', 13)} Редактировать</button>` : ''}`;
}

// Миниатюры дорисовываются после открытия карточки: до клика по точке байты
// снимков не нужны.
async function hydrateManualPhotos(r, popupEl) {
  const box = popupEl && popupEl.querySelector('.rp-thumbs');
  if (!box) return;
  const photos = (r.photos || []).filter(ph => ph && ph.id);
  const buttons = [...box.querySelectorAll('.rp-thumb')];
  await Promise.all(photos.map(async (ph, i) => {
    const btn = buttons[i];
    if (!btn) return;
    try {
      const url = await photoUrl(ph.id);
      if (!btn.isConnected) return;
      btn.innerHTML = `<img src="${url}" alt="Фото точки ${i + 1}">`;
    } catch (_) {
      if (btn.isConnected) btn.innerHTML = '<span class="rp-thumb-err">!</span>';
    }
  }));
}
function wireManualPopup(popup, layer, r, marker) {
  const el = popup.getElement();
  hydrateManualPhotos(r, el);
  const thumbs = el && el.querySelector('.rp-thumbs');
  if (thumbs) {
    thumbs.addEventListener('click', ev => {
      const btn = ev.target.closest('.rp-thumb');
      if (!btn) return;
      openLightbox((r.photos || []).map(ph => ph.id), +btn.dataset.photoIndex || 0);
    });
  }
  const edit = el && el.querySelector('[data-rpedit]');
  if (edit) edit.addEventListener('click', () => { marker.closePopup(); openRetailForm(layer.id, r.id); });
}

/* ── ФОРМА ТОРГОВОЙ ТОЧКИ ────────────────────────────────────────────── */
let _rpEditId = null;        // редактируемая точка (null — создание новой)
let _rpLayerId = null;       // слой редактируемой точки
let _rpPhotos = [];          // [{id,w,h}] — уже загруженные на сервер снимки
let _rpColor = '';           // '' — цвет наследуется от слоя
let _rpPickingGeo = false;

// Цвет конкретной точки: пусто — как у слоя, иначе свой оттенок.
function renderRetailColors() {
  const box = document.getElementById('rp-colors');
  const auto = document.getElementById('rp-color-auto');
  const hint = document.getElementById('rp-color-hint');
  if (!box) return;
  const sel = document.getElementById('rp-layer');
  const layer = sel ? customPtLayers.find(l => l.id === sel.value) : null;
  const layerColor = (layer && layer.color) || SWATCHES[0];
  if (auto) {
    auto.classList.toggle('on', !_rpColor);
    auto.style.setProperty('--auto-color', layerColor);
  }
  if (hint) hint.textContent = _rpColor ? _rpColor : 'как у слоя';
  box.innerHTML = SWATCHES.map(c =>
    `<button type="button" class="sw${c.toLowerCase() === _rpColor.toLowerCase() ? ' on' : ''}" data-rpsw="${c}" style="background:${c}" title="${c}" aria-label="Цвет ${c}"></button>`).join('')
    + `<input type="color" class="sw-pick" id="rp-color-pick" value="${_rpColor || layerColor}" title="Свой оттенок">`;
  box.querySelectorAll('[data-rpsw]').forEach(el => {
    el.addEventListener('click', () => { _rpColor = el.dataset.rpsw; renderRetailColors(); });
  });
  const pick = document.getElementById('rp-color-pick');
  if (pick) pick.addEventListener('input', e => { _rpColor = e.target.value; renderRetailColors(); });
}

function rpField(id) { return document.getElementById(id); }

// Точка кладётся в выбранный слой — как DS/IPSE. Здесь же можно завести новый.
function buildRetailLayerSel(selectedId) {
  const sel = rpField('rp-layer');
  if (!sel) return;
  const layers = manualLayers();
  sel.innerHTML = layers.map(l =>
    `<option value="${esc(l.id)}"${l.id === selectedId ? ' selected' : ''}>${esc(l.name)}</option>`).join('')
    + '<option value="__new__">+ Новый слой…</option>';
  const newBox = rpField('rp-layer-new-box');
  const isNew = !layers.length || sel.value === '__new__';
  if (!layers.length) sel.value = '__new__';
  if (newBox) newBox.style.display = isNew ? '' : 'none';
}
function openRetailForm(layerId, id) {
  if (!isAdmin()) { toast('Точки вручную заводит только владелец', 'err'); return; }
  syncRetailKeyWarn();
  const layer = layerId ? customPtLayers.find(l => l.id === layerId) : null;
  const p = layer && id ? (layer.recs || []).find(x => x.id === id) : null;
  _rpEditId = p ? p.id : null;
  _rpLayerId = layer ? layer.id : null;
  _rpPhotos = p ? (p.photos || []).slice() : [];
  _rpColor = p && p.color ? p.color : '';
  buildRetailLayerSel(layer ? layer.id : (manualLayers()[0] || {}).id);
  renderRetailColors();
  rpField('rp-layer-new').value = '';
  rpField('rp-title').textContent = p ? 'Точка' : 'Новая точка';
  rpField('rp-name').value    = p ? (p.name || '') : '';
  rpField('rp-dms').value     = p ? (p.dms || '') : '';
  rpField('rp-equip').value   = p ? (p.equip || '') : '';
  rpField('rp-sales').value   = p && p.sales != null ? p.sales : '';
  rpField('rp-comment').value = p ? (p.comment || '') : '';
  rpField('rp-lat').value     = p ? p.lat : '';
  rpField('rp-lon').value     = p ? p.lon : '';
  rpField('rp-delete').style.display = p ? '' : 'none';
  renderRetailFormPhotos();
  rpField('rp-modal').hidden = false;
  _rpInitial = retailFormSnapshot();
  setTimeout(() => rpField('rp-name').focus(), 120);
}
// Снимок формы при открытии — по нему понимаем, есть ли что терять.
let _rpInitial = '';
function retailFormSnapshot() {
  return JSON.stringify([
    'rp-layer', 'rp-layer-new', 'rp-name', 'rp-dms', 'rp-equip', 'rp-sales', 'rp-comment', 'rp-lat', 'rp-lon',
  ].map(id => { const el = rpField(id); return el ? el.value : ''; })
    .concat([_rpColor, _rpPhotos.map(ph => ph.id).join(',')]));
}
function retailFormDirty() {
  const m = rpField('rp-modal');
  return !!m && !m.hidden && retailFormSnapshot() !== _rpInitial;
}
// Закрыть по «Отмена» или Esc. Если что-то введено — сначала спрашиваем:
// раньше промах кликом мимо формы молча стирал всё введённое.
function requestCloseRetailForm() {
  if (retailFormDirty() && !confirm('Закрыть форму? Введённые данные не сохранятся.')) return;
  closeRetailForm();
}
// Клик мимо формы ничего не закрывает — только подсказывает, как закрыть.
function nudgeRetailForm() {
  const card = document.querySelector('#rp-modal .rp-card');
  if (card) { card.classList.remove('nudge'); void card.offsetWidth; card.classList.add('nudge'); }
  const now = Date.now();
  if (!nudgeRetailForm._t || now - nudgeRetailForm._t > 4000) {
    toast('Форма не закрывается кликом мимо — нажмите «Отмена» или Esc', 'info', 3200);
    nudgeRetailForm._t = now;
  }
}
function closeRetailForm() {
  rpField('rp-modal').hidden = true;
  stopGeoPick();
  _rpEditId = null; _rpLayerId = null; _rpPhotos = []; _rpColor = '';
}
function renderRetailFormPhotos() {
  const box = rpField('rp-photos');
  const addBtn = rpField('rp-photo-add');
  box.innerHTML = _rpPhotos.map((ph, i) => `
    <div class="rp-ph" data-ph="${i}">
      <img alt="Фото ${i + 1}">
      <button type="button" class="rp-ph-del" data-phdel="${i}" aria-label="Удалить фото ${i + 1}">&times;</button>
    </div>`).join('');
  _rpPhotos.forEach(async (ph, i) => {
    const img = box.querySelector(`[data-ph="${i}"] img`);
    if (!img) return;
    try { img.src = await photoUrl(ph.id); } catch (_) { img.alt = 'Фото недоступно'; }
  });
  box.querySelectorAll('[data-phdel]').forEach(btn => {
    btn.addEventListener('click', () => {
      _rpPhotos.splice(+btn.dataset.phdel, 1);
      renderRetailFormPhotos();
    });
  });
  const full = _rpPhotos.length >= RETAIL_MAX_PHOTOS;
  addBtn.style.display = full ? 'none' : '';
  const pasteBtn = rpField('rp-photo-paste');
  if (pasteBtn) pasteBtn.style.display = full ? 'none' : '';
  const pasteHint = rpField('rp-paste-hint');
  if (pasteHint) pasteHint.hidden = full;
  rpField('rp-photo-hint').textContent = `${_rpPhotos.length} из ${RETAIL_MAX_PHOTOS}`;
  syncRetailKeyWarn();
}

/* Ключ записи живёт только в памяти вкладки и стирается при обновлении
   страницы (так решено ради безопасности). Без него сервер отвечает 401 на
   загрузку фото и на сохранение. Поэтому не прячем это в исчезающий тост, а
   показываем прямо в форме — вместе с полем, чтобы ввести ключ здесь же. */
function syncRetailKeyWarn() {
  const warn = document.getElementById('rp-key-warn');
  const addBtn = document.getElementById('rp-photo-add');
  if (!warn) return;
  const missing = !SERVER_URL || !SERVER_KEY;
  warn.hidden = !missing;
  [addBtn, document.getElementById('rp-photo-paste')].forEach(btn => {
    if (!btn) return;
    btn.disabled = missing || _rpUploading;
    btn.title = missing ? 'Сначала введите ключ записи' : '';
  });
}

/* Добавление снимков в форму точки — один путь для файла, Ctrl+V и кнопки
   «Вставить из буфера». */
let _rpUploading = false;
async function addRetailPhotos(files) {
  const room = RETAIL_MAX_PHOTOS - _rpPhotos.length;
  const images = files.filter(f => f && /^image\//.test(f.type));
  if (!images.length) { toast('Это не изображение', 'warn'); return; }
  if (room <= 0) { toast(`Уже ${RETAIL_MAX_PHOTOS} фото — удалите одно, чтобы добавить новое`, 'warn', 4000); return; }
  if (!SERVER_URL || !SERVER_KEY) { syncRetailKeyWarn(); toast('Нет ключа записи — фото не загрузить', 'err'); return; }
  if (_rpUploading) { toast('Подождите — предыдущее фото ещё загружается', 'info'); return; }
  const batch = images.slice(0, room);
  if (images.length > room) toast(`Добавлено ${room} из ${images.length}: больше ${RETAIL_MAX_PHOTOS} фото на точку нельзя`, 'warn', 4000);
  _rpUploading = true;
  const addBtn = document.getElementById('rp-photo-add');
  if (addBtn) addBtn.textContent = 'Загрузка…';
  syncRetailKeyWarn();
  try {
    for (const f of batch) {
      try { _rpPhotos.push(await uploadPhoto(f)); }
      catch (e) { toast('Фото не загружено: ' + e.message, 'err', 4500); }
    }
  } finally {
    _rpUploading = false;
    if (addBtn) addBtn.textContent = '+ Добавить фото';
    renderRetailFormPhotos();
  }
}

// Картинки из события вставки. Текст, вставляемый в поля формы, не трогаем.
function clipboardImages(dt) {
  if (!dt) return [];
  const out = [];
  for (const it of dt.items || []) {
    if (it.kind === 'file' && /^image\//.test(it.type)) { const f = it.getAsFile(); if (f) out.push(f); }
  }
  if (!out.length) for (const f of dt.files || []) if (/^image\//.test(f.type)) out.push(f);
  return out;
}

// Кнопка «Вставить из буфера» — для мыши и телефона. Браузер может спросить
// разрешение на чтение буфера; если API нет (старый браузер), подсказываем Ctrl+V.
async function pasteRetailPhotoFromButton() {
  if (!navigator.clipboard || typeof navigator.clipboard.read !== 'function') {
    toast('Браузер не даёт прочитать буфер кнопкой — нажмите Ctrl+V в этой форме', 'warn', 4500);
    return;
  }
  try {
    const items = await navigator.clipboard.read();
    const files = [];
    for (const item of items) {
      const type = item.types.find(t => /^image\//.test(t));
      if (!type) continue;
      const blob = await item.getType(type);
      files.push(new File([blob], 'clipboard.' + (type.split('/')[1] || 'png'), { type }));
    }
    if (!files.length) { toast('В буфере нет изображения — скопируйте фото или сделайте скриншот', 'warn', 4000); return; }
    addRetailPhotos(files);
  } catch (e) {
    toast(e && e.name === 'NotAllowedError'
      ? 'Браузер запретил доступ к буферу — разрешите его или нажмите Ctrl+V в этой форме'
      : 'Не удалось прочитать буфер — нажмите Ctrl+V в этой форме', 'warn', 5000);
  }
}

// «Указать на карте»: модалка прячется, следующий клик по карте даёт координаты.
let _geoPickHandler = null;
function startGeoPick() {
  if (_rpPickingGeo) return;
  _rpPickingGeo = true;
  rpField('rp-modal').classList.add('picking');
  document.body.classList.add('geo-picking');
  toast('Кликните точку на карте — Esc для отмены', 'info', 3500);
  _geoPickHandler = e => {
    rpField('rp-lat').value = e.latlng.lat.toFixed(6);
    rpField('rp-lon').value = e.latlng.lng.toFixed(6);
    stopGeoPick();
  };
  map.on('click', _geoPickHandler);
}
function stopGeoPick() {
  if (!_rpPickingGeo) return;
  _rpPickingGeo = false;
  // Снимаем именно свой обработчик: map.off('click') убрал бы и чужие.
  if (_geoPickHandler) map.off('click', _geoPickHandler);
  _geoPickHandler = null;
  rpField('rp-modal').classList.remove('picking');
  document.body.classList.remove('geo-picking');
}

async function saveRetailForm() {
  const name = rpField('rp-name').value.trim();
  const lat = parseFloat(String(rpField('rp-lat').value).replace(',', '.'));
  const lon = parseFloat(String(rpField('rp-lon').value).replace(',', '.'));
  if (!name) { toast('Укажите название точки', 'err'); rpField('rp-name').focus(); return; }
  if (!isFinite(lat) || !isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    toast('Укажите координаты — вручную или кнопкой «Указать на карте»', 'err');
    rpField('rp-lat').focus();
    return;
  }

  // Слой назначения: существующий ручной слой либо новый, заведённый здесь же.
  const sel = rpField('rp-layer');
  let layer = null;
  if (sel && sel.value === '__new__') {
    const layerName = rpField('rp-layer-new').value.trim();
    if (!layerName) { toast('Введите название нового слоя', 'err'); rpField('rp-layer-new').focus(); return; }
    layer = createManualLayer(layerName);
  } else if (sel) {
    layer = customPtLayers.find(l => l.id === sel.value);
  }
  if (!layer) { toast('Выберите слой для точки', 'err'); return; }

  const salesRaw = String(rpField('rp-sales').value).trim();
  const point = {
    id: _rpEditId || 'rp_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    name,
    dms: rpField('rp-dms').value.trim(),
    equip: rpField('rp-equip').value.trim(),
    sales: salesRaw === '' ? null : (isFinite(+salesRaw) ? +salesRaw : null),
    comment: rpField('rp-comment').value.trim(),
    lat, lon,
    color: _rpColor || '',   // пусто — цвет наследуется от слоя
    photos: _rpPhotos.slice(),
  };
  // Точку могли перенести в другой слой — убираем её из прежнего.
  const previous = _rpLayerId ? customPtLayers.find(l => l.id === _rpLayerId) : null;
  if (previous && previous !== layer) previous.recs = previous.recs.filter(x => x.id !== point.id);
  const i = layer.recs.findIndex(x => x.id === point.id);
  const isEdit = i >= 0 || (previous && previous !== layer && _rpEditId);
  if (i >= 0) layer.recs[i] = point; else layer.recs.push(point);
  layer.visible = true;

  closeRetailForm();
  buildCustomPtUI(); buildAddrSrcSel(); buildRtExclUI();
  renderCustomPoints();
  reenrichAll();   // ручные точки входят в нашу сеть — покрытие пересчитать
  saveState();
  if (SERVER_URL && !SERVER_KEY) {
    toast('Точка сохранена только в этом браузере: без ключа записи она не уйдёт на сервер', 'err', 6000);
  } else {
    toast(isEdit ? 'Точка обновлена' : `Точка «${name}» добавлена в слой «${layer.name}»`, 'ok');
  }
  map.flyTo([lat, lon], Math.max(map.getZoom(), 15), { duration: .6 });
}

// Новый слой ручного ввода — тот же объект, что и у загруженных слоёв, плюс
// флаг manual, из-за которого в карточке появляется «+ Точка» вместо «Данные».
function createManualLayer(name) {
  const used = customPtLayers.map(l => String(l.color).toLowerCase());
  const color = SWATCHES.find(c => !used.includes(c.toLowerCase())) || SWATCHES[customPtLayers.length % SWATCHES.length];
  const layer = {
    id: 'cpt_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
    name: capFirst(name), color, manual: true, visible: true, shape: 'star', size: 34, opacity: 1,
    radiusOn: false, radiusM: 1500, radiusColor: color, radiusOpacity: 0.15,
    recs: [], _group: null,
  };
  customPtLayers.push(layer);
  return layer;
}

function deleteRetailPoint() {
  const layer = customPtLayers.find(l => l.id === _rpLayerId);
  const p = layer && (layer.recs || []).find(x => x.id === _rpEditId);
  if (!layer || !p) return;
  if (!confirm(`Удалить точку «${p.name}»? Действие необратимо.`)) return;
  layer.recs = layer.recs.filter(x => x.id !== p.id);
  closeRetailForm();
  buildCustomPtUI(); buildAddrSrcSel(); buildRtExclUI();
  renderCustomPoints(); reenrichAll(); saveState();
  toast('Точка удалена', 'ok');
}

function wireRetailUI() {
  const on = (id, ev, fn) => { const el = document.getElementById(id); if (el) el.addEventListener(ev, fn); };
  on('add-manual-pt-btn', 'click', () => openRetailForm(null, null));
  on('manual-export-all', 'click', () => exportManualPts(null));
  on('rp-layer', 'change', () => {
    const sel = document.getElementById('rp-layer');
    const box = document.getElementById('rp-layer-new-box');
    if (box) box.style.display = sel.value === '__new__' ? '' : 'none';
    if (sel.value === '__new__') setTimeout(() => document.getElementById('rp-layer-new').focus(), 60);
    renderRetailColors();   // «как у слоя» показывает цвет выбранного слоя
  });
  on('rp-color-auto', 'click', () => { _rpColor = ''; renderRetailColors(); });
  on('rp-cancel', 'click', requestCloseRetailForm);
  on('rp-save', 'click', saveRetailForm);
  on('rp-delete', 'click', deleteRetailPoint);
  on('rp-geo-pick', 'click', startGeoPick);
  // pointerdown, а не click: выделение текста в поле, отпущенное за краем
  // формы, тоже давало «клик по фону».
  on('rp-modal', 'pointerdown', e => { if (e.target.id === 'rp-modal' && !_rpPickingGeo) nudgeRetailForm(); });

  const fileInp = document.getElementById('rp-photo-file');
  on('rp-photo-add', 'click', () => fileInp && fileInp.click());
  if (fileInp) {
    fileInp.addEventListener('change', () => {
      const files = [...fileInp.files];
      fileInp.value = '';
      if (files.length) addRetailPhotos(files);
    });
  }
  on('rp-photo-paste', 'click', pasteRetailPhotoFromButton);
  // Ctrl+V / ⌘V при открытой форме точки: картинка из буфера уходит в фото.
  // Если в буфере текст — это обычная вставка в поле, не мешаем.
  document.addEventListener('paste', e => {
    const modal = document.getElementById('rp-modal');
    if (!modal || modal.hidden) return;
    const files = clipboardImages(e.clipboardData);
    if (!files.length) return;
    e.preventDefault();
    addRetailPhotos(files);
  });

  on('rp-key-apply', 'click', () => {
    const inp = document.getElementById('rp-key-input');
    const value = inp ? inp.value.trim() : '';
    if (!value) { if (inp) inp.focus(); return; }
    SERVER_KEY = value;
    if (inp) inp.value = '';
    const sideKey = document.getElementById('admin-key-input');
    if (sideKey) sideKey.value = SERVER_KEY;   // держим оба поля согласованными
    syncRetailKeyWarn();
    toast('Ключ принят — запись включена до обновления страницы', 'ok');
  });
  on('rp-key-input', 'keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); document.getElementById('rp-key-apply').click(); }
  });

  on('lightbox-close', 'click', closeLightbox);
  on('lightbox-prev', 'click', () => moveLightbox(-1));
  on('lightbox-next', 'click', () => moveLightbox(1));
  on('photo-lightbox', 'click', e => { if (e.target.id === 'photo-lightbox') closeLightbox(); });
  document.addEventListener('keydown', e => {
    const ov = document.getElementById('photo-lightbox');
    if (!ov || ov.hidden) {
      if (e.key !== 'Escape') return;
      if (_rpPickingGeo) { stopGeoPick(); return; }
      const m = document.getElementById('rp-modal');
      if (m && !m.hidden) requestCloseRetailForm();
      return;
    }
    if (e.key === 'Escape') closeLightbox();
    else if (e.key === 'ArrowLeft') moveLightbox(-1);
    else if (e.key === 'ArrowRight') moveLightbox(1);
  });
}

function buildCustomPtUI() {
  const box   = document.getElementById('custom-pt-list');
  const badge = document.getElementById('acc-badge-cpt');
  if (!box) return;

  const vis = customPtLayers.filter(l => l.visible).length;
  if (badge) badge.textContent = customPtLayers.length ? `${vis}/${customPtLayers.length}` : '';

  // Общая выгрузка нужна только когда ручных точек больше одного слоя —
  // иначе достаточно ссылки в самой карточке.
  const exportAll = document.getElementById('manual-export-all');
  if (exportAll) {
    const filled = manualLayers().filter(l => l.recs.length);
    exportAll.style.display = filled.length > 1 ? '' : 'none';
  }

  syncLabelAllBtn();
  if (!customPtLayers.length) {
    box.innerHTML = `<div class="lc-empty">${isAdmin()
      ? 'Слоёв точек пока нет. «Создать слой» — для точек из Excel, «Добавить точку вручную» — по одной с фото.'
      : 'Слоёв точек пока нет — их добавляет владелец карты.'}</div>`;
    return;
  }

  box.innerHTML = customPtLayers.map(l => {
    const opacity = Math.min(1, Math.max(.2, Number.isFinite(+l.opacity) ? +l.opacity : 1));
    const size = Math.min(44, Math.max(20, Number.isFinite(+l.size) ? +l.size : 30));
    const n = l.recs.length;
    const fields = l.fields || [];
    const open = _cptOpen.has(l.id);
    const icon = l.icon;
    const id = esc(l.id);
    return `
    <div class="lc cpt-layer${open ? ' open' : ''}${l.visible ? '' : ' off'}" data-cpid="${id}">
      <div class="lc-row">
        <button type="button" class="lc-sw" data-cppaint="${id}" aria-haspopup="dialog" aria-expanded="false" title="Цвет меток" aria-label="Цвет меток слоя «${esc(l.name)}»" style="background:${l.color2 ? `linear-gradient(135deg, ${safeColor(l.color)}, ${safeColor(l.color2)})` : safeColor(l.color)}"></button>
        <div class="lc-name"><span class="lc-t" title="${esc(l.name)}">${esc(l.name)}</span><button type="button" class="lc-ic lc-ren" data-cptrename="${id}" title="Переименовать" aria-label="Переименовать слой «${esc(l.name)}»">${uiIcon('pencil', 13)}</button></div>
        <div class="cbx sm${l.visible ? ' on' : ''}" data-cptoggle="${id}" role="switch" tabindex="0" aria-checked="${l.visible}" aria-label="Показывать слой «${esc(l.name)}» на карте"></div>
      </div>
      <div class="lc-sub">
        <span class="lc-n" data-cpmore="${id}">${n.toLocaleString('ru-RU')} ${plural(n, 'точка', 'точки', 'точек')}${l.manual ? ' · вручную' : ''}${fields.length ? ' · ' + fields.length + ' ' + plural(fields.length, 'поле', 'поля', 'полей') : ''}</span>
        <div class="lc-tools">
          ${l.manual
            ? `<button type="button" class="lc-ic admin-only" data-cptaddpt="${id}" title="Добавить точку вручную" aria-label="Добавить точку">${uiIcon('plus')}</button>
               ${n ? `<button type="button" class="lc-ic" data-rpexport="${id}" title="Выгрузить точки слоя в Excel" aria-label="Выгрузить в Excel">${uiIcon('download')}</button>` : ''}`
            : `${n ? `<button type="button" class="lc-ic" data-cptxls="${id}" title="Выгрузить точки слоя в Excel — те же колонки, что в шаблоне, со всеми вашими полями" aria-label="Выгрузить в Excel">${uiIcon('sheet')}</button>` : ''}
               <button type="button" class="lc-ic admin-only" data-cpttpl="${id}" title="Скачать шаблон Excel для этого слоя" aria-label="Скачать шаблон">${uiIcon('download')}</button>
               <button type="button" class="lc-ic admin-only" data-cptup="${id}" title="Загрузить или обновить точки из файла" aria-label="Загрузить данные">${uiIcon('upload')}</button>`}
          <button type="button" class="lc-ic lc-del admin-only" data-cpdel="${id}" title="Удалить слой" aria-label="Удалить слой">${uiIcon('trash')}</button>
          <button type="button" class="lc-ic lc-more" data-cpmore="${id}" title="Настройки слоя" aria-label="Настройки слоя" aria-expanded="${open}">${uiIcon('chevron')}</button>
        </div>
      </div>
      <div class="lc-body">
        <div class="lc-lbl">Метка на карте</div>
        ${markerPickerHtml(l.shape, icon, l.color, l.color2)}
        <div class="lc-sl"><span>Размер</span><input type="range" class="cpt-size" data-cpsize="${id}" min="20" max="44" step="1" value="${size}"/><b class="cpt-size-val">${size} px</b></div>
        <div class="lc-sl"><span>Прозрачность</span><input type="range" class="cpt-opacity" data-cpopacity="${id}" min="0.2" max="1" step="0.05" value="${opacity}"/><b class="cpt-opacity-val">${Math.round(opacity * 100)}%</b></div>
        <div class="lc-opt">
          <div class="cbx sm cpt-lbl-cbx${l.labels ? ' on' : ''}" data-cplbl="${id}" role="switch" tabindex="0" aria-checked="${l.labels ? 'true' : 'false'}" aria-label="Названия точек слоя «${esc(l.name)}» на карте"></div>
          <span>Названия на карте</span>
        </div>
        <div class="lc-opt">
          <div class="cbx sm cpt-dens-cbx${l.density ? ' on' : ''}" data-cpdens="${id}" role="switch" tabindex="0" aria-checked="${l.density ? 'true' : 'false'}" aria-label="Зона плотности слоя «${esc(l.name)}»"></div>
          <span>Зона плотности <span class="tip-icon" data-tip="Сглаженные пояса вокруг скоплений точек, как на погодной карте. Цвета — палитра слоя (квадрат цвета слева от названия), размер — «Размер пятна» на вкладке «Карта».">ⓘ</span></span>
        </div>
        <div class="lc-opt">
          <div class="cbx sm green cpt-rad-cbx${l.radiusOn ? ' on' : ''}" data-cprad="${id}" role="switch" tabindex="0" aria-checked="${l.radiusOn ? 'true' : 'false'}" aria-label="Радиус охвата для «${esc(l.name)}»"></div>
          <span>Радиус охвата</span>
        </div>
        <div class="pt-radius-ctl lc-radius" data-cpradctl="${id}" style="${l.radiusOn ? '' : 'display:none'}">
          <div class="lc-sl"><span>Радиус</span><input type="range" class="cpt-rad-r" data-cpradr="${id}" min="200" max="5000" step="100" value="${l.radiusM || 1500}"/><b class="cpt-rad-rv">${fmtD(l.radiusM || 1500)}</b></div>
          <div class="lc-sl"><span>Заливка</span><input type="range" class="green cpt-rad-o" data-cprado="${id}" min="0.03" max="0.5" step="0.01" value="${l.radiusOpacity == null ? .15 : l.radiusOpacity}"/><b class="cpt-rad-ov">${Math.round((l.radiusOpacity == null ? .15 : l.radiusOpacity) * 100)}%</b></div>
          <div class="lc-sl"><span>Цвет радиуса</span><input type="color" class="cpt-rad-col" data-cpradcol="${id}" value="${safeColor(l.radiusColor || l.color)}"/><b></b></div>
        </div>
        ${fields.length ? `<div class="lc-fields">${fields.map(f => `<span>${esc(f)}</span>`).join('')}</div>` : ''}
        <div class="lc-foot"><span></span>
          <button type="button" class="lc-link${_cptSoloId === l.id ? ' on' : ''}" data-cptsolo="${id}">${uiIcon('eye', 13)} ${_cptSoloId === l.id ? 'Показать все' : 'Только этот'}</button>
        </div>
      </div>
      ${l.manual && n ? `<button type="button" class="rp-list-toggle" data-rplist="${id}" aria-expanded="${rpListOpen(l) ? 'true' : 'false'}" aria-controls="rp-list-${id}">
          <span>${rpListOpen(l) ? 'Скрыть список точек' : 'Показать список точек'}</span><b>${n.toLocaleString('ru-RU')}</b>
          ${uiIcon('chevron', 13)}
        </button>
        <div class="rp-list" id="rp-list-${id}"${rpListOpen(l) ? '' : ' hidden'}>${l.recs.map(r => `
          <div class="rp-item" data-rpgo="${id}|${esc(r.id || '')}">
            <span class="rp-item-dot" style="background:${safeColor(r.color || l.color)}" title="${r.color ? 'свой цвет' : 'цвет слоя'}"></span>
            <span class="rp-item-ph" title="${(r.photos || []).length ? 'Есть фото' : 'Без фото'}">${(r.photos || []).length ? uiIcon('camera', 14) : ''}</span>
            <div class="rp-item-main">
              <b>${esc(r.name || 'Без названия')}</b>
              <span>${esc(r.dms ? 'ДМС ' + r.dms : 'без ДМС-кода')}${r.sales != null && r.sales !== '' && isFinite(+r.sales) ? ' · ' + (+r.sales).toLocaleString('ru-RU') + ' продаж' : ''}</span>
            </div>
            ${isAdmin() ? `<button type="button" class="rp-item-edit" data-rpedit="${id}|${esc(r.id || '')}" title="Редактировать" aria-label="Редактировать точку">${uiIcon('pencil', 13)}</button>` : ''}
          </div>`).join('')}</div>` : ''}
    </div>`;
  }).join('');

  // Настройки слоя раскрываются стрелкой или кликом по числу точек.
  box.querySelectorAll('[data-cpmore]').forEach(el => {
    el.addEventListener('click', () => {
      const card = el.closest('.cpt-layer');
      const id = card && card.dataset.cpid;
      if (!id) return;
      const open = card.classList.toggle('open');
      const more = card.querySelector('.lc-more'); if (more) more.setAttribute('aria-expanded', String(open));
      if (open) _cptOpen.add(id); else _cptOpen.delete(id);
    });
  });
  box.querySelectorAll('[data-cptxls]').forEach(el => el.addEventListener('click', () => exportLayerXlsx('pt', el.dataset.cptxls)));
  box.querySelectorAll('[data-cpttpl]').forEach(el => el.addEventListener('click', () => {
    const l = customPtLayers.find(x => x.id === el.dataset.cpttpl); if (l) downloadLayerTemplate('pt', l);
  }));
  // Переключатели с клавиатуры — как кликом.
  box.querySelectorAll('.cbx[role="switch"]').forEach(el => el.addEventListener('keydown', e => {
    if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); el.click(); }
  }));

  box.querySelectorAll('[data-cptoggle]').forEach(el => {
    el.addEventListener('click', () => {
      const l = customPtLayers.find(x => x.id === el.dataset.cptoggle); if (!l) return;
      l.visible = !l.visible;
      if (!l.visible && _cptSoloId === l.id) {
        if (_cptPrevVisible) customPtLayers.forEach(x => {
          if (x.id !== l.id && _cptPrevVisible[x.id] != null) x.visible = _cptPrevVisible[x.id];
        });
        _cptSoloId = null; _cptPrevVisible = null;
      }
      renderCustomPoints(); buildCustomPtUI(); buildAddrSrcSel(); buildRtExclUI(); saveState();
    });
  });

  box.querySelectorAll('.cpt-layer').forEach(card => {
    const l = customPtLayers.find(x => x.id === card.dataset.cpid); if (!l) return;
    wireMarkerPicker(card, (shape, icon) => {
      if (shape) l.shape = shape;
      if (icon) l.icon = icon;
      refreshMarkerPicker(card, l.shape, l.icon, l.color, l.color2);
      renderCustomPoints(); updateLayerLegend(); saveState();
    });
  });

  // Цвет меток: готовый градиент, один цвет или свой градиент. Во время
  // перетаскивания пипетки перерисовываем только маркеры.
  box.querySelectorAll('[data-cppaint]').forEach(sw => {
    sw.addEventListener('click', () => {
      const l = customPtLayers.find(x => x.id === sw.dataset.cppaint); if (!l) return;
      openPaintPop(sw, { ramp: l.ramp || (l.color2 ? 'custom2' : 'custom'), color: l.color, color2: l.color2 }, (p, live) => {
        if (p.ramp === 'custom' || p.ramp === 'custom2') {
          l.color = p.color; l.color2 = p.ramp === 'custom2' ? p.color2 : '';
          l.ramp = '';
        } else {
          const g = HEAT_RAMPS[p.ramp] || heatGrad(l.color);
          l.color = g[0.55]; l.color2 = g[1.0];
          l.ramp = p.ramp;   // зона плотности берёт палитру целиком, а не два цвета
        }
        sw.style.background = l.color2 ? `linear-gradient(135deg, ${safeColor(l.color)}, ${safeColor(l.color2)})` : safeColor(l.color);
        const card = sw.closest('.cpt-layer');
        if (card) refreshMarkerPicker(card, l.shape, l.icon, l.color, l.color2);
        renderCustomPoints();
        if (!live) { buildAddrSrcSel(); buildRtExclUI(); saveState(); }
      });
    });
  });

  box.querySelectorAll('[data-cpsize]').forEach(el => {
    el.addEventListener('input', () => {
      const l = customPtLayers.find(x => x.id === el.dataset.cpsize); if (!l) return;
      l.size = +el.value;
      const v = el.parentElement.querySelector('.cpt-size-val'); if (v) v.textContent = l.size + ' px';
      renderCustomPoints(); saveState();
    });
  });

  box.querySelectorAll('[data-cpopacity]').forEach(el => {
    el.addEventListener('input', () => {
      const l = customPtLayers.find(x => x.id === el.dataset.cpopacity); if (!l) return;
      l.opacity = +el.value;
      const v = el.parentElement.querySelector('.cpt-opacity-val'); if (v) v.textContent = Math.round(l.opacity * 100) + '%';
      renderCustomPoints(); saveState();
    });
  });

  box.querySelectorAll('[data-cplbl]').forEach(el => {
    el.addEventListener('click', () => {
      const l = customPtLayers.find(x => x.id === el.dataset.cplbl); if (!l) return;
      l.labels = !l.labels;
      el.classList.toggle('on', l.labels); el.setAttribute('aria-checked', l.labels ? 'true' : 'false');
      syncLabelAllBtn(); scheduleLabels(); saveState();
    });
  });

  box.querySelectorAll('[data-cpdens]').forEach(el => {
    el.addEventListener('click', () => {
      const l = customPtLayers.find(x => x.id === el.dataset.cpdens); if (!l) return;
      l.density = !l.density;
      el.classList.toggle('on', l.density); el.setAttribute('aria-checked', String(l.density));
      scheduleZones(); saveState();
    });
  });

  box.querySelectorAll('[data-cprad]').forEach(el => {
    el.addEventListener('click', () => {
      const l = customPtLayers.find(x => x.id === el.dataset.cprad); if (!l) return;
      l.radiusOn = !l.radiusOn; el.classList.toggle('on', l.radiusOn); el.setAttribute('aria-checked', String(l.radiusOn));
      const ctl = box.querySelector(`[data-cpradctl="${l.id}"]`); if (ctl) ctl.style.display = l.radiusOn ? '' : 'none';
      renderCustomPoints(); saveState();
    });
  });

  box.querySelectorAll('[data-cpradr]').forEach(el => {
    el.addEventListener('input', () => {
      const l = customPtLayers.find(x => x.id === el.dataset.cpradr); if (!l) return;
      l.radiusM = +el.value;
      const v = el.parentElement.querySelector('.cpt-rad-rv'); if (v) v.textContent = fmtD(l.radiusM);
      renderCustomPoints(); saveState();
    });
  });

  box.querySelectorAll('[data-cprado]').forEach(el => {
    el.addEventListener('input', () => {
      const l = customPtLayers.find(x => x.id === el.dataset.cprado); if (!l) return;
      l.radiusOpacity = +el.value;
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

  box.querySelectorAll('[data-cptrename]').forEach(el => {
    el.addEventListener('click', () => {
      const l = customPtLayers.find(x => x.id === el.dataset.cptrename); if (!l) return;
      const card = el.closest('.cpt-layer');
      const nmEl = card && card.querySelector('.lc-name'); if (!nmEl) return;
      const inp = document.createElement('input');
      inp.type = 'text'; inp.value = l.name; inp.maxLength = 40; inp.className = 'lc-rename';
      nmEl.replaceWith(inp); inp.focus(); inp.select();
      let done = false;
      const commit = save => {
        if (done) return; done = true;
        if (save) { const v = capFirst(inp.value); if (v) l.name = v; }
        buildCustomPtUI(); buildAddrSrcSel(); buildRtExclUI(); if (save) saveState();
      };
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') commit(true); else if (e.key === 'Escape') commit(false); });
      inp.addEventListener('blur', () => commit(true));
    });
  });

  box.querySelectorAll('[data-cptsolo]').forEach(el => {
    el.addEventListener('click', () => toggleCustomPtSolo(el.dataset.cptsolo));
  });

  box.querySelectorAll('[data-cptup]').forEach(el => {
    el.addEventListener('click', () => {
      _cptUploadTarget = el.dataset.cptup;
      document.getElementById('cpt-file').click();
    });
  });

  // Ручные слои: добавление точки, переход к точке и её правка
  box.querySelectorAll('[data-cptaddpt]').forEach(el => {
    el.addEventListener('click', () => openRetailForm(el.dataset.cptaddpt, null));
  });
  // Список точек сворачивается на месте, без перестройки карточек.
  box.querySelectorAll('[data-rplist]').forEach(btn => {
    btn.addEventListener('click', () => {
      const l = customPtLayers.find(x => x.id === btn.dataset.rplist); if (!l) return;
      const open = !rpListOpen(l);
      setRpListOpen(l.id, open);
      const list = document.getElementById('rp-list-' + l.id);
      if (list) list.hidden = !open;
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      btn.querySelector('span').textContent = open ? 'Скрыть список точек' : 'Показать список точек';
    });
  });

  box.querySelectorAll('[data-rpexport]').forEach(el => {
    const run = () => exportManualPts(el.dataset.rpexport);
    el.addEventListener('click', run);
    el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); run(); } });
  });
  box.querySelectorAll('[data-rpgo]').forEach(el => {
    el.addEventListener('click', e => {
      if (e.target.closest('[data-rpedit]')) return;
      const [layerId, recId] = el.dataset.rpgo.split('|');
      const layer = customPtLayers.find(x => x.id === layerId);
      const r = layer && (layer.recs || []).find(x => x.id === recId);
      if (r) map.flyTo([r.lat, r.lon], Math.max(map.getZoom(), 15), { duration: .6 });
    });
  });
  box.querySelectorAll('[data-rpedit]').forEach(el => {
    el.addEventListener('click', () => {
      const [layerId, recId] = el.dataset.rpedit.split('|');
      openRetailForm(layerId, recId);
    });
  });

  box.querySelectorAll('[data-cpdel]').forEach(el => {
    el.addEventListener('click', () => {
      const id = el.dataset.cpdel;
      const l  = customPtLayers.find(x => x.id === id); if (!l) return;
      if (!confirm(`Удалить слой «${l.name}»? Данные слоя будут потеряны.`)) return;
      if (_cptSoloId === id) {
        if (_cptPrevVisible) customPtLayers.forEach(x => { if (_cptPrevVisible[x.id] != null) x.visible = _cptPrevVisible[x.id]; });
        _cptSoloId = null; _cptPrevVisible = null;
      }
      customPtLayers = customPtLayers.filter(x => x.id !== id);
      _cptOpen.delete(id);
      clearAddrPreview();
      renderCustomPoints(); buildCustomPtUI(); buildAddrSrcSel(); buildRtExclUI();
      reenrichAll();
      renderCityInfo(); saveState();
      toast(`Слой «${l.name}» удалён`, 'info');
    });
  });
  a11ySwitches();
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
// Строки «поле: значение» для карточки точки.
function extraRowsHtml(r) {
  if (!r || !r.x) return '';
  return Object.entries(r.x).map(([k, v]) =>
    `<div class="pp-row"><span>${esc(k)}</span><b style="font-family:Inter;font-weight:600;text-align:right">${esc(String(v))}</b></div>`).join('');
}

function rebuildUpTarget() {
  const sel = document.getElementById('up-target');
  const cur = sel.value;
  // Через «Данные» обновляются только тепловые слои: наши точки грузятся во
  // вкладке «Точки», своим слоем и своим шаблоном.
  sel.innerHTML = heatKeys.length
    ? heatKeys.map(k => `<option value="${esc(k)}">${esc(DS[k] ? DS[k].name : k)}</option>`).join('')
    : '<option value="">Нет слоёв — создайте на вкладке «Карта»</option>';
  if (cur && heatKeys.includes(cur)) sel.value = cur;
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

function closeLayerModal() {
  document.getElementById('layer-modal-overlay').classList.remove('open');
}
function confirmLayerModal() {
  const name  = capFirst(document.getElementById('layer-modal-input').value);
  const color = document.getElementById('layer-modal-color').value;
  if (!name) { document.getElementById('layer-modal-input').focus(); return; }
  closeLayerModal();
  const rows = pendingHeatRows; pendingHeatRows = null;
  const parsed = rows ? toRecs(rows) : [];
  const recs = rows ? enrich(parsed) : [];
  const key  = 'custom_' + Date.now();
  DS[key] = { key, name, color, ramp: 'custom', opacity: 1, intensity: 1, visible: true,
              volUnit: parsed._percent ? '%' : '', recs, stats: statsOf(recs), _userData: true,
              // Свои колонки файла — поля слоя: шаблон, карточка, выгрузка.
              fields: mergeFields([], parsed._fields) };
  heatKeys.push(key);
  focusNewLayer(key);
  toast(recs.length ? `Слой «${name}» загружен (${recs.length} точек)` : `Слой «${name}» создан`, 'ok');
}

// Re-render everything after a layer's data changes, then fly the map to it.
function focusNewLayer(key) {
  const d = DS[key]; if (!d) return;
  if (hasCityFilter() && d.recs.length && !d.recs.some(recInCities)) { selectedCities = []; buildCityUI(); }
  // buildRtExclUI обязателен: без него новый слой не появлялся в списке
  // исключений адресной программы до перезагрузки страницы.
  buildHeatUI(); rebuildUpTarget(); buildAddrSrcSel(); buildRecBasisSel(); buildRtExclUI();
  renderHeat(); renderRecs(); saveState();
  const bpts = d.recs.filter(recInSelection).map(r => [r.lat, r.lon]);
  if (bpts.length) map.flyToBounds(L.latLngBounds(bpts).pad(.15), { duration: .6, maxZoom: 16 });
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
    const rec = { name: t.name, fil: cityOf(la, lo), lat: la, lon: lo, vol: v };
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

/* Формат значения точки с учётом единицы слоя. */
function volUnitOf(d) { return d && d.volUnit === '%' ? '%' : ''; }
function fmtVol(d, v) {
  const n = +v || 0;
  const abs = Math.abs(n);
  // toLocaleString по умолчанию режет до 3 знаков — доли вида 0,00042
  // превращались в «0». Берём столько знаков, чтобы осталось 3 значащих.
  const digits = abs > 0 && abs < 1
    ? Math.min(8, Math.max(3, 2 - Math.floor(Math.log10(abs))))
    : 2;
  const text = n.toLocaleString('ru-RU', { maximumFractionDigits: digits });
  return volUnitOf(d) ? text + '%' : text;
}

/* nd — расстояние до ближайшей НАШЕЙ точки (все слои вкладки «Точки»).
   Пока наших точек нет, расстояние неизвестно: Infinity честно означает
   «не покрыто», а в интерфейсе печатается как «—».
   Вынесено отдельно, потому что пересчитывать это надо при каждом изменении
   наших точек, а тяжёлый расчёт локального спроса (ld/lc) — не надо. */
function enrichNd(recs, ix) {
  ix = ix || buildPtIndex(ourPts());
  for (const s of recs) {
    const n = nearestPt(ix, s.lat, s.lon);
    s.nd = n ? Math.round(n.dist) : Infinity;
  }
  return recs;
}

/* Наши точки изменились (загрузка/добавление/удаление слоя) — пересчитать
   покрытие во всех тепловых слоях и обновить рекомендации. */
function reenrichAll() {
  const ix = buildPtIndex(ourPts());
  heatKeys.forEach(k => { const d = DS[k]; if (d && d.recs) enrichNd(d.recs, ix); });
  renderRecs();
}

// The former 0.01° grid made a single cell roughly 1 km tall. Dense layers
// therefore compared far too many point pairs during startup. A 0.005° grid
// keeps the same exact 700 m Haversine criterion but narrows candidates before
// that calculation; ±2 cells safely covers the radius throughout UZ and KG.
const DENSITY_GRID = 200;
const DENSITY_NEIGHBOURS = 2;
function enrichLocalDemand(recs) {
  const grid = new Map();
  recs.forEach((s, i) => {
    const la = Math.floor(s.lat * DENSITY_GRID), lo = Math.floor(s.lon * DENSITY_GRID);
    const key = la + '_' + lo;
    const bucket = grid.get(key);
    if (bucket) bucket.push(i); else grid.set(key, [i]);
  });
  for (const s of recs) {
    let ld = 0, lc = 0;
    const kla = Math.floor(s.lat * DENSITY_GRID), klo = Math.floor(s.lon * DENSITY_GRID);
    for (let dla = -DENSITY_NEIGHBOURS; dla <= DENSITY_NEIGHBOURS; dla++) {
      for (let dlo = -DENSITY_NEIGHBOURS; dlo <= DENSITY_NEIGHBOURS; dlo++) {
        const arr = grid.get((kla + dla) + '_' + (klo + dlo));
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
  // Array metadata is intentionally non-serialised; saved snapshots contain
  // only source fields and reconstruct density only when recommendations need it.
  recs._densityReady = true;
  return recs;
}
function ensureLayerDensity(d) {
  if (d && d.recs && !d.recs._densityReady) enrichLocalDemand(d.recs);
}
function enrich(recs, ix) {
  enrichNd(recs, ix);
  return enrichLocalDemand(recs);
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
    if (r.x) m.x = r.x;
    return m;
  });
}

function buildStateSnapshot() {
  const layers = {};
  heatKeys.forEach(k => {
    const d = DS[k]; if (!d) return;
    const o = { name: d.name, color: d.color, color2: d.color2 || '', ramp: d.ramp, icon: d.icon || '', shape: d.shape || '', fields: d.fields || [], opacity: d.opacity, intensity: d.intensity, visible: d.visible, showTags: !!d.showTags, volUnit: d.volUnit || '', stats: d.stats };
    if (k.startsWith('custom_') || d._userData) {
      o._userData = true;
      if (d._recordsLoaded === false) o._recordsOmitted = true;
      else o.recs = slimRecs(d.recs);
    }
    layers[k] = o;
  });
  return {
    _v: 1, _app: 'hm-br', _savedAt: new Date().toISOString(), _date: new Date().toISOString().slice(0, 10),
    _lazy: heatKeys.some(k => DS[k] && DS[k]._recordsLoaded === false),
    heatKeys, layers, incCol: { ...incCol },
    selectedCities: selectedCities.slice(),
    // Keep the legacy field for older consumers; it represents only a single selection.
    city: selectedCities.length === 1 ? selectedCities[0] : '',
    covR, topN, recBasis, recShow, heatBoost, heatBlend, heatRadius, districtsOn, incomeHeatOn, coresOn,
    // «Границы»: свои зоны (геометрия — только контуры), выбор и режим отбора.
    distOpacity, boundLayers: boundLayers.map(l => ({ id: l.id, name: l.name, color: l.color, visible: l.visible, zones: l.zones })),
    boundSel: boundSel.slice(), boundFilter: { ...boundFilter },
    showHeatAll, showPointsAll, heatStyle,
    cityScope,
    addrSrcKeys, addrRefKeys, rtRadius, rtRadiusOp, rtExclRadius, rtExclOp, rtExclKeys,
    // recs ручных слоёв несут карточку и идентификаторы фото — байты снимков
    // живут на сервере и в состояние не попадают.
    customPtLayers: customPtLayers.map(l => ({ id: l.id, name: l.name, color: l.color, color2: l.color2 || '', icon: l.icon || '', fields: l.fields || [], manual: !!l.manual, visible: l.visible, shape: l.shape, size: l.size, opacity: l.opacity, radiusOn: l.radiusOn, radiusM: l.radiusM, radiusColor: l.radiusColor, radiusOpacity: l.radiusOpacity, labels: !!l.labels, density: !!l.density, ramp: l.ramp || '', recs: l.recs })),
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
    buildCityUI(); buildHeatUI(); buildCustomPtUI(); rebuildUpTarget(); syncControls();
    renderHeat(); renderCustomPoints(); renderRecs(); renderDistricts(); renderIncome();
    doSave(); // persist locally too
    toast('Настройки загружены', 'ok');
  };
  rd.readAsText(file);
}

function applySnapshot(st) {
  // ВАЖНО: наши точки восстанавливаются ПЕРВЫМИ. От них считается nd в
  // тепловых слоях ниже — при обратном порядке покрытие посчиталось бы по
  // ещё не заменённому набору точек.
  if (Array.isArray(st.customPtLayers)) {
    // Wipe all existing custom-point markers — otherwise old groups stay
    // orphaned on the map (overlapping new ones / impossible to toggle off).
    cptRoot.clearLayers();
    // Restore custom point layers without their Leaflet groups (re-created on render)
    _cptSoloId = null; _cptPrevVisible = null; _cptOpen.clear();
    customPtLayers = st.customPtLayers.map(l => ({ ...l, _group: null }));
  }
  // Миграция: раньше точки ручного ввода лежали отдельным списком retailPts.
  // Переносим их в обычный слой — потерять заведённые вручную точки нельзя.
  if (Array.isArray(st.retailPts) && st.retailPts.length) {
    const migrated = st.retailPts.map(p => ({
      ...p, lat: +p.lat, lon: +p.lon,
      photos: Array.isArray(p.photos) ? p.photos.filter(ph => ph && ph.id) : [],
    })).filter(p => isFinite(p.lat) && isFinite(p.lon));
    const known = new Set();
    customPtLayers.forEach(l => (l.recs || []).forEach(r => { if (r.id) known.add(r.id); }));
    const fresh = migrated.filter(p => !known.has(p.id));
    if (fresh.length) {
      const color = (st.retailLayer && st.retailLayer.color) || '#F1C40F';
      customPtLayers.push({
        id: 'cpt_retail_legacy', name: 'Торговые точки', color, manual: true,
        visible: st.retailLayer ? st.retailLayer.visible !== false : true,
        shape: 'star', size: 34, opacity: 1,
        radiusOn: false, radiusM: 1500, radiusColor: color, radiusOpacity: 0.15,
        recs: fresh, _group: null,
      });
    }
  }
  // All hydrated heat layers share the same closest-own-point lookup. Build it
  // once rather than rebuilding it per layer while the map is starting.
  const ownPointIndex = buildPtIndex(ourPts());
  // Only user-uploaded layers are shown; drop legacy cig/sticks/combined keys
  // that older saved states may still carry.
  if (Array.isArray(st.heatKeys)) heatKeys = st.heatKeys.filter(k => k.startsWith('custom_'));
  if (st.layers) {
    for (const k of heatKeys) {
      const sv = st.layers[k]; if (!sv) continue;
      if (!DS[k]) DS[k] = { key: k };
      Object.assign(DS[k], {
        name: sv.name || DS[k].name || k,
        color: sv.color || DS[k].color || '#12ADC1',
        intensity: typeof sv.intensity === 'number' ? sv.intensity : (DS[k].intensity || 1),
        visible: typeof sv.visible === 'boolean' ? sv.visible : Boolean(DS[k].visible),
      });
      if (typeof sv.ramp    === 'string') DS[k].ramp    = sv.ramp;
      DS[k].color2 = typeof sv.color2 === 'string' ? sv.color2 : '';
      DS[k].icon = typeof sv.icon === 'string' ? sv.icon : '';
      DS[k].shape = typeof sv.shape === 'string' ? sv.shape : '';
      DS[k].fields = Array.isArray(sv.fields) ? sv.fields.filter(f => typeof f === 'string').slice(0, EXTRA_MAX_COLS) : [];
      if (typeof sv.opacity === 'number') DS[k].opacity = sv.opacity;
      DS[k].showTags = !!sv.showTags;
      DS[k].volUnit = sv.volUnit === '%' ? '%' : '';
      if (Array.isArray(sv.recs)) {
        // Saved recs are slim (see slimRecs). Rebuild city and nearest-own-point
        // fields during hydration; defer expensive local-demand (`ld/lc`) work
        // until this layer is selected as the recommendation basis.
        sv.recs.forEach(r => { r.fil = cityOf(r.lat, r.lon); });
        DS[k].recs = sv.recs;
        enrichNd(DS[k].recs, ownPointIndex);
        DS[k].recs._densityReady = false;
        DS[k].stats = sv.stats || statsOf(DS[k].recs);
        DS[k]._recordsLoaded = true;
        DS[k]._userData = true;
      } else if (st._meta) {
        // A metadata-first manifest must never inherit stale records from the
        // previous map/session. They arrive lazily through `/state/layer`.
        DS[k].recs = [];
        DS[k].stats = sv.stats || { n: sv.recordCount || 0, sum: 0, max: 0, p50: 0, p90: 0.01 };
        DS[k]._recordsLoaded = false;
        DS[k]._userData = true;
        // Derived render caches belong to the previous revision — drop them so a
        // refresh cannot paint the old heat over freshly published records.
        DS[k]._heatCache = null;
        DS[k]._fullPtsCache = null;
        DS[k]._heatMaxCache = null;
      } else if (!DS[k].recs) {
        DS[k].recs = []; DS[k].stats = { n: 0, sum: 0, max: 0, p50: 0, p90: 0.01 };
      }
    }
  }
  // st.pts — настройки удалённых слоёв «Наши точки · IQOS», игнорируются.
  if (st.incCol) Object.assign(incCol, st.incCol);
  if (Array.isArray(st.selectedCities)) {
    selectedCities = canonicalCities(st.selectedCities);
  } else if (typeof st.city === 'string') {
    // Backward compatibility with the previous single-city export format.
    selectedCities = st.city && CITIES.includes(st.city) ? [st.city] : [];
  }
  if (typeof st.covR       === 'number')  covR         = st.covR;
  if (typeof st.topN       === 'number')  topN         = st.topN;
  if (typeof st.recBasis   === 'string' && DS[st.recBasis]) recBasis = st.recBasis;
  if (typeof st.recShow    === 'boolean') recShow      = st.recShow;
  // Общая яркость убрана из интерфейса — старое значение не применяем, иначе
  // его нельзя было бы вернуть назад.
  heatBoost = 1;
  if (typeof st.showHeatAll === 'boolean') showHeatAll = st.showHeatAll;
  heatStyle = st.heatStyle === 'zones' ? 'zones' : 'spots';
  // Раньше ярлыки включались у каждого слоя отдельно — переносим в общий флаг.
  if (typeof st.showPointsAll === 'boolean') showPointsAll = st.showPointsAll;
  else if (st.layers && Object.values(st.layers).some(l => l && l.showTags)) showPointsAll = true;
  if (typeof st.heatBlend  === 'string')  heatBlend    = st.heatBlend;
  if (typeof st.heatRadius === 'number')  heatRadius   = st.heatRadius;
  // До октября 2026 режим назывался tashkentScope и касался только Ташкента.
  const scope = st.cityScope || st.tashkentScope;
  if (scope === 'city' || scope === 'region') cityScope = scope;
  if (typeof st.districtsOn  === 'boolean') districtsOn  = st.districtsOn;
  applyBoundsState(st);
  if (typeof st.incomeHeatOn === 'boolean') incomeHeatOn = st.incomeHeatOn;
  if (typeof st.coresOn      === 'boolean') coresOn      = st.coresOn;
  // Старые состояния хранили один ключ строкой — переносим в список.
  if (Array.isArray(st.addrSrcKeys))        addrSrcKeys  = st.addrSrcKeys.slice();
  else if (typeof st.addrSrcKey === 'string' && st.addrSrcKey) addrSrcKeys = [st.addrSrcKey];
  // Старые состояния хранили один ключ строкой — переносим в список.
  if (Array.isArray(st.addrRefKeys))        addrRefKeys  = st.addrRefKeys.slice();
  else if (typeof st.addrRefKey === 'string' && st.addrRefKey) addrRefKeys = [st.addrRefKey];
  if (typeof st.rtRadius     === 'number')  rtRadius     = st.rtRadius;
  if (typeof st.rtRadiusOp   === 'string')  rtRadiusOp   = st.rtRadiusOp;
  if (typeof st.rtExclRadius === 'number')  rtExclRadius = st.rtExclRadius;
  if (typeof st.rtExclOp     === 'string')  rtExclOp     = st.rtExclOp;
  if (Array.isArray(st.rtExclKeys))         rtExclKeys   = st.rtExclKeys.slice();
}

/* ── EXPORT RECS ─────────────────────────────────────────────────────── */
/* Значение в выгрузку — БЕЗ округления до фиксированного знака. Доли вида
   0,00042 при round(v*1000)/1000 схлопывались в одинаковые 0,001 (а раньше, при
   двух знаках, вообще в 0) — в файле получались одинаковые числа, не имеющие
   отношения к загруженным. Храним 6 значащих цифр: и мелкие доли целы, и
   хвосты двоичной арифметики не лезут. */
function exportNum(v) {
  const n = +v;
  if (!isFinite(n)) return '';
  if (n === 0) return 0;
  return Number(n.toPrecision(6));
}

/* Процентную колонку в Excel оставляем ЧИСЛОМ и вешаем формат ячейки: так
   значение и читается как «0,356%», и продолжает сортироваться/суммироваться.
   Текст с «%» превратил бы колонку в строки. Число знаков подбираем по самому
   мелкому значению, иначе «0,00042%» показалось бы как «0,000%». */
function percentCellFormat(values) {
  let min = Infinity;
  for (const v of values) {
    const a = Math.abs(+v);
    if (a > 0 && isFinite(a) && a < min) min = a;
  }
  if (!isFinite(min)) return '0.000"%"';
  const decimals = Math.min(8, Math.max(3, 2 - Math.floor(Math.log10(min))));
  return '0.' + '0'.repeat(decimals) + '"%"';
}
function markPercentColumn(ws, colIndex, rowCount, values) {
  try {
    const z = percentCellFormat(values || []);
    for (let r = 1; r <= rowCount; r++) {
      const addr = XLSX.utils.encode_cell({ c: colIndex, r });
      const cell = ws[addr];
      if (cell && typeof cell.v === 'number') { cell.z = z; cell.t = 'n'; }
    }
  } catch (e) { console.warn('Percent format skipped:', e.message); }
}

function exportRecs() {
  if (!lastRecs.length) { toast('Нет рекомендаций для экспорта', 'err'); return; }
  if (!window.XLSX) { ensureSheetLibs().then(exportRecs).catch(() => toast('Не удалось загрузить XLSX', 'err')); return; }
  const basis = DS[recBasis] || null;
  const volCol = volUnitOf(basis) ? 'Значение, %' : 'Объём';
  const header = ['Ранг', 'Название зоны', 'Город', 'Широта', 'Долгота', 'Спрос (ед/км²)', 'Точек рядом', volCol, 'До ближайшей ТТ, м'];
  const rows   = [header];
  lastRecs.forEach((s, i) => rows.push([
    i + 1, s.name || ('Зона ' + (i + 1)), s.fil || '',
    +s.lat.toFixed(6), +s.lon.toFixed(6),
    Math.round(s.ld), s.lc, exportNum(s.vol),
    isFinite(s.nd) ? s.nd : '',
  ]));
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 6 }, { wch: 30 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 15 }, { wch: 12 }, { wch: 12 }, { wch: 20 }];
  if (volUnitOf(basis)) markPercentColumn(ws, 7, lastRecs.length, lastRecs.map(s => s.vol));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Рекомендации BR');
  XLSX.writeFile(wb, 'rekomendacii_BR_' + lastBasisName.toLowerCase() + '_' + new Date().toISOString().slice(0, 10) + '.xlsx');
  toast('Файл скачан', 'ok');
}

const MANUAL_EXPORT_HEAD = ['Название', 'ДМС-код', 'Оборудование', 'Продажи',
  'Широта', 'Долгота', 'Город', 'Цвет', 'Комментарий', 'Фото, шт', 'Ссылки на фото'];
function manualExportRow(l, r) {
  const photos = (r.photos || []).filter(ph => ph && ph.id);
  return [
    r.name || '',
    r.dms || '',
    r.equip || '',
    r.sales != null && r.sales !== '' && isFinite(+r.sales) ? +r.sales : '',
    +(+r.lat).toFixed(6),
    +(+r.lon).toFixed(6),
    cityOf(r.lat, r.lon) || '',
    r.color || l.color || '',
    r.comment || '',
    photos.length,
    photos.map(ph => SERVER_URL + '/photo/' + ph.id).join('\n'),
  ];
}

/* ── ВЫГРУЗКА СЛОЯ В EXCEL ─────────────────────────────────────────────
   Колонки — как в шаблоне слоя (то, что владелец заполняет и загружает):
   стандартные + все свои поля слоя и колонки, пришедшие из файла (`r.x`).
   У тепловых слоёв к шаблону добавляются Код / Адрес / Часы, если они есть
   в данных. Выгрузку можно загрузить обратно — колонки распознаются те же;
   процентный слой пишет «Значение, %», и загрузка снова видит проценты. */
const STD_EXPORT = {
  'Название': r => r.name || '',
  'Широта': r => +(+r.lat).toFixed(6),
  'Долгота': r => +(+r.lon).toFixed(6),
  'Значение': r => exportNum(r.vol),
  'Адрес': r => r.addr || '',
  'Часы работы': r => r.hours || '',
  'Код': r => r.code || '',
};
function layerSheetAoa(kind, layer, recs, tail) {
  // Ручные точки — своя карточка (ДМС, оборудование, фото): свои колонки.
  if (kind === 'pt' && layer.manual) {
    return [MANUAL_EXPORT_HEAD.concat(tail ? [tail.head] : [])]
      .concat(recs.map(r => manualExportRow(layer, r).concat(tail ? [tail.val(r)] : [])));
  }
  const cols = layerTemplateColumns(kind, []);
  if (kind === 'heat') {
    [['Код', 'code'], ['Адрес', 'addr'], ['Часы работы', 'hours']].forEach(([c, f]) => { if (recs.some(r => r[f])) cols.push(c); });
  }
  const seen = new Set(cols.map(c => c.toLowerCase()));
  const extra = [];
  const addField = f => { const k = String(f).trim(); if (k && !seen.has(k.toLowerCase())) { seen.add(k.toLowerCase()); extra.push(k); } };
  (layer.fields || []).forEach(addField);
  recs.forEach(r => { if (r.x) Object.keys(r.x).forEach(addField); });
  const all = cols.concat(extra);
  const pct = kind === 'heat' && volUnitOf(layer);
  const head = all.map(c => c === 'Значение' && pct ? 'Значение, %' : c).concat(tail ? [tail.head] : []);
  const rows = recs.map(r => all.map(c => STD_EXPORT[c] && cols.includes(c) ? STD_EXPORT[c](r) : (r.x && r.x[c] != null ? r.x[c] : ''))
    .concat(tail ? [tail.val(r)] : []));
  return [head].concat(rows);
}
function layerSheet(kind, layer, recs, tail) {
  const aoa = layerSheetAoa(kind, layer, recs, tail);
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = aoa[0].map(c => ({ wch: Math.min(40, Math.max(10, String(c).length + 4)) }));
  const vi = aoa[0].indexOf('Значение, %');
  if (vi >= 0) markPercentColumn(ws, vi, recs.length, recs.map(r => r.vol));
  return ws;
}
function sheetName(name, used) {
  const base = String(name || 'Слой').replace(/[[\]:*?/\\]/g, ' ').trim().slice(0, 28) || 'Слой';
  let out = base, i = 2;
  while (used.has(out.toLowerCase())) out = base.slice(0, 25) + ' ' + (i++);
  used.add(out.toLowerCase());
  return out;
}
async function exportLayerXlsx(kind, id) {
  try {
    await ensureSheetLibs();
    let layer;
    if (kind === 'heat') { await ensureLayerRecords(id); layer = DS[id]; }
    else layer = customPtLayers.find(l => l.id === id);
    const recs = (layer && layer.recs) || [];
    if (!recs.length) { toast('В слое нет точек для выгрузки', 'err'); return; }
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, layerSheet(kind, layer, recs), sheetName(layer.name, new Set()));
    saveXlsx(wb, `${translit(layer.name || 'sloy')}_${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast(`Выгружено: ${recs.length.toLocaleString('ru-RU')} ${plural(recs.length, 'точка', 'точки', 'точек')}`, 'ok');
  } catch (e) {
    console.warn('Layer export failed:', e);
    toast('Не удалось выгрузить слой — проверьте интернет', 'err');
  }
}
/* Точки внутри выбранных районов и зон: лист «Районы» (площадь и сколько
   точек каждого слоя), затем по листу на каждый включённый слой — колонки
   слоя плюс «Район». Фильтр городов учитывается, режим «снаружи» — нет:
   кнопка называется «точки внутри выбранных». */
async function exportZonePoints() {
  const zones = activeBoundZones();
  if (!zones.length) { toast('Сначала выберите районы на карте', 'err'); return; }
  try {
    await ensureSheetLibs();
    const hk = heatKeys.filter(k => DS[k] && DS[k].visible);
    if (hk.length) await ensureLayerRecords(hk);
    const layers = hk.map(k => ({ kind: 'heat', layer: DS[k] }))
      .concat(customPtLayers.filter(l => l.visible).map(l => ({ kind: 'pt', layer: l })));
    const zonesOf = r => zones.filter(z => zoneHas(z, +r.lat, +r.lon));
    const perZone = zones.map(() => layers.map(() => 0));
    const sheets = [];
    layers.forEach(({ kind, layer }, li) => {
      const hits = [];
      (layer.recs || []).forEach(r => {
        if (!recInCities(r)) return;
        const zs = zonesOf(r);
        if (!zs.length) return;
        zs.forEach(z => { perZone[zones.indexOf(z)][li]++; });
        hits.push({ r, names: zs.map(z => z.name).join(', ') });
      });
      if (hits.length) {
        const byRec = new Map(hits.map(h => [h.r, h.names]));
        sheets.push({ kind, layer, recs: hits.map(h => h.r), tail: { head: 'Район', val: r => byRec.get(r) || '' } });
      }
    });
    if (!sheets.length) { toast('В выбранных районах нет точек включённых слоёв', 'err', 3500); return; }
    const used = new Set();
    const wb = XLSX.utils.book_new();
    const sumHead = ['Район', 'Площадь, км²'].concat(layers.map(x => x.layer.name));
    const sumRows = zones.map((z, zi) => [z.name, exportNum(zoneArea(z.mp) / 1e6)].concat(perZone[zi]));
    if (zones.length > 1) {
      sumRows.push(['Всего', exportNum(zones.reduce((a, z) => a + zoneArea(z.mp), 0) / 1e6)]
        .concat(layers.map((_, li) => sheets.find(sh => sh.layer === layers[li].layer)?.recs.length || 0)));
    }
    const sum = XLSX.utils.aoa_to_sheet([sumHead].concat(sumRows));
    sum['!cols'] = sumHead.map((c, i) => ({ wch: i ? Math.max(12, String(c).length + 2) : 28 }));
    XLSX.utils.book_append_sheet(wb, sum, sheetName('Районы', used));
    sheets.forEach(sh => XLSX.utils.book_append_sheet(wb, layerSheet(sh.kind, sh.layer, sh.recs, sh.tail), sheetName(sh.layer.name, used)));
    saveXlsx(wb, `tochki_v_rayonah_${new Date().toISOString().slice(0, 10)}.xlsx`);
    const n = sheets.reduce((a, sh) => a + sh.recs.length, 0);
    toast(`Выгружено: ${n.toLocaleString('ru-RU')} ${plural(n, 'точка', 'точки', 'точек')} из ${zones.length} ${plural(zones.length, 'района', 'районов', 'районов')}`, 'ok');
  } catch (e) {
    console.warn('Zone export failed:', e);
    toast('Не удалось выгрузить — проверьте интернет', 'err');
  }
}

/* Выгрузка точек ручного ввода. `layerId` — один слой, иначе все ручные слои
   одним листом. Фото в XLSX не вставить, поэтому даём число и прямые ссылки:
   они открываются в браузере, где уже есть сессия. */
function exportManualPts(layerId) {
  if (!window.XLSX) {
    ensureSheetLibs().then(() => exportManualPts(layerId)).catch(() => toast('Не удалось загрузить XLSX', 'err'));
    return;
  }
  const layers = layerId ? customPtLayers.filter(l => l.id === layerId) : manualLayers();
  const rows = [['Слой'].concat(MANUAL_EXPORT_HEAD)];
  layers.forEach(l => (l.recs || []).forEach(r => rows.push([l.name].concat(manualExportRow(l, r)))));
  if (rows.length === 1) { toast('В слое нет точек для выгрузки', 'err'); return; }

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 20 }, { wch: 30 }, { wch: 14 }, { wch: 26 }, { wch: 10 },
                 { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 10 }, { wch: 40 }, { wch: 9 }, { wch: 52 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Точки');
  const base = layerId && layers[0] ? layers[0].name : 'tochki_vruchnuyu';
  const safe = base.replace(/[^\wа-яё\- ]+/gi, '').trim().replace(/\s+/g, '_').slice(0, 40) || 'tochki';
  XLSX.writeFile(wb, safe + '_' + new Date().toISOString().slice(0, 10) + '.xlsx');
  toast(`Выгружено точек: ${rows.length - 1}`, 'ok');
}

/* ── RETRAFFIC FILTERED EXPORT ───────────────────────────────────────── */
// Layers eligible for use as "exclusions" — custom layers, not base shipment layers
// Сколько точек в слое НА САМОМ ДЕЛЕ. Записи тепловых слоёв грузятся лениво
// (только видимые и основа рекомендаций), поэтому у остальных `recs` пуст, хотя
// данные на сервере есть. Число берём из манифеста (`stats.n`).
function layerRecordCount(d) {
  if (!d) return 0;
  if (d._recordsLoaded === false) return (d.stats && d.stats.n) || 0;
  return (d.recs || []).length || ((d.stats && d.stats.n) || 0);
}
function rtExclLayerKeys() {
  const hk = heatKeys.filter(k => k !== 'cig' && k !== 'sticks' && DS[k] && layerRecordCount(DS[k]) > 0);
  const ck = customPtLayers.filter(l => l.recs.length).map(l => '__cpt__' + l.id);
  return [...hk, ...ck];
}
/* Компактный список слоёв для шагов адрески: видно 3 слоя (отмеченные —
   первыми), остальные раскрываются кнопкой «Ещё N». Строка — квадратик-галка,
   цвет слоя, название и число точек. */
const PICK_VISIBLE = 3;
const _pickOpen = new Set();
function pickLayerMeta(k) {
  if (k.startsWith('__cpt__')) {
    const l = customPtLayers.find(x => x.id === k.slice(7));
    return l ? { name: l.name, sw: l.color2 ? `linear-gradient(135deg, ${safeColor(l.color)}, ${safeColor(l.color2)})` : safeColor(l.color), n: l.recs.length, kind: 'Точки' } : null;
  }
  const d = DS[k];
  return d ? { name: d.name || k, sw: paintSwatchCss(d), n: layerRecordCount(d), kind: 'Слой' } : null;
}
function pickListHtml(listId, keys, selected, attr, ariaVerb) {
  const ordered = keys.filter(k => selected.includes(k)).concat(keys.filter(k => !selected.includes(k)));
  const open = _pickOpen.has(listId);
  const limit = Math.max(PICK_VISIBLE, selected.length);
  const rows = ordered.map((k, i) => {
    const m = pickLayerMeta(k); if (!m) return '';
    const on = selected.includes(k);
    const hidden = !open && i >= limit;
    return `<button type="button" class="pick-row${on ? ' on' : ''}" ${attr}="${esc(k)}" aria-pressed="${on}"${hidden ? ' hidden' : ''} title="${esc(ariaVerb)} «${esc(m.name)}»">
      <span class="pick-chk" aria-hidden="true"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg></span>
      <span class="pick-sw" style="background:${m.sw}"></span>
      <span class="pick-nm">${esc(m.name)}</span>
      <span class="pick-n">${m.n.toLocaleString('ru-RU')}</span>
    </button>`;
  }).join('');
  const rest = ordered.length - limit;
  const more = rest > 0
    ? `<button type="button" class="pick-more" data-pickmore="${esc(listId)}" aria-expanded="${open}">${open ? 'Свернуть' : `Ещё ${rest} ${plural(rest, 'слой', 'слоя', 'слоёв')}`}${uiIcon('chevron', 13)}</button>`
    : '';
  return `<div class="pick-list">${rows}</div>${more}`;
}
function wirePickMore(box, listId) {
  const b = box.querySelector('[data-pickmore]');
  if (!b) return;
  b.addEventListener('click', () => {
    const open = !_pickOpen.has(listId);
    if (open) _pickOpen.add(listId); else _pickOpen.delete(listId);
    if (listId === 'src') buildAddrSrcSel(); else if (listId === 'ref') buildAddrRefSel(); else buildRtExclUI();
  });
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
    box.innerHTML = '<div class="rt-excl-empty">Нет других слоёв с точками — загрузите слой на вкладке «Карта» или «Точки».</div>';
    syncExclHint();
    return;
  }
  box.innerHTML = pickListHtml('excl', keys, rtExclKeys, 'data-rtx', 'Исключать точки рядом со слоем');
  wirePickMore(box, 'excl');
  box.querySelectorAll('[data-rtx]').forEach(cb => {
    cb.addEventListener('click', () => {
      const k = cb.dataset.rtx;
      if (rtExclKeys.includes(k)) rtExclKeys = rtExclKeys.filter(x => x !== k);
      else rtExclKeys.push(k);
      cb.classList.toggle('on', rtExclKeys.includes(k));
      cb.setAttribute('aria-pressed', String(rtExclKeys.includes(k)));
      syncExclHint();
      saveState();
    });
  });
  syncExclHint();
}

const OP_LABELS = { lte: '≤', lt: '<', gte: '≥', gt: '>' };
function opLabel(op) { return OP_LABELS[op] || op; }
const cmpDist = (d, thresh, op) =>
  op === 'lte' ? d <= thresh : op === 'lt' ? d < thresh : op === 'gte' ? d >= thresh : d > thresh;

// Что сейчас показано превью адресной программы — для строк в легенде.
// null — превью не на карте.
let addrPreview = null;
function syncAddrPreviewBtn() {
  const btn = document.getElementById('btn-addr-preview');
  if (!btn) return;
  btn.innerHTML = addrPreview ? `${uiIcon('x', 15)} Убрать с карты` : `${uiIcon('eye', 15)} Показать на карте`;
  btn.classList.toggle('on', !!addrPreview);
}
function clearAddrPreview() {
  addrLayer.clearLayers();
  if (addrPreview) { addrPreview = null; updateLayerLegend(); }
  syncAddrPreviewBtn();
}

/* Объясняет шаг исключений живым текстом: какой оператор выбран, то и пишем.
   Раньше подпись была жёстко «ближе чем», хотя оператор мог стоять на «>» —
   и тогда правило означало ровно обратное. */
function syncExclHint() {
  const label = document.getElementById('rt-excl-op-label');
  const hint  = document.getElementById('rt-excl-hint');
  if (!label || !hint) return;
  const far = rtExclOp === 'gt' || rtExclOp === 'gte';
  label.textContent = far ? 'дальше чем' : 'ближе чем';
  const n = rtExclKeys.length;
  if (!n) {
    hint.className = 'addr-hint';
    hint.textContent = 'Ни один слой не отмечен — исключения не применяются.';
    return;
  }
  const layers = n === 1 ? 'отмеченного слоя' : `отмеченных слоёв (${n})`;
  if (far) {
    hint.className = 'addr-hint warn';
    hint.textContent = `Уберём адреса, у которых ближайшая точка ${layers} ДАЛЬШЕ ${fmtD(rtExclRadius)}. Обычно нужен обратный знак — «<» или «≤».`;
  } else {
    hint.className = 'addr-hint';
    hint.textContent = `Уберём адреса, рядом с которыми уже есть точка ${layers} — ближе ${fmtD(rtExclRadius)}.`;
  }
}

/* Returns all available source layers for address program (name → key map) */
function addrSrcOptions() {
  const opts = [];
  heatKeys.forEach(k => { if (DS[k]) opts.push({ key: k, name: DS[k].name || k }); });
  customPtLayers.forEach(l => opts.push({ key: '__cpt__' + l.id, name: l.name }));
  return opts;
}

/* Источником могут быть НЕСКОЛЬКО слоёв сразу — их точки объединяются.
   Список тумблеров, как в шаге «Исключить»: выпадающий список позволял
   выбрать только один слой. */
function buildAddrSrcSel() {
  const box = document.getElementById('addr-src-list');
  if (!box) return;
  const opts = addrSrcOptions();
  const valid = new Set(opts.map(o => o.key));
  addrSrcKeys = addrSrcKeys.filter(k => valid.has(k));
  if (!addrSrcKeys.length && opts.length) addrSrcKeys = [opts[0].key];

  if (!opts.length) {
    box.innerHTML = '<div class="rt-excl-empty">Нет слоёв — загрузите на вкладке «Карта» или «Точки».</div>';
  } else {
    box.innerHTML = pickListHtml('src', opts.map(o => o.key), addrSrcKeys, 'data-addrsrc', 'Анализировать слой');
    wirePickMore(box, 'src');
    box.querySelectorAll('[data-addrsrc]').forEach(cb => {
      cb.addEventListener('click', () => {
        const k = cb.dataset.addrsrc;
        // Хотя бы один слой должен остаться — иначе анализировать нечего.
        if (addrSrcKeys.includes(k)) {
          if (addrSrcKeys.length === 1) { toast('Оставьте хотя бы один слой', 'err'); return; }
          addrSrcKeys = addrSrcKeys.filter(x => x !== k);
        } else {
          addrSrcKeys.push(k);
        }
        cb.classList.toggle('on', addrSrcKeys.includes(k));
        buildAddrSrcSel();
        clearAddrPreview();
        saveState();
      });
    });
  }
  const exclBlock = document.getElementById('addr-excl-block');
  // Исключения работают, когда среди выбранных есть слой со значениями.
  if (exclBlock) exclBlock.style.display = addrSrcHasVol() ? '' : 'none';
  buildAddrRefSel();
}

/* Слои-источники, разложенные по типу. */
function addrSrcLayers() {
  return addrSrcKeys.map(k => {
    if (k.startsWith('__cpt__')) {
      const layer = customPtLayers.find(l => l.id === k.slice(7));
      return layer ? { key: k, name: layer.name, recs: layer.recs, heat: null } : null;
    }
    const d = DS[k];
    return d ? { key: k, name: d.name || k, recs: d.recs || [], heat: d } : null;
  }).filter(Boolean);
}
function addrSrcHasVol() { return addrSrcLayers().some(l => l.heat); }
function addrSrcName() {
  const names = addrSrcLayers().map(l => l.name);
  if (!names.length) return '—';
  return names.length <= 2 ? names.join(' + ') : `${names[0]} и ещё ${names.length - 1}`;
}
/* Общая единица значения: только если ВСЕ слои со значениями процентные. */
function addrSrcUnitLayer() {
  const withVol = addrSrcLayers().filter(l => l.heat);
  if (!withVol.length) return null;
  return withVol.every(l => volUnitOf(l.heat) === '%') ? withVol[0].heat : null;
}

/* Ориентиры — НЕСКОЛЬКО слоёв точек: расстояние считается до ближайшей точки
   среди всех отмеченных. Раньше был `<select>` и работал ровно один слой. */
function buildAddrRefSel() {
  const box = document.getElementById('addr-ref-list');
  if (!box) return;
  const opts = [];
  customPtLayers.forEach(l => {
    if (l.recs.length) opts.push({ key: '__cpt__' + l.id, name: l.name });
  });
  const valid = new Set(opts.map(o => o.key));
  addrRefKeys = addrRefKeys.filter(k => valid.has(k));
  if (!addrRefKeys.length && opts.length) addrRefKeys = [opts[0].key];

  if (!opts.length) {
    box.innerHTML = '<div class="rt-excl-empty">Нет точек — загрузите их на вкладке «Точки».</div>';
    return;
  }
  box.innerHTML = pickListHtml('ref', opts.map(o => o.key), addrRefKeys, 'data-addrref', 'Считать расстояние до слоя');
  wirePickMore(box, 'ref');
  box.querySelectorAll('[data-addrref]').forEach(cb => {
    cb.addEventListener('click', () => {
      const k = cb.dataset.addrref;
      // Без ориентиров расстояние считать не от чего — один слой оставляем.
      if (addrRefKeys.includes(k)) {
        if (addrRefKeys.length === 1) { toast('Оставьте хотя бы один слой точек', 'err'); return; }
        addrRefKeys = addrRefKeys.filter(x => x !== k);
      } else {
        addrRefKeys.push(k);
      }
      cb.classList.toggle('on', addrRefKeys.includes(k));
      buildAddrRefSel();
      clearAddrPreview();
      saveState();
    });
  });
}

function addrRefLayers() {
  return addrRefKeys
    .map(k => customPtLayers.find(l => '__cpt__' + l.id === k))
    .filter(l => l && l.recs.length);
}

/* Подпись ориентиров для попапов, тостов и выгрузки */
function addrRefName() {
  const names = addrRefLayers().map(l => l.name);
  if (!names.length) return 'наши точки';
  return names.length <= 2 ? names.join(' + ') : `${names[0]} и ещё ${names.length - 1}`;
}

/* Точки-ориентиры для расчёта расстояния. Одна точка, попавшая в два слоя,
   не должна считаться дважды — сводим по координатам и помним слой, чтобы
   показать его в карточке кандидата. */
function addrRefPoints() {
  const byCoord = new Map();
  addrRefLayers().forEach(l => {
    for (const r of l.recs) {
      const key = (+r.lat).toFixed(5) + '|' + (+r.lon).toFixed(5);
      if (!byCoord.has(key)) byCoord.set(key, { ...r, _layerName: l.name });
    }
  });
  return [...byCoord.values()];
}

/* Точки всех выбранных слоёв одним списком. Одна и та же точка, попавшая в
   два слоя, в адресной программе должна быть одним адресом — поэтому
   объединяем по координатам, запоминая, из каких слоёв она пришла. */
function addrSrcRecs() {
  const byCoord = new Map();
  addrSrcLayers().forEach(l => {
    for (const r of l.recs) {
      const key = (+r.lat).toFixed(5) + '|' + (+r.lon).toFixed(5);
      const prev = byCoord.get(key);
      if (prev) {
        if (!prev._srcNames.includes(l.name)) prev._srcNames.push(l.name);
        // Значение берём максимальное из слоёв — точка «весит» столько,
        // сколько её самый крупный источник.
        if (l.heat && (prev.vol_total == null || (r.vol || 0) > prev.vol_total)) prev.vol_total = r.vol || 0;
        continue;
      }
      byCoord.set(key, { ...r, vol_total: l.heat ? (r.vol || 0) : null, _srcNames: [l.name] });
    }
  });
  return [...byCoord.values()];
}

/* Core filter: returns { points, excluded, srcName, hasVol, noRef } */
function runAddrFilter() {
  const hasVol = addrSrcHasVol();   // хотя бы один слой со значениями
  const srcName = addrSrcName();

  let points = addrSrcRecs();
  if (selectionActive()) points = points.filter(recInSelection);

  const refPts = addrRefPoints();

  // Attach nearest reference-point distance AND the ref point itself
  const refIx = buildPtIndex(refPts);
  points.forEach(p => {
    const n = nearestPt(refIx, p.lat, p.lon);
    p._distOwn = n ? Math.round(n.dist) : Infinity;
    p._nearRef = n ? n.ref : null;   // reference point object
  });

  // Фильтр по объёму точки убран по просьбе владельца: адресную программу
  // задают расстояние до ориентиров и исключения.

  // Distance to the reference layer (our points)
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

  return { points, excluded, srcName, hasVol, noRef: !refPts.length };
}

/* Show filtered points on map */
// Адресная программа читает записи слоя-источника и слоёв-исключений напрямую.
// Записи тепловых слоёв грузятся лениво, поэтому без явной подгрузки фильтр
// считал бы по пустым массивам: ноль точек у источника и «исключено 0»,
// причём молча — результат выглядел бы правдоподобным.
async function ensureAddrLayers() {
  const keys = [...addrSrcKeys, ...rtExclKeys].filter(k => DS[k] && DS[k]._recordsLoaded === false);
  if (!keys.length) return true;
  toast('Загружаем данные слоёв…', 'info', 2500);
  try {
    await ensureLayerRecords(keys);
    return true;
  } catch (e) {
    toast('Не удалось загрузить данные слоёв: ' + (e.message || 'ошибка связи'), 'err', 5000);
    return false;
  }
}

async function previewAddrOnMap() {
  // Повторный клик убирает превью — иначе оранжевые точки некуда девать.
  if (addrPreview) { clearAddrPreview(); return; }
  if (!(await ensureAddrLayers())) return;
  clearAddrPreview();
  const { points, noRef } = runAddrFilter();
  // Без референсных точек фильтр по расстоянию не имеет смысла — говорим прямо,
  // а не «нет точек по фильтрам» (частый случай на карте KG).
  if (noRef) { toast(`Нет точек-ориентиров («${addrRefName()}») — загрузите их во вкладке «Точки»`, 'err', 5000); return; }
  if (!points.length) { toast('Нет точек по текущим фильтрам', 'warn'); return; }

  const refLabel = addrRefName();
  const srcLayer = addrSrcUnitLayer();   // единица значения, если она общая для слоёв
  const multiSrc = addrSrcKeys.length > 1;
  const multiRef = addrRefLayers().length > 1;

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
      `<b style="color:#6C8EFF">${esc(ref._layerName || refLabel)}</b><br>${esc(refName)}`,
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
    // При нескольких слоях-ориентирах важнее, к какому именно ближе всего.
    const nearLabel = multiRef && p._nearRef && p._nearRef._layerName ? p._nearRef._layerName : refLabel;
    const lines = [`<b style="color:#FF8C00">#${i + 1} ${esc(p.name || '—')}</b>`];
    if (p.addr) lines.push(esc(p.addr));
    if (p.fil)  lines.push(esc(p.fil));
    // При объединении слоёв важно видеть, откуда точка.
    if (multiSrc && p._srcNames) lines.push(`Слой: <b>${esc(p._srcNames.join(', '))}</b>`);
    lines.push(`До ${esc(nearLabel)}${nearName ? ' (' + esc(nearName) + ')' : ''}: <b>${fmtD(p._distOwn)}</b>`);
    if (p.vol_total != null) lines.push(`${volUnitOf(srcLayer) ? 'Значение' : 'Объём'}: ${fmtVol(srcLayer, p.vol_total)}`);
    m.bindPopup(lines.join('<br>') + yandexLinkHtml(p.lat, p.lon));
    addrLayer.addLayer(m);
  });

  addrPreview = { count: points.length, refs: usedRefs.size, refLabel: refLabel };
  updateLayerLegend();
  syncAddrPreviewBtn();

  const allPts = [...points.map(p => [p.lat, p.lon]),
                  ...[...usedRefs.values()].map(r => [r.lat, r.lon])];
  map.flyToBounds(L.latLngBounds(allPts).pad(.12), { duration: .7, maxZoom: 16 });
  toast(`На карте: ${points.length} точек · ${usedRefs.size} ориентиров`, 'ok');
}

async function exportRetraffic() {
  if (!window.XLSX) { ensureSheetLibs().then(exportRetraffic).catch(() => toast('Не удалось загрузить XLSX', 'err')); return; }
  if (!(await ensureAddrLayers())) return;
  const { points, excluded, srcName, hasVol, noRef } = runAddrFilter();
  const refName = addrRefName();
  const srcLayerForExport = addrSrcUnitLayer();   // единица значения колонки

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
  const volCol = volUnitOf(srcLayerForExport) ? 'Значение, %' : 'Объём';
  // Колонка «Слой» нужна только когда основ несколько — иначе это шум.
  const multiSrc = addrSrcKeys.length > 1;
  // Расстояние само по себе не говорит, ДО КАКОЙ точки оно посчитано —
  // ставим ориентир сразу за ним. Код и слой добавляем только если им есть
  // что показать, чтобы не плодить пустые колонки.
  const refNameOf = p => {
    const r = p._nearRef;
    if (!r) return '';
    return r.name || r.code || r.dms || `${(+r.lat).toFixed(5)}, ${(+r.lon).toFixed(5)}`;
  };
  const refCodeOf = p => (p._nearRef && (p._nearRef.code || p._nearRef.dms)) || '';
  const refHasCode = points.some(p => refCodeOf(p));
  const multiRef = addrRefLayers().length > 1;

  const rows = [['№', 'Название', 'Город', 'Адрес', 'Широта', 'Долгота', volCol, distCol,
                 'Ближайшая точка']
    .concat(refHasCode ? ['Код ориентира'] : [])
    .concat(multiRef ? ['Слой ориентира'] : [])
    .concat(['Код'])
    .concat(multiSrc ? ['Слой'] : [])];
  points.forEach((p, i) => {
    rows.push([
      i + 1, p.name || '', p.fil || '', p.addr || '',
      +p.lat.toFixed(6), +p.lon.toFixed(6),
      p.vol_total != null ? exportNum(p.vol_total) : '',
      isFinite(p._distOwn) ? p._distOwn : '',
      refNameOf(p),
    ].concat(refHasCode ? [refCodeOf(p)] : [])
     .concat(multiRef ? [(p._nearRef && p._nearRef._layerName) || ''] : [])
     .concat([p.code || ''])
     .concat(multiSrc ? [(p._srcNames || []).join(', ')] : []));
  });

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 4 }, { wch: 38 }, { wch: 12 }, { wch: 36 }, { wch: 12 }, { wch: 12 }, { wch: 13 }, { wch: 18 }, { wch: 30 }]
    .concat(refHasCode ? [{ wch: 16 }] : [])
    .concat(multiRef ? [{ wch: 22 }] : [])
    .concat([{ wch: 10 }])
    .concat(multiSrc ? [{ wch: 26 }] : []);
  if (volUnitOf(srcLayerForExport)) markPercentColumn(ws, 6, points.length, points.map(p => p.vol_total));

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
      ['Исключаемые слои', exclNames.length ? exclNames.join(', ') : 'не выбраны'],
      ['Расстояние до исключ. слоя', opLabel(rtExclOp) + ' ' + fmtD(rtExclRadius)],
      ['Исключено точек', excluded],
    ] : []),
    ['Город', selectedCityLabel()],
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
// currentMap: id карты из реестра (comdep, other, kg или созданная владельцем)
// currentRole: 'admin' | 'comdep' | 'other' | 'kg'
let currentMap  = sessionStorage.getItem('hm_map')  || null;
let currentRole = null; // populated only from the server session
let currentUser = null; // populated only from the server session
const isAdmin = () => currentRole === 'admin';

/* ── PERSISTENCE ─────────────────────────────────────────────────────── */
// State is stored per-map so the two departments never overwrite each other.
const storeKey = () => 'hm_state_' + encodeURIComponent(currentUser || 'anonymous') + '_' + (currentMap || 'main');

// ── Server sync config ───────────────────────────────────────────────────
// Set SERVER_URL to your VPS API root, e.g. 'https://api.example.com'
// Set SERVER_KEY to the API_KEY you configured in server/.env
// Leave SERVER_URL empty to skip server sync and use localStorage only.
const SERVER_URL = window._HM_SERVER_URL || '';
// The owner-only API key is entered separately and is never bundled. It is
// intentionally memory-only: a page refresh requires the owner to enter it
// again, which prevents a persistent write credential in browser storage.
let SERVER_KEY = '';
try { localStorage.removeItem('hm_admin_key'); } catch (e) {}

// The HttpOnly cookie is the primary session transport. A short-lived bearer
// response remains an in-memory fallback for browsers that block cross-site
// cookies, but it is never persisted in sessionStorage/localStorage.
let SESSION_TOKEN = '';
try { sessionStorage.removeItem('hm_session_token'); } catch (e) {}
function authHeaders(extra = {}) {
  return SESSION_TOKEN ? { ...extra, Authorization: `Bearer ${SESSION_TOKEN}` } : { ...extra };
}
function authFetch(url, options = {}) {
  return fetch(url, { ...options, credentials: 'include', headers: authHeaders(options.headers || {}) });
}
// Ключ записи выдаёт сервер — при входе и при восстановлении сессии после F5.
// Владельцу больше не нужно вводить его руками; ручное поле остаётся запасным
// путём (старый сервер без writeKey либо статический API_KEY для скриптов).
function applyWriteKey(key) {
  if (typeof key === 'string' && key) SERVER_KEY = key;
  const inp = document.getElementById('admin-key-input');
  if (inp && SERVER_KEY) inp.placeholder = 'Ключ получен автоматически';
  if (typeof syncRetailKeyWarn === 'function') syncRetailKeyWarn();
}

function rememberSessionToken(token) {
  SESSION_TOKEN = typeof token === 'string' ? token : '';
}

// Persistent read cache for authenticated payloads. IndexedDB holds multi-megabyte
// snapshots without the localStorage quota pressure that caused the old cache to
// be removed at boot. Entries are scoped to the authenticated user and map.
const HM_CACHE_DB = 'hm-read-cache-v2';
const HM_CACHE_STORE = 'entries';
let _cacheDb = null;
function cacheScope() {
  return encodeURIComponent(currentUser || 'anonymous') + ':' + encodeURIComponent(currentMap || 'main');
}
function cacheKey(kind, extra = '') {
  return kind + ':' + cacheScope() + (extra ? ':' + encodeURIComponent(extra) : '');
}
function openReadCache() {
  if (!('indexedDB' in window)) return Promise.resolve(null);
  if (_cacheDb) return Promise.resolve(_cacheDb);
  return new Promise(resolve => {
    let done = false;
    const finish = db => { if (!done) { done = true; resolve(db); } };
    try {
      const req = indexedDB.open(HM_CACHE_DB, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(HM_CACHE_STORE)) db.createObjectStore(HM_CACHE_STORE);
      };
      req.onsuccess = () => { _cacheDb = req.result; _cacheDb.onversionchange = () => { _cacheDb.close(); _cacheDb = null; }; finish(_cacheDb); };
      req.onerror = req.onblocked = () => finish(null);
    } catch (_) { finish(null); }
  });
}
async function cacheGet(key) {
  const db = await openReadCache(); if (!db) return null;
  return new Promise(resolve => {
    try {
      const req = db.transaction(HM_CACHE_STORE, 'readonly').objectStore(HM_CACHE_STORE).get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    } catch (_) { resolve(null); }
  });
}
async function cachePut(key, value) {
  const db = await openReadCache(); if (!db) return false;
  return new Promise(resolve => {
    try {
      const req = db.transaction(HM_CACHE_STORE, 'readwrite').objectStore(HM_CACHE_STORE).put(value, key);
      req.onsuccess = () => resolve(true);
      req.onerror = () => resolve(false);
    } catch (_) { resolve(false); }
  });
}
async function pruneOldLayerRevisions(revision) {
  const db = await openReadCache(); if (!db || !revision) return;
  const prefixes = [cacheKey('state-layer') + ':', cacheKey('state-chunk') + ':'];
  const keepPrefixes = [cacheKey('state-layer', revision + ':'), cacheKey('state-chunk', revision + ':')];
  await new Promise(resolve => {
    try {
      const store = db.transaction(HM_CACHE_STORE, 'readwrite').objectStore(HM_CACHE_STORE);
      const req = store.getAllKeys();
      req.onsuccess = () => {
        (req.result || []).forEach(key => {
          const oldLayer = typeof key === 'string' && prefixes.some((prefix, i) => key.startsWith(prefix) && !key.startsWith(keepPrefixes[i]));
          if (oldLayer) store.delete(key);
        });
        resolve();
      };
      req.onerror = () => resolve();
    } catch (_) { resolve(); }
  });
}
function dataRevision(data) { return (data && (data._savedAt || data._revision)) || ''; }
function applyData(data) {
  DATA = Object.assign(data, { _loaded: true });
  bzInvalidate();   // районы города для «Границ» приехали только сейчас
  Object.assign(DS.cig, data.cig || {});
  Object.assign(DS.sticks, data.sticks || {});
  DS.cig.ramp = DS.cig.ramp || 'warm';
  DS.sticks.ramp = DS.sticks.ramp || 'cool';
  Object.values(DS).forEach(d => { d.opacity = d.opacity == null ? 1 : d.opacity; });
  return DATA;
}
async function fetchDataMeta() {
  const res = await authFetch(SERVER_URL + '/data/meta', { signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}
async function fetchDataset() {
  const res = await authFetch(SERVER_URL + '/data', { signal: AbortSignal.timeout(60000) });
  if (res.status === 401) throw new Error('AUTH_REQUIRED');
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const data = await res.json();
  if (!data || data.empty) throw new Error('На сервере нет базовых данных');
  return data;
}
let _dataLoad = null;
async function ensureData() {
  if (DATA && DATA._loaded) return DATA;
  if (!SERVER_URL) throw new Error('Сервер не настроен');
  if (!_dataLoad) {
    _dataLoad = (async () => {
      const key = cacheKey('dataset');
      const cached = await cacheGet(key);
      if (cached && cached.data) {
        // Show the last verified dataset immediately. A tiny metadata request
        // revalidates it in the background without delaying first paint.
        const ready = applyData(cached.data);
        fetchDataMeta().then(async meta => {
          if (meta && !meta.empty && meta._revision !== cached.revision) {
            const fresh = await fetchDataset();
            await cachePut(key, { revision: dataRevision(fresh), data: fresh, cachedAt: Date.now() });
            // Do not replace an already interactive map mid-session. The new
            // dataset is ready for the next open and the current state remains coherent.
          }
        }).catch(() => {});
        return ready;
      }
      const fresh = await fetchDataset();
      await cachePut(key, { revision: dataRevision(fresh), data: fresh, cachedAt: Date.now() });
      return applyData(fresh);
    })().catch(err => {
      _dataLoad = null;
      throw err;
    });
  }
  return _dataLoad;
}

function stateRevision(state) { return (state && (state._revision || state._savedAt)) || ''; }
let _activeStateRevision = '';

async function readCachedStateMeta() {
  const cached = await cacheGet(cacheKey('state-meta'));
  return cached && cached.meta && cached.meta._app === 'hm-br' ? cached.meta : null;
}
async function cacheStateMeta(meta) {
  if (!meta || meta.empty || meta._app !== 'hm-br') return false;
  return cachePut(cacheKey('state-meta'), { revision: stateRevision(meta), meta, cachedAt: Date.now() });
}
function snapshotManifest(snapshot) {
  const layers = {};
  for (const [key, layer] of Object.entries(snapshot.layers || {})) {
    const { recs, ...meta } = layer || {};
    layers[key] = {
      ...meta,
      recordCount: Array.isArray(recs) ? recs.length : (meta.stats && meta.stats.n) || 0,
    };
  }
  return { ...snapshot, layers, _meta: true, _revision: snapshot._savedAt || '' };
}
function cacheStateSnapshot(snapshot) {
  const revision = stateRevision(snapshot);
  if (!revision) return;
  cacheStateMeta(snapshotManifest(snapshot));
  pruneOldLayerRevisions(revision);
  for (const [key, layer] of Object.entries(snapshot.layers || {})) {
    if (!Array.isArray(layer && layer.recs)) continue;
    cachePut(cacheKey('state-layer', revision + ':' + key), {
      revision, recs: layer.recs, stats: layer.stats, cachedAt: Date.now(),
    });
  }
}
async function fetchStateManifest() {
  if (!SERVER_URL) return null;
  const res = await authFetch(SERVER_URL + '/state/meta?map=' + encodeURIComponent(currentMap), {
    signal: AbortSignal.timeout(55000),
  });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const data = await res.json();
  if (!data || data.empty || data._app !== 'hm-br') return null;
  return data;
}
let _stateRevisionRefresh = null;
async function refreshStateRevision() {
  if (!SERVER_URL) return false;
  if (!_stateRevisionRefresh) {
    const before = _activeStateRevision;
    _stateRevisionRefresh = (async () => {
      const fresh = await fetchStateManifest();
      const next = stateRevision(fresh);
      if (!next || next === before) return false;
      _activeStateRevision = next;
      await cacheStateMeta(fresh);
      pruneOldLayerRevisions(next);
      return true;
    })().finally(() => { _stateRevisionRefresh = null; });
  }
  return _stateRevisionRefresh;
}
function isStaleLayerError(err) {
  return err && (err.message === 'STALE_LAYER' || err.message === 'STALE_LAYER_CHUNK');
}
// Set while a visible refresh runs so the loaders can report real progress
// (records hydrated / records promised by the manifest) instead of a fake bar.
let _loadProgressHook = null;
function reportLoadProgress(n) {
  if (_loadProgressHook && n > 0) _loadProgressHook(n);
}
function hydrateLayerRecords(key, recs, stats, ownPointIndex, complete = true) {
  const d = DS[key];
  if (!d) return;
  const rows = Array.isArray(recs) ? recs : [];
  rows.forEach(r => { r.fil = cityOf(r.lat, r.lon); });
  d.recs = rows;
  enrichNd(rows, ownPointIndex || buildPtIndex(ourPts()));
  rows._densityReady = false;
  d.stats = stats || statsOf(rows);
  d._recordsLoaded = complete;
  d._recordsLoading = !complete;
  d._heatCache = null;
  d._fullPtsCache = null;
  d._heatMaxCache = null;
}
const CHUNK_LAYER_MIN_RECORDS = 12000;
const CHUNK_SIZE = 4000;
function yieldToBrowser() {
  return new Promise(resolve => {
    if (typeof requestIdleCallback === 'function') requestIdleCallback(resolve, { timeout: 250 });
    else setTimeout(resolve, 0);
  });
}
function expandLayerChunk(payload) {
  const dict = payload.dictionaries || {};
  const value = (field, index) => index == null || index < 0 ? '' : (dict[field] && dict[field][index]) || '';
  return (payload.rows || []).map(row => {
    const r = { lat: +row[0], lon: +row[1], vol: Number(row[2]) || 0 };
    const name = value('name', row[3]);
    const addr = value('addr', row[4]);
    const code = value('code', row[5]);
    const hours = value('hours', row[6]);
    if (name) r.name = name;
    if (addr) r.addr = addr;
    if (code) r.code = code;
    if (hours) r.hours = hours;
    const xs = value('x', row[7]);
    if (xs) { try { r.x = JSON.parse(xs); } catch (_) { /* повреждённое поле — пропускаем */ } }
    return r;
  });
}
const _layerChunkInFlight = new Map();
async function fetchLayerChunk(key, offset) {
  const chunkKey = cacheKey('state-chunk', _activeStateRevision + ':' + key + ':' + offset);
  const cached = await cacheGet(chunkKey);
  if (cached && cached.payload) return cached.payload;
  if (_layerChunkInFlight.has(chunkKey)) return _layerChunkInFlight.get(chunkKey);
  const pending = (async () => {
    const res = await authFetch(SERVER_URL + '/state/layer/chunk?map=' + encodeURIComponent(currentMap) + '&layer=' + encodeURIComponent(key) + '&offset=' + offset + '&limit=' + CHUNK_SIZE, {
      signal: AbortSignal.timeout(55000),
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const payload = await res.json();
    if (!payload || payload._app !== 'hm-layer-chunk' || payload.key !== key || payload._revision !== _activeStateRevision) {
      throw new Error('STALE_LAYER_CHUNK');
    }
    await cachePut(chunkKey, { revision: payload._revision, payload, cachedAt: Date.now() });
    return payload;
  })();
  _layerChunkInFlight.set(chunkKey, pending);
  try {
    return await pending;
  } finally {
    if (_layerChunkInFlight.get(chunkKey) === pending) _layerChunkInFlight.delete(chunkKey);
  }
}
async function loadChunkedLayer(key, ownPointIndex, firstResolve, firstReject) {
  const d = DS[key];
  let revisionRetried = false;
  let firstResolved = false;
  try {
    while (true) {
      const fullCacheKey = cacheKey('state-layer', _activeStateRevision + ':' + key);
      const fullCached = await cacheGet(fullCacheKey);
      if (fullCached && Array.isArray(fullCached.recs)) {
        hydrateLayerRecords(key, fullCached.recs, fullCached.stats, ownPointIndex);
        reportLoadProgress(fullCached.recs.length);
        d._recordsLoading = false; d._recordsLoaded = true;
        if (!firstResolved) { firstResolved = true; firstResolve(); }
        d._recordsReady = null;
        d._recordsLoad = null;
        return;
      }
      let offset = 0, first = true, rows = [];
      try {
        while (true) {
          const payload = await fetchLayerChunk(key, offset);
          const chunk = expandLayerChunk(payload);
          rows = rows.concat(chunk);
          reportLoadProgress(chunk.length);
          hydrateLayerRecords(key, rows, d.stats, ownPointIndex, payload.nextOffset == null);
          d._recordsLoading = payload.nextOffset != null;
          if (first) {
            first = false;
            if (!firstResolved) { firstResolved = true; firstResolve(); }
            else if (d.visible) renderHeat();
          } else if (d.visible) renderHeat();
          if (key === recBasis && !first) renderRecs();
          if (payload.nextOffset == null) break;
          offset = payload.nextOffset;
          await yieldToBrowser();
        }
        d._recordsLoaded = true;
        d._recordsLoading = false;
        d._recordsReady = null;
        d._recordsLoad = null;
        if (d.visible) renderHeat();
        if (key === recBasis) renderRecs();
        return;
      } catch (err) {
        if (isStaleLayerError(err) && !revisionRetried && await refreshStateRevision()) {
          revisionRetried = true;
          d.recs = [];
          d._recordsLoaded = false;
          d._recordsLoading = true;
          continue;
        }
        throw err;
      }
    }
  } catch (err) {
    d._recordsLoading = false;
    d._recordsReady = null;
    d._recordsLoad = null;
    if (!firstResolved) firstReject(err);
    else console.warn('Progressive layer load failed after partial data:', err.message);
  }
}
async function ensureLayerRecords(keys, allowRevisionRecovery = true) {
  const todo = [...new Set((Array.isArray(keys) ? keys : [keys]).filter(k => DS[k] && !DS[k]._recordsLoaded))];
  if (!todo.length) return;
  const ownPointIndex = buildPtIndex(ourPts());
  try {
    await Promise.all(todo.map(async key => {
    const d = DS[key];
    if (d._recordsReady) return d._recordsReady;
    if (d._recordsLoad) return d._recordsLoad;
    if ((d.stats && d.stats.n || 0) >= CHUNK_LAYER_MIN_RECORDS) {
      let resolveFirst, rejectFirst;
      d._recordsReady = new Promise((resolve, reject) => { resolveFirst = resolve; rejectFirst = reject; });
      d._recordsLoading = true;
      d._recordsLoad = loadChunkedLayer(key, ownPointIndex, resolveFirst, rejectFirst);
      await d._recordsReady;
      return;
    }
    d._recordsLoad = (async () => {
      const layerCacheKey = cacheKey('state-layer', _activeStateRevision + ':' + key);
      let payload = await cacheGet(layerCacheKey);
      if (!payload || !Array.isArray(payload.recs)) {
        const res = await authFetch(SERVER_URL + '/state/layer?map=' + encodeURIComponent(currentMap) + '&layer=' + encodeURIComponent(key), {
          signal: AbortSignal.timeout(55000),
        });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        payload = await res.json();
        if (!payload || payload._app !== 'hm-layer' || payload.key !== key || payload._revision !== _activeStateRevision) {
          throw new Error('STALE_LAYER');
        }
        await cachePut(layerCacheKey, { revision: payload._revision, recs: payload.recs, stats: payload.stats, cachedAt: Date.now() });
      }
      hydrateLayerRecords(key, payload.recs, payload.stats, ownPointIndex);
      reportLoadProgress(Array.isArray(payload.recs) ? payload.recs.length : 0);
    })();
      try { await d._recordsLoad; } finally { d._recordsLoad = null; }
    }));
  } catch (err) {
    if (allowRevisionRecovery && isStaleLayerError(err) && await refreshStateRevision()) {
      return ensureLayerRecords(todo, false);
    }
    throw err;
  }
}
function eagerStateLayers() {
  const keys = heatKeys.filter(k => DS[k] && DS[k].visible);
  if (recBasis && DS[recBasis]) keys.push(recBasis);
  return keys;
}

let stateReady = false, _saveTimer = null;
let _lastServerStateFingerprint = '';
function stateFingerprint(snapshot) {
  if (!snapshot) return '';
  const layers = Object.entries(snapshot.layers || {}).map(([key, layer]) => [
    key, layer && layer.name, layer && layer.color, layer && layer.opacity,
    layer && layer.intensity, layer && layer.visible,
    layer && layer.ramp, layer && layer.showTags,
    layer && layer.color2, layer && layer.icon, layer && layer.shape, layer && JSON.stringify(layer.fields || []),
    layer && layer._recordsOmitted,
    layer && layer.recordCount,
    layer && layer.stats,
    Array.isArray(layer && layer.recs) ? layer.recs.length : null,
  ]);
  const custom = (snapshot.customPtLayers || []).map(layer => [
    layer.id, layer.name, layer.color, layer.visible, layer.shape, layer.manual,
    layer.color2 || '', layer.icon || '', JSON.stringify(layer.fields || []),
    layer.size, layer.opacity, !!layer.labels, !!layer.density, layer.ramp || '',
    layer.radiusOn, layer.radiusM, layer.radiusColor, layer.radiusOpacity,
    Array.isArray(layer.recs) ? layer.recs.length : 0,
    // Правка карточки ручной точки не меняет их количество. Без этого отпечаток
    // совпал бы с прежним и сохранение на сервер было бы пропущено.
    layer.manual && Array.isArray(layer.recs)
      ? layer.recs.map(r => [r.id, r.name, r.dms, r.equip, r.sales, r.comment, r.color,
          r.lat, r.lon, (r.photos || []).map(ph => ph.id).join(',')].join('~')).join('|')
      : '',
  ]);
  return JSON.stringify({
    heatKeys: snapshot.heatKeys || [], layers, custom,
    selectedCities: snapshot.selectedCities || [], city: snapshot.city || '',
    incCol: snapshot.incCol, covR: snapshot.covR, topN: snapshot.topN,
    recBasis: snapshot.recBasis, recShow: snapshot.recShow,
    heatBoost: snapshot.heatBoost, heatBlend: snapshot.heatBlend,
    showHeatAll: snapshot.showHeatAll !== false, showPointsAll: !!snapshot.showPointsAll,
    heatStyle: snapshot.heatStyle || 'spots',
    heatRadius: snapshot.heatRadius, districtsOn: snapshot.districtsOn,
    distOpacity: snapshot.distOpacity, boundSel: snapshot.boundSel || [], boundFilter: snapshot.boundFilter || null,
    // Геометрию зон целиком не сравниваем: зоны не правятся по вершинам, их
    // только добавляют и удаляют — хватает идентификатора, имени и числа вершин.
    boundLayers: (snapshot.boundLayers || []).map(l => [l.id, l.name, l.color, l.visible,
      (l.zones || []).map(z => [z.id, z.name, JSON.stringify(z.mp || []).length].join('~')).join('|')]),
    cityScope: snapshot.cityScope || snapshot.tashkentScope,
    incomeHeatOn: snapshot.incomeHeatOn, coresOn: snapshot.coresOn,
    addrSrcKeys: snapshot.addrSrcKeys, addrRefKeys: snapshot.addrRefKeys,
    rtRadius: snapshot.rtRadius, rtRadiusOp: snapshot.rtRadiusOp,
    rtExclRadius: snapshot.rtExclRadius,
    rtExclOp: snapshot.rtExclOp, rtExclKeys: snapshot.rtExclKeys || [],
  });
}

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
    // own — легаси-поле: наши точки давно живут в слоях состояния, а не в базе.
    // Пустой массив оставлен, чтобы старые вкладки (с закэшированным
    // index.html и проверкой `!d.own`) продолжали грузиться.
    own: [], cities: DATA.cities,
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
  const headers = authHeaders({ 'Content-Type': 'application/json', 'X-API-Key': SERVER_KEY });
  let body = json;
  if (_gzipOk) {
    try {
      body = await new Response(new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'))).blob();
      headers['Content-Encoding'] = 'gzip';
    } catch (e) { _gzipOk = false; body = json; }
  }
  try {
    return await fetch(url, {
      method: 'POST', headers, body, credentials: 'include',
      signal: AbortSignal.timeout(timeoutMs),
    });
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
  if (!isAdmin()) return;
  if (!SERVER_KEY) {
    // Молчаливый выход прятал главное: правки владельца никуда не уходят.
    setSyncBadge('err', 'Нет ключа записи — правки только локально');
    return;
  }
  if (_pushing) { _pushPending = true; return; }   // coalesce concurrent saves
  _pushing = true;
  setSyncBadge('syncing', isRetry ? 'Повтор…' : 'Сохранение…');
  try {
    const res = await postJson(SERVER_URL + '/state?map=' + encodeURIComponent(currentMap), snapshot, 120000);
    if (res.status === 415) { _gzipOk = false; throw new Error('gzip не поддержан сервером'); }
    if (!res.ok) {
      _lastPushFailed = true;
      setSyncBadge('err', res.status === 413 ? 'Данные слишком большие' : 'Ошибка сохранения');
      console.warn('Server sync error:', res.status);
      if (res.status === 413) toast('Данные слишком большие для сервера', 'err');
    } else {
      const saved = await res.json().catch(() => null);
      if (saved && saved.savedAt) {
        snapshot._savedAt = saved.savedAt;
        _activeStateRevision = saved.savedAt;
        const manifest = snapshotManifest(snapshot);
        try { localStorage.setItem(storeKey(), JSON.stringify(manifest)); } catch (_) {}
        cacheStateSnapshot(snapshot);
        _lastServerStateFingerprint = stateFingerprint(snapshot);
      }
      _lastPushFailed = false;
      const now = new Date().toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' });
      setSyncBadge('ok', 'Сохранено ' + now);
    }
  } catch (e) {
    _lastPushFailed = true;
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
  setSyncBadge('syncing', 'Загрузка…');
  const wakeHint = setTimeout(() => setSyncBadge('syncing', 'Сервер пробуждается…'), 5000);
  try {
    const data = await fetchStateManifest();
    clearTimeout(wakeHint);
    if (!data) {
      setSyncBadge('ok', 'Нет данных на сервере');
      return null;
    }
    await cacheStateMeta(data);
    pruneOldLayerRevisions(stateRevision(data));
    return data;
  } catch (e) {
    clearTimeout(wakeHint);
    const msg = e.name === 'TimeoutError' ? 'Сервер не отвечает (перезагрузите)' : 'Сервер недоступен';
    setSyncBadge('err', msg);
    console.warn('Could not load state manifest, using local cache:', e.message);
    return null;
  }
}

function doSave() {
  const snapshot = buildStateSnapshot();
  snapshot._clientTs = Date.now(); // local edit timestamp (used to resolve vs server)
  const manifest = snapshotManifest(snapshot);
  // Keep only compact settings in localStorage as a compatibility/offline
  // fallback. Full layer records are versioned in IndexedDB instead.
  try { localStorage.setItem(storeKey(), JSON.stringify(manifest)); } catch (e) {}
  cacheStateSnapshot(snapshot);
  // Local cache writes are still allowed, but identical admin state is not
  // posted again. This removes duplicate autosave transactions after startup,
  // repeated clicks and delegated sidebar events.
  if (isAdmin() && SERVER_KEY && stateFingerprint(snapshot) === _lastServerStateFingerprint) return;
  pushToServer(snapshot);
}

function saveState() {
  if (!stateReady) return;
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(doSave, 1500);   // batch rapid edits — state can be several MB
}

function syncControls() {
  const $ = id => document.getElementById(id);
  $('s-cov').value         = covR;  $('v-cov').textContent  = fmtD(covR);
  $('s-top').value         = topN;  $('v-top').textContent  = topN;
  $('s-heat-radius').value = heatRadius; $('v-heat-radius').textContent = heatRadius + ' px';
  $('heat-blend').value    = heatBlend;
  syncHeatStyleBtns();
  $('rec-show').classList.toggle('on', recShow);
  buildRecBasisSel();
  syncBoundsBadge();
  $('s-rt-radius').value  = rtRadius;     $('v-rt-radius').textContent = fmtD(rtRadius);
  $('op-rt-radius').value = rtRadiusOp;
  $('s-rt-excl').value    = rtExclRadius; $('v-rt-excl').textContent   = fmtD(rtExclRadius);
  $('op-rt-excl').value   = rtExclOp;
  syncExclHint();
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
  $('rec-basis-sel').addEventListener('change', async e => {
    recBasis = e.target.value;
    try { await ensureLayerRecords(recBasis); } catch (_) { toast('Не удалось загрузить данные слоя', 'err'); return; }
    renderRecs();
  });

  $('rec-show').addEventListener('click', e => { recShow = !recShow; e.target.classList.toggle('on', recShow); renderRecs(); });
  $('s-cov').addEventListener('input', e => { covR = +e.target.value; $('v-cov').textContent = fmtD(covR); fillSlider(e.target); renderRecs(); });
  $('s-top').addEventListener('input', e => { topN = +e.target.value; $('v-top').textContent = topN; fillSlider(e.target); renderRecs(); });

  // Что показывать: точки и/или тепло
  [['vt-points', () => setShowPoints(!showPointsAll)], ['vt-heat', () => setShowHeat(!showHeatAll)]].forEach(([id, fn]) => {
    const el = $(id); if (!el) return;
    el.addEventListener('click', fn);
    el.addEventListener('keydown', e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); fn(); } });
  });
  syncViewToggles();

  // Heat spot radius
  $('s-heat-radius').addEventListener('input', e => {
    heatRadius = +e.target.value;
    $('v-heat-radius').textContent = heatRadius + ' px';
    fillSlider(e.target); renderHeat();
  });

  // Вид тепловой карты: пятна или зоны плотности
  document.querySelectorAll('[data-hstyle]').forEach(b => b.addEventListener('click', () => {
    if (heatStyle === b.dataset.hstyle) return;
    heatStyle = b.dataset.hstyle;
    syncHeatStyleBtns(); renderHeat(); saveState();
  }));

  // Blend mode (fast path)
  $('heat-blend').addEventListener('change', e => {
    heatBlend = e.target.value;
    restyleHeatCanvases(); scheduleZones();
  });

  // Создать слой: название и поля → шаблон → загрузка
  wireCreateLayer();
  $('add-layer-btn').addEventListener('click', () => openCreateLayer('heat'));
  // Re-upload data into an existing layer (per-layer "Обновить данные")
  const heatUpdInp = $('heat-update-file');
  heatUpdInp.addEventListener('change', () => {
    const f = heatUpdInp.files[0]; const k = _heatUpdateTarget;
    heatUpdInp.value = ''; _heatUpdateTarget = null;
    if (!f || !k || !DS[k]) return;
    parseSheet(f, rows => {
      const parsed = toRecs(rows);
      const recs = enrich(parsed);
      if (!recs.length) { toast('Не найдено строк с lat/lon', 'err'); return; }
      DS[k].recs = recs; DS[k].stats = statsOf(recs); DS[k].visible = true; DS[k]._userData = true; DS[k]._recordsLoaded = true;
      DS[k].volUnit = parsed._percent ? '%' : '';
      DS[k].fields = mergeFields(DS[k].fields, parsed._fields);
      focusNewLayer(k);
      toast(`Слой «${DS[k].name}» обновлён: ${recs.length.toLocaleString('ru-RU')} ${plural(recs.length, 'точка', 'точки', 'точек')}`, 'ok');
    });
  });
  $('layer-modal-cancel').addEventListener('click', () => { pendingHeatRows = null; closeLayerModal(); });
  $('layer-modal-confirm').addEventListener('click', confirmLayerModal);
  $('layer-modal-input').addEventListener('keydown', e => { if (e.key === 'Enter') confirmLayerModal(); if (e.key === 'Escape') closeLayerModal(); });
  // Клик мимо закрывает окно, только если название ещё не введено.
  $('layer-modal-overlay').addEventListener('click', e => {
    if (e.target !== $('layer-modal-overlay')) return;
    if ($('layer-modal-input').value.trim()) { toast('Чтобы закрыть — «Отмена» или Esc', 'info'); return; }
    pendingHeatRows = null; closeLayerModal();
  });

  // Template downloads — one generator for both upload flows, so the sample
  // files always match what the corresponding parser expects.
  const TEMPLATES = {
    heat: {
      // Третья строка показывает, что value можно писать процентом.
      // code / addr необязательны — попадают в карточку точки и в выгрузки.
      rows: [['name', 'lat', 'lon', 'value', 'code', 'addr'],
             ['Пример ТТ', 41.311100, 69.279700, 12.5, 'TT-0001', 'г.Ташкент, ул. Пример 1'],
             ['Пример ТТ 2', 41.299000, 69.240000, 8, 'TT-0002', ''],
             ['Пример в процентах', 41.290000, 69.230000, '0,356%', '', '']],
      cols: [22, 12, 12, 14, 12, 30], file: 'shablon_sloy_heatmap.xlsx',
    },
    cpt: {
      rows: [['name', 'lat', 'lon', 'addr', 'hours', 'code'],
             ['Пример точки', 41.311100, 69.279700, 'г.Ташкент, ул. Пример 1', '10:00-22:00', 'A-01'],
             ['Пример точки 2', 41.299000, 69.240000, 'г.Ташкент, ул. Пример 2', '', '']],
      cols: [22, 12, 12, 30, 14, 8], file: 'shablon_nashi_tochki.xlsx',
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
  $('dl-tpl').addEventListener('click', () => downloadTemplate('heat'));
  const cptTpl = $('cpt-tpl'); if (cptTpl) cptTpl.addEventListener('click', () => downloadTemplate('cpt'));

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
      // target heat layer is known.
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

    const d = DS[tk]; if (!d) { toast('Выберите слой для загрузки', 'err'); return; }
    const parsedUpload = toRecs(pendingUpload);
    d.recs = enrich(parsedUpload); d.stats = statsOf(d.recs); d.visible = true; d._userData = true;
    d.volUnit = parsedUpload._percent ? '%' : '';
    d.fields = mergeFields(d.fields, parsedUpload._fields);
    reset();
    // The selected-city filter would otherwise silently hide points that fall
    // in other cities — reset to "Все" so the freshly uploaded layer is visible.
    if (hasCityFilter() && !d.recs.some(recInCities)) { selectedCities = []; buildCityUI(); }
    buildHeatUI(); renderHeat(); renderRecs(); buildRtExclUI();
    // Frame the map on the new data so it's obvious it loaded.
    const bpts = d.recs.filter(recInSelection).map(r => [r.lat, r.lon]);
    if (bpts.length) map.flyToBounds(L.latLngBounds(bpts).pad(.15), { duration: .6, maxZoom: 16 });
    saveState();
    toast(`Слой «${d.name}» обновлён (${d.stats.n} точек)`, 'ok');
  });

  // Admin write key — memory-only and never in the bundle or browser storage.
  const keyInp = $('admin-key-input');
  if (keyInp) {
    keyInp.value = SERVER_KEY;
    $('admin-key-save').addEventListener('click', () => {
      SERVER_KEY = keyInp.value.trim();
      toast(SERVER_KEY
        ? 'Ключ принят — запись включена до обновления страницы'
        : 'Ключ удалён — запись отключена', SERVER_KEY ? 'ok' : 'info');
    });
  }

  // Save current layers back to the server as the new base dataset (admin)
  const saveDsBtn = $('btn-save-dataset');
  if (saveDsBtn) saveDsBtn.addEventListener('click', () => {
    if (!isAdmin()) { toast('Только администратор может менять базу', 'err'); return; }
    pushDataset(saveDsBtn);
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


  $('s-rt-radius').addEventListener('input', e => {
    rtRadius = +e.target.value; $('v-rt-radius').textContent = fmtD(rtRadius); fillSlider(e.target); saveState();
  });
  $('op-rt-radius').addEventListener('change', e => { rtRadiusOp = e.target.value; saveState(); });
  $('s-rt-excl').addEventListener('input', e => {
    rtExclRadius = +e.target.value; $('v-rt-excl').textContent = fmtD(rtExclRadius); fillSlider(e.target); syncExclHint(); saveState();
  });
  $('op-rt-excl').addEventListener('change', e => { rtExclOp = e.target.value; syncExclHint(); saveState(); });

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
  const setSide = setSideDrawer;   // body.side-open — не прокручивать страницу под панелью
  $('burger').addEventListener('click', () => setSide(!sideEl.classList.contains('open')));
  backdrop.addEventListener('click', () => setSide(false));
  // Keyboard shortcuts: Esc closes drawer; 1-6 switch tabs (when not typing)
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && isMobile()) { setSide(false); return; }
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'select' || tag === 'textarea' || e.metaKey || e.ctrlKey || e.altKey) return;
    // Порядок как в нижней навигации — иначе «Город» недостижим с клавиатуры,
    // а «4» открывает не то, что подписано.
    const tabs = ['tab-map', 'tab-points', 'tab-bounds', 'tab-recs', 'tab-analysis', 'tab-data'];
    if (e.key >= '1' && e.key <= '6') {
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
      // Районы города приезжают с `/data` позже первой отрисовки — собираем при открытии.
      if (tab.dataset.tab === 'tab-bounds') buildBoundsUI();
      // On mobile: don't auto-close — let user see the panel they just opened
    });
  });

  wireRetailUI();

  // Custom point layers — modal
  // Одна кнопка на все слои: включает подписи всем видимым слоям, если хоть
  // у одного они выключены, иначе выключает всем.
  // Вся строка «Названия точек» работает как переключатель.
  $('pt-labels-vt').addEventListener('click', e => { if (!e.target.closest('#pt-labels-all')) $('pt-labels-all').click(); });
  $('pt-labels-all').addEventListener('keydown', e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); $('pt-labels-all').click(); } });
  $('pt-labels-all').addEventListener('click', () => {
    const vis = customPtLayers.filter(l => l.visible);
    if (!vis.length) { toast('Включите хотя бы один слой точек', 'warn'); return; }
    const on = !vis.every(l => l.labels);
    vis.forEach(l => { l.labels = on; });
    buildCustomPtUI(); scheduleLabels(); saveState();
  });

  $('add-custom-pt-btn').addEventListener('click', () => openCreateLayer('pt'));
  $('cpt-modal-cancel').addEventListener('click', () => {
    $('cpt-modal-overlay').classList.remove('open');
  });
  $('cpt-modal-confirm').addEventListener('click', () => {
    const name = capFirst($('cpt-modal-name').value);
    if (!name) { $('cpt-modal-name').focus(); return; }
    const color = $('cpt-modal-color').value;
    $('cpt-modal-overlay').classList.remove('open');
    const id = 'cpt_' + Date.now();
    customPtLayers.push({ id, name, color, visible: true, shape: 'teardrop', size: 30, opacity: 1, radiusOn: false, radiusM: 1500, radiusColor: color, radiusOpacity: 0.15, recs: [], _group: null });
    buildCustomPtUI(); buildAddrSrcSel(); buildRtExclUI(); saveState();
    toast(`Слой «${name}» создан — загрузите данные`, 'ok');
  });
  $('cpt-modal-overlay').addEventListener('click', e => {
    if (e.target !== $('cpt-modal-overlay')) return;
    const inp = $('cpt-modal-overlay').querySelector('input[type="text"]');
    if (inp && inp.value.trim()) { toast('Чтобы закрыть — «Отмена» или Esc', 'info'); return; }
    $('cpt-modal-overlay').classList.remove('open');
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
      l.fields = mergeFields(l.fields, recs._fields);
      buildCustomPtUI(); buildAddrSrcSel(); buildRtExclUI(); renderCustomPoints();
      reenrichAll();   // добавились наши точки — пересчитать покрытие и рекомендации
      renderCityInfo(); saveState();
      toast(`Слой «${l.name}»: загружено ${recs.length.toLocaleString('ru-RU')} ${plural(recs.length, 'точка', 'точки', 'точек')}`, 'ok');
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
/* ── КАРТЫ: реестр, переключение, управление ─────────────────────────────
   Список карт отдаёт сервер (`GET /maps`) — уже отфильтрованный по правам.
   Если сервер старый и маршрута нет, работаем с тремя исходными картами,
   как раньше. */
const BUILTIN_MAPS = [
  { id: 'comdep', name: 'Com Dep', desc: 'Карта коммерческого отдела', icon: '🗂', country: 'uz', viewers: ['comdep'], base: true },
  { id: 'other', name: 'Другая', desc: 'Карта второго отдела', icon: '🗺', country: 'uz', viewers: ['other'], base: true },
  { id: 'kg', name: 'Кыргызстан', desc: 'Карта по городам Кыргызстана', icon: '🇰🇬', country: 'kg', viewers: ['kg'], base: true },
];
const MAP_ROLES = ['comdep', 'other', 'kg'];
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
let MAP_LIST = BUILTIN_MAPS.slice();
let _mapsFromServer = false;

function mapInfo(id) {
  return MAP_LIST.find(m => m.id === id) || BUILTIN_MAPS.find(m => m.id === id)
    || { id, name: id || '—', desc: '', icon: '🗺', country: 'uz', viewers: [], base: false };
}
// Чьи пользователи: роль называется по своей исходной карте.
function roleLabel(role) { return (BUILTIN_MAPS.find(m => m.id === role) || { name: role }).name; }

async function fetchMaps() {
  try {
    const res = await authFetch(SERVER_URL + '/maps', { signal: AbortSignal.timeout(20000) });
    if (res.ok) {
      const j = await res.json();
      if (j && Array.isArray(j.maps)) { MAP_LIST = j.maps; _mapsFromServer = true; return MAP_LIST; }
    }
  } catch (e) { console.warn('Maps list unavailable:', e.message); }
  _mapsFromServer = false;
  MAP_LIST = BUILTIN_MAPS.filter(m => isAdmin() || m.id === currentRole);
  return MAP_LIST;
}

function showRoleBadge() {
  const badge = document.getElementById('mode-badge');
  if (!badge) return;
  // Подпись учётки на самой карте убрана по просьбе владельца: карта и роль
  // видны в шапке боковой панели, переключатель карт — там же.
  badge.style.display = 'none';
  const m = mapInfo(currentMap);
  const many = MAP_LIST.length > 1;
  badge.textContent = (isAdmin() ? 'Админ · ' : '') + m.name + (many ? ' ▾' : '');
  badge.className = 'mode-badge ' + (isAdmin() ? 'mode-edit' : 'mode-view') + (many ? ' clickable' : '');
  badge.title = many ? 'Переключить карту' : '';
  badge.setAttribute('role', many ? 'button' : 'status');
  badge.tabIndex = many ? 0 : -1;
  const sw = document.getElementById('map-switch');
  if (sw) {
    document.getElementById('map-switch-icon').innerHTML = mapIconHtml(m.icon, 14);
    document.getElementById('map-switch-name').textContent = m.name;
    sw.classList.toggle('single', !many);
    sw.disabled = !many;
    sw.title = many ? 'Переключить карту' : m.name;
  }
}

// Дождаться, пока последние правки уйдут на сервер, — иначе перезагрузка при
// переключении карты оборвала бы сохранение.
let _lastPushFailed = false;
async function flushSaves() {
  if (!stateReady) return true;
  if (_saveTimer) { clearTimeout(_saveTimer); _saveTimer = null; doSave(); }
  const until = Date.now() + 30000;
  while ((_pushing || _pushPending) && Date.now() < until) await new Promise(r => setTimeout(r, 200));
  return !(_pushing || _pushPending) && !(isAdmin() && _lastPushFailed);
}

async function switchMap(id) {
  closeMapMenu();
  if (!id || id === currentMap) return;
  const target = mapInfo(id);
  toast(`Открываем «${target.name}»…`, 'info', 4000);
  const saved = await flushSaves();
  if (!saved && !confirm('Последние правки этой карты не дошли до сервера. Всё равно переключиться?')) return;
  sessionStorage.setItem('hm_map', id);
  location.reload();   // чистый старт: у каждой карты свои слои, города и кэш
}

function closeMapMenu() {
  const menu = document.getElementById('map-menu');
  if (menu) menu.hidden = true;
  document.querySelectorAll('[aria-controls="map-menu"]').forEach(el => el.setAttribute('aria-expanded', 'false'));
}
function openMapMenu(anchor, focusItem = true) {
  let menu = document.getElementById('map-menu');
  if (!menu) {
    menu = document.createElement('div');
    menu.id = 'map-menu';
    menu.setAttribute('role', 'menu');
    document.body.appendChild(menu);
    document.addEventListener('pointerdown', e => {
      if (!menu.hidden && !menu.contains(e.target) && !e.target.closest('[aria-controls="map-menu"]')) closeMapMenu();
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !menu.hidden) closeMapMenu(); });
  }
  menu.innerHTML = `<div class="map-menu-head">Карты</div>` + MAP_LIST.map(m => `
    <button type="button" class="map-menu-item${m.id === currentMap ? ' on' : ''}" role="menuitem" data-mapgo="${esc(m.id)}">
      <span class="mm-ic">${mapIconHtml(m.icon)}</span>
      <span class="mm-body"><b>${esc(m.name)}</b>${m.desc ? `<small>${esc(m.desc)}</small>` : ''}</span>
      ${m.id === currentMap ? '<span class="mm-cur">открыта</span>' : ''}
    </button>`).join('') +
    (isAdmin() ? `<button type="button" class="map-menu-new" data-mapnew="1">＋ Новая карта · управление</button>` : '');
  menu.querySelectorAll('[data-mapgo]').forEach(b => b.addEventListener('click', () => switchMap(b.dataset.mapgo)));
  const nb = menu.querySelector('[data-mapnew]');
  if (nb) nb.addEventListener('click', () => { closeMapMenu(); openMapsAdmin(true); });
  menu.hidden = false;
  const r = anchor.getBoundingClientRect();
  const w = Math.min(300, window.innerWidth - 24);
  menu.style.width = w + 'px';
  const left = Math.max(12, Math.min(r.left, window.innerWidth - w - 12));
  menu.style.left = left + 'px';
  const h = menu.offsetHeight;
  const below = r.bottom + 8;
  menu.style.top = (below + h < window.innerHeight - 8 ? below : Math.max(8, r.top - h - 8)) + 'px';
  anchor.setAttribute('aria-expanded', 'true');
  const cur = menu.querySelector('.map-menu-item.on') || menu.querySelector('.map-menu-item');
  if (cur && focusItem) cur.focus();
}
async function toggleMapMenu(anchor, focusItem = true) {
  const menu = document.getElementById('map-menu');
  if (menu && !menu.hidden) { closeMapMenu(); return; }
  await fetchMaps();          // свежий список: карту могли только что создать
  showRoleBadge();
  if (MAP_LIST.length > 1 || isAdmin()) openMapMenu(anchor, focusItem);
}
function wireMapSwitch() {
  const sw = document.getElementById('map-switch');
  if (sw) sw.addEventListener('click', () => toggleMapMenu(sw));
  const badge = document.getElementById('mode-badge');
  // Наведение на название карты или на значок в углу открывает тот же список.
  [sw, badge].forEach(trigger => {
    if (!trigger) return;
    const hm = hoverMenu({
      trigger,
      canOpen: () => !trigger.disabled && (trigger !== badge || badge.classList.contains('clickable')),
      panel: () => document.getElementById('map-menu'),
      isOpen: () => { const m = document.getElementById('map-menu'); return !!m && !m.hidden; },
      open: async () => { await toggleMapMenu(trigger, false); if (hm) hm.bindPanel(); },
      close: closeMapMenu,
    });
  });
  if (badge) {
    badge.setAttribute('aria-controls', 'map-menu');
    badge.addEventListener('click', () => { if (badge.classList.contains('clickable')) toggleMapMenu(badge); });
    badge.addEventListener('keydown', e => {
      if ((e.key === 'Enter' || e.key === ' ') && badge.classList.contains('clickable')) { e.preventDefault(); toggleMapMenu(badge); }
    });
  }
}

/* Управление картами — вкладка «Данные» (только владелец). */
let _mapEditId = null;
function openMapsAdmin(focusForm) {
  const tab = document.querySelector('.side-tab[data-tab="tab-data"]');
  if (tab) tab.click();
  const reopen = document.getElementById('side-reopen');
  if (reopen && document.getElementById('app').classList.contains('side-hidden')) reopen.click();
  renderMapsAdmin();
  if (focusForm) {
    resetMapForm();
    const g = document.getElementById('map-form-group');
    if (g) { g.open = true; g.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
    setTimeout(() => { const n = document.getElementById('mf-name'); if (n) n.focus(); }, 250);
  }
}

function fmtBytes(b) {
  if (!b) return '0 КБ';
  return b >= 1048576 ? (b / 1048576).toLocaleString('ru-RU', { maximumFractionDigits: 1 }) + ' МБ'
    : Math.max(1, Math.round(b / 1024)) + ' КБ';
}

async function renderMapsAdmin() {
  const box = document.getElementById('maps-admin-list');
  if (!box || !isAdmin()) return;
  box.innerHTML = '<div class="maps-empty">Загружаем список карт…</div>';
  await fetchMaps();
  showRoleBadge();
  if (!_mapsFromServer) {
    box.innerHTML = '<div class="maps-empty">Сервер ещё старой версии — создание карт заработает после передеплоя на Render.</div>';
    syncMapForm();
    return;
  }
  box.innerHTML = MAP_LIST.map(m => {
    const st = m.stats || {};
    const viewers = (m.viewers || []).filter(r => MAP_ROLES.includes(r)).map(roleLabel);
    const upd = st.updatedAt ? new Date(st.updatedAt).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
    const meta = [
      m.country === 'kg' ? 'Кыргызстан' : 'Узбекистан',
      'видят: ' + (viewers.length ? viewers.join(', ') : 'только владелец'),
      st.bytes ? fmtBytes(st.bytes) + (upd ? ' · ' + upd : '') : 'пустая',
      st.photos ? `фото: ${st.photos} (${fmtBytes(st.photoBytes)})` : '',
    ].filter(Boolean).join(' · ');
    const cur = m.id === currentMap;
    return `<div class="map-row${cur ? ' cur' : ''}">
      <span class="map-row-ic">${mapIconHtml(m.icon, 20)}</span>
      <div class="map-row-main">
        <b>${esc(m.name)}${cur ? '<span class="map-row-tag">открыта</span>' : ''}${m.base ? '<span class="map-row-tag base">исходная</span>' : ''}</b>
        <small>${esc(meta)}</small>
      </div>
      <div class="map-row-acts">
        ${cur ? '' : `<button type="button" class="lyr-act" data-mapopen="${esc(m.id)}" title="Открыть карту">Открыть</button>`}
        <button type="button" class="lyr-act" data-mapedit="${esc(m.id)}" title="Название, значок, доступ" aria-label="Изменить карту">${uiIcon('pencil', 14)}</button>
        ${m.base ? '' : `<button type="button" class="lyr-act lyr-del" data-mapdel="${esc(m.id)}" title="Удалить карту">&times;</button>`}
      </div>
    </div>`;
  }).join('');
  box.querySelectorAll('[data-mapopen]').forEach(b => b.addEventListener('click', () => switchMap(b.dataset.mapopen)));
  box.querySelectorAll('[data-mapedit]').forEach(b => b.addEventListener('click', () => editMap(b.dataset.mapedit)));
  box.querySelectorAll('[data-mapdel]').forEach(b => b.addEventListener('click', () => deleteMap(b.dataset.mapdel)));
  syncMapForm();
}

// Форма одна на создание и правку: при правке поле «Начать с» скрыто, а у
// исходных карт нельзя менять страну.
function syncMapForm() {
  const copy = document.getElementById('mf-copy');
  if (copy) {
    const keep = copy.value;
    copy.innerHTML = '<option value="">Пустая карта</option>' + MAP_LIST.map(m =>
      `<option value="${esc(m.id)}">Копия «${esc(m.name)}» — все слои и точки</option>`).join('');
    copy.value = MAP_LIST.some(m => m.id === keep) ? keep : '';
  }
  const roles = document.getElementById('mf-roles');
  if (roles && !roles.dataset.built) {
    roles.dataset.built = '1';
    roles.innerHTML = MAP_ROLES.map(r => `
      <label class="mf-role"><input type="checkbox" value="${r}"/> <span>Пользователи ${esc(roleLabel(r))}</span></label>`).join('');
  }
  const icons = document.getElementById('mf-icons');
  if (icons && !icons.dataset.built) {
    icons.dataset.built = '1';
    icons.innerHTML = MAP_ICONS.map(ic => `<button type="button" class="mf-icon" data-ic="${ic}" aria-label="Значок карты">${mapIconHtml(ic)}</button>`).join('');
    icons.querySelectorAll('[data-ic]').forEach(b => b.addEventListener('click', () => setMapFormIcon(b.dataset.ic)));
  }
}
function setMapFormIcon(ic) {
  const box = document.getElementById('mf-icons');
  if (!box) return;
  box.dataset.value = ic;
  box.querySelectorAll('[data-ic]').forEach(b => b.classList.toggle('on', b.dataset.ic === ic));
}
function resetMapForm() {
  _mapEditId = null;
  syncMapForm();
  const $ = id => document.getElementById(id);
  $('mf-name').value = ''; $('mf-desc').value = '';
  $('mf-country').value = 'uz'; $('mf-country').disabled = false;
  $('mf-copy').value = ''; $('mf-copy-row').style.display = '';
  document.querySelectorAll('#mf-roles input').forEach(i => { i.checked = false; });
  setMapFormIcon('🗺');
  $('mf-title').textContent = '＋ Новая карта';
  $('mf-submit').textContent = 'Создать карту';
  $('mf-cancel').style.display = 'none';
}
function editMap(id) {
  const m = mapInfo(id);
  syncMapForm();
  _mapEditId = id;
  const $ = id2 => document.getElementById(id2);
  $('mf-name').value = m.name; $('mf-desc').value = m.desc || '';
  $('mf-country').value = m.country === 'kg' ? 'kg' : 'uz';
  $('mf-country').disabled = !!m.base;
  $('mf-copy-row').style.display = 'none';
  document.querySelectorAll('#mf-roles input').forEach(i => {
    i.checked = (m.viewers || []).includes(i.value);
    // Роль исходной карты всегда видит свою карту.
    i.disabled = m.base && i.value === m.id;
  });
  setMapFormIcon(m.icon || '🗺');
  $('mf-title').textContent = 'Изменить: ' + m.name;
  $('mf-submit').textContent = 'Сохранить изменения';
  $('mf-cancel').style.display = '';
  const g = $('map-form-group');
  if (g) { g.open = true; g.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
}

async function mapsPost(path, body, timeoutMs = 60000) {
  if (!SERVER_KEY) throw new Error('Нет ключа записи — войдите заново под владельцем');
  const res = await postJson(SERVER_URL + path, body, timeoutMs);
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || ('Ошибка сервера: HTTP ' + res.status));
  return j;
}

async function submitMapForm() {
  const $ = id => document.getElementById(id);
  const name = $('mf-name').value.trim();
  if (!name) { toast('Укажите название карты', 'warn'); $('mf-name').focus(); return; }
  const body = {
    name, desc: $('mf-desc').value.trim(),
    icon: $('mf-icons').dataset.value || '🗺',
    country: $('mf-country').value,
    viewers: Array.from(document.querySelectorAll('#mf-roles input:checked')).map(i => i.value),
  };
  const btn = $('mf-submit'), old = btn.textContent;
  btn.disabled = true;
  try {
    if (_mapEditId) {
      btn.textContent = 'Сохраняем…';
      await mapsPost('/maps/update', { id: _mapEditId, ...body });
      toast(`Карта «${name}» обновлена`, 'ok');
      resetMapForm();
      await renderMapsAdmin();
    } else {
      body.copyFrom = $('mf-copy').value || '';
      btn.textContent = body.copyFrom ? 'Копируем слои…' : 'Создаём…';
      const j = await mapsPost('/maps', body, 120000);
      resetMapForm();
      $('map-form-group').open = false;
      await renderMapsAdmin();
      toast(`Карта «${j.map.name}» создана`, 'ok', 4000);
      if (confirm(`Карта «${j.map.name}» создана. Открыть её сейчас?`)) switchMap(j.map.id);
    }
  } catch (e) {
    toast(e.message, 'err', 5000);
  } finally {
    btn.disabled = false;
    if (btn.textContent.endsWith('…')) btn.textContent = old;
  }
}

async function deleteMap(id) {
  const m = mapInfo(id);
  if (id === currentMap) { toast('Эта карта сейчас открыта — сначала переключитесь на другую', 'warn', 4000); return; }
  const typed = prompt(`Удалить карту «${m.name}» вместе со всеми слоями, точками и фото? Это необратимо.\n\nДля подтверждения введите название карты:`);
  if (typed == null) return;
  try {
    await mapsPost('/maps/delete', { id, confirm: typed.trim() });
    toast(`Карта «${m.name}» удалена`, 'ok');
    if (_mapEditId === id) resetMapForm();
    await renderMapsAdmin();
  } catch (e) {
    toast(e.message, 'err', 5000);
  }
}

/* Учётные записи (админ-панель): список логинов и смена пароля любого из
   них, включая свой. Хэши остаются на сервере. */
const ROLE_NAMES = { admin: 'Владелец (админ)', comdep: 'Com Dep', other: 'Другая', kg: 'Кыргызстан' };
let _pwOpen = null;
function genPassword() {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const buf = new Uint32Array(12); crypto.getRandomValues(buf);
  return Array.from(buf, n => abc[n % abc.length]).join('');
}
async function renderUsersAdmin() {
  const box = document.getElementById('users-admin-list');
  if (!box || !isAdmin()) return;
  box.innerHTML = '<div class="maps-empty">Загружаем учётные записи…</div>';
  let users = [], min = 8;
  try {
    const res = await authFetch(SERVER_URL + '/auth/users', { signal: AbortSignal.timeout(20000) });
    if (res.status === 404) { box.innerHTML = '<div class="maps-empty">Сервер ещё старой версии — смена паролей заработает после передеплоя на Render.</div>'; return; }
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const j = await res.json(); users = j.users || []; min = j.min || 8;
  } catch (e) {
    box.innerHTML = `<div class="maps-empty">Не удалось загрузить учётные записи: ${esc(e.message)}</div>`;
    return;
  }
  box.innerHTML = users.map(u => {
    const when = u.changedAt ? 'пароль изменён ' + new Date(u.changedAt).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'пароль из настроек сервера';
    const me = u.username === currentUser;
    const open = _pwOpen === u.username;
    return `<div class="user-row${open ? ' open' : ''}" data-user="${esc(u.username)}">
      <div class="user-top">
        <span class="user-av">${esc(u.username.slice(0, 1).toUpperCase())}</span>
        <div class="user-main"><b>${esc(u.username)}${me ? '<span class="map-row-tag">вы</span>' : ''}</b><small>${esc(ROLE_NAMES[u.role] || u.role)} · ${esc(when)}</small></div>
        <button type="button" class="lyr-act user-pw-btn" data-pwtoggle="${esc(u.username)}">${open ? 'Отмена' : 'Сменить пароль'}</button>
      </div>
      ${open ? `<div class="user-pw-form">
        <div class="user-pw-row">
          <input type="password" class="mf-input" data-pw1 autocomplete="new-password" placeholder="Новый пароль, от ${min} символов" minlength="${min}" maxlength="128"/>
          <button type="button" class="lyr-act" data-pwshow title="Показать пароль" aria-label="Показать пароль">${uiIcon('eye', 14)}</button>
        </div>
        <input type="password" class="mf-input" data-pw2 autocomplete="new-password" placeholder="Повторите пароль" maxlength="128"/>
        <div class="user-pw-acts">
          <button type="button" class="lyr-act" data-pwgen>Сгенерировать</button>
          <button type="button" class="btn user-pw-save" data-pwsave="${esc(u.username)}">Сохранить пароль</button>
        </div>
      </div>` : ''}
    </div>`;
  }).join('') || '<div class="maps-empty">Учётных записей нет</div>';
  box.querySelectorAll('[data-pwtoggle]').forEach(b => b.addEventListener('click', () => {
    _pwOpen = _pwOpen === b.dataset.pwtoggle ? null : b.dataset.pwtoggle;
    renderUsersAdmin().then(() => { const i = box.querySelector('[data-pw1]'); if (i) i.focus(); });
  }));
  const form = box.querySelector('.user-pw-form');
  if (!form) return;
  const p1 = form.querySelector('[data-pw1]'), p2 = form.querySelector('[data-pw2]');
  form.querySelector('[data-pwshow]').addEventListener('click', () => {
    const t = p1.type === 'password' ? 'text' : 'password'; p1.type = t; p2.type = t;
  });
  form.querySelector('[data-pwgen]').addEventListener('click', () => {
    const v = genPassword(); p1.value = v; p2.value = v; p1.type = 'text'; p2.type = 'text';
    toast('Пароль сгенерирован — скопируйте и передайте его владельцу логина', 'info', 4500);
  });
  const save = form.querySelector('[data-pwsave]');
  const submit = async () => {
    const username = save.dataset.pwsave;
    if (p1.value.length < min) { toast(`Пароль должен быть не короче ${min} символов`, 'warn'); p1.focus(); return; }
    if (p1.value !== p2.value) { toast('Пароли не совпадают', 'warn'); p2.focus(); return; }
    const self = username === currentUser;
    if (!confirm(self ? 'Сменить ваш пароль? Остальные ваши сессии (другие браузеры) будут завершены.'
                      : `Сменить пароль «${username}»? Все открытые сессии этого логина будут завершены.`)) return;
    save.disabled = true; save.textContent = 'Сохраняем…';
    try {
      const j = await mapsPost('/auth/password', { username, password: p1.value }, 30000);
      if (j.self) { rememberSessionToken(j.token); applyWriteKey(j.writeKey); }
      _pwOpen = null;
      toast(`Пароль «${username}» изменён`, 'ok', 4000);
      renderUsersAdmin();
    } catch (e) {
      toast(e.message, 'err', 5000);
      save.disabled = false; save.textContent = 'Сохранить пароль';
    }
  };
  save.addEventListener('click', submit);
  p2.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
}

function wireMapsAdmin() {
  const $ = id => document.getElementById(id);
  if (!$('maps-admin-list')) return;
  $('mf-submit').addEventListener('click', submitMapForm);
  $('mf-cancel').addEventListener('click', resetMapForm);
  $('maps-refresh').addEventListener('click', renderMapsAdmin);
  const ur = $('users-refresh'); if (ur) ur.addEventListener('click', renderUsersAdmin);
  $('mf-name').addEventListener('keydown', e => { if (e.key === 'Enter') submitMapForm(); });
  resetMapForm();
  if (isAdmin()) { renderMapsAdmin(); renderUsersAdmin(); }
}

// Viewers may freely tune the view (colours, layers, cities) but cannot
// upload, create or delete data — those controls are hidden via `body.viewer`.
function applyRoleUI() { document.body.classList.toggle('viewer', !isAdmin()); }

/* ── ПУБЛИКАЦИЯ ОБНОВЛЕНИЙ (слежение + видимое применение) ───────────── */
// Владелец сохраняет карту на сервер; остальные вкладки узнают об этом из
// дешёвого опроса /state/revision и применяют новую версию по кнопке — с
// реальным прогрессом (загруженные точки / обещанные манифестом).
const UPDATE_POLL_MS = 45000;
let _pendingRevision = '';
let _dismissedRevision = '';
let _updateRunning = false;
let _updatePollTimer = null;
let _updateRetryReloads = false;

async function fetchStateRevisionQuick() {
  const res = await authFetch(SERVER_URL + '/state/revision?map=' + encodeURIComponent(currentMap), {
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const data = await res.json();
  return (data && data.revision) || '';
}

function revisionTimeLabel(revision) {
  const t = Date.parse(revision);
  return isFinite(t)
    ? new Date(t).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })
    : '';
}
function showUpdateBanner(revision) {
  const el = document.getElementById('update-banner');
  if (!el || revision === _dismissedRevision) return;
  const time = document.getElementById('update-banner-time');
  if (time) {
    const at = revisionTimeLabel(revision);
    time.textContent = at ? 'опубликовано в ' + at : 'владелец опубликовал новую версию';
  }
  el.hidden = false;
}
function hideUpdateBanner() {
  const el = document.getElementById('update-banner');
  if (el) el.hidden = true;
}

function setUpdateProgress(p, title, sub) {
  const pct = Math.max(0, Math.min(1, p));
  const shown = Math.round(pct * 100);
  const pctEl = document.getElementById('upd-pct');
  const barEl = document.getElementById('upd-bar-fill');
  if (pctEl) pctEl.textContent = shown + '%';
  if (barEl) barEl.style.width = shown + '%';
  if (title) { const el = document.getElementById('upd-title'); if (el) el.textContent = title; }
  if (sub)   { const el = document.getElementById('upd-sub');   if (el) el.textContent = sub; }
  // Карта возвращает цвет по мере прогресса — прогресс виден на самой карте.
  document.body.style.setProperty('--upd-gray', String(1 - pct));
}
function openUpdateOverlay() {
  const ov = document.getElementById('update-overlay');
  if (!ov) return;
  ov.className = '';
  ov.hidden = false;
  document.body.classList.add('updating');
  const hints = document.getElementById('upd-hints');
  if (hints) { hints.hidden = true; hints.innerHTML = ''; }
  const acts = document.getElementById('upd-actions');
  if (acts) acts.hidden = true;
  setUpdateProgress(0, 'Обновляем карту', 'Проверяем данные на сервере…');
}
function closeUpdateOverlay() {
  const ov = document.getElementById('update-overlay');
  if (ov) ov.hidden = true;
  document.body.classList.remove('updating');
  document.body.style.removeProperty('--upd-gray');
}

// Что именно пошло не так и что с этим делать — без общих слов.
function updateFailureCopy(err) {
  const msg = (err && err.message) || '';
  if (msg === 'HTTP 401') {
    return {
      reload: true,
      sub: 'Сессия входа истекла — сервер больше не принимает запросы.',
      hints: ['Нажмите «Войти заново» и введите логин и пароль.',
              'Данные не потеряны: карта хранится на сервере, а не в браузере.'],
    };
  }
  if (msg === 'HTTP 403') {
    return {
      sub: 'Нет доступа к этой карте под текущим логином.',
      hints: ['Выйдите и войдите под логином своего отдела.',
              'Если доступ нужен — напишите владельцу карты.'],
    };
  }
  if (msg === 'EMPTY_STATE') {
    return {
      sub: 'На сервере пока нет сохранённой версии этой карты.',
      hints: ['Владелец ещё не нажимал сохранение — попробуйте позже.'],
    };
  }
  if (err && err.name === 'TimeoutError') {
    return {
      sub: 'Сервер не ответил вовремя.',
      hints: ['Подождите 30 секунд и нажмите «Повторить» — сервер мог «просыпаться».',
              'Если повторяется — проверьте интернет и обновите страницу (Ctrl+Shift+R).'],
    };
  }
  return {
    sub: msg ? 'Ошибка связи с сервером: ' + msg : 'Не удалось связаться с сервером.',
    hints: ['Проверьте интернет и нажмите «Повторить».',
            'Если не помогает — обновите страницу целиком (Ctrl+Shift+R).',
            'Старые данные на карте остались — работать можно, но они не самые свежие.'],
  };
}
function showUpdateFailure(err) {
  const ov = document.getElementById('update-overlay');
  if (ov) { ov.hidden = false; ov.className = 'fail'; }
  document.body.classList.remove('updating');
  document.body.style.removeProperty('--upd-gray');
  const copy = updateFailureCopy(err);
  _updateRetryReloads = !!copy.reload;
  const pctEl = document.getElementById('upd-pct');
  if (pctEl) pctEl.textContent = 'Сбой';
  const titleEl = document.getElementById('upd-title');
  if (titleEl) titleEl.textContent = 'Обновление не выполнено';
  const subEl = document.getElementById('upd-sub');
  if (subEl) subEl.textContent = copy.sub;
  const hints = document.getElementById('upd-hints');
  if (hints) {
    hints.innerHTML = copy.hints.map(h => `<li>${esc(h)}</li>`).join('');
    hints.hidden = false;
  }
  const retry = document.getElementById('upd-retry');
  if (retry) retry.textContent = copy.reload ? 'Войти заново' : 'Повторить';
  const acts = document.getElementById('upd-actions');
  if (acts) acts.hidden = false;
  setSyncBadge('err', 'Обновление не выполнено');
  console.warn('Update failed:', (err && err.message) || err);
}

async function runUpdate() {
  if (_updateRunning || !SERVER_URL) return;
  _updateRunning = true;
  _dismissedRevision = '';
  hideUpdateBanner();
  openUpdateOverlay();
  const prevRevision = _activeStateRevision;
  const wasReady = stateReady;
  stateReady = false; // не отправлять обратно на сервер то, что сейчас применяем
  try {
    const manifest = await fetchStateManifest();
    if (!manifest) throw new Error('EMPTY_STATE');
    await cacheStateMeta(manifest);
    _activeStateRevision = stateRevision(manifest);
    pruneOldLayerRevisions(_activeStateRevision);

    setUpdateProgress(0.08, 'Обновляем карту', 'Применяем настройки слоёв…');
    applySnapshot(manifest);
    applyViewerDefaults();
    renderCurrentState();

    const keys = eagerStateLayers();
    const total = keys.reduce((sum, k) => sum + ((DS[k] && DS[k].stats && DS[k].stats.n) || 0), 0);
    let done = 0;
    if (total > 0) {
      setUpdateProgress(0.1, 'Обновляем карту',
        'Загружаем точки: ' + total.toLocaleString('ru-RU'));
      _loadProgressHook = n => {
        done += n;
        setUpdateProgress(0.1 + 0.85 * Math.min(done / total, 1));
      };
    }
    await ensureLayerRecords(keys);
    _loadProgressHook = null;

    setUpdateProgress(0.97, 'Обновляем карту', 'Отрисовываем слои…');
    renderCurrentState();

    const at = revisionTimeLabel(_activeStateRevision) || new Date().toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' });
    const ov = document.getElementById('update-overlay');
    if (ov) ov.className = 'done';
    setUpdateProgress(1, 'Обновление успешно',
      'Карта соответствует версии от ' + at + (total ? ' · точек: ' + total.toLocaleString('ru-RU') : ''));
    setSyncBadge('ok', 'Обновлено ' + at);
    _pendingRevision = '';
    if (isAdmin() && SERVER_KEY) _lastServerStateFingerprint = stateFingerprint(buildStateSnapshot());
    setTimeout(closeUpdateOverlay, 1400);
  } catch (err) {
    _activeStateRevision = prevRevision; // чтобы повтор начался с чистой ревизии
    showUpdateFailure(err);
  } finally {
    _loadProgressHook = null;
    _updateRunning = false;
    stateReady = wasReady;
  }
}

async function checkForUpdates() {
  if (!SERVER_URL || !_appStarted || _updateRunning || document.hidden) return;
  try {
    const rev = await fetchStateRevisionQuick();
    if (!rev) return;
    if (rev === _activeStateRevision) { _pendingRevision = ''; hideUpdateBanner(); return; }
    _pendingRevision = rev;
    showUpdateBanner(rev);
  } catch (_) {
    // Молча: состояние связи уже показывает бейдж синхронизации.
  }
}

function wireUpdateUI() {
  const on = (id, fn) => { const el = document.getElementById(id); if (el) el.addEventListener('click', fn); };
  on('update-apply', () => runUpdate());
  on('update-dismiss', () => { _dismissedRevision = _pendingRevision; hideUpdateBanner(); });
  on('upd-retry', () => { if (_updateRetryReloads) location.reload(); else runUpdate(); });
  on('upd-close', closeUpdateOverlay);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !_updateRunning) closeUpdateOverlay();
  });
}
function startUpdateWatcher() {
  if (!SERVER_URL || _updatePollTimer) return;
  wireUpdateUI();
  _updatePollTimer = setInterval(checkForUpdates, UPDATE_POLL_MS);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) checkForUpdates(); });
  window.addEventListener('online', checkForUpdates);
}

/* ── START APP (runs once a map is chosen) ───────────────────────────── */
let _appStarted = false;
function readLocalSnapshot() {
  try {
    const raw = localStorage.getItem(storeKey());
    return raw ? JSON.parse(raw) : null;
  } catch (_) { return null; }
}
function renderCurrentState() {
  buildCityUI(); buildHeatUI(); buildCustomPtUI(); rebuildUpTarget(); syncControls();
  renderHeat(); renderCustomPoints(); renderRecs(); renderDistricts(); renderIncome();
  buildBoundsUI(); syncBoundsBadge();
  fillAllSliders();   // syncControls ставит value без события input
}
/* Учётки без админ-прав всегда открывают карту с чистого листа (решение
   владельца): все тепловые слои и слои точек выключены, «Точки» на вкладке
   «Слои» включены — включил слой и сразу видишь его точки; адресная
   программа сброшена; районы города включены с самой лёгкой заливкой,
   выбор районов снят. Город, выбранный админом, сохраняется — на него карта
   и приближается. Сохраняется это только у зрителя локально: на сервер
   пишет одна роль admin. */
function applyViewerDefaults() {
  if (isAdmin()) return;
  heatKeys.forEach(k => { if (DS[k]) DS[k].visible = false; });
  customPtLayers.forEach(l => { l.visible = false; });
  showPointsAll = true;
  _soloKey = null; _preSolo = null; _cptSoloId = null; _cptPrevVisible = null;
  addrSrcKeys = []; addrRefKeys = []; rtExclKeys = [];
  rtRadius = 1000; rtRadiusOp = 'lte'; rtExclRadius = 150; rtExclOp = 'lt';
  districtsOn = COUNTRY === 'uz';
  distOpacity = .04;
  boundSel = [];
  bzInvalidate();
}
// Город, выбранный админом: рамка по его настоящим границам (если они есть),
// иначе по центру. Без выбранного города — по видимым точкам, как раньше.
function cityFrameBounds() {
  const pts = [];
  selectedCities.forEach(c => {
    const rings = cityRings(c);
    if (rings.length) rings.forEach(r => { pts.push([r.minLat, r.minLon], [r.maxLat, r.maxLon]); });
    else if (CC[c]) pts.push(CC[c]);
  });
  return pts;
}
function fitInitialBounds() {
  if (hasCityFilter()) {
    const pts = cityFrameBounds();
    if (!pts.length) return;
    const opts = { duration: .8, paddingTopLeft: [24, 92], paddingBottomRight: [24, 24] };
    if (pts.length === 1) map.flyTo(pts[0], 12, opts);
    else map.flyToBounds(L.latLngBounds(pts), { ...opts, maxZoom: 13 });
    return;
  }
  const framePts = visiblePts();
  if (framePts.length) map.fitBounds(L.latLngBounds(framePts).pad(.05), { maxZoom: 16 });
  else if (CITIES[0] && CC[CITIES[0]]) map.setView(CC[CITIES[0]], 11);
}
async function applyStartupSnapshot(snapshot) {
  if (!snapshot) return false;
  _activeStateRevision = stateRevision(snapshot);
  applySnapshot(snapshot);
  applyViewerDefaults();
  renderCurrentState();
  // The map becomes useful as soon as the visible layer and recommendation
  // basis are ready; hidden records wait for a deliberate user action.
  await ensureLayerRecords(eagerStateLayers());
  renderCurrentState();
  fitInitialBounds();
  return true;
}
async function startApp() {
  if (_appStarted) return;
  const serverStatePromise = fetchFromServer();
  const cachedStatePromise = readCachedStateMeta();
  try {
    await ensureData();
  } catch (e) {
    if (e.message !== 'AUTH_REQUIRED') toast('Не удалось загрузить базу данных', 'err', 5000);
    console.warn('Could not load authenticated dataset:', e.message);
    return;
  }
  _appStarted = true;
  applyRoleUI();
  showRoleBadge();
  wireMapSwitch();
  applyCountry(currentMap);

  const legacyLocal = readLocalSnapshot();
  const cachedState = await cachedStatePromise;
  // Prefer a newer unsynchronised legacy edit; otherwise the IndexedDB manifest
  // is the fastest safe first paint for this user and map.
  const initial = legacyLocal && legacyLocal._clientTs > Date.parse((cachedState && cachedState._savedAt) || '')
    ? legacyLocal : (cachedState || legacyLocal);
  let initialRevision = '';
  if (initial) {
    initialRevision = stateRevision(initial);
    await applyStartupSnapshot(initial);
  } else {
    renderCurrentState();
  }
  wireEvents();
  wireMapsAdmin();
  wireTips();
  stateReady = true;
  setTimeout(() => { if (map && map.invalidateSize) map.invalidateSize(); }, 60);

  const serverState = await serverStatePromise;
  const serverTs = serverState && serverState._savedAt ? Date.parse(serverState._savedAt) : 0;
  const localTs  = legacyLocal && legacyLocal._clientTs ? legacyLocal._clientTs : 0;
  const hasLayers = st => !!(st && Array.isArray(st.heatKeys) && st.heatKeys.some(k => k.startsWith('custom_')));
  const localHasLayers = hasLayers(legacyLocal || cachedState);
  const serverHasLayers = hasLayers(serverState);
  let chosen;
  if (serverHasLayers && !localHasLayers) chosen = serverState;
  else if (localHasLayers && !serverHasLayers) chosen = legacyLocal || cachedState;
  else chosen = (localTs > serverTs && legacyLocal) ? legacyLocal : (serverState || cachedState || legacyLocal);

  const chosenRevision = stateRevision(chosen);
  if (chosen && chosenRevision !== initialRevision) {
    await applyStartupSnapshot(chosen);
  }
  if (chosen) {
    // Keep legacy localStorage only as a compatibility/fallback snapshot. New
    // startup reads use IndexedDB manifest and per-layer records instead.
    if (!chosen._meta) {
      try { localStorage.setItem(storeKey(), JSON.stringify(chosen)); } catch (_) {}
    }
    if (chosen === serverState) {
      _lastServerStateFingerprint = stateFingerprint(buildStateSnapshot());
      const savedAt = serverState._savedAt
        ? new Date(serverState._savedAt).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })
        : '';
      setSyncBadge('ok', 'Обновлено' + (savedAt ? ' ' + savedAt : ''));
    } else {
      setSyncBadge('ok', 'Локальные данные');
    }
  } else if (SERVER_URL && legacyLocal && isAdmin()) {
    pushToServer(buildStateSnapshot());
  }
  // С этого момента вкладка сама узнаёт о новых публикациях владельца.
  startUpdateWatcher();
}

/* ── AUTH ────────────────────────────────────────────────────────────── */
(function initAuth() {
  // Authentication is server-side. The browser stores only the HttpOnly session
  // cookie; usernames, passwords and roles are never shipped in this bundle.
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
  const lock = () => {
    screen.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    stepLogin.style.display = '';
    stepMap.style.display = 'none';
  };
  // Карточки выбора строятся из реестра — там только карты, доступные роли.
  const renderMapCards = () => {
    const box = document.getElementById('map-cards');
    if (!box) return;
    box.innerHTML = MAP_LIST.map(m => `
      <button class="mode-card map-card" data-map="${esc(m.id)}">
        <div class="mode-icon">${mapIconHtml(m.icon, 24)}</div>
        <div class="mode-body">
          <div class="mode-name">${esc(m.name)}</div>
          <div class="mode-desc">${esc(m.desc || (m.country === 'kg' ? 'Кыргызстан' : 'Узбекистан'))}</div>
        </div>
      </button>`).join('') || '<div class="mode-desc">Для этого логина нет доступных карт — напишите владельцу.</div>';
    box.querySelectorAll('.map-card').forEach(card => card.addEventListener('click', () => enterMap(card.dataset.map)));
  };
  const showMapStep = async () => {
    stepLogin.style.display = 'none';
    stepMap.style.display = '';
    const box = document.getElementById('map-cards');
    if (box) box.innerHTML = '<div class="mode-desc">Загружаем список карт…</div>';
    await fetchMaps();
    // Единственная доступная карта — открываем сразу, выбирать нечего.
    if (!isAdmin() && MAP_LIST.length === 1) { enterMap(MAP_LIST[0].id); return; }
    renderMapCards();
  };
  const enterMap = m => {
    currentMap = m;
    sessionStorage.setItem('hm_map', m);
    unlock();
    startApp();
  };

  // sessionStorage remembers the last map only. Authentication is always
  // revalidated against the server, so a forged browser value is insufficient.
  const restoreSession = async () => {
    try {
      const res = await authFetch(SERVER_URL + '/auth/me', {
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) {
        if (res.status === 401) rememberSessionToken('');
        throw new Error('AUTH_REQUIRED');
      }
      const me = await res.json();
      if (me.token) rememberSessionToken(me.token);
      applyWriteKey(me.writeKey);
      currentUser = me.username;
      currentRole = me.role;
      currentMap = sessionStorage.getItem('hm_map') || null;
      await fetchMaps();
      if (currentMap && !MAP_LIST.some(m => m.id === currentMap)) currentMap = null;
      sessionStorage.setItem('hm_role', currentRole);
      if (currentMap) { unlock(); startApp(); } else showMapStep();
    } catch (e) {
      currentUser = null;
      currentRole = null;
      currentMap = null;
      sessionStorage.removeItem('hm_role');
      sessionStorage.removeItem('hm_map');
      lock();
      if (e.message !== 'AUTH_REQUIRED') console.warn('Auth session check failed:', e.message);
    }
  };
  const showLoginError = () => {
    errEl.classList.add('show');
    ['auth-user', 'auth-pass'].forEach(id => {
      const inp = document.getElementById(id);
      inp.classList.remove('err'); void inp.offsetWidth; inp.classList.add('err');
    });
    document.getElementById('auth-pass').value = '';
    document.getElementById('auth-pass').focus();
    setTimeout(() => {
      errEl.classList.remove('show');
      ['auth-user', 'auth-pass'].forEach(id => document.getElementById(id).classList.remove('err'));
    }, 3000);
  };

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const username = document.getElementById('auth-user').value.trim().toLowerCase();
    const password = document.getElementById('auth-pass').value;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Входим…';
    try {
      const res = await fetch(SERVER_URL + '/auth/login', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) throw new Error('LOGIN_FAILED');
      const me = await res.json();
      if (me.token) rememberSessionToken(me.token);
      applyWriteKey(me.writeKey);
      currentUser = me.username;
      currentRole = me.role;
      sessionStorage.setItem('hm_role', currentRole);
      showMapStep();
    } catch (err) {
      showLoginError();
      if (err.message !== 'LOGIN_FAILED') console.warn('Login request failed:', err.message);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Войти';
    }
  });

  ['auth-user', 'auth-pass'].forEach(id => {
    document.getElementById(id).addEventListener('input', function () {
      this.classList.remove('err'); errEl.classList.remove('show');
    });
  });
  logoutBtn.addEventListener('click', async () => {
    try { await authFetch(SERVER_URL + '/auth/logout', { method: 'POST' }); } catch (_) {}
    rememberSessionToken('');
    SERVER_KEY = '';
    sessionStorage.removeItem('hm_role');
    sessionStorage.removeItem('hm_map');
    currentUser = null; currentRole = null; currentMap = null;
    location.reload();
  });

  restoreSession();
})();
