// Реестр карт: создание, копия с фото, правка, удаление, доступ ролей.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { startServer, json, bearer, signIn } = require('./harness');

const USERS = {
  boss: { role: 'admin', password: 'boss-pass-123' },
  com: { role: 'comdep', password: 'com-pass-123' },
  kgu: { role: 'kg', password: 'kg-pass-123' },
};
const PNG = 'data:image/png;base64,' + Buffer.from('fake png bytes').toString('base64');

test('maps', async t => {
  const srv = await startServer(USERS);
  t.after(() => srv.stop());
  const boss = await signIn(srv, 'boss', USERS.boss.password);
  const com = await signIn(srv, 'com', USERS.com.password);
  const kgu = await signIn(srv, 'kgu', USERS.kgu.password);
  const create = async body => { const r = await boss.post('/maps', body); return [r.status, await r.json()]; };
  const update = async body => { const r = await boss.post('/maps/update', body); return [r.status, await r.json()]; };
  const remove = async body => { const r = await boss.post('/maps/delete', body); return [r.status, await r.json()]; };
  const mapsOf = async who => (await (await who.get('/maps')).json()).maps;

  await t.test('admin sees the three base maps with storage stats; a role sees only its own', async () => {
    const all = await mapsOf(boss);
    assert.deepEqual(all.map(m => m.id), ['comdep', 'other', 'kg']);
    assert.ok(all.every(m => m.base && m.stats && m.stats.bytes === 0));
    const mine = await mapsOf(com);
    assert.deepEqual(mine.map(m => m.id), ['comdep']);
    assert.equal(mine[0].stats, undefined);
  });

  let photoId;
  await t.test('a new map copies the source state and re-keys its photos', async () => {
    const up = await boss.post('/photo?map=comdep', { data: PNG });
    photoId = (await up.json()).id;
    const state = { _app: 'hm-br', heatKeys: ['h1'], layers: { h1: { name: 'L', recs: [{ lat: 41, lon: 69, vol: 1 }] } },
      customPtLayers: [{ recs: [{ photos: [{ id: photoId }, { id: 'missing-photo' }, null] }, null] }, null] };
    assert.equal((await boss.post('/state?map=comdep', state)).status, 200);
    const stats = (await mapsOf(boss)).find(m => m.id === 'comdep').stats;
    assert.ok(stats.bytes > 100, 'stored size is reported');
    assert.ok(Date.parse(stats.updatedAt) > Date.now() - 60000);
    // Фото считает только PostgreSQL; файловое хранилище их не считает (0).
    assert.deepEqual([stats.photos, stats.photoBytes > 0], srv.storage === 'postgresql' ? [1, true] : [0, false]);
    const [s, j] = await create({ name: 'Самарканд <b>', desc: 'тест', icon: '🏙', country: 'uz', viewers: ['comdep', 'hacker'], copyFrom: 'comdep' });
    assert.equal(s, 200);
    assert.equal(j.ok, true);
    assert.match(j.map.id, /^m[0-9a-z]+[0-9a-f]{6}$/);
    assert.ok(Date.parse(j.map.createdAt) > Date.now() - 60000);
    assert.equal(j.map.name, 'Самарканд b');
    assert.deepEqual(j.map.viewers, ['comdep']);
    assert.equal(j.map.icon, '🏙');
    assert.equal(j.map.base, false);
    const copy = await (await com.get('/state?map=' + j.map.id)).json();
    assert.deepEqual(copy.heatKeys, ['h1']);
    const photos = copy.customPtLayers[0].recs[0].photos;
    assert.notEqual(photos[0].id, photoId, 'photo id is bound to the new map');
    assert.equal(photos[1].id, 'missing-photo', 'a photo that is gone keeps its id');
    const img = await com.get('/photo/' + photos[0].id);
    assert.equal(img.status, 200);
    assert.equal(Buffer.from(await img.arrayBuffer()).toString(), 'fake png bytes');
    assert.equal((await kgu.get('/state/meta?map=' + j.map.id)).status, 403);
    assert.ok((await mapsOf(com)).some(m => m.id === j.map.id), 'viewer role sees the new map');
  });

  await t.test('create validates name, source map and country', async () => {
    assert.equal((await create({ name: '   ' }))[0], 400);
    assert.equal((await create({ name: 'самарканд B' }))[0], 409, 'name clash ignores case');
    assert.equal((await create({ name: 'Новая', copyFrom: 'nope' }))[0], 400);
    const [, kg] = await create({ name: 'Ош', country: 'kg', icon: 'слишком длинный значок' });
    assert.equal(kg.map.country, 'kg');
    assert.equal(kg.map.icon, '🗺', 'over-long icon falls back');
    const [, uz] = await create({ name: 'Где-то', country: 'zz', icon: 'abcd' });
    assert.equal(uz.map.country, 'uz');
    assert.deepEqual(uz.map.viewers, []);
    assert.equal(uz.map.icon, 'abcd', 'four characters fit');
    assert.equal((await create({ name: 'Пять', icon: 'abcde' }))[1].map.icon, '🗺');
    assert.notEqual(kg.map.id, uz.map.id, 'ids are unique');
  });

  await t.test('only the owner with a write key can create maps', async () => {
    assert.equal(com.writeKey, '', 'viewer gets no write key');
    assert.equal((await com.post('/maps', { name: 'X' })).status, 403, 'even the static key does not make a viewer an owner');
    assert.equal((await srv.request('/maps', json({ name: 'X' }, bearer(boss.token)))).status, 401);
  });

  await t.test('update renames, re-scopes and guards base maps', async () => {
    const id = (await mapsOf(boss)).find(m => m.name === 'Самарканд b').id;
    assert.equal((await update({ id: 'nope' }))[0], 404);
    assert.equal((await update({ id, name: ' ' }))[0], 400);
    assert.equal((await update({ id, name: 'ОШ' }))[0], 409);
    let [s, j] = await update({ id, name: 'Самарканд', desc: 'новое', icon: '📍', viewers: ['kg'], country: 'kg' });
    assert.equal(s, 200);
    assert.equal(j.ok, true);
    assert.equal((await update({ id, country: 'zz' }))[1].map.country, 'kg', 'unknown country is ignored');
    assert.deepEqual([j.map.name, j.map.desc, j.map.icon, j.map.viewers, j.map.country], ['Самарканд', 'новое', '📍', ['kg'], 'kg']);
    assert.equal((await com.get('/state/meta?map=' + id)).status, 403, 'comdep lost access');
    assert.equal((await kgu.get('/state/meta?map=' + id)).status, 200, 'kg gained access');
    [s, j] = await update({ id: 'comdep', name: 'Коммерция', viewers: [], country: 'kg', icon: '' });
    assert.equal(s, 200);
    assert.ok(j.map.viewers.includes('comdep'), 'base map keeps its own role');
    assert.equal(j.map.country, 'uz', 'base map country is fixed');
    assert.equal(j.map.icon, '🗂');
    [, j] = await update({ id: 'comdep', viewers: ['kg'], icon: '📍' });
    assert.deepEqual([j.map.viewers, j.map.icon, j.map.name], [['comdep', 'kg'], '📍', 'Коммерция']);
    assert.equal((await kgu.get('/state/meta?map=comdep')).status, 200, 'kg now sees the base map');
    await update({ id: 'comdep', viewers: [], icon: '🗂' });
    [, j] = await update({ id: 'comdep', desc: '' });
    assert.equal(j.map.desc, '');
  });

  await t.test('delete needs the exact name and removes state and photos', async () => {
    const m = (await mapsOf(boss)).find(x => x.name === 'Самарканд');
    assert.equal((await remove({ id: 'nope' }))[0], 404);
    assert.equal((await remove({ id: 'comdep', confirm: 'Коммерция' }))[0], 400, 'base maps stay');
    assert.equal((await remove({ id: m.id, confirm: 'не то' }))[0], 400);
    const before = await srv.photoCount();
    assert.ok(await srv.stored(m.id));
    assert.deepEqual(await remove({ id: m.id, confirm: 'самарканд' }), [200, { ok: true }]);
    assert.equal(await srv.stored(m.id), false);
    assert.equal(await srv.photoCount(), before - 1);
    assert.equal((await boss.get('/state/meta?map=' + m.id)).status, 400);
    assert.equal((await boss.get('/photo/' + photoId)).status, 200, 'source map photo stays');
  });

  await t.test('a map without state deletes cleanly', async () => {
    const [, j] = await create({ name: 'Пустая' });
    assert.equal((await remove({ id: j.map.id, confirm: 'Пустая' }))[0], 200);
  });

  await t.test('the registry survives a restart', async () => {
    const names = (await mapsOf(boss)).map(m => m.name);
    const again = await startServer(USERS, {}, { dir: srv.dir });
    try {
      const b2 = await signIn(again, 'boss', USERS.boss.password);
      assert.deepEqual((await mapsOf(b2)).map(m => m.name), names);
    } finally { await again.stop(); }
  });

  await t.test('no more than 40 new maps', async () => {
    const have = (await mapsOf(boss)).filter(m => !m.base).length;
    for (let i = have; i < 40; i += 1) assert.equal((await create({ name: 'Карта ' + i }))[0], 200);
    assert.deepEqual(await create({ name: 'Лишняя' }), [409, { error: 'Достигнут предел: 40 новых карт' }]);
  });
});

test('legacy registry entries are filled in at load', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hm-legacy-'));
  fs.writeFileSync(path.join(dir, 'state.maps.json'), JSON.stringify({ maps: [
    { id: 'mold', name: 'Старая' },
    { id: 'mfull', name: 'Полная', desc: 'd', icon: '📍', country: 'kg', viewers: ['kg'], createdAt: '2026-01-01T00:00:00.000Z' },
    { id: 'comdep', name: 'Ком' },
    null,
    { id: 5 },
  ] }));
  const srv = await startServer(USERS, {}, { dir });
  try {
    const boss = await signIn(srv, 'boss', USERS.boss.password);
    const maps = (await (await boss.get('/maps')).json()).maps;
    const by = id => maps.find(m => m.id === id);
    assert.deepEqual(maps.map(m => m.id), ['comdep', 'other', 'kg', 'mold', 'mfull']);
    const { stats, ...old } = by('mold');
    assert.deepEqual(old, { id: 'mold', name: 'Старая', desc: '', icon: '🗺', country: 'uz', viewers: [], base: false, createdAt: '' });
    assert.equal(by('mfull').country, 'kg');
    assert.deepEqual([by('comdep').name, by('comdep').desc, by('comdep').createdAt], ['Ком', 'Карта коммерческого отдела', '']);
    const kgu = await signIn(srv, 'kgu', USERS.kgu.password);
    assert.deepEqual((await (await kgu.get('/maps')).json()).maps.map(m => m.id), ['kg', 'mfull']);
    assert.equal((await kgu.get('/state?map=mold')).status, 403);
  } finally {
    await srv.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a photo whose map is gone from the registry is not served', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hm-orphan-'));
  const id = 'a'.repeat(32);
  fs.mkdirSync(path.join(dir, 'photos'));
  fs.writeFileSync(path.join(dir, 'photos', id + '.json'), JSON.stringify({ id, map: 'ghost', mime: 'image/png', b64: Buffer.from('x').toString('base64') }));
  const srv = await startServer(USERS, {}, { dir });
  try {
    const boss = await signIn(srv, 'boss', USERS.boss.password);
    assert.equal((await boss.get('/photo/' + id)).status, 403);
  } finally {
    await srv.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
