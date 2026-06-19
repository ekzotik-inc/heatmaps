'use strict';

// ---------------------------------------------------------------------------
// Minimal deps — no build step required, just: npm install && node server.js
// ---------------------------------------------------------------------------
const fs      = require('fs');
const path    = require('path');
const http    = require('http');
const express = require('express');
const cors    = require('cors');

// ---------------------------------------------------------------------------
// Config — read from .env file manually (no dotenv dep needed)
// ---------------------------------------------------------------------------
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8')
    .split('\n')
    .forEach(line => {
      const m = line.match(/^([^#=\s][^=]*)=(.*)$/);
      if (m) process.env[m[1].trim()] = m[2].trim();
    });
}

const PORT         = parseInt(process.env.PORT    || '3001', 10);
const API_KEY      = process.env.API_KEY || '';
const DATABASE_URL = process.env.DATABASE_URL || '';
const ORIGINS      = (process.env.ALLOWED_ORIGINS || '')
  .split(',').map(s => s.trim()).filter(Boolean);

const STATE_FILE = path.join(__dirname, 'state.json');

if (!API_KEY || API_KEY === 'change_me_to_something_secret') {
  console.warn('\n⚠️  WARNING: API_KEY is not set or is the default placeholder.');
  console.warn('   Anyone who knows your server URL can overwrite the state.');
  console.warn('   Set a strong API_KEY in server/.env\n');
}

// ---------------------------------------------------------------------------
// Storage — PostgreSQL (persistent) or file fallback (ephemeral on Render)
// ---------------------------------------------------------------------------
let db = null; // pg client

async function initDb() {
  if (!DATABASE_URL) return;
  const { Client } = require('pg');
  db = new Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await db.connect();
  await db.query(`
    CREATE TABLE IF NOT EXISTS app_state (
      key TEXT PRIMARY KEY,
      json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  console.log('✅  PostgreSQL connected — state will persist across restarts');
}

async function readState() {
  if (db) {
    try {
      const r = await db.query("SELECT json FROM app_state WHERE key = 'main'");
      if (r.rows.length === 0) return null;
      return JSON.parse(r.rows[0].json);
    } catch (e) {
      console.error('DB read error:', e.message);
      return null;
    }
  }
  // Fallback: file-based (ephemeral on Render free tier)
  try {
    if (fs.existsSync(STATE_FILE)) return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch (e) {
    console.error('Failed to read state.json:', e.message);
  }
  return null;
}

async function writeState(data) {
  const json = JSON.stringify(data);
  if (db) {
    await db.query(
      `INSERT INTO app_state (key, json, updated_at)
       VALUES ('main', $1, $2)
       ON CONFLICT (key) DO UPDATE SET json = $1, updated_at = $2`,
      [json, new Date().toISOString()]
    );
    return;
  }
  // Fallback: atomic file write
  const tmp = STATE_FILE + '.tmp';
  fs.writeFileSync(tmp, json, 'utf8');
  fs.renameSync(tmp, STATE_FILE);
}

function verifyKey(req) {
  if (!API_KEY) return true; // no key configured — open (warn at startup)
  const header = req.headers['x-api-key'] || '';
  return header === API_KEY;
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------
const app = express();

// CORS
app.use(cors({
  origin: (origin, cb) => {
    // Allow requests with no origin (curl, Postman, same-origin)
    if (!origin) return cb(null, true);
    if (ORIGINS.length === 0 || ORIGINS.includes(origin)) return cb(null, true);
    cb(new Error(`CORS: origin ${origin} not allowed`));
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'X-API-Key'],
}));

app.use(express.json({ limit: '50mb' })); // state can include uploaded layer data

// Health check
app.get('/health', (_req, res) => {
  res.json({ ok: true, ts: new Date().toISOString(), storage: db ? 'postgresql' : 'file' });
});

// GET /state — returns current shared state (no auth required to read)
app.get('/state', async (_req, res) => {
  const state = await readState();
  if (!state) return res.json({ empty: true });
  res.json(state);
});

// POST /state — saves new state (auth required)
app.post('/state', async (req, res) => {
  if (!verifyKey(req)) {
    return res.status(401).json({ error: 'Invalid or missing X-API-Key header' });
  }
  const body = req.body;
  if (!body || body._app !== 'hm-br') {
    return res.status(400).json({ error: 'Invalid state object (missing _app marker)' });
  }
  body._savedAt = new Date().toISOString();
  try {
    await writeState(body);
    res.json({ ok: true, savedAt: body._savedAt });
  } catch (e) {
    console.error('Write error:', e.message);
    res.status(500).json({ error: 'Failed to write state' });
  }
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
const server = http.createServer(app);

initDb()
  .catch(e => {
    console.error('Failed to connect to PostgreSQL, falling back to file storage:', e.message);
    db = null;
  })
  .then(() => {
    server.listen(PORT, () => {
      console.log(`\n🗺  Heat Map state server running on port ${PORT}`);
      console.log(`   Storage: ${db ? 'PostgreSQL (persistent)' : 'File (state.json — ephemeral on Render free tier!)'}`);
      console.log(`   GET  http://localhost:${PORT}/state  — read shared state`);
      console.log(`   POST http://localhost:${PORT}/state  — write state (requires X-API-Key)`);
      console.log(`   GET  http://localhost:${PORT}/health — health check\n`);
    });
  });

// Graceful shutdown
process.on('SIGTERM', () => { if (db) db.end(); server.close(() => process.exit(0)); });
process.on('SIGINT',  () => { if (db) db.end(); server.close(() => process.exit(0)); });
