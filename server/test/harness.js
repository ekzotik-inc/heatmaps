// Запуск настоящего server.js для тестов: свободный порт, временная папка
// данных (HM_DATA_DIR), учётки с паролями из теста. Рядом с server.js и в
// боевые хранилища ничего не пишется.
const { spawn } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');

const SERVER = path.join(__dirname, '..', 'server.js');
const API_KEY = 'test-static-key-0123456789abcdef';

function hash(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hex = crypto.scryptSync(password, salt, 32, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }).toString('hex');
  return `scrypt$16384$8$1$${salt}$${hex}`;
}

function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.unref();
    s.on('error', reject);
    s.listen(0, () => { const { port } = s.address(); s.close(() => resolve(port)); });
  });
}

// users: { login: { role, password } }. opts.dir — запустить на уже
// существующей папке данных (проверка перезапуска); её тогда не удаляем.
async function startServer(users, extraEnv = {}, opts = {}) {
  const dir = opts.dir || fs.mkdtempSync(path.join(os.tmpdir(), 'hm-server-test-'));
  const port = await freePort();
  const auth = {};
  for (const [name, u] of Object.entries(users)) auth[name] = { role: u.role, passwordHash: hash(u.password) };
  const env = { ...process.env, PORT: String(port), HM_DATA_DIR: dir, API_KEY,
    SESSION_SECRET: 'test-session-secret', AUTH_USERS_JSON: JSON.stringify(auth), ALLOWED_ORIGINS: '', ...extraEnv };
  for (const k of ['NODE_ENV', 'DATABASE_URL', 'KG_AUTH_USER_JSON']) if (!(k in extraEnv)) delete env[k];
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
    base,
    dir,
    log: () => log,
    request: (p, init = {}) => fetch(base + p, { redirect: 'manual', ...init }),
    stop: () => new Promise(resolve => {
      child.removeAllListeners('exit');
      // Выход по SIGTERM штатный (process.exit) — c8 успевает записать покрытие.
      child.on('exit', () => { if (!opts.keep && !opts.dir) fs.rmSync(dir, { recursive: true, force: true }); resolve(); });
      child.kill('SIGTERM');
    }),
  };
}

function json(body, headers = {}) {
  return { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) };
}

const bearer = token => ({ Authorization: `Bearer ${token}` });

// Вход + готовые заголовки для чтения и записи от имени пользователя.
async function signIn(srv, username, password) {
  const res = await srv.request('/auth/login', json({ username, password }));
  const body = await res.json();
  if (res.status !== 200) throw new Error(`login ${username}: ${res.status}`);
  return {
    ...body,
    read: bearer(body.token),
    write: { ...bearer(body.token), 'X-API-Key': body.writeKey || API_KEY },
    get: p => srv.request(p, { headers: bearer(body.token) }),
    post: (p, data) => srv.request(p, json(data, { ...bearer(body.token), 'X-API-Key': body.writeKey || API_KEY })),
  };
}

module.exports = { API_KEY, startServer, json, bearer, signIn };
