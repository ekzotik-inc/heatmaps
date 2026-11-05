// Журнал действий, ошибки из браузеров и откат версий (страница «Админ»).
const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, signIn, json } = require('./harness');

const USERS = {
  boss: { role: 'admin', password: 'boss-pass-123' },
  com: { role: 'comdep', password: 'com-pass-123' },
};
const pause = ms => new Promise(r => setTimeout(r, ms));

test('journal: who did what, merged repeats, failures and browser errors', async t => {
  const srv = await startServer(USERS, { HM_VERSION_GAP_MS: '0' });
  t.after(() => srv.stop());
  await srv.request('/auth/login', json({ username: 'com', password: 'wrong-pass-1' }));
  const boss = await signIn(srv, 'boss', USERS.boss.password);
  const com = await signIn(srv, 'com', USERS.com.password);
  for (let i = 0; i < 3; i++) await boss.post('/state?map=comdep', { _app: 'hm-br', n: i });
  await boss.post('/auth/users/create', { username: 'anna', role: 'user', password: 'x' });
  await com.post('/client-error', { message: 'TypeError: boom', where: 'app.js:10', map: 'comdep' });
  await pause(300);
  const j = await (await boss.get('/admin/log')).json();
  const find = (action, pred = () => true) => j.rows.find(r => r.action === action && pred(r));
  assert.deepEqual([find('/auth/login', r => r.status === 401).username, find('/auth/login', r => r.status === 401).level], ['com', 'warn'], 'failed sign-in with the login tried');
  assert.ok(find('/auth/login', r => r.username === 'boss' && r.status === 200));
  const save = find('/state');
  assert.deepEqual([save.username, save.map, save.count], ['boss', 'comdep', 3], 'autosaves merge into one line');
  const bad = find('/auth/users/create');
  assert.deepEqual([bad.level, bad.detail.username, typeof bad.detail.error], ['warn', 'anna', 'string'], 'a refused action keeps its reason');
  assert.ok(!JSON.stringify(j.rows).includes('wrong-pass-1'), 'passwords never reach the journal');
  const ce = find('client-error');
  assert.deepEqual([ce.username, ce.level, ce.detail.error], ['com', 'error', 'TypeError: boom']);
  assert.ok(j.errors24h >= 1);
  assert.equal((await com.get('/admin/log')).status, 403);
  const onlyErr = await (await boss.get('/admin/log?level=error')).json();
  assert.ok(onlyErr.rows.every(r => r.level === 'error'));
});

test('versions: every change keeps the previous data; restore brings it back and can be undone', async t => {
  const srv = await startServer(USERS, { HM_VERSION_GAP_MS: '0' });
  t.after(() => srv.stop());
  const boss = await signIn(srv, 'boss', USERS.boss.password);
  const com = await signIn(srv, 'com', USERS.com.password);
  const st = n => ({ _app: 'hm-br', heatKeys: ['custom_a'], layers: { custom_a: { name: 'A', recs: Array.from({ length: n }, () => ({ lat: 41, lon: 69, vol: 1 })) } } });
  await boss.post('/state?map=comdep', st(1));
  await boss.post('/state?map=comdep', st(2));
  await boss.post('/state?map=comdep', st(3));
  await pause(200);
  let v = (await (await boss.get('/admin/versions?key=comdep')).json()).versions;
  assert.deepEqual(v.map(x => [x.username, x.summary.points]), [['boss', 2], ['boss', 1]], 'newest first, state before each change');
  assert.equal((await boss.post('/admin/versions/restore', { id: v[1].id })).status, 200);
  const now = await (await com.get('/state/layer?map=comdep&layer=custom_a')).json();
  assert.equal(now.recs.length, 1, 'everyone sees the restored map');
  v = (await (await boss.get('/admin/versions?key=comdep')).json()).versions;
  assert.deepEqual([v[0].reason, v[0].summary.points], ['before-restore', 3], 'the state before the restore is kept');
  await boss.post('/shared/layers', { layers: [{ id: 's1', kind: 'pt', name: 'S', maps: ['*'], recs: [] }] });
  await boss.post('/shared/layers', { layers: [] });
  await pause(200);
  const sv = (await (await boss.get('/admin/versions?key=shared_layers')).json()).versions;
  assert.equal(sv[0].summary.layers, 1);
  assert.equal((await boss.post('/admin/versions/restore', { id: sv[0].id })).status, 200);
  assert.deepEqual((await (await com.get('/shared/layers?map=comdep')).json()).layers.map(l => l.name), ['S']);
  assert.equal((await com.post('/admin/versions/restore', { id: sv[0].id })).status, 403);
  assert.equal((await boss.post('/admin/versions/restore', { id: 99999 })).status, 404);
  const log = (await (await boss.get('/admin/log')).json()).rows;
  assert.ok(log.some(r => r.action === '/admin/versions/restore' && r.detail.key === 'shared_layers'), 'the restore is in the journal');
});

test('versions: a burst of saves by one person is one restore point', async t => {
  const srv = await startServer(USERS);   // окно склейки по умолчанию — 10 минут
  t.after(() => srv.stop());
  const boss = await signIn(srv, 'boss', USERS.boss.password);
  for (let i = 0; i < 4; i++) await boss.post('/state?map=comdep', { _app: 'hm-br', n: i });
  await pause(200);
  const v = (await (await boss.get('/admin/versions?key=comdep')).json()).versions;
  assert.equal(v.length, 1, 'the state before the burst');
});

test('a deleted point is named in the journal and always gets its own restore point', async t => {
  const srv = await startServer(USERS);   // окно серии — 10 минут, как на Render
  t.after(() => srv.stop());
  const boss = await signIn(srv, 'boss', USERS.boss.password);
  const com = await signIn(srv, 'com', USERS.com.password);
  const map = recs => ({ _app: 'hm-br', heatKeys: [], layers: {}, customPtLayers: [{ id: 'cpt_1', name: 'Киоски', recs }] });
  const A = { name: 'А', lat: 41, lon: 69 }, B = { name: 'Б', lat: 41.1, lon: 69.1 }, C = { name: 'В', lat: 41.2, lon: 69.2 };
  await boss.post('/state?map=comdep', map([A, B]));
  await boss.post('/state?map=comdep', map([A, B, C]));   // начало серии — точка возврата
  await boss.post('/state?map=comdep', map([A, C]));      // удаление внутри серии — своя точка
  await pause(300);
  const log = (await (await boss.get('/admin/log')).json()).rows.filter(r => r.action === '/state');
  assert.ok(log.some(r => r.detail.change === 'удалил 1 точку из слоя «Киоски»'), JSON.stringify(log.map(r => r.detail)));
  assert.ok(log.some(r => r.detail.change === 'добавил 1 точку в слой «Киоски»'));
  const v = (await (await boss.get('/admin/versions?key=comdep')).json()).versions;
  assert.deepEqual([v[0].reason, v[0].summary.change, v[0].summary.points], ['delete', 'удалил 1 точку из слоя «Киоски»', 3]);
  assert.equal((await boss.post('/admin/versions/restore', { id: v[0].id })).status, 200);
  assert.deepEqual((await (await com.get('/state?map=comdep')).json()).customPtLayers[0].recs.map(r => r.name), ['А', 'Б', 'В'], 'the deleted point is back');
});
