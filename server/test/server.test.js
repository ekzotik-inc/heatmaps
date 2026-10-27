// Сервер как «чёрный ящик»: каждый набор поднимает настоящий server.js на
// свободном порту с временной папкой данных и ходит в него по HTTP, как
// браузер. Ничего не пишется рядом с server.js и в боевые хранилища.
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');

const SERVER = path.join(__dirname, '..', 'server.js');
const API_KEY = 'test-static-key-0123456789abcdef';
const PASSWORDS = { boss: 'boss-pass-123', viewer: 'viewer-pass-123' };

function hash(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hex = crypto.scryptSync(password, salt, 32, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }).toString('hex');
  return `scrypt$16384$8$1$${salt}$${hex}`;
}

const USERS = JSON.stringify({
  boss: { role: 'admin', passwordHash: hash(PASSWORDS.boss) },
  viewer: { role: 'comdep', passwordHash: hash(PASSWORDS.viewer) },
});

function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.unref();
    s.on('error', reject);
    s.listen(0, () => { const { port } = s.address(); s.close(() => resolve(port)); });
  });
}

async function startServer() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hm-server-test-'));
  const port = await freePort();
  const env = { ...process.env, PORT: String(port), HM_DATA_DIR: dir, API_KEY,
    SESSION_SECRET: 'test-session-secret', AUTH_USERS_JSON: USERS, ALLOWED_ORIGINS: '' };
  delete env.NODE_ENV;
  delete env.DATABASE_URL;
  delete env.KG_AUTH_USER_JSON;
  const child = spawn(process.execPath, [SERVER], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  await new Promise((resolve, reject) => {
    const onData = chunk => {
      log += chunk;
      if (log.includes('running on port')) resolve();
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('exit', code => reject(new Error(`server exited ${code}:\n${log}`)));
  });
  const base = `http://127.0.0.1:${port}`;
  return {
    dir,
    request: (p, opts = {}) => fetch(base + p, { redirect: 'manual', ...opts }),
    stop: () => new Promise(resolve => {
      child.removeAllListeners('exit');
      child.on('exit', () => { fs.rmSync(dir, { recursive: true, force: true }); resolve(); });
      child.kill('SIGTERM');
    }),
  };
}

function json(body, headers = {}) {
  return { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) };
}

async function login(srv, username, headers = {}) {
  const res = await srv.request('/auth/login', json({ username, password: PASSWORDS[username] }, headers));
  return { res, body: await res.json(), cookie: res.headers.getSetCookie()[0] || '' };
}

const bearer = token => ({ Authorization: `Bearer ${token}` });

test('server', async t => {
  const srv = await startServer();
  t.after(() => srv.stop());

  await t.test('health reports file storage and configured auth', async () => {
    const body = await (await srv.request('/health')).json();
    assert.equal(body.ok, true);
    assert.equal(body.storage, 'file');
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
    assert.ok(fs.existsSync(path.join(srv.dir, 'state.comdep.json')), 'state lands in HM_DATA_DIR');
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
