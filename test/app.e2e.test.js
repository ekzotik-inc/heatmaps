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
const USERS = {
  boss: { role: 'admin', password: 'boss-pass-123' },
  viewer: { role: 'comdep', password: 'viewer-pass-123' },
  guest: { role: 'other', password: 'guest-pass-123' },
};
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
    // Не ждём 'load': он зависит от внешних CDN (шрифты); форму и готовность
    // карты тест ждёт сам.
    await page.goto(`${web.base}/index.html`, { waitUntil: 'domcontentloaded' });
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

  // Страница «Админ» (admin.html) — своя вкладка браузера со входом.
  async function openAdmin(hash = '') {
    const ctx = await browser.newContext({ viewport: { width: 1300, height: 900 }, ignoreHTTPSErrors: true });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('dialog', d => d.accept());
    await page.route(`${web.base}/admin.html`, async route => {
      const res = await route.fetch();
      route.fulfill({ response: res, body: (await res.text()).replace(PROD_SERVER, `window._HM_SERVER_URL = '${api.base}'`) });
    });
    await page.coverage.startJSCoverage({ resetOnNavigation: false });
    await page.goto(`${web.base}/admin.html${hash}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#ad-login:not([hidden])');
    await page.fill('#ad-user', 'boss');
    await page.fill('#ad-pass', USERS.boss.password);
    await page.click('#ad-login-btn');
    await page.waitForSelector('#ad-app:not([hidden])');
    return {
      page, errors,
      close: async () => { coverage.push(...await page.coverage.stopJSCoverage()); await ctx.close(); },
    };
  }

  await t.test('helpers give the expected results', async () => {
    const s = await open('boss');
    const cases = require('./app-helpers.cases');
    // Выражение может вернуть промис (асинхронный помощник) — дожидаемся его.
    const got = await s.page.evaluate(exprs => Promise.all(exprs.map(async src => {
      try { return { v: JSON.stringify(await (0, eval)(src)) }; } catch (e) { return { err: String(e) }; }
    })), cases.map(c => c[0]));
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
          { id: 'r2', lat: 41.4, lon: 69.3, color: 'url(//evil.example)' },
        ],
        retailLayer: { color: '#123456', visible: false },
        tashkentScope: 'city', addrSrcKey: 'custom_b', addrRefKey: '__cpt__cpt_retail_legacy',
        city: 'Самарканд', heatBoost: 3, heatStyle: 'weird', recBasis: 'nope', covR: 900, recShow: false,
      });
      const snap = buildStateSnapshot();
      const legacy = snap.customPtLayers.find(l => l.id === 'cpt_retail_legacy');
      applySnapshot({ _app: 'hm-br', _meta: true, heatKeys: ['custom_m'], layers: { custom_m: { name: 'М', recordCount: 42 } } });
      const m = DS.custom_m;
      applySnapshot({ _app: 'hm-br', city: 'Атлантида', addrSrcKeys: ['x'], cityScope: 'nowhere' });
      return {
        heatKeys: snap.heatKeys, b: [snap.layers.custom_b.name, snap.layers.custom_b.recs.length, snap.layers.custom_b.stats.n],
        legacy: legacy && [legacy.color, legacy.visible, legacy.manual, legacy.shape, legacy.recs.map(r => [r.id, r.lat, r.lon, r.photos])],
        legacyColors: legacy && legacy.recs.map(r => r.color || ''),
        scope: snap.cityScope, addr: [snap.addrSrcKeys, snap.addrRefKeys], cities: snap.selectedCities,
        heatBoost: snap.heatBoost, heatStyle: snap.heatStyle, showPointsAll: snap.showPointsAll, recGone: !['recBasis', 'covR', 'topN', 'recShow'].some(k => k in snap),
        manifest: [m.name, m._recordsLoaded, m.recs.length, m.stats.n],
        after: [selectedCities, addrSrcKeys, cityScope],
      };
    });
    assert.deepStrictEqual(got, {
      heatKeys: ['custom_b'], b: ['Б', 1, 1],
      legacy: ['#123456', false, true, 'star', [['r1', 41.3, 69.2, [{ id: 'a' }]], ['r2', 41.4, 69.3, []]]],
      legacyColors: ['', ''],
      scope: 'city', addr: [['custom_b'], ['__cpt__cpt_retail_legacy']], cities: ['Самарканд'],
      heatBoost: 1, heatStyle: 'spots', showPointsAll: true, recGone: true,
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

  // CLAUDE.md, инвариант 15: учётка без админ-прав открывает карту с чистого
  // листа, но город админа сохраняется.
  await t.test('a viewer opens the admin\'s map from a clean start', async () => {
    const s = await open('guest', 'other');
    const v = await s.page.evaluate(() => {
      const snap = buildStateSnapshot();
      return {
        heat: Object.values(snap.layers).map(l => l.visible), points: snap.customPtLayers.map(l => l.visible),
        showPointsAll: snap.showPointsAll, addr: [snap.addrSrcKeys, snap.addrRefKeys, snap.rtExclKeys],
        rt: [snap.rtRadius, snap.rtRadiusOp, snap.rtExclRadius, snap.rtExclOp],
        districts: [snap.districtsOn, snap.distOpacity], boundSel: snap.boundSel, cities: snap.selectedCities,
        admin: isAdmin(),
        // Адреска с пустым выбором считается без ошибок (пустой результат).
        addrRuns: (() => { try { runAddrFilter(); return true; } catch (e) { return String(e); } })(),
      };
    });
    assert.deepStrictEqual(v, {
      heat: [false], points: [false], showPointsAll: true, addr: [[], [], []],
      rt: [1000, 'lte', 150, 'lt'], districts: [true, 0.04], boundSel: [], cities: RICH_STATE.selectedCities,
      admin: false, addrRuns: true,
    });
    assert.deepEqual(s.errors, []);
    await s.close();
  });

  // Решение владельца 28.10.2026: границы может создавать любая учётка; у
  // зрителя они личные — видны только ему и сохраняются между входами.
  await t.test('a viewer creates own boundaries that persist and stay private', async () => {
    const s = await open('guest', 'other');
    const ui = await s.page.evaluate(() => {
      const box = document.getElementById('bounds-ui');
      return {
        sections: [...box.querySelectorAll('.bz-sec')].map(e => e.textContent),
        ownerLayerEditable: !!box.querySelector('[data-bzdel="bl1"], [data-bzdraw="bl1"], [data-bzren="bl1"]'),
        canCreate: !!box.querySelector('[data-bzcreate]'),
      };
    });
    assert.deepEqual(ui, { sections: ['Границы владельца карты', 'Мои границы', 'Яркость заливки'], ownerLayerEditable: false, canCreate: true });
    await s.page.click('#bounds-tab');
    await s.page.click('#bounds-ui [data-bzcreate]');
    await s.page.fill('#bz-new-name', 'мой район');
    await s.page.click('#bounds-ui [data-bznew="draw"]');
    const saved = s.page.waitForResponse(r => r.url().includes('/my/bounds') && r.request().method() === 'POST');
    await s.page.evaluate(() => bdrawAddZone([L.latLng(41.30, 69.20), L.latLng(41.30, 69.25), L.latLng(41.33, 69.25)]));
    assert.equal((await saved).status(), 200);
    const editable = await s.page.evaluate(() => {
      const l = boundLayers.find(x => x.own);
      return { name: l.name, zones: l.zones.length, del: !!document.querySelector(`#bounds-ui [data-bzdel="${l.id}"]`) };
    });
    assert.deepEqual(editable, { name: 'Мой район', zones: 1, del: true });
    assert.deepEqual(s.errors, []);
    await s.close();

    const again = await open('guest', 'other');
    await again.page.waitForFunction(() => boundLayers.some(l => l.own));
    const kept = await again.page.evaluate(() => {
      const own = boundLayers.filter(l => l.own);
      return { own: own.map(l => [l.name, l.zones.length]), inSnapshot: buildStateSnapshot().boundLayers.map(l => l.name) };
    });
    assert.deepEqual(kept, { own: [['Мой район', 1]], inSnapshot: ['Мои зоны'] }, 'kept after sign-in, never in the map state');
    await again.close();

    const boss = await open('boss', 'other');
    const adminSees = await boss.page.evaluate(() => boundLayers.map(l => l.name));
    assert.deepEqual(adminSees, ['Мои зоны'], 'the admin does not see a viewer\'s boundaries');
    await boss.close();
  });

  // Решение владельца 03.11.2026: любая учётка загружает свои слои и точки,
  // видит их только она.
  await t.test('a viewer uploads own layers and points that persist and stay private', async () => {
    const s = await open('guest', 'other');
    const upload = async (createBtn, name, csv) => {
      await s.page.click(createBtn);
      await s.page.fill('#cl-name', name);
      await s.page.click('#cl-create');
      const [chooser] = await Promise.all([s.page.waitForEvent('filechooser'), s.page.click('#cl-upload')]);
      const saved = s.page.waitForResponse(r => r.url().includes('/my/layers') && r.request().method() === 'POST', { timeout: 30000 });
      await chooser.setFiles({ name: 'data.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
      assert.equal((await saved).status(), 200);
    };
    await s.page.waitForFunction(() => _ownLayersReady === currentMap);
    await upload('#add-layer-btn', 'мои продажи', 'Название,Широта,Долгота,Значение\nА,41.3,69.2,5\nБ,41.31,69.21,3\n');
    await s.page.click('.side-tab[data-tab="tab-points"]');
    await upload('#add-custom-pt-btn', 'мои киоски', 'Название,Широта,Долгота\nКиоск,41.305,69.205\n');
    assert.deepEqual(s.errors, []);
    await s.close();

    const again = await open('guest', 'other');
    await again.page.waitForFunction(() => _ownLayersReady === currentMap && customPtLayers.some(l => l.own));
    const kept = await again.page.evaluate(() => {
      const snap = buildStateSnapshot();
      return {
        heat: heatKeys.filter(k => DS[k].own).map(k => [DS[k].name, DS[k].recs.length]),
        points: customPtLayers.filter(l => l.own).map(l => [l.name, l.recs.length]),
        inMapSnapshot: [Object.values(snap.layers).map(l => l.name), snap.customPtLayers.map(l => l.name)],
      };
    });
    assert.deepEqual(kept, {
      heat: [['Мои продажи', 2]], points: [['Мои киоски', 1]],
      inMapSnapshot: [['Продажи'], ['Мои точки']],
    });
    await again.close();

    const boss = await open('boss', 'other');
    const adminSees = await boss.page.evaluate(() => [heatKeys.map(k => DS[k].name), customPtLayers.map(l => l.name)]);
    assert.deepEqual(adminSees, [['Продажи'], ['Мои точки']], 'the admin does not see a viewer\'s layers');
    await boss.close();
  });

  // Решение владельца 04.11.2026: страница «Админ» — общие слои для выбранных
  // карт и права учёток.
  await t.test('admin uploads a shared layer and sets account rights on the admin page', async () => {
    const adm = await openAdmin('#layers');
    const { page } = adm;
    await page.waitForSelector('#l-src [data-src]');
    await page.click('#l-shared');
    await page.fill('#s-name', 'общий рынок');
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('#s-pick')]);
    const saved = page.waitForResponse(r => r.url().endsWith('/shared/layers/one') && r.request().method() === 'POST');
    await chooser.setFiles({ name: 'm.csv', mimeType: 'text/csv', buffer: Buffer.from('Название,Широта,Долгота,Значение\nА,41.3,69.2,5\nБ,42.8,74.6,3\n') });
    assert.equal((await saved).status(), 200);
    // Права: guest получает ручные точки и теряет свои слои.
    await page.click('.a-nav a[data-sec="users"]');
    await page.click('[data-user="guest"]');
    for (const perm of ['manual', 'layers']) {
      await page.waitForSelector(`[data-uperm="${perm}"]`);
      const done = page.waitForResponse(r => r.url().endsWith('/auth/perms'));
      const fresh = page.waitForResponse(r => r.url().endsWith('/auth/users'));
      await page.click(`[data-uperm="${perm}"]`);
      assert.equal((await done).status(), 200);
      await fresh;
    }
    assert.deepEqual(adm.errors, []);
    await adm.close();

    const boss = await open('boss', 'other');
    await boss.page.waitForFunction(() => heatKeys.some(k => DS[k].shared));
    assert.deepEqual(await boss.page.evaluate(() => [heatKeys.filter(k => DS[k].shared).map(k => DS[k].name), buildStateSnapshot().heatKeys.some(k => DS[k].shared)]),
      [['Общий рынок'], false], 'shown on the map, not written into the map state');
    await boss.close();

    for (const [user, map] of [['guest', 'other'], ['viewer', 'comdep']]) {
      const s = await open(user, map);
      await s.page.waitForFunction(() => heatKeys.some(k => DS[k] && DS[k].shared));
      const seen = await s.page.evaluate(() => {
        const k = heatKeys.find(x => DS[x].shared);
        return { name: DS[k].name, n: DS[k].recs.length, editable: canEditLayer(DS[k]) };
      });
      assert.deepEqual(seen, { name: 'Общий рынок', n: 2, editable: false }, `${user} on ${map}`);
      if (user === 'guest') {
        assert.equal(await s.page.isVisible('#add-layer-btn'), false, 'own layers right taken away');
        await s.page.click('.side-tab[data-tab="tab-points"]');
        assert.equal(await s.page.isVisible('#add-manual-pt-btn'), true, 'manual points right given');
      }
      await s.close();
    }
  });

  // Решение владельца 05.11.2026: слой карты, в том числе ручные точки, можно
  // сделать общим; админ продолжает править его на карте.
  await t.test('admin makes the manual points layer shared and keeps editing it', async () => {
    const boss = await open('boss', 'other');
    boss.page.on('dialog', d => d.accept());
    await boss.page.click('.side-tab[data-tab="tab-points"]');
    const shared = boss.page.waitForResponse(r => r.url().endsWith('/shared/layers/one'));
    await boss.page.click('[data-cpshare="cpt_1"]');
    // Окно выбора карт: «все карты», но без Кыргызстана.
    await boss.page.uncheck('[data-dlg-map][value="kg"]');
    await boss.page.click('#sh-dlg-ok');
    assert.equal((await shared).status(), 200);
    await boss.page.waitForFunction(() => customPtLayers.some(l => l.shared && l.name === 'Мои точки'));
    const after = await boss.page.evaluate(() => ({
      inMap: buildStateSnapshot().customPtLayers.map(l => l.name),
      shared: customPtLayers.filter(l => l.shared).map(l => [l.name, l.manual, l.recs.length, canEditLayer(l), canDeleteLayer(l)]),
    }));
    assert.deepEqual(after, { inMap: [], shared: [['Мои точки', true, 1, true, true]] });
    const whereShared = async () => boss.page.evaluate(async () => (await (await authFetch(SERVER_URL + '/shared/layers/all')).json())
      .layers.filter(l => l.name === 'Мои точки').map(l => [l.maps, l.except]));
    assert.deepEqual(await whereShared(), [[['*'], ['kg']]]);
    const edit = boss.page.waitForResponse(r => r.url().endsWith('/shared/layers/one'));
    await boss.page.evaluate(() => {
      customPtLayers.find(l => l.shared).recs.push({ id: 'p2', name: 'Вторая', lat: 41.31, lon: 69.26 });
      saveState();
    });
    assert.equal((await edit).status(), 200);
    // Удаление общего слоя на карте убирает его только с этой карты.
    const hidden = boss.page.waitForResponse(r => r.url().endsWith('/shared/layers/hide'));
    await boss.page.click('[data-cpdel^="cpt_s_"]');
    assert.equal((await hidden).status(), 200);
    assert.equal(await boss.page.evaluate(() => customPtLayers.some(l => l.shared && l.name === 'Мои точки')), false, 'gone from this map');
    assert.deepEqual(await whereShared(), [[['*'], ['kg', 'other']]], 'still shared elsewhere');
    assert.deepEqual(boss.errors, []);
    await boss.close();

    const viewer = await open('viewer', 'comdep');
    await viewer.page.waitForFunction(() => customPtLayers.some(l => l.shared && l.name === 'Мои точки'));
    const seen = await viewer.page.evaluate(() => customPtLayers.filter(l => l.shared && l.manual).map(l => [l.name, l.recs.map(r => r.name), canEditLayer(l)]));
    assert.deepEqual(seen, [['Мои точки', ['Киоск', 'Вторая'], false]]);
    await viewer.close();
  });

  // Владелец: «Все города» — камера отдаляется на весь Узбекистан, а не
  // улетает к случайной точке с ошибочными координатами.
  await t.test('all cities frames the whole country, ignoring stray points', async () => {
    const s = await open('boss');
    const view = await s.page.evaluate(async () => {
      DS.custom_far = { key: 'custom_far', name: 'Далёкая', color: '#e31a1c', visible: true, recs: [{ lat: 10, lon: 10, vol: 1 }], stats: statsOf([{ vol: 1 }]), _recordsLoaded: true };
      heatKeys.push('custom_far');
      selectedCities = [];
      focusCityView(false);
      await new Promise(r => setTimeout(r, 1500));
      const c = map.getCenter(), b = map.getBounds();
      delete DS.custom_far; heatKeys = heatKeys.filter(k => k !== 'custom_far');
      return { lat: c.lat, lon: c.lng, containsUz: b.contains(L.latLngBounds([[37.18, 55.99], [45.59, 73.15]])), zoom: map.getZoom() };
    });
    assert.ok(view.lat > 37 && view.lat < 46 && view.lon > 55 && view.lon < 74, `centre inside Uzbekistan: ${view.lat}, ${view.lon}`);
    assert.ok(view.zoom >= 4 && view.zoom <= 7, `country zoom, got ${view.zoom}`);
    assert.equal(view.containsUz, true, 'the whole country is in view');
    await s.close();
  });

  // Владелец 06.11.2026: создавать новые учётки на странице «Админ».
  await t.test('admin creates and deletes an account on the admin page', async () => {
    const boss = await openAdmin('#users');
    const { page } = boss;
    await page.click('#u-new');
    await page.fill('#n-name', 'Anna.K');
    await page.fill('#n-pass', 'anna-pass-123');
    await page.check('input[name="n-role"][value="comdep"]');
    const created = page.waitForResponse(r => r.url().endsWith('/auth/users/create'));
    await page.click('#n-create');
    assert.equal((await created).status(), 200);
    await page.click('#a-dlg-ok');   // «Учётка создана»: логин и пароль для человека
    const canLogin = async () => (await api.request('/auth/login', json({ username: 'anna.k', password: 'anna-pass-123' }))).status;
    assert.equal(await canLogin(), 200, 'the new account signs in');
    await page.waitForSelector('#u-del');
    await page.click('#u-del');
    const deleted = page.waitForResponse(r => r.url().endsWith('/auth/users/delete'));
    await page.click('#a-dlg-ok');
    assert.equal((await deleted).status(), 200);
    assert.equal(await canLogin(), 401, 'deleted account cannot sign in');
    await page.click('[data-user="viewer"]');
    await page.waitForSelector('#u-pw');
    assert.equal(await page.isVisible('#u-del'), false, 'accounts from Render have no delete button');
    assert.deepEqual(boss.errors, []);
    await boss.close();
  });

  // Владелец: админ удаляет любую точку из любого слоя — из самого слоя, у всех.
  await t.test('admin deletes a single point from a heat layer and a points layer', async () => {
    const boss = await open('boss', 'comdep');
    boss.page.on('dialog', d => d.accept());
    const saved = () => boss.page.waitForResponse(r => r.url().includes('/state?map=comdep') && r.request().method() === 'POST');
    let done = saved();
    await boss.page.evaluate(() => {
      const recs = [{ name: 'Тепло 1', lat: 41.30, lon: 69.20, vol: 4 }, { name: 'Тепло 2', lat: 41.31, lon: 69.25, vol: 6 }];
      recs.forEach(r => { r.fil = cityOf(r.lat, r.lon); });
      DS.custom_del = { key: 'custom_del', name: 'Тепло', color: '#e31a1c', ramp: 'custom', opacity: 1, intensity: 1, visible: true, showTags: true,
        recs, stats: statsOf(recs), _recordsLoaded: true, _userData: true };
      heatKeys.push('custom_del');
      customPtLayers.push({ id: 'cpt_del', name: 'Киоски', color: '#2ca25f', visible: true, shape: 'circle', size: 30, opacity: 1,
        recs: [{ name: 'Киоск 1', lat: 41.30, lon: 69.20 }, { name: 'Киоск 2', lat: 41.32, lon: 69.28 }] });
      showPointsAll = true;   // точки тепловых слоёв видны при включённых «Точках»
      buildHeatUI(); buildCustomPtUI(); renderHeat(); renderTags(true); renderCustomPoints();
      map.setView([41.31, 69.24], 13, { animate: false });
      saveState();
    });
    assert.equal((await done).status(), 200);
    // Слой точек: клик по метке → «Удалить точку».
    await boss.page.evaluate(() => customPtLayers.find(l => l.id === 'cpt_del')._group.eachLayer(m => {
      if (m.getTooltip && m.getTooltip() && /Киоск 2/.test(m.getTooltip().getContent())) m.openPopup();
    }));
    done = saved();
    await boss.page.click('.leaflet-popup [data-ptdel]');
    assert.equal((await done).status(), 200);
    // Тепловой слой: ярлык точки → «Удалить точку».
    await boss.page.evaluate(() => tagRoot.eachLayer(m => { if (m.getTooltip() && m.getTooltip().getContent() === 'Тепло 1') m.openPopup(); }));
    done = saved();
    await boss.page.click('.leaflet-popup [data-ptdel]');
    assert.equal((await done).status(), 200);
    assert.deepEqual(await boss.page.evaluate(() => [DS.custom_del.recs.map(r => r.name), DS.custom_del.stats.n,
      customPtLayers.find(l => l.id === 'cpt_del').recs.map(r => r.name)]), [['Тепло 2'], 1, ['Киоск 1']]);
    assert.deepEqual(boss.errors, []);
    await boss.close();

    const viewer = await open('viewer', 'comdep');
    const seen = await viewer.page.evaluate(() => [DS.custom_del.stats.n, customPtLayers.find(l => l.id === 'cpt_del').recs.map(r => r.name),
      delPointBtnHtml(DS.custom_del), delPointBtnHtml(customPtLayers.find(l => l.id === 'cpt_del'))]);
    assert.deepEqual(seen, [1, ['Киоск 1'], '', ''], 'gone for everyone; a viewer has no delete button');
    await viewer.close();
  });

  await t.test('admin chooses which maps an account sees', async () => {
    const boss = await openAdmin('#users');
    const { page } = boss;
    await page.click('[data-user="viewer"]');
    const viewerMaps = async () => {
      const { token } = await (await api.request('/auth/login', json({ username: 'viewer', password: USERS.viewer.password }))).json();
      return (await (await api.request('/maps', { headers: bearer(token) })).json()).maps.map(m => m.id);
    };
    const saved = async action => {
      const done = page.waitForResponse(r => r.url().endsWith('/auth/maps'));
      const fresh = page.waitForResponse(r => r.url().endsWith('/auth/users'));
      await action();
      assert.equal((await done).status(), 200);
      await fresh;
    };
    assert.equal(await page.isChecked('input[name="u-mapmode"][value="role"]'), true, 'by role at first');
    await saved(() => page.check('input[name="u-mapmode"][value="custom"]'));
    await page.waitForSelector('[data-umap][value="kg"]');
    assert.deepEqual([await page.isChecked('[data-umap][value="comdep"]'), await page.isChecked('[data-umap][value="kg"]')], [true, false], 'starts from the role maps');
    await saved(() => page.check('[data-umap][value="kg"]'));
    assert.deepEqual(await viewerMaps(), ['comdep', 'kg']);
    await saved(() => page.check('input[name="u-mapmode"][value="role"]'));
    assert.deepEqual(await viewerMaps(), ['comdep'], 'back to the role');
    assert.deepEqual(boss.errors, []);
    await boss.close();
  });

  // Владелец 06.11.2026: «Админ» — отдельная страница; на ней все слои и точки
  // всех карт, роли и правила, память сервера.
  await t.test('the admin page manages layers, points, rules and server memory', async () => {
    const boss = await open('boss', 'comdep');
    const [popup] = await Promise.all([boss.page.waitForEvent('popup'), boss.page.click('#admin-open')]);
    assert.match(popup.url(), /\/admin\.html$/, 'the map opens the admin page in its own tab');
    await boss.close();

    const adm = await openAdmin('#layers');
    const { page } = adm;
    await page.click('[data-src="map:comdep"]');
    await page.click('[data-lpts][data-key="cpt_del"]');
    await page.waitForSelector('#p-table [data-pti]');
    assert.deepEqual(await page.$$eval('#p-table tbody tr td:nth-child(2)', tds => tds.map(td => td.textContent)), ['Киоск 1']);
    await page.check('#p-table [data-pti="0"]');
    await page.click('#p-del');
    let done = page.waitForResponse(r => r.url().endsWith('/admin/points/delete'));
    await page.click('#a-dlg-ok');
    assert.equal((await done).status(), 200);
    await page.keyboard.press('Escape');
    await page.click('[data-lren][data-key="custom_del"]');
    await page.fill('#a-dlg-input', 'тепло новое');
    done = page.waitForResponse(r => r.url().endsWith('/admin/layers/update'));
    await page.click('#a-dlg-ok');
    assert.equal((await done).status(), 200);
    const st = await api.readStored('comdep');
    assert.deepEqual([st.customPtLayers.find(l => l.id === 'cpt_del').recs.length, st.layers.custom_del.name], [0, 'Тепло новое']);

    await page.click('.a-nav a[data-sec="roles"]');
    await page.waitForSelector('[data-rule="kg"][data-perm="manual"]');
    done = page.waitForResponse(r => r.url().endsWith('/auth/rules') && r.request().method() === 'POST');
    await page.click('[data-rule="kg"][data-perm="manual"]');
    assert.equal((await done).status(), 200);
    await page.waitForSelector('[data-rule="kg"][data-perm="manual"][aria-checked="true"]');

    await page.click('.a-nav a[data-sec="server"]');
    await page.waitForSelector('#s-body .a-row');
    assert.ok((await page.textContent('#s-body')).includes('Карта «Com Dep»'));
    assert.ok((await page.textContent('#s-body')).includes('Память сервера'));
    await page.click('.a-nav a[data-sec="home"]');
    await page.waitForSelector('.a-stat');
    assert.deepEqual(adm.errors, []);
    await adm.close();
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
