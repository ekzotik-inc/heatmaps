// Страница «Админ»: роли и правила ролей, слои и точки всех карт, память.
const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, signIn } = require('./harness');

const USERS = {
  boss: { role: 'admin', password: 'boss-pass-123' },
  com: { role: 'comdep', password: 'com-pass-123' },
  kgu: { role: 'kg', password: 'kg-pass-123' },
};
const PNG = 'data:image/png;base64,' + Buffer.from('png').toString('base64');

test('roles and role rules', async t => {
  const srv = await startServer(USERS);
  t.after(() => srv.stop());
  const boss = await signIn(srv, 'boss', USERS.boss.password);
  const com = await signIn(srv, 'com', USERS.com.password);
  const user = async name => (await (await boss.get('/auth/users')).json()).users.find(u => u.username === name);

  await t.test('a rule sets the default rights of a role; an account setting wins, null returns to the rule', async () => {
    assert.deepEqual((await (await boss.get('/auth/rules')).json()).rules.comdep, { layers: true, manual: false, bounds: true });
    assert.equal((await boss.post('/auth/rules', { role: 'comdep', perms: { manual: true, bounds: false } })).status, 200);
    assert.deepEqual((await user('com')).perms, { layers: true, manual: true, bounds: false });
    assert.deepEqual((await user('kgu')).perms, { layers: true, manual: false, bounds: true }, 'other roles untouched');
    assert.equal((await boss.post('/auth/perms', { username: 'com', perms: { manual: false } })).status, 200);
    assert.deepEqual([(await user('com')).perms.manual, (await user('com')).own], [false, { manual: false }]);
    assert.equal((await boss.post('/auth/perms', { username: 'com', perms: { manual: null } })).status, 200);
    assert.deepEqual([(await user('com')).perms.manual, (await user('com')).own], [true, {}]);
    assert.equal((await boss.post('/auth/rules', { role: 'admin', perms: { manual: false } })).status, 400);
    assert.equal((await com.post('/auth/rules', { role: 'comdep', perms: { manual: true } })).status, 403);
  });

  await t.test('the admin gives a role; it ends the sessions and opens the maps of the role', async () => {
    assert.equal((await boss.post('/auth/role', { username: 'com', role: 'kg' })).status, 200);
    assert.equal((await com.get('/auth/me')).status, 401, 'old session ended');
    const again = await signIn(srv, 'com', USERS.com.password);
    assert.equal(again.role, 'kg');
    assert.deepEqual((await (await again.get('/maps')).json()).maps.map(m => m.id), ['kg']);
    assert.equal((await boss.post('/auth/role', { username: 'boss', role: 'kg' })).status, 400, 'not your own role');
    assert.equal((await boss.post('/auth/role', { username: 'com', role: 'king' })).status, 400);
    assert.equal((await boss.post('/auth/role', { username: 'ghost', role: 'kg' })).status, 404);
  });

  await t.test('roles and rules survive a restart', async () => {
    const again = await startServer(USERS, {}, { dir: srv.dir });
    try {
      const c = await signIn(again, 'com', USERS.com.password);
      assert.equal(c.role, 'kg');
      const b = await signIn(again, 'boss', USERS.boss.password);
      assert.deepEqual((await (await b.get('/auth/rules')).json()).rules.comdep, { layers: true, manual: true, bounds: false });
    } finally { await again.stop(); }
  });
});

test('layers and points of every map', async t => {
  const srv = await startServer(USERS);
  t.after(() => srv.stop());
  const boss = await signIn(srv, 'boss', USERS.boss.password);
  const com = await signIn(srv, 'com', USERS.com.password);
  const recs = [{ name: 'Альфа', lat: 41.3, lon: 69.2, vol: 2 }, { name: 'Бета', lat: 41.31, lon: 69.21, vol: 3 }, { name: 'Гамма', lat: 41.32, lon: 69.22, vol: 5 }];
  await boss.post('/state?map=comdep', {
    _app: 'hm-br', heatKeys: ['custom_a'], layers: { custom_a: { name: 'Продажи', recs } },
    customPtLayers: [{ id: 'cpt_1', name: 'Киоски', recs: [{ name: 'К1', lat: 41.3, lon: 69.2 }, { name: 'К2', lat: 41.4, lon: 69.3 }] }],
  });
  await boss.post('/shared/layers', { layers: [{ id: 's1', kind: 'pt', name: 'Общие', maps: ['*'], recs: [{ name: 'О1', lat: 41, lon: 69 }, { name: 'О2', lat: 42, lon: 70 }] }] });
  await com.post('/my/layers?map=comdep', { heatKeys: ['custom_u'], layers: { custom_u: { name: 'Моё', recs: [{ lat: 41, lon: 69, vol: 1 }] } }, points: [] });
  const heat = { scope: 'map', map: 'comdep', kind: 'heat', key: 'custom_a' };
  const q = o => new URLSearchParams(o).toString();

  await t.test('one list covers map, shared and personal layers', async () => {
    const j = await (await boss.get('/admin/layers')).json();
    assert.deepEqual(j.maps.find(m => m.id === 'comdep').layers.map(l => [l.kind, l.key, l.name, l.n]), [['heat', 'custom_a', 'Продажи', 3], ['pt', 'cpt_1', 'Киоски', 2]]);
    assert.deepEqual(j.shared.map(l => [l.key, l.n, l.maps]), [['s1', 2, ['*']]]);
    assert.deepEqual(j.own.map(o => [o.owner, o.map, o.layers.map(l => l.name)]), [['com', 'comdep', ['Моё']]]);
    assert.equal((await com.get('/admin/layers')).status, 403);
  });

  await t.test('points are searched and deleted from the layer itself, for everyone', async () => {
    const found = await (await boss.get('/admin/points?' + q({ ...heat, q: 'бет' }))).json();
    assert.deepEqual([found.total, found.matched, found.rows.map(r => [r.i, r.name])], [3, 1, [[1, 'Бета']]]);
    assert.equal((await boss.post('/admin/points/delete', { ...heat, points: [{ i: 1, lat: 41.3, lon: 69.2 }] })).status, 409, 'coordinates must match');
    assert.equal((await boss.post('/admin/points/delete', { ...heat, points: [{ i: 1, lat: 41.31, lon: 69.21 }] })).status, 200);
    const layer = await (await com.get('/state/layer?map=comdep&layer=custom_a')).json();
    assert.deepEqual([layer.recs.map(r => r.name), layer.stats.n, layer.stats.sum], [['Альфа', 'Гамма'], 2, 7]);
    const pt = { scope: 'map', map: 'comdep', kind: 'pt', key: 'cpt_1' };
    assert.equal((await boss.post('/admin/points/delete', { ...pt, points: [{ i: 0, lat: 41.3, lon: 69.2 }] })).status, 200);
    assert.deepEqual((await (await com.get('/state?map=comdep')).json()).customPtLayers[0].recs.map(r => r.name), ['К2']);
    const sh = { scope: 'shared', kind: 'pt', key: 's1' };
    assert.equal((await boss.post('/admin/points/delete', { ...sh, points: [{ i: 1, lat: 42, lon: 70 }] })).status, 200);
    assert.deepEqual((await (await com.get('/shared/layers?map=comdep')).json()).layers[0].recs.map(r => r.name), ['О1']);
    assert.equal((await com.post('/admin/points/delete', { ...heat, points: [{ i: 0, lat: 41.3, lon: 69.2 }] })).status, 403);
  });

  await t.test('layers are renamed and deleted', async () => {
    assert.equal((await boss.post('/admin/layers/update', { ...heat, name: 'Продажи 2' })).status, 200);
    assert.equal((await boss.post('/admin/layers/update', { ...heat, name: ' ' })).status, 400);
    assert.equal((await boss.post('/admin/layers/delete', { scope: 'map', map: 'comdep', kind: 'pt', key: 'cpt_1' })).status, 200);
    const st = await (await com.get('/state?map=comdep')).json();
    assert.deepEqual([st.layers.custom_a.name, st.customPtLayers.length], ['Продажи 2', 0]);
    assert.equal((await boss.post('/admin/layers/delete', { scope: 'shared', kind: 'pt', key: 's1' })).status, 200);
    assert.deepEqual((await (await com.get('/shared/layers?map=comdep')).json()).layers, []);
    assert.equal((await boss.post('/admin/layers/delete', { scope: 'map', map: 'comdep', kind: 'heat', key: 'nope' })).status, 404);
  });
});

test('server memory: report, cache, orphan photos, personal data', async t => {
  const srv = await startServer(USERS);
  t.after(() => srv.stop());
  const boss = await signIn(srv, 'boss', USERS.boss.password);
  const com = await signIn(srv, 'com', USERS.com.password);
  const kept = (await (await boss.post('/photo?map=comdep', { data: PNG })).json()).id;
  const lost = (await (await boss.post('/photo?map=comdep', { data: 'data:image/png;base64,' + Buffer.from('other').toString('base64') })).json()).id;
  await boss.post('/state?map=comdep', { _app: 'hm-br', customPtLayers: [{ id: 'cpt_m', name: 'Р', manual: true, recs: [{ id: 'p', name: 'Т', lat: 41, lon: 69, photos: [{ id: kept }] }] }] });
  await com.post('/my/bounds?map=comdep', { layers: [{ id: 'u1', name: 'Мои', zones: [] }] });
  const report = async () => (await boss.get('/admin/storage')).json();

  const r = await report();
  assert.equal(r.storage, srv.storage);
  assert.ok(r.process.rss > 0 && r.process.heapUsed > 0);
  assert.deepEqual([r.photos.count, r.photos.orphans.count], [2, 1]);
  const own = r.keys.find(k => k.kind === 'own');
  assert.deepEqual([own.what, own.map, own.owner], ['bounds', 'comdep', 'com']);
  assert.ok(r.keys.find(k => k.key === 'comdep').bytes > 0);
  assert.equal(r.keys.find(k => k.key === 'comdep').kind, 'map');

  assert.equal((await boss.post('/admin/cache/clear', {})).status, 200);
  const pruned = await (await boss.post('/admin/photos/prune', {})).json();
  assert.equal(pruned.count, 1);
  assert.equal((await boss.get('/photo/' + kept)).status, 200, 'a photo in use stays');
  assert.equal((await boss.get('/photo/' + lost)).status, 404);

  assert.equal((await boss.post('/admin/storage/delete', { key: 'comdep' })).status, 400, 'a map state is not deleted here');
  assert.equal((await boss.post('/admin/storage/delete', { key: own.key })).status, 200);
  assert.deepEqual((await (await com.get('/my/bounds?map=comdep')).json()).layers, []);
  assert.equal((await boss.post('/admin/storage/delete', { key: 'nope' })).status, 404);
  assert.equal((await com.get('/admin/storage')).status, 403);
});
