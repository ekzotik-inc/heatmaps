// Права учёток (свои слои, ручные точки, свои границы) и общие слои, которые
// админ раздаёт на выбранные карты.
const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, signIn } = require('./harness');

const USERS = {
  boss: { role: 'admin', password: 'boss-pass-123' },
  com: { role: 'comdep', password: 'com-pass-123' },
  kgu: { role: 'kg', password: 'kg-pass-123' },
};
const ring = (lon, lat, d) => [[lon, lat], [lon + d, lat], [lon + d, lat + d], [lon, lat + d], [lon, lat]];
const BOUNDS = [{ id: 'u1', name: 'Мои', color: '#7b3294', zones: [{ id: 'z1', name: 'Z', mp: [[ring(69.2, 41.29, 0.05)]] }] }];
const HEAT = { heatKeys: ['custom_u1'], layers: { custom_u1: { name: 'H', recs: [] } }, points: [] };
const MANUAL = { heatKeys: [], layers: {}, points: [{ id: 'cpt_m', name: 'Ручные', manual: true, recs: [] }] };
const PNG = 'data:image/png;base64,' + Buffer.from('png').toString('base64');

test('account permissions', async t => {
  const srv = await startServer(USERS);
  t.after(() => srv.stop());
  const boss = await signIn(srv, 'boss', USERS.boss.password);
  let com = await signIn(srv, 'com', USERS.com.password);
  const setPerms = async (username, perms) => (await boss.post('/auth/perms', { username, perms })).status;

  await t.test('defaults: own layers and boundaries yes, manual points no; admin can everything', async () => {
    assert.deepEqual(com.perms, { layers: true, manual: false, bounds: true });
    assert.deepEqual(boss.perms, { layers: true, manual: true, bounds: true });
    const users = (await (await boss.get('/auth/users')).json()).users;
    assert.deepEqual(users.find(u => u.username === 'com').perms, { layers: true, manual: false, bounds: true });
  });

  await t.test('only the admin changes permissions', async () => {
    assert.equal((await com.post('/auth/perms', { username: 'com', perms: { manual: true } })).status, 403);
    assert.equal(await setPerms('nobody', { manual: true }), 404);
    assert.equal(await setPerms('boss', { manual: false }), 400, 'the admin always has every right');
  });

  await t.test('the server enforces each right', async () => {
    assert.equal((await com.post('/my/layers?map=comdep', MANUAL)).status, 403, 'manual points need the manual right');
    assert.equal((await com.post('/photo?map=comdep', { data: PNG })).status, 403);
    assert.equal(await setPerms('com', { layers: false, manual: true, bounds: false }), 200);
    com = await signIn(srv, 'com', USERS.com.password);
    assert.deepEqual(com.perms, { layers: false, manual: true, bounds: false });
    assert.equal((await com.post('/my/layers?map=comdep', HEAT)).status, 403, 'own layers need the layers right');
    assert.equal((await com.post('/my/layers?map=comdep', MANUAL)).status, 200);
    assert.equal((await com.post('/photo?map=comdep', { data: PNG })).status, 200);
    assert.equal((await com.post('/my/bounds?map=comdep', { layers: BOUNDS })).status, 403);
  });

  await t.test('permissions survive a restart', async () => {
    const again = await startServer(USERS, {}, { dir: srv.dir });
    try {
      const c = await signIn(again, 'com', USERS.com.password);
      assert.deepEqual(c.perms, { layers: false, manual: true, bounds: false });
      assert.deepEqual((await (await c.get('/auth/me')).json()).perms, { layers: false, manual: true, bounds: false });
    } finally { await again.stop(); }
  });
});

test('shared layers', async t => {
  const srv = await startServer(USERS);
  t.after(() => srv.stop());
  const boss = await signIn(srv, 'boss', USERS.boss.password);
  const com = await signIn(srv, 'com', USERS.com.password);
  const kgu = await signIn(srv, 'kgu', USERS.kgu.password);
  const LAYERS = [
    { id: 'all1', kind: 'heat', name: 'Везде', maps: ['*'], recs: [{ lat: 41, lon: 69, vol: 1 }] },
    { id: 'kg1', kind: 'pt', name: 'Только KG', maps: ['kg'], recs: [{ name: 'A', lat: 42.8, lon: 74.6 }] },
  ];
  const onMap = async (who, map) => (await (await who.get('/shared/layers?map=' + map)).json()).layers.map(l => l.name);

  await t.test('empty until the admin saves; only the admin saves', async () => {
    assert.deepEqual(await onMap(com, 'comdep'), []);
    assert.equal((await com.post('/shared/layers', { layers: LAYERS })).status, 403);
    assert.equal((await boss.post('/shared/layers', { layers: LAYERS })).status, 200);
  });

  await t.test('each map gets the layers chosen for it, new maps get the ones marked for all', async () => {
    assert.deepEqual(await onMap(com, 'comdep'), ['Везде']);
    assert.deepEqual(await onMap(kgu, 'kg'), ['Везде', 'Только KG']);
    assert.equal((await com.get('/shared/layers?map=kg')).status, 403, 'map access still applies');
    const id = (await (await boss.post('/maps', { name: 'Новая', viewers: ['comdep'] })).json()).map.id;
    assert.deepEqual(await onMap(com, id), ['Везде']);
    const all = (await (await boss.get('/shared/layers/all')).json()).layers;
    assert.deepEqual(all.map(l => [l.id, l.maps]), [['all1', ['*']], ['kg1', ['kg']]]);
    assert.equal((await com.get('/shared/layers/all')).status, 403);
  });

  await t.test('input is checked', async () => {
    const bad = [
      [{ id: 'x', kind: 'nope', name: 'X', maps: ['*'], recs: [] }],
      [{ id: 'bad id!', kind: 'heat', name: 'X', maps: ['*'], recs: [] }],
      [{ id: 'x', kind: 'heat', name: 'X', maps: 'all', recs: [] }],
      [{ id: 'x', kind: 'heat', name: 'X', maps: ['*'], recs: 'no' }],
      'nope',
    ];
    for (const layers of bad) assert.equal((await boss.post('/shared/layers', { layers })).status, 400, JSON.stringify(layers).slice(0, 60));
    assert.deepEqual(await onMap(kgu, 'kg'), ['Везде', 'Только KG'], 'rejected saves change nothing');
  });
});

test('a map layer made shared: upsert one layer, its photos open to every map it reaches', async t => {
  const srv = await startServer(USERS);
  t.after(() => srv.stop());
  const boss = await signIn(srv, 'boss', USERS.boss.password);
  const kgu = await signIn(srv, 'kgu', USERS.kgu.password);
  const photoId = (await (await boss.post('/photo?map=comdep', { data: PNG })).json()).id;
  assert.equal((await kgu.get('/photo/' + photoId)).status, 403, 'a comdep photo is closed to kg');
  const manual = { id: 'm1', kind: 'pt', name: 'Ручные', manual: true, recs: [{ id: 'p1', name: 'Киоск', lat: 41.3, lon: 69.2, photos: [{ id: photoId }] }] };
  const one = async layer => (await boss.post('/shared/layers/one', { layer })).status;

  assert.equal(await one({ ...manual, maps: ['comdep'] }), 200);
  assert.equal((await kgu.get('/photo/' + photoId)).status, 403, 'still closed: the layer is not on a kg map');
  assert.equal(await one({ ...manual, maps: ['*'] }), 200, 'upsert by id');
  assert.equal((await kgu.get('/photo/' + photoId)).status, 200, 'open once the shared layer reaches kg');
  const edited = { ...manual, name: 'Ручные 2', recs: manual.recs.concat({ id: 'p2', name: 'Новая', lat: 41.31, lon: 69.21 }) };
  delete edited.maps;
  assert.equal(await one(edited), 200, 'an edit without maps keeps the maps');
  const all = (await (await boss.get('/shared/layers/all')).json()).layers;
  assert.deepEqual(all.map(l => [l.id, l.name, l.maps, l.recs.length]), [['m1', 'Ручные 2', ['*'], 2]]);
  assert.equal((await kgu.post('/shared/layers/one', { layer: manual })).status, 403);
  assert.equal(await one({ id: 'bad id', kind: 'pt', recs: [] }), 400);
});

test('shared layer: removed from one map only; «all maps» keeps future maps', async t => {
  const srv = await startServer(USERS);
  t.after(() => srv.stop());
  const boss = await signIn(srv, 'boss', USERS.boss.password);
  const com = await signIn(srv, 'com', USERS.com.password);
  const kgu = await signIn(srv, 'kgu', USERS.kgu.password);
  const names = async (who, map) => (await (await who.get('/shared/layers?map=' + map)).json()).layers.map(l => l.name);
  const hide = async (id, map) => (await boss.post('/shared/layers/hide', { id, map })).status;
  await boss.post('/shared/layers', { layers: [
    { id: 'a', kind: 'pt', name: 'Везде', maps: ['*'], recs: [] },
    { id: 'b', kind: 'pt', name: 'Две карты', maps: ['comdep', 'kg'], recs: [] },
  ] });

  assert.equal(await hide('a', 'comdep'), 200);
  assert.deepEqual(await names(com, 'comdep'), ['Две карты'], 'gone from comdep only');
  assert.deepEqual(await names(kgu, 'kg'), ['Везде', 'Две карты'], 'still on kg');
  const fresh = (await (await boss.post('/maps', { name: 'Свежая', viewers: ['comdep'] })).json()).map.id;
  assert.deepEqual(await names(com, fresh), ['Везде'], 'a new map still gets an «all maps» layer');

  assert.equal(await hide('b', 'kg'), 200);
  assert.deepEqual(await names(kgu, 'kg'), ['Везде']);
  assert.deepEqual(await names(com, 'comdep'), ['Две карты']);
  const all = (await (await boss.get('/shared/layers/all')).json()).layers;
  assert.deepEqual(all.map(l => [l.id, l.maps, l.except || []]), [['a', ['*'], ['comdep']], ['b', ['comdep'], []]]);

  assert.equal(await hide('nope', 'kg'), 404);
  assert.equal((await com.post('/shared/layers/hide', { id: 'b', map: 'comdep' })).status, 403);
});

test('map access per account: the admin picks the maps, «по роли» returns to the default', async t => {
  const srv = await startServer(USERS);
  t.after(() => srv.stop());
  const boss = await signIn(srv, 'boss', USERS.boss.password);
  const com = await signIn(srv, 'com', USERS.com.password);
  const ids = async who => (await (await who.get('/maps')).json()).maps.map(m => m.id);
  const setMaps = async (username, maps) => (await boss.post('/auth/maps', { username, maps })).status;
  const listed = async () => (await (await boss.get('/auth/users')).json()).users.find(u => u.username === 'com');

  assert.deepEqual(await ids(com), ['comdep'], 'by role at first');
  assert.equal((await listed()).maps, null);

  assert.equal(await setMaps('com', ['kg', 'other']), 200);
  assert.deepEqual(await ids(com), ['other', 'kg'], 'exactly the chosen maps, the role map is gone');
  assert.equal((await com.get('/state?map=comdep')).status, 403);
  assert.equal((await com.get('/state?map=kg')).status, 200);
  assert.deepEqual((await listed()).maps, ['kg', 'other']);
  assert.equal((await boss.post('/auth/perms', { username: 'com', perms: { manual: true } })).status, 200);
  assert.deepEqual((await listed()).maps, ['kg', 'other'], 'changing rights keeps the maps');

  const fresh = (await (await boss.post('/maps', { name: 'Для comdep', viewers: ['comdep'] })).json()).map.id;
  assert.ok(!(await ids(com)).includes(fresh), 'a chosen list is not widened by the role');

  assert.equal(await setMaps('com', []), 200);
  assert.deepEqual(await ids(com), [], 'no maps at all');

  assert.equal(await setMaps('com', ['nope']), 400, 'unknown map');
  assert.equal(await setMaps('boss', ['kg']), 400, 'the admin sees every map');
  assert.equal(await setMaps('ghost', ['kg']), 404);
  assert.equal((await com.post('/auth/maps', { username: 'com', maps: ['kg'] })).status, 403);

  const again = await startServer(USERS, {}, { dir: srv.dir });
  try {
    assert.deepEqual(await ids(await signIn(again, 'com', USERS.com.password)), [], 'survives a restart');
  } finally { await again.stop(); }

  assert.equal(await setMaps('com', null), 200);
  assert.deepEqual(await ids(com), ['comdep', fresh], 'back to the role');
});
