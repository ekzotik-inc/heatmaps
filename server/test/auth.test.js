// Учётки: пароли из админ-панели, ограничение попыток входа, настройки из
// окружения (KG_AUTH_USER_JSON, битый AUTH_USERS_JSON), CORS и заголовки.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { startServer, json, bearer, signIn } = require('./harness');

const USERS = {
  boss: { role: 'admin', password: 'boss-pass-123' },
  com: { role: 'comdep', password: 'com-pass-123' },
  kgu: { role: 'kg', password: 'kg-pass-123' },
};

function hash(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  return `scrypt$16384$8$1$${salt}$` + crypto.scryptSync(password, salt, 32, { N: 16384, r: 8, p: 1, maxmem: 64 << 20 }).toString('hex');
}

const login = (srv, username, password, headers) => srv.request('/auth/login', json({ username, password }, headers));

test('passwords from the admin panel', async t => {
  const srv = await startServer(USERS);
  t.after(() => srv.stop());
  let boss = await signIn(srv, 'boss', USERS.boss.password);
  const change = async (who, username, password) => { const r = await who.post('/auth/password', { username, password }); return [r.status, await r.json()]; };

  await t.test('the owner lists accounts, admin first, without hashes', async () => {
    const [s, j] = [(await boss.get('/auth/users')).status, await (await boss.get('/auth/users')).json()];
    assert.equal(s, 200);
    assert.deepEqual(j.users.map(u => [u.username, u.role, u.changedAt]), [['boss', 'admin', ''], ['com', 'comdep', ''], ['kgu', 'kg', '']]);
    assert.equal(j.min, 8);
    assert.doesNotMatch(JSON.stringify(j), /scrypt/);
    const com = await signIn(srv, 'com', USERS.com.password);
    assert.equal((await com.get('/auth/users')).status, 403);
  });

  await t.test('password rules', async () => {
    assert.equal((await change(boss, 'nobody', 'longenough1'))[0], 404);
    assert.equal((await change(boss, 'com', 'short'))[0], 400);
    assert.equal((await change(boss, 'com', 'x'.repeat(129)))[0], 400);
    assert.equal((await change(boss, 'com', ' padded-pass '))[0], 400);
    assert.equal((await change(boss, 'com', undefined))[0], 400);
  });

  await t.test('changing your own password keeps you signed in with a new session', async () => {
    const [s, j] = await change(boss, 'BOSS', 'boss-pass-456');
    assert.equal(s, 200);
    assert.equal(j.self, true);
    assert.ok(j.token && j.writeKey);
    assert.equal((await boss.get('/auth/me')).status, 401, 'old session is revoked');
    const me = await srv.request('/auth/me', { headers: bearer(j.token) });
    assert.equal(me.status, 200);
    assert.equal((await me.json()).writeKey, j.writeKey);
    assert.equal((await login(srv, 'boss', USERS.boss.password)).status, 401, 'old password no longer works');
    boss = await signIn(srv, 'boss', 'boss-pass-456');
    const [, other] = await change(boss, 'com', 'com-pass-456');
    assert.equal(other.self, false);
    assert.equal(other.token, undefined);
    const list = await (await boss.get('/auth/users')).json();
    assert.ok(list.users.find(u => u.username === 'com').changedAt);
  });

  await t.test('changed passwords survive a restart', async () => {
    const again = await startServer(USERS, {}, { dir: srv.dir });
    try {
      assert.equal((await login(again, 'com', 'com-pass-456')).status, 200);
      assert.equal((await login(again, 'com', USERS.com.password)).status, 401);
      assert.equal((await login(again, 'kgu', USERS.kgu.password)).status, 200, 'untouched accounts keep env passwords');
      assert.match(again.log(), /Password overrides applied: 2/);
    } finally { await again.stop(); }
  });
});

test('login rate limit', async () => {
  const srv = await startServer(USERS);
  try {
    for (let i = 0; i < 5; i += 1) assert.equal((await login(srv, 'com', 'wrong-' + i)).status, 401);
    const blocked = await login(srv, 'com', USERS.com.password);
    assert.equal(blocked.status, 429);
    assert.ok(Number(blocked.headers.get('retry-after')) > 0);
    assert.equal((await login(srv, 'boss', USERS.boss.password)).status, 200, 'other accounts are not blocked');
    for (let i = 0; i < 2; i += 1) await login(srv, 'kgu', 'wrong');
    assert.equal((await login(srv, 'kgu', USERS.kgu.password)).status, 200);
    for (let i = 0; i < 4; i += 1) assert.equal((await login(srv, 'kgu', 'wrong')).status, 401, 'success clears the failures');
    assert.equal((await srv.request('/auth/login', json({}))).status, 401, 'empty body is a failed login');
  } finally { await srv.stop(); }
});

test('accounts from the environment', async t => {
  await t.test('KG_AUTH_USER_JSON replaces the kg account; bad entries are skipped', async () => {
    const env = {
      AUTH_USERS_JSON: JSON.stringify({
        Boss: { role: 'admin', passwordHash: hash('boss-pass-123') },
        oldkg: { role: 'kg', passwordHash: hash('old-kg-pass') },
        hacker: { role: 'root', passwordHash: hash('x') },
        nohash: { role: 'comdep' },
        ' ': { role: 'comdep', passwordHash: hash('x') },
      }),
      KG_AUTH_USER_JSON: JSON.stringify({ NewKG: { role: 'kg', passwordHash: hash('new-kg-pass') } }),
    };
    const srv = await startServer({}, env);
    try {
      assert.equal((await login(srv, 'boss', 'boss-pass-123')).status, 200, 'logins are case-insensitive');
      assert.equal((await login(srv, 'oldkg', 'old-kg-pass')).status, 401);
      assert.equal((await login(srv, 'newkg', 'new-kg-pass')).status, 200);
      assert.equal((await login(srv, 'hacker', 'x')).status, 401);
    } finally { await srv.stop(); }
  });

  await t.test('a broken KG override is ignored and logged', async () => {
    for (const bad of ['{not json', JSON.stringify({ a: { role: 'kg', passwordHash: 'h' }, b: {} }), JSON.stringify({ x: { role: 'admin', passwordHash: 'h' } })]) {
      const srv = await startServer(USERS, { KG_AUTH_USER_JSON: bad });
      try {
        assert.match(srv.log(), /Invalid KG_AUTH_USER_JSON override/);
        assert.equal((await login(srv, 'kgu', USERS.kgu.password)).status, 200);
      } finally { await srv.stop(); }
    }
  });

  await t.test('without users, secret or key the server says so and refuses logins', async () => {
    const srv = await startServer({}, { AUTH_USERS_JSON: '{broken', SESSION_SECRET: '', API_KEY: '' });
    try {
      const health = await (await srv.request('/health')).json();
      assert.deepEqual([health.authConfigured, health.writeAuthConfigured], [false, false]);
      assert.match(srv.log(), /Invalid AUTH_USERS_JSON/);
      assert.match(srv.log(), /SESSION_SECRET is missing/);
      assert.match(srv.log(), /API_KEY is missing/);
      assert.equal((await login(srv, 'boss', 'x')).status, 401);
    } finally { await srv.stop(); }
  });

  await t.test('a valid user is still refused when the session secret is missing', async () => {
    const srv = await startServer(USERS, { SESSION_SECRET: '' });
    try {
      assert.equal((await login(srv, 'boss', USERS.boss.password)).status, 401);
    } finally { await srv.stop(); }
  });

  await t.test('a malformed stored hash never matches', async () => {
    const srv = await startServer({}, { AUTH_USERS_JSON: JSON.stringify({
      a: { role: 'admin', passwordHash: 'plain-text' },
      b: { role: 'admin', passwordHash: 'scrypt$x$8$1$salt$abcd' },
      c: { role: 'admin', passwordHash: 'scrypt$16384$8$1$salt$zz' },
      d: { role: 'admin', passwordHash: 'scrypt$3$8$1$salt$abcd' },
    }) });
    try {
      for (const u of ['a', 'b', 'c', 'd']) assert.equal((await login(srv, u, 'plain-text')).status, 401, u);
    } finally { await srv.stop(); }
  });
});

test('sessions, CORS and headers', async t => {
  const srv = await startServer(USERS, { ALLOWED_ORIGINS: 'https://ok.example, http://localhost:8080' });
  t.after(() => srv.stop());
  const boss = await signIn(srv, 'boss', USERS.boss.password);

  await t.test('forged, malformed or foreign tokens are refused', async () => {
    const [payload, sig] = boss.token.split('.');
    const forged = Buffer.from(JSON.stringify({ u: 'boss', role: 'admin', iat: Date.now(), exp: 9e9 })).toString('base64url') + '.' + sig;
    const expired = (() => {
      const p = Buffer.from(JSON.stringify({ u: 'boss', role: 'admin', exp: 1 })).toString('base64url');
      return p + '.' + crypto.createHmac('sha256', 'test-session-secret').update(p).digest('base64url');
    })();
    const sign = obj => { const p = Buffer.from(JSON.stringify(obj)).toString('base64url'); return p + '.' + crypto.createHmac('sha256', 'test-session-secret').update(p).digest('base64url'); };
    for (const token of [forged, payload, '.' + sig, expired, sign({ u: 'boss', role: 'comdep', exp: 9e9 }), sign({ u: 'ghost', role: 'admin', exp: 9e9 }), sign({ role: 'admin', exp: 9e9 }), 'bm90IGpzb24.' + crypto.createHmac('sha256', 'test-session-secret').update('bm90IGpzb24').digest('base64url')]) {
      assert.equal((await srv.request('/auth/me', { headers: bearer(token) })).status, 401, token.slice(0, 20));
    }
    const legacy = sign({ u: 'boss', role: 'admin', exp: Math.floor(Date.now() / 1000) + 3600 });
    assert.equal((await srv.request('/auth/me', { headers: bearer(legacy) })).status, 200, 'tokens without iat still work');
    assert.equal((await srv.request('/auth/me', { headers: { Cookie: 'other=1; hm_session=%E0%A4%A' } })).status, 401, 'broken cookie encoding');
    assert.equal((await srv.request('/auth/me', { headers: { Cookie: 'junk; hm_session=' + encodeURIComponent(boss.token) } })).status, 200);
  });

  await t.test('a write key from another session is refused', async () => {
    const other = await signIn(srv, 'boss', USERS.boss.password);
    const res = await srv.request('/maps', json({ name: 'X' }, { ...bearer(boss.token), 'X-API-Key': other.writeKey.replace(/.$/, c => (c === 'A' ? 'B' : 'A')) }));
    assert.equal(res.status, 401);
    const short = await srv.request('/maps', json({ name: 'X' }, { ...bearer(boss.token), 'X-API-Key': 'short' }));
    assert.equal(short.status, 401);
  });

  await t.test('only listed origins pass CORS', async () => {
    const ok = await srv.request('/health', { headers: { Origin: 'https://ok.example' } });
    assert.equal(ok.headers.get('access-control-allow-origin'), 'https://ok.example');
    assert.equal(ok.headers.get('access-control-allow-credentials'), 'true');
    const bad = await srv.request('/health', { headers: { Origin: 'https://evil.example' } });
    assert.equal(bad.status, 403);
    assert.deepEqual(await bad.json(), { error: 'Origin not allowed' });
  });

  await t.test('security headers are on every response', async () => {
    const res = await srv.request('/health');
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(res.headers.get('x-frame-options'), 'DENY');
    assert.equal(res.headers.get('referrer-policy'), 'no-referrer');
    assert.equal(res.headers.get('x-powered-by'), null);
  });
});
