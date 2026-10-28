// Личные границы: любая учётка рисует свои зоны на доступной ей карте; их
// видит только она сама, общую карту и границы админа это не трогает.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { startServer, json, bearer, signIn } = require('./harness');

const USERS = {
  boss: { role: 'admin', password: 'boss-pass-123' },
  com: { role: 'comdep', password: 'com-pass-123' },
  com2: { role: 'comdep', password: 'com2-pass-123' },
  kgu: { role: 'kg', password: 'kg-pass-123' },
};
const ring = (lon, lat, d) => [[lon, lat], [lon + d, lat], [lon + d, lat + d], [lon, lat + d], [lon, lat]];
const LAYER = { id: 'b1', name: 'Мои зоны', color: '#7b3294', visible: true,
  zones: [{ id: 'z1', name: 'Центр', mp: [[ring(69.2, 41.29, 0.05)]] }] };

test('own boundaries', async t => {
  const srv = await startServer(USERS);
  t.after(() => srv.stop());
  const com = await signIn(srv, 'com', USERS.com.password);
  const com2 = await signIn(srv, 'com2', USERS.com2.password);
  const boss = await signIn(srv, 'boss', USERS.boss.password);
  const kgu = await signIn(srv, 'kgu', USERS.kgu.password);
  const mine = async (who, map = 'comdep') => { const r = await who.get('/my/bounds?map=' + map); return [r.status, await r.json()]; };
  const save = async (who, layers, map = 'comdep') => { const r = await who.post('/my/bounds?map=' + map, { layers }); return [r.status, await r.json()]; };

  await t.test('every account gets a write key; shared data stays owner-only', async () => {
    assert.ok(com.writeKey, 'viewer has a write key for own data');
    assert.equal((await com.post('/state?map=comdep', { _app: 'hm-br' })).status, 403);
    assert.equal((await com.post('/maps', { name: 'X' })).status, 403);
    assert.equal((await com.post('/data', { _app: 'hm-data' })).status, 403);
  });

  await t.test('nothing saved yet reads as an empty list', async () => {
    assert.deepEqual(await mine(com), [200, { layers: [] }]);
  });

  await t.test('a viewer saves and reads back own boundaries; others do not see them', async () => {
    const [s, j] = await save(com, [LAYER]);
    assert.equal(s, 200);
    assert.equal(j.ok, true);
    assert.deepEqual(await mine(com), [200, { layers: [LAYER] }]);
    assert.deepEqual((await mine(com2))[1], { layers: [] }, 'another account of the same role');
    assert.deepEqual((await mine(boss))[1], { layers: [] }, 'the admin');
    assert.equal(((await (await boss.get('/state?map=comdep')).json()).boundLayers || []).length, 0, 'the shared map is untouched');
  });

  await t.test('boundaries are per map and need access to that map', async () => {
    assert.deepEqual((await mine(com, 'other'))[0], 403);
    assert.equal((await save(com, [LAYER], 'kg'))[0], 403);
    assert.equal((await save(com, [LAYER], 'nope'))[0], 400);
    assert.deepEqual(await mine(kgu, 'kg'), [200, { layers: [] }]);
  });

  await t.test('writes need the session write key', async () => {
    const res = await srv.request('/my/bounds?map=comdep', json({ layers: [] }, bearer(com.token)));
    assert.equal(res.status, 401);
    assert.equal((await srv.request('/my/bounds?map=comdep')).status, 401, 'reads need a session');
  });

  await t.test('input is checked where it enters', async () => {
    assert.equal((await save(com, 'not a list'))[0], 400);
    assert.equal((await save(com, Array.from({ length: 21 }, (_, i) => ({ ...LAYER, id: 'b' + i }))))[0], 400, 'at most 20 layers');
    const big = Array.from({ length: 20001 }, (_, i) => [69 + i / 1e6, 41]);
    assert.equal((await save(com, [{ ...LAYER, zones: [{ id: 'z', name: 'Z', mp: [[big]] }] }]))[0], 413, 'vertex limit');
    const [s] = await save(com, [
      { id: 'b<1>', name: '  ' + 'Д'.repeat(50), color: 'red;x:url(//e)', visible: 'yes', zones: [
        { id: 'z/1', name: '<b>Зона</b>', mp: [[ring(69.2, 41.29, 0.05)], [[[200, 41], [69, 41], [69, 42], [200, 41]]]] },
        { id: 'z2', name: 'Пустая', mp: [[[[1, 2]]]] },
        null,
      ] },
      null,
      { name: 'без id', zones: [] },
    ]);
    assert.equal(s, 200);
    const [, back] = await mine(com);
    assert.deepEqual(back.layers, [{
      id: 'b1', name: 'Д'.repeat(40), color: '#12ADC1', visible: true,
      zones: [{ id: 'z1', name: 'b Зона /b', mp: [[ring(69.2, 41.29, 0.05)]] }],
    }]);
  });

  await t.test('own boundaries survive a restart and go away with their map', async () => {
    await save(com, [LAYER]);
    const again = await startServer(USERS, {}, { dir: srv.dir });
    try {
      const c = await signIn(again, 'com', USERS.com.password);
      assert.deepEqual((await (await c.get('/my/bounds?map=comdep')).json()).layers, [LAYER]);
    } finally { await again.stop(); }
    const created = await (await boss.post('/maps', { name: 'Временная', viewers: ['comdep'] })).json();
    const id = created.map.id;
    assert.equal((await save(com, [LAYER], id))[0], 200);
    const key = 'ubounds.' + id + '.' + crypto.createHash('sha256').update('com').digest('hex').slice(0, 24);
    assert.equal(await srv.stored(key), true);
    assert.equal((await boss.post('/maps/delete', { id, confirm: 'Временная' })).status, 200);
    assert.equal(await srv.stored(key), false);
  });
});
