// app.js в настоящем браузере: тест поднимает server.js (временная папка
// данных), раздаёт статику из корня репозитория, подменяет адрес сервера в
// index.html и входит через форму, как пользователь. Покрытие app.js (V8)
// пишется в coverage/app/lcov.info — его читает crapper.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { isDeepStrictEqual } = require('node:util');
const { API_KEY, startServer, json, bearer } = require('../server/test/harness');

let chromium;
try { ({ chromium } = require('playwright')); } catch (_) { chromium = null; }

const ROOT = path.join(__dirname, '..');
const PROD_SERVER = /window\._HM_SERVER_URL = '[^']*'/;
const USERS = { boss: { role: 'admin', password: 'boss-pass-123' }, viewer: { role: 'comdep', password: 'viewer-pass-123' } };
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };

function serveStatic() {
  const srv = http.createServer((req, res) => {
    const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '') || 'index.html';
    const file = path.join(ROOT, rel);
    if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res.writeHead(404); return res.end();
    }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise(resolve => srv.listen(0, '127.0.0.1', () => resolve({
    base: `http://127.0.0.1:${srv.address().port}`,
    stop: () => new Promise(r => srv.close(r)),
  })));
}

// В облачном контейнере внешние CDN (Leaflet, шрифты) идут через прокси
// окружения; без прокси браузер ходит напрямую. Статика и сервер — на разных
// портах loopback: проверка Local Network Access в Chromium с прокси такие
// запросы режет, поэтому в тесте она выключена.
function launchOptions() {
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
  const opts = { args: ['--disable-features=LocalNetworkAccessChecks'] };
  if (proxy) opts.proxy = { server: proxy, bypass: '<-loopback>,127.0.0.1,localhost' };
  return opts;
}

// Без базовой выгрузки /data карта не стартует («На сервере нет базовых данных»).
const DATASET = {
  _app: 'hm-data',
  cig: { name: 'Сигареты', recs: [{ lat: 41.3, lon: 69.25, vol: 5, fil: 'Ташкент', name: 'A' }] },
  sticks: { name: 'Стики', recs: [] },
};

// Карта «other» получает состояние, где каждая настройка не по умолчанию.
const RICH_STATE = require('./app-state.fixture');
// Карта «kg» — слой больше порога, который грузится фрагментами
// (CHUNK_LAYER_MIN_RECORDS в app.js); у части записей все текстовые поля.
const BIG_RECS = Array.from({ length: 12500 }, (_, i) => {
  const r = { lat: +(42.8 + (i % 500) / 10000).toFixed(5), lon: +(74.5 + Math.floor(i / 500) / 1000).toFixed(5), vol: (i % 7) + 1 };
  if (i % 3 === 0) r.name = 'Точка ' + (i % 40);
  if (i % 5 === 0) Object.assign(r, { addr: 'ул. ' + (i % 11), code: 'K' + i, hours: '9-18' });
  if (i % 4 === 0) r.x = { Канал: i % 8 ? 'Розница' : 'HoReCa', Сегмент: 'S' + (i % 3) };
  return r;
});
const BIG_STATE = { _app: 'hm-br', heatKeys: ['custom_big'], layers: { custom_big: { _userData: true, name: 'Большой', color: '#e31a1c', visible: true, recs: BIG_RECS } } };

async function seed(api) {
  const res = await api.request('/auth/login', json({ username: 'boss', password: USERS.boss.password }));
  const { token } = await res.json();
  const put = await api.request('/data', json(DATASET, { ...bearer(token), 'X-API-Key': API_KEY }));
  assert.equal(put.status, 200, 'dataset seeded');
  const state = await api.request('/state?map=other', json(RICH_STATE, { ...bearer(token), 'X-API-Key': API_KEY }));
  assert.equal(state.status, 200, 'rich state seeded');
  const big = await api.request('/state?map=kg', json(BIG_STATE, { ...bearer(token), 'X-API-Key': API_KEY }));
  assert.equal(big.status, 200, 'big layer seeded');
}

// Пути снимка, изменение которых не меняет отпечаток: такая правка не ушла бы
// на сервер (инвариант 1 в CLAUDE.md). Выполняется в странице.
function fingerprintBlindSpots() {
  /* global buildStateSnapshot, stateFingerprint */
  const META = new Set(['_v', '_app', '_savedAt', '_date', '_lazy']);
  const snap = buildStateSnapshot();
  const base = stateFingerprint(snap);
  const mutate = v => (typeof v === 'number' ? v + 1 : typeof v === 'boolean' ? !v : typeof v === 'string' ? v + 'x'
    : Array.isArray(v) ? v.concat([v.length && typeof v[0] === 'object' ? { ...v[0] } : 'zz'])
      : v && typeof v === 'object' ? { ...v, zz: 1 } : 'set');
  const blind = [];
  const probe = (path, edit) => { const s = structuredClone(snap); edit(s); if (stateFingerprint(s) === base) blind.push(path); };
  const nested = ['layers', 'customPtLayers', 'boundLayers'];
  for (const k of Object.keys(snap)) if (!META.has(k) && !nested.includes(k)) probe(k, s => { s[k] = mutate(s[k]); });
  // _userData — служебная метка своих слоёв, у сохранённых она всегда true.
  for (const [key, layer] of Object.entries(snap.layers)) {
    for (const f of Object.keys(layer)) if (f !== '_userData') probe(`layers.${key}.${f}`, s => { s.layers[key][f] = mutate(layer[f]); });
  }
  snap.customPtLayers.forEach((l, i) => {
    for (const f of Object.keys(l)) probe(`customPtLayers[${i}].${f}`, s => { s.customPtLayers[i][f] = mutate(l[f]); });
    (l.recs || []).forEach((r, j) => {
      for (const f of Object.keys(r)) probe(`customPtLayers[${i}].recs[${j}].${f}`, s => { s.customPtLayers[i].recs[j][f] = mutate(r[f]); });
    });
  });
  snap.boundLayers.forEach((l, i) => {
    for (const f of Object.keys(l)) probe(`boundLayers[${i}].${f}`, s => { s.boundLayers[i][f] = mutate(l[f]); });
    l.zones.forEach((z, j) => {
      for (const f of Object.keys(z)) probe(`boundLayers[${i}].zones[${j}].${f}`, s => { s.boundLayers[i].zones[j][f] = mutate(z[f]); });
    });
  });
  return blind;
}

async function writeLcov(entries, staticBase) {
  const v8toIstanbul = require('v8-to-istanbul');
  const libCoverage = require('istanbul-lib-coverage');
  const libReport = require('istanbul-lib-report');
  const reports = require('istanbul-reports');
  const map = libCoverage.createCoverageMap({});
  for (const entry of entries) {
    const url = new URL(entry.url);
    if (url.origin !== staticBase || url.pathname !== '/app.js') continue;
    const conv = v8toIstanbul(path.join(ROOT, 'app.js'), 0, { source: entry.source });
    await conv.load();
    conv.applyCoverage(entry.functions);
    map.merge(conv.toIstanbul());
  }
  const dir = path.join(ROOT, 'coverage', 'app');
  const context = libReport.createContext({ dir, coverageMap: map, defaultSummarizer: 'flat' });
  reports.create('lcovonly', { projectRoot: ROOT }).execute(context);
}

test('app in the browser', { skip: !chromium && 'playwright is not installed' }, async t => {
  const api = await startServer(USERS);
  await seed(api);
  const web = await serveStatic();
  const browser = await chromium.launch(launchOptions());
  const coverage = [];
  t.after(async () => {
    await writeLcov(coverage, web.base);
    await browser.close();
    await web.stop();
    await api.stop();
  });

  async function open(user, map = 'comdep') {
    const ctx = await browser.newContext({ viewport: { width: 1300, height: 860 }, ignoreHTTPSErrors: true });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route(`${web.base}/index.html`, async route => {
      const res = await route.fetch();
      route.fulfill({ response: res, body: (await res.text()).replace(PROD_SERVER, `window._HM_SERVER_URL = '${api.base}'`) });
    });
    await page.coverage.startJSCoverage({ resetOnNavigation: false });
    await page.goto(`${web.base}/index.html`);
    await page.fill('#auth-user', user);
    await page.fill('#auth-pass', USERS[user].password);
    await page.click('#auth-submit');
    // Админу и тем, кому открыто несколько карт, сначала показывают выбор карты.
    const card = `#map-cards .map-card[data-map="${map}"]`;
    await page.waitForFunction(sel => {
      const el = document.querySelector(sel);
      return (el && el.offsetParent) || (typeof stateReady !== 'undefined' && stateReady);
    }, card, { timeout: 30000 });
    if (await page.locator(card).isVisible()) await page.click(card);
    await page.waitForFunction(() => typeof stateReady !== 'undefined' && stateReady, null, { timeout: 30000 });
    return {
      page, errors,
      close: async () => { coverage.push(...await page.coverage.stopJSCoverage()); await ctx.close(); },
    };
  }

  await t.test('helpers give the expected results', async () => {
    const s = await open('boss');
    const cases = require('./app-helpers.cases');
    const got = await s.page.evaluate(exprs => exprs.map(src => {
      try { return { v: JSON.stringify((0, eval)(src)) }; } catch (e) { return { err: String(e) }; }
    }), cases.map(c => c[0]));
    const wrong = cases
      .map(([expr, want], i) => ({ expr, want, got: got[i].err || (got[i].v === undefined ? undefined : JSON.parse(got[i].v)) }))
      .filter(c => !isDeepStrictEqual(c.got, JSON.parse(JSON.stringify(c.want))));
    assert.deepEqual(wrong, []);
    await s.close();
  });

  await t.test('saved state: every field is restored, reaches the fingerprint and survives re-apply', async () => {
    const s = await open('boss', 'other');
    // Записи тепловых слоёв грузятся лениво — сначала дожидаемся их.
    const snap = await s.page.evaluate(async () => { await ensureLayerRecords(heatKeys); return buildStateSnapshot(); });
    for (const key of Object.keys(RICH_STATE).filter(k => !k.startsWith('_'))) {
      assert.deepStrictEqual(snap[key], RICH_STATE[key], `restored ${key}`);
    }
    assert.deepEqual(await s.page.evaluate(fingerprintBlindSpots), [], 'every field changes the fingerprint');
    const again = await s.page.evaluate(() => {
      const before = buildStateSnapshot();
      applySnapshot(structuredClone(before));
      const after = buildStateSnapshot();
      return { same: stateFingerprint(before) === stateFingerprint(after), before, after };
    });
    for (const k of ['_savedAt', '_date']) { delete again.before[k]; delete again.after[k]; }
    assert.deepStrictEqual(again.after, again.before);
    assert.equal(again.same, true);
    assert.deepEqual(s.errors, []);
    await s.close();
  });

  await t.test('older saved formats are migrated on apply', async () => {
    const s = await open('boss');
    const got = await s.page.evaluate(() => {
      applySnapshot({
        _app: 'hm-br', heatKeys: ['cig', 'custom_b'],
        layers: { cig: { name: 'Сигареты' }, custom_b: { name: 'Б', showTags: true, recs: [{ lat: 41.3, lon: 69.2, vol: 2 }] } },
        retailPts: [
          { id: 'r1', lat: '41.3', lon: '69.2', name: 'Старая', photos: [{ id: 'a' }, null, {}] },
          { id: 'bad', lat: 'x', lon: 1 },
        ],
        retailLayer: { color: '#123456', visible: false },
        tashkentScope: 'city', addrSrcKey: 'custom_b', addrRefKey: '__cpt__cpt_retail_legacy',
        city: 'Самарканд', heatBoost: 3, heatStyle: 'weird', recBasis: 'nope',
      });
      const snap = buildStateSnapshot();
      const legacy = snap.customPtLayers.find(l => l.id === 'cpt_retail_legacy');
      applySnapshot({ _app: 'hm-br', _meta: true, heatKeys: ['custom_m'], layers: { custom_m: { name: 'М', recordCount: 42 } } });
      const m = DS.custom_m;
      applySnapshot({ _app: 'hm-br', city: 'Атлантида', addrSrcKeys: ['x'], cityScope: 'nowhere' });
      return {
        heatKeys: snap.heatKeys, b: [snap.layers.custom_b.name, snap.layers.custom_b.recs.length, snap.layers.custom_b.stats.n],
        legacy: legacy && [legacy.color, legacy.visible, legacy.manual, legacy.shape, legacy.recs.map(r => [r.id, r.lat, r.lon, r.photos])],
        scope: snap.cityScope, addr: [snap.addrSrcKeys, snap.addrRefKeys], cities: snap.selectedCities,
        heatBoost: snap.heatBoost, heatStyle: snap.heatStyle, showPointsAll: snap.showPointsAll, recBasisKept: snap.recBasis !== 'nope',
        manifest: [m.name, m._recordsLoaded, m.recs.length, m.stats.n],
        after: [selectedCities, addrSrcKeys, cityScope],
      };
    });
    assert.deepStrictEqual(got, {
      heatKeys: ['custom_b'], b: ['Б', 1, 1],
      legacy: ['#123456', false, true, 'star', [['r1', 41.3, 69.2, [{ id: 'a' }]]]],
      scope: 'city', addr: [['custom_b'], ['__cpt__cpt_retail_legacy']], cities: ['Самарканд'],
      heatBoost: 1, heatStyle: 'spots', showPointsAll: true, recBasisKept: true,
      manifest: ['М', false, 0, 42],
      after: [[], ['x'], 'city'],
    });
    await s.close();
  });

  await t.test('a large layer arrives in chunks with every record field intact', async () => {
    const s = await open('boss', 'kg');
    await s.page.evaluate(() => ensureLayerRecords(['custom_big']));
    await s.page.waitForFunction(() => DS.custom_big._recordsLoaded && !DS.custom_big._recordsLoading, null, { timeout: 60000 });
    const recs = await s.page.evaluate(() => buildStateSnapshot().layers.custom_big.recs);
    assert.equal(recs.length, BIG_RECS.length);
    const wrong = recs.findIndex((r, i) => !isDeepStrictEqual(r, BIG_RECS[i]));
    assert.equal(wrong, -1, wrong < 0 ? '' : `record ${wrong}: ${JSON.stringify(recs[wrong])} vs ${JSON.stringify(BIG_RECS[wrong])}`);
    assert.deepEqual(s.errors, []);
    await s.close();
  });

  await t.test('admin signs in and the map starts without page errors', async () => {
    const s = await open('boss');
    assert.deepEqual(s.errors, []);
    assert.equal(await s.page.isVisible('#map'), true);
    await s.close();
  });

  // Видимость меняется с задержкой (hoverMenu, анимация) — ждём то, что
  // увидит пользователь, а не состояние в тот же тик.
  const shown = (page, sel) => page.locator(sel).waitFor({ state: 'visible', timeout: 5000 });
  const gone = (page, sel) => page.locator(sel).waitFor({ state: 'hidden', timeout: 5000 });

  await t.test('a hint opens on hover, stays pinned after click and closes on Escape', async () => {
    const s = await open('boss');
    const icon = s.page.locator('.tip-icon[data-tip]:visible').first();
    await icon.hover();
    await shown(s.page, '#hm-tip');
    await icon.click();
    await s.page.mouse.move(900, 400);
    await s.page.waitForTimeout(500);
    assert.equal(await s.page.isVisible('#hm-tip'), true, 'pinned hint survives leaving it');
    assert.equal(await icon.getAttribute('aria-expanded'), 'true');
    await icon.press('Escape');
    await gone(s.page, '#hm-tip');
    assert.equal(await icon.getAttribute('aria-expanded'), 'false');
    await s.close();
  });

  await t.test('the map switcher menu opens and closes on Escape', async () => {
    const s = await open('boss');
    await s.page.click('#map-switch');
    await shown(s.page, '#map-menu');
    assert.equal(await s.page.getAttribute('#map-switch', 'aria-expanded'), 'true');
    await s.page.keyboard.press('Escape');
    await gone(s.page, '#map-menu');
    assert.equal(await s.page.getAttribute('#map-switch', 'aria-expanded'), 'false');
    await s.close();
  });
});
