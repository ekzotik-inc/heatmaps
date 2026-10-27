// Сервер как «чёрный ящик»: настоящий server.js (harness.js) и запросы по
// HTTP, как из браузера.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { API_KEY, startServer, json, bearer } = require('./harness');

const PASSWORDS = { boss: 'boss-pass-123', viewer: 'viewer-pass-123' };
const USERS = {
  boss: { role: 'admin', password: PASSWORDS.boss },
  viewer: { role: 'comdep', password: PASSWORDS.viewer },
};

async function login(srv, username, headers = {}) {
  const res = await srv.request('/auth/login', json({ username, password: PASSWORDS[username] }, headers));
  return { res, body: await res.json(), cookie: res.headers.getSetCookie()[0] || '' };
}

test('server', async t => {
  const srv = await startServer(USERS);
  t.after(() => srv.stop());

  await t.test('health reports the storage and configured auth', async () => {
    const body = await (await srv.request('/health')).json();
    assert.equal(body.ok, true);
    assert.equal(body.storage, srv.storage);
    assert.equal(body.authConfigured, true);
    assert.equal(body.writeAuthConfigured, true);
  });

  await t.test('login over http sets a Lax HttpOnly cookie without Secure', async () => {
    const { res, body, cookie } = await login(srv, 'boss');
    assert.equal(res.status, 200);
    assert.equal(body.role, 'admin');
    assert.ok(body.writeKey);
    assert.equal(cookie, `hm_session=${encodeURIComponent(body.token)}; Max-Age=28800; Path=/; HttpOnly; SameSite=Lax`);
  });

  await t.test('login behind https proxy sets SameSite=None; Secure', async () => {
    const { body, cookie } = await login(srv, 'boss', { 'X-Forwarded-Proto': 'https' });
    assert.equal(cookie, `hm_session=${encodeURIComponent(body.token)}; Max-Age=28800; Path=/; HttpOnly; SameSite=None; Secure`);
  });

  await t.test('logout expires the cookie with the same attributes', async () => {
    const plain = await srv.request('/auth/logout', { method: 'POST' });
    assert.equal(plain.headers.getSetCookie()[0], 'hm_session=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax');
    const secure = await srv.request('/auth/logout', { method: 'POST', headers: { 'X-Forwarded-Proto': 'https' } });
    assert.equal(secure.headers.getSetCookie()[0], 'hm_session=; Max-Age=0; Path=/; HttpOnly; SameSite=None; Secure');
  });

  await t.test('wrong password is refused without a token', async () => {
    const res = await srv.request('/auth/login', json({ username: 'boss', password: 'nope-nope' }));
    assert.equal(res.status, 401);
    assert.equal((await res.json()).token, undefined);
    assert.equal(res.headers.getSetCookie().length, 0);
  });

  await t.test('reads require a session', async () => {
    assert.equal((await srv.request('/state?map=comdep')).status, 401);
    assert.equal((await srv.request('/maps')).status, 401);
  });

  await t.test('session works through the cookie as well as the bearer token', async () => {
    const { body, cookie } = await login(srv, 'boss');
    const viaCookie = await srv.request('/auth/me', { headers: { Cookie: cookie.split(';')[0] } });
    assert.equal((await viaCookie.json()).username, 'boss');
    const viaBearer = await srv.request('/auth/me', { headers: bearer(body.token) });
    assert.equal((await viaBearer.json()).writeKey, body.writeKey);
  });

  await t.test('a viewer sees only maps open to its role and gets no write key', async () => {
    const { body } = await login(srv, 'viewer');
    assert.equal(body.writeKey, '');
    const maps = (await (await srv.request('/maps', { headers: bearer(body.token) })).json()).maps;
    assert.deepEqual(maps.map(m => m.id), ['comdep']);
    assert.deepEqual(await (await srv.request('/state?map=comdep', { headers: bearer(body.token) })).json(), { empty: true });
    assert.equal((await srv.request('/state?map=kg', { headers: bearer(body.token) })).status, 403);
    assert.equal((await srv.request('/state?map=nope', { headers: bearer(body.token) })).status, 400);
  });

  await t.test('writes need admin role and the X-API-Key header', async () => {
    const state = { _app: 'hm-br', layers: {}, note: 'saved by test' };
    const boss = (await login(srv, 'boss')).body;
    const viewer = (await login(srv, 'viewer')).body;
    const noKey = await srv.request('/state?map=comdep', json(state, bearer(boss.token)));
    assert.equal(noKey.status, 401);
    const viewerWithKey = await srv.request('/state?map=comdep', json(state, { ...bearer(viewer.token), 'X-API-Key': API_KEY }));
    assert.equal(viewerWithKey.status, 403);
    const badMarker = await srv.request('/state?map=comdep', json({ layers: {} }, { ...bearer(boss.token), 'X-API-Key': boss.writeKey }));
    assert.equal(badMarker.status, 400);
    const ok = await srv.request('/state?map=comdep', json(state, { ...bearer(boss.token), 'X-API-Key': boss.writeKey }));
    assert.equal(ok.status, 200);
    const back = await (await srv.request('/state?map=comdep', { headers: bearer(viewer.token) })).json();
    assert.equal(back.note, 'saved by test');
    assert.ok(await srv.stored('comdep'), 'state lands in the test storage');
    if (srv.storage === 'file') assert.ok(fs.existsSync(path.join(srv.dir, 'state.comdep.json')), 'file storage uses HM_DATA_DIR');
  });

  await t.test('changing a password revokes sessions issued before it', async () => {
    const boss = (await login(srv, 'boss')).body;
    const old = (await login(srv, 'viewer')).body;
    const newPass = 'viewer-pass-456';
    const res = await srv.request('/auth/password', json({ username: 'viewer', password: newPass }, { ...bearer(boss.token), 'X-API-Key': boss.writeKey }));
    assert.equal(res.status, 200);
    assert.equal((await srv.request('/auth/me', { headers: bearer(old.token) })).status, 401);
    const again = await srv.request('/auth/login', json({ username: 'viewer', password: newPass }));
    assert.equal(again.status, 200);
    PASSWORDS.viewer = newPass;
  });
});
