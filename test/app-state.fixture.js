// Сохранённое состояние карты, в котором каждая настройка отличается от
// значения по умолчанию: так видно, что приложение восстанавливает каждое
// поле, а не берёт своё.
const ring = (lon, lat, d) => [[lon, lat], [lon + d, lat], [lon + d, lat + d], [lon, lat + d], [lon, lat]];

module.exports = {
  _app: 'hm-br', _v: 1,
  heatKeys: ['custom_a'],
  layers: {
    custom_a: {
      _userData: true, name: 'Продажи', color: '#e31a1c', color2: '#2c7fb8', ramp: 'custom2', icon: 'cafe', shape: 'circle',
      fields: ['Канал'], opacity: 0.7, intensity: 1.5, visible: true, showTags: true, volUnit: '%',
      stats: { n: 2, sum: 3.5, max: 2.5, p50: 2.5, p90: 2.5 },
      recs: [
        { lat: 41.31, lon: 69.24, vol: 1, name: 'Точка 1', addr: 'ул. Навои, 1', code: 'C1', hours: '9-18', x: { Канал: 'HoReCa' } },
        { lat: 41.32, lon: 69.25, vol: 2.5, name: 'Точка 2' },
      ],
    },
  },
  customPtLayers: [{
    id: 'cpt_1', name: 'Мои точки', color: '#2ca25f', color2: '#006d2c', icon: 'store', fields: ['Сегмент'], manual: true,
    visible: true, shape: 'star', size: 30, opacity: 0.9, radiusOn: true, radiusM: 800, radiusColor: '#2ca25f',
    radiusOpacity: 0.2, labels: true, density: true, ramp: 'warm',
    recs: [{ id: 'p1', name: 'Киоск', lat: 41.305, lon: 69.245, dms: 'D-1', equip: 'Стойка', sales: 12, comment: 'угол',
      color: '#ff7f00', photos: [{ id: '0123456789abcdef0123456789abcdef' }] }],
  }],
  incCol: { high: '#1a9850', mid: '#fee08b', low: '#d73027' },
  selectedCities: ['Самарканд'], city: 'Самарканд',
  covR: 1200, topN: 7, recBasis: 'custom_a', recShow: false, heatBoost: 1, heatBlend: 'normal', heatRadius: 35,
  districtsOn: true, incomeHeatOn: true, coresOn: true,
  distOpacity: 0.3,
  boundLayers: [{ id: 'bl1', name: 'Мои зоны', color: '#7b3294', visible: true,
    zones: [{ id: 'z1', name: 'Центр', mp: [[ring(69.2, 41.29, 0.05)]] }] }],
  boundSel: ['bl1:z1'], boundFilter: { on: true, mode: 'out' },
  showHeatAll: false, showPointsAll: true, heatStyle: 'zones', cityScope: 'city',
  addrSrcKeys: ['custom_a'], addrRefKeys: ['__cpt__cpt_1'],
  rtRadius: 700, rtRadiusOp: 'gt', rtExclRadius: 300, rtExclOp: 'gte', rtExclKeys: ['__cpt__cpt_1'],
};
