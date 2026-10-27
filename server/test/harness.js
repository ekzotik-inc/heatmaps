// Запуск настоящего server.js для тестов: свободный порт, временная папка
// данных (HM_DATA_DIR), учётки с паролями из теста. Рядом с server.js и в
// боевые хранилища ничего не пишется.
//
// HM_TEST_STORAGE=pg + HM_TEST_PG_URL — те же тесты на PostgreSQL, как на
// Render: каждый сервер получает свою чистую базу, файлы state.*.json,
// которыми тест засевает папку, импортируются в app_state.
const { spawn } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');

// HM_TEST_SERVER_JS — другой server.js (mutator подкладывает изменённую копию
// в свою папку и запускает тесты оттуда).
const SERVER = process.env.HM_TEST_SERVER_JS ? path.resolve(process.env.HM_TEST_SERVER_JS) : path.join(__dirname, '..', 'server.js');
const PG_URL = process.env.HM_TEST_STORAGE === 'pg' ? process.env.HM_TEST_PG_URL : '';
if (process.env.HM_TEST_STORAGE === 'pg' && !PG_URL) throw new Error('HM_TEST_STORAGE=pg needs HM_TEST_PG_URL');
const dbByDir = new Map();
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

function dbUrl(name) {
  const url = new URL(PG_URL);
  url.pathname = '/' + name;
  return url.toString();
}

async function withDb(name, fn) {
  const { Client } = require('pg');
  const client = new Client({ connectionString: dbUrl(name), ssl: { rejectUnauthorized: false } });
  await client.connect();
  try { return await fn(client); } finally { await client.end(); }
}

// Своя база на папку данных; при повторном запуске на той же папке — та же база.
async function databaseFor(dir) {
  if (dbByDir.has(dir)) return { name: dbByDir.get(dir), created: false };
  const name = 'hm_test_' + crypto.randomBytes(6).toString('hex');
  await withDb(new URL(PG_URL).pathname.slice(1) || 'postgres', c => c.query(`CREATE DATABASE ${name}`));
  await withDb(name, async c => {
    await c.query('CREATE TABLE app_state (key TEXT PRIMARY KEY, json TEXT NOT NULL, updated_at TEXT NOT NULL)');
    for (const f of fs.readdirSync(dir)) {
      const m = f.match(/^state\.(.+)\.json$/);
      if (m) await c.query('INSERT INTO app_state VALUES ($1, $2, $3)', [m[1], fs.readFileSync(path.join(dir, f), 'utf8'), new Date().toISOString()]);
    }
  });
  dbByDir.set(dir, name);
  return { name, created: true };
}

async function dropDatabase(name) {
  await withDb(new URL(PG_URL).pathname.slice(1) || 'postgres', c => c.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`));
}

// users: { login: { role, password } }. opts.dir — запустить на уже
// существующей папке данных (проверка перезапуска); её тогда не удаляем.
async function startServer(users, extraEnv = {}, opts = {}) {
  const dir = opts.dir || fs.mkdtempSync(path.join(os.tmpdir(), 'hm-server-test-'));
  const pg = PG_URL ? await databaseFor(dir) : null;
  if (pg && !('DATABASE_URL' in extraEnv)) extraEnv = { ...extraEnv, DATABASE_URL: dbUrl(pg.name) };
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
  const exited = () => new Promise(resolve => {
    child.removeAllListeners('exit');
    child.on('exit', resolve);
    // Выход по SIGTERM штатный (process.exit) — c8 успевает записать покрытие.
    child.kill('SIGTERM');
  });
  return {
    base,
    dir,
    storage: pg ? 'postgresql' : 'file',
    log: () => log,
    request: (p, init = {}) => fetch(base + p, { redirect: 'manual', ...init }),
    // Есть ли сохранённое состояние под ключом — в файле или в строке базы.
    stored: key => (pg
      ? withDb(pg.name, async c => (await c.query('SELECT 1 FROM app_state WHERE key = $1', [key])).rows.length > 0)
      : fs.existsSync(path.join(dir, `state.${key}.json`))),
    photoCount: () => (pg
      ? withDb(pg.name, async c => Number((await c.query('SELECT count(*) AS n FROM photos')).rows[0].n))
      : (fs.existsSync(path.join(dir, 'photos')) ? fs.readdirSync(path.join(dir, 'photos')).length : 0)),
    stop: async () => {
      await exited();
      if (pg && pg.created) { await dropDatabase(pg.name); dbByDir.delete(dir); }
      if (!opts.dir) fs.rmSync(dir, { recursive: true, force: true });
    },
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
