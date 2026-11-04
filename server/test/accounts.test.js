// Учётки, созданные на странице «Админ»: вход, список, смена пароля,
// удаление; учётки из окружения (Render) отсюда не удаляются.
const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, json, signIn } = require('./harness');

const USERS = {
  boss: { role: 'admin', password: 'boss-pass-123' },
  com: { role: 'comdep', password: 'com-pass-123' },
};
const login = (srv, username, password) => srv.request('/auth/login', json({ username, password }));

test('accounts created on the admin page', async t => {
  const srv = await startServer(USERS);
  t.after(() => srv.stop());
  const boss = await signIn(srv, 'boss', USERS.boss.password);
  const com = await signIn(srv, 'com', USERS.com.password);
  const create = async body => { const r = await boss.post('/auth/users/create', body); return [r.status, await r.json()]; };

  await t.test('the admin creates an account that can sign in at once', async () => {
    const [s, j] = await create({ username: 'Anna.K', role: 'other', password: 'anna-pass-123' });
    assert.deepEqual([s, j], [200, { ok: true, username: 'anna.k', role: 'other' }]);
    const res = await login(srv, 'anna.k', 'anna-pass-123');
    assert.equal(res.status, 200);
    assert.equal((await res.json()).role, 'other');
    const users = (await (await boss.get('/auth/users')).json()).users;
    assert.deepEqual(users.map(u => [u.username, !!u.created]), [['boss', false], ['anna.k', true], ['com', false]]);
  });

  await t.test('checks: admin only, valid login, free name, known role, password rules', async () => {
    assert.equal((await com.post('/auth/users/create', { username: 'x1x', role: 'other', password: 'longenough1' })).status, 403);
    assert.equal((await create({ username: 'a', role: 'other', password: 'longenough1' }))[0], 400, 'too short');
    assert.equal((await create({ username: 'имя', role: 'other', password: 'longenough1' }))[0], 400, 'latin only');
    assert.equal((await create({ username: 'COM', role: 'other', password: 'longenough1' }))[0], 409, 'taken by an env account');
    assert.equal((await create({ username: 'anna.k', role: 'other', password: 'longenough1' }))[0], 409);
    assert.equal((await create({ username: 'newbie', role: 'root', password: 'longenough1' }))[0], 400);
    assert.equal((await create({ username: 'newbie', role: 'other', password: 'short' }))[0], 400);
  });

  await t.test('created accounts survive a restart and change password like others', async () => {
    assert.equal((await boss.post('/auth/password', { username: 'anna.k', password: 'anna-pass-456' })).status, 200);
    const again = await startServer(USERS, {}, { dir: srv.dir });
    try {
      assert.equal((await login(again, 'anna.k', 'anna-pass-456')).status, 200);
      assert.equal((await login(again, 'anna.k', 'anna-pass-123')).status, 401);
    } finally { await again.stop(); }
  });

  await t.test('only created accounts can be deleted; deletion ends their sessions', async () => {
    const anna = await signIn(srv, 'anna.k', 'anna-pass-456');
    assert.equal((await boss.post('/auth/users/delete', { username: 'com' })).status, 400, 'env accounts stay');
    assert.equal((await boss.post('/auth/users/delete', { username: 'boss' })).status, 400);
    assert.equal((await com.post('/auth/users/delete', { username: 'anna.k' })).status, 403);
    assert.equal((await boss.post('/auth/users/delete', { username: 'anna.k' })).status, 200);
    assert.equal((await anna.get('/auth/me')).status, 401, 'session ended');
    assert.equal((await login(srv, 'anna.k', 'anna-pass-456')).status, 401);
    assert.equal((await boss.post('/auth/users/delete', { username: 'anna.k' })).status, 404);
  });

  await t.test('a re-created login starts with default rights', async () => {
    await create({ username: 'temp', role: 'other', password: 'temp-pass-123' });
    assert.equal((await boss.post('/auth/perms', { username: 'temp', perms: { manual: true } })).status, 200);
    assert.equal((await boss.post('/auth/users/delete', { username: 'temp' })).status, 200);
    await create({ username: 'temp', role: 'other', password: 'temp-pass-123' });
    assert.deepEqual((await signIn(srv, 'temp', 'temp-pass-123')).perms, { layers: true, manual: false, bounds: true });
  });
});
