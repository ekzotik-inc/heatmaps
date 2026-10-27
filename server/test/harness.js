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

// users: { login: { role, password } }
async function startServer(users, extraEnv = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hm-server-test-'));
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
    request: (p, opts = {}) => fetch(base + p, { redirect: 'manual', ...opts }),
    stop: () => new Promise(resolve => {
      child.removeAllListeners('exit');
      // Выход по SIGTERM штатный (process.exit) — c8 успевает записать покрытие.
      child.on('exit', () => { fs.rmSync(dir, { recursive: true, force: true }); resolve(); });
      child.kill('SIGTERM');
    }),
  };
}

function json(body, headers = {}) {
  return { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) };
}

const bearer = token => ({ Authorization: `Bearer ${token}` });

module.exports = { API_KEY, startServer, json, bearer };
