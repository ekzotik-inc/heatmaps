// Базовые данные, состояние карты, ленивые слои, фрагменты и фото.
const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, signIn } = require('./harness');

const USERS = {
  boss: { role: 'admin', password: 'boss-pass-123' },
  com: { role: 'comdep', password: 'com-pass-123' },
  kgu: { role: 'kg', password: 'kg-pass-123' },
};

const rec = (i, extra = {}) => ({ lat: 41.123456789 + i, lon: 69.987654321, vol: i, name: 'n' + (i % 3), addr: '', ...extra });

test('state', async t => {
  const srv = await startServer(USERS);
  t.after(() => srv.stop());
  const boss = await signIn(srv, 'boss', USERS.boss.password);
  const com = await signIn(srv, 'com', USERS.com.password);
  const kgu = await signIn(srv, 'kgu', USERS.kgu.password);
  const getJson = async (who, p) => { const r = await who.get(p); return [r.status, await r.json()]; };

  await t.test('base dataset: empty, rejected without marker, then saved with a revision', async () => {
    assert.deepEqual((await getJson(com, '/data'))[1], { empty: true });
    assert.deepEqual((await getJson(com, '/data/meta'))[1], { empty: true });
    assert.equal((await boss.post('/data', { cig: {} })).status, 400);
    assert.equal((await com.post('/data', { _app: 'hm-data' })).status, 403);
    const saved = await (await boss.post('/data', { _app: 'hm-data', cig: { recs: [] } })).json();
    assert.equal(saved.ok, true);
    const [, meta] = await getJson(com, '/data/meta');
    assert.deepEqual(meta, { _app: 'hm-data-meta', _revision: saved.savedAt, _v: 1 });
    assert.deepEqual((await getJson(com, '/data'))[1].cig, { recs: [] });
  });

  await t.test('an unsaved map answers empty everywhere', async () => {
    for (const p of ['/state?map=comdep', '/state/meta?map=comdep', '/state/layer?map=comdep&layer=a', '/state/layer/chunk?map=comdep&layer=a']) {
      assert.deepEqual((await getJson(com, p))[1], { empty: true }, p);
    }
    assert.deepEqual((await getJson(com, '/state/revision?map=comdep'))[1], { revision: '', empty: true });
  });

  let revision;
  await t.test('meta strips records and keeps or derives layer stats', async () => {
    const recs = [1, 5, 2, 9, 3, 0, 'x'].map(v => ({ lat: 41, lon: 69, vol: v }));
    const res = await boss.post('/state?map=comdep', {
      _app: 'hm-br', heatKeys: ['a', 'b', 'c'],
      layers: { a: { name: 'A', recs }, b: { name: 'B', recs: [], stats: { n: 7 } }, c: null },
    });
    revision = (await res.json()).savedAt;
    const [, meta] = await getJson(com, '/state/meta?map=comdep');
    assert.equal(meta._meta, true);
    assert.equal(meta._revision, revision);
    assert.deepEqual(meta.layers.a, { name: 'A', recordCount: 7, stats: { n: 7, sum: 20, max: 9, p50: 2, p90: 9 } }, 'zero and junk values count as 0');
    assert.deepEqual(meta.layers.b, { name: 'B', recordCount: 0, stats: { n: 7 } });
    assert.deepEqual(meta.layers.c, { recordCount: 0, stats: { n: 0, sum: 0, max: 0, p50: 0, p90: 0.01 } });
    assert.deepEqual((await getJson(com, '/state/revision?map=comdep'))[1], { revision, empty: false });
  });

  await t.test('one layer: records and stats, unknown layer is 404', async () => {
    const [, layer] = await getJson(com, '/state/layer?map=comdep&layer=a');
    assert.equal(layer._app, 'hm-layer');
    assert.equal(layer._revision, revision);
    assert.equal(layer.recs.length, 7);
    assert.equal(layer.stats.max, 9);
    assert.equal((await getJson(com, '/state/layer?map=comdep&layer=c'))[0], 404);
    assert.equal((await getJson(com, '/state/layer?map=comdep&layer=zzz'))[0], 404);
    assert.equal((await getJson(com, '/state/layer?map=comdep&layer=layers'))[0], 404);
    await boss.post('/state?map=kg', { _app: 'hm-br', layers: { a: { recs: [] } } });
    assert.equal((await getJson(boss, '/state/layer?map=kg&layer=a'))[0], 404, 'a layer not listed in heatKeys');
    assert.equal((await getJson(boss, '/state/layer/chunk?map=kg&layer=a'))[0], 404);
  });

  await t.test('layer chunks: compact rows, dictionaries, paging and clamps', async () => {
    const recs = Array.from({ length: 1200 }, (_, i) => rec(i, i === 0 ? { x: { Канал: 'HoReCa' }, code: 'C1', hours: '9-18' } : i === 1 ? { x: 'not an object' } : {}));
    recs[5] = null;
    await boss.post('/state?map=comdep', { _app: 'hm-br', heatKeys: ['big', 'nolist'], layers: { big: { recs }, nolist: { recs: 'oops' } } });
    const [, first] = await getJson(com, '/state/layer/chunk?map=comdep&layer=big&limit=10');
    assert.equal(first._app, 'hm-layer-chunk');
    assert.deepEqual([first.total, first.offset, first.limit, first.nextOffset], [1200, 0, 500, 500], 'limit is at least 500');
    assert.deepEqual(first.rows[0], [41.12346, 69.98765, 0, 0, -1, 0, 0, 0]);
    assert.deepEqual(first.rows[5], [0, 0, 0, -1, -1, -1, -1, -1], 'missing record becomes an empty row');
    assert.deepEqual(first.dictionaries.name, ['n0', 'n1', 'n2']);
    assert.deepEqual(first.dictionaries.x, ['{"Канал":"HoReCa"}'], 'a non-object x is dropped');
    assert.equal(first.rows[1][7], -1);
    const [, last] = await getJson(com, '/state/layer/chunk?map=comdep&layer=big&offset=1000&limit=99999');
    assert.deepEqual([last.offset, last.limit, last.rows.length, last.nextOffset], [1000, 5000, 200, null]);
    const [, past] = await getJson(com, '/state/layer/chunk?map=comdep&layer=big&offset=5000');
    assert.deepEqual([past.offset, past.rows.length], [1200, 0]);
    const [, none] = await getJson(com, '/state/layer/chunk?map=comdep&layer=nolist');
    assert.equal(none.total, 0);
    assert.equal((await getJson(com, '/state/layer/chunk?map=comdep&layer=gone'))[0], 404);
  });

  await t.test('the first chunk is cached per revision and refreshed after a save', async () => {
    const [, a] = await getJson(com, '/state/layer/chunk?map=comdep&layer=big');
    const [, b] = await getJson(com, '/state/layer/chunk?map=comdep&layer=big');
    assert.deepEqual(a, b);
    await boss.post('/state?map=comdep', { _app: 'hm-br', heatKeys: ['big'], layers: { big: { recs: [rec(7)] } } });
    const [, c] = await getJson(com, '/state/layer/chunk?map=comdep&layer=big');
    assert.equal(c.total, 1);
    assert.notEqual(c._revision, a._revision);
  });

  await t.test('a lazy save keeps records the browser did not load', async () => {
    await boss.post('/state?map=comdep', { _app: 'hm-br', heatKeys: ['a', 'b'], layers: { a: { name: 'A', recs: [rec(1), rec(2)] }, b: { name: 'B', recs: [rec(3)] } } });
    await boss.post('/state?map=comdep', {
      _app: 'hm-br', _lazy: true, heatKeys: ['a', 'b', 'n'],
      layers: { a: { name: 'A2', _recordsOmitted: true }, b: { name: 'B2', recs: [] }, n: { name: 'N', _recordsOmitted: true }, z: null },
    });
    const [, st] = await getJson(com, '/state?map=comdep');
    assert.equal(st._lazy, false);
    assert.equal(st.layers.a.name, 'A2', 'incoming settings win');
    assert.equal(st.layers.a.recs.length, 2, 'omitted records are kept');
    assert.equal(st.layers.a._recordsOmitted, undefined);
    assert.deepEqual(st.layers.b.recs, [], 'sent records replace old ones');
    assert.deepEqual(st.layers.n, { name: 'N' }, 'new omitted layer has nothing to keep');
  });

  await t.test('a lazy save onto an empty map is stored as sent', async () => {
    await boss.post('/state?map=other', { _app: 'hm-br', _lazy: true, layers: { a: { _recordsOmitted: true } } });
    const [, st] = await getJson(boss, '/state?map=other');
    assert.equal(st._lazy, true);
  });

  await t.test('state writes check the marker and map access', async () => {
    assert.equal((await boss.post('/state?map=comdep', { layers: {} })).status, 400);
    assert.equal((await boss.post('/state?map=nope', { _app: 'hm-br' })).status, 400);
    assert.equal((await kgu.get('/state?map=comdep')).status, 403);
  });

  await t.test('photos: validation, storage and access by map', async () => {
    const send = async data => { const r = await boss.post('/photo?map=comdep', { data }); return [r.status, await r.json()]; };
    assert.equal((await send('not a data url'))[0], 400);
    assert.equal((await send('data:image/gif;base64,R0lG'))[0], 415);
    assert.equal((await send('data:image/png;base64,='))[0], 400, 'empty image');
    assert.equal((await send('data:image/png;base64,' + Buffer.alloc(4 * 1024 * 1024 + 1).toString('base64')))[0], 413);
    assert.equal((await send('data:image/png;base64,' + Buffer.alloc(4 * 1024 * 1024, 1).toString('base64')))[0], 200, 'exactly 4 MB fits');
    const bytes = Buffer.from('jpeg-ish');
    const [s, j] = await send('data:image/JPEG;base64,' + bytes.toString('base64'));
    assert.equal(s, 200);
    assert.deepEqual([j.ok, j.bytes], [true, bytes.length]);
    assert.equal((await send('data:image/jpeg;base64,' + bytes.toString('base64')))[1].id, j.id, 'same bytes, same id');
    const img = await com.get('/photo/' + j.id);
    assert.equal(img.status, 200);
    assert.equal(img.headers.get('content-type'), 'image/jpeg');
    assert.match(img.headers.get('cache-control'), /immutable/);
    assert.deepEqual(Buffer.from(await img.arrayBuffer()), bytes);
    assert.equal((await kgu.get('/photo/' + j.id)).status, 403);
    assert.equal((await com.get('/photo/' + 'f'.repeat(32))).status, 404);
    assert.equal((await com.get('/photo/not-an-id')).status, 400);
    assert.equal((await com.post('/photo?map=comdep', { data: 'x' })).status, 403);
  });
});
