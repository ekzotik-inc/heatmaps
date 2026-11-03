// Личные слои: любая учётка загружает свои тепловые слои и слои точек на
// доступной ей карте; их видит только она сама.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { startServer, json, bearer, signIn } = require('./harness');

const USERS = {
  boss: { role: 'admin', password: 'boss-pass-123' },
  com: { role: 'comdep', password: 'com-pass-123' },
  com2: { role: 'comdep', password: 'com2-pass-123' },
};
const MINE = {
  heatKeys: ['custom_u1'],
  layers: { custom_u1: { name: 'Мои продажи', color: '#e31a1c', visible: true, recs: [{ lat: 41.3, lon: 69.2, vol: 2 }] } },
  points: [{ id: 'cpt_u1', name: 'Мои точки', color: '#2ca25f', visible: true, recs: [{ name: 'A', lat: 41.31, lon: 69.21 }] }],
};

test('own layers', async t => {
  const srv = await startServer(USERS);
  t.after(() => srv.stop());
  const com = await signIn(srv, 'com', USERS.com.password);
  const com2 = await signIn(srv, 'com2', USERS.com2.password);
  const boss = await signIn(srv, 'boss', USERS.boss.password);
  const mine = async (who, map = 'comdep') => { const r = await who.get('/my/layers?map=' + map); return [r.status, await r.json()]; };
  const save = async (who, body, map = 'comdep') => { const r = await who.post('/my/layers?map=' + map, body); return [r.status, await r.json()]; };

  await t.test('empty until saved; saved layers are seen only by their account', async () => {
    assert.deepEqual(await mine(com), [200, { heatKeys: [], layers: {}, points: [] }]);
    assert.deepEqual(await save(com, MINE), [200, { ok: true }]);
    assert.deepEqual(await mine(com), [200, MINE]);
    assert.deepEqual((await mine(com2))[1].heatKeys, [], 'same role, other account');
    assert.deepEqual((await mine(boss))[1].heatKeys, [], 'the admin');
    assert.equal(((await (await boss.get('/state?map=comdep')).json()).heatKeys || []).length, 0, 'map state untouched');
  });

  await t.test('access, write key and shape are checked', async () => {
    assert.equal((await mine(com, 'kg'))[0], 403);
    assert.equal((await srv.request('/my/layers?map=comdep', json(MINE, bearer(com.token)))).status, 401);
    assert.equal((await save(com, { heatKeys: 'x', layers: {}, points: [] }))[0], 400);
    assert.equal((await save(com, { heatKeys: ['other_key'], layers: {}, points: [] }))[0], 400, 'keys must be custom_*');
    assert.equal((await save(com, { heatKeys: ['custom_a'], layers: {}, points: [] }))[0], 400, 'every key needs a layer');
    const many = Array.from({ length: 21 }, (_, i) => ({ id: 'cpt_' + i, name: 'P', recs: [] }));
    assert.equal((await save(com, { heatKeys: [], layers: {}, points: many }))[0], 400, 'at most 20 point layers');
    const big = Array.from({ length: 200001 }, () => ({ lat: 41, lon: 69, vol: 1 }));
    assert.equal((await save(com, { heatKeys: ['custom_b'], layers: { custom_b: { name: 'B', recs: big } }, points: [] }))[0], 413);
    assert.deepEqual((await mine(com))[1], MINE, 'rejected saves change nothing');
  });

  await t.test('own layers go away with their map', async () => {
    const id = (await (await boss.post('/maps', { name: 'Временная', viewers: ['comdep'] })).json()).map.id;
    assert.equal((await save(com, MINE, id))[0], 200);
    const key = 'ulayers.' + id + '.' + crypto.createHash('sha256').update('com').digest('hex').slice(0, 24);
    assert.equal(await srv.stored(key), true);
    assert.equal((await boss.post('/maps/delete', { id, confirm: 'Временная' })).status, 200);
    assert.equal(await srv.stored(key), false);
  });
});
