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

const PORT    = parseInt(process.env.PORT    || '3001', 10);
const API_KEY = process.env.API_KEY || '';
const ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',').map(s => s.trim()).filter(Boolean);

const STATE_FILE = path.join(__dirname, 'state.json');

if (!API_KEY || API_KEY === 'change_me_to_something_secret') {
  console.warn('\n⚠️  WARNING: API_KEY is not set or is the default placeholder.');
  console.warn('   Anyone who knows your server URL can overwrite the state.');
  console.warn('   Set a strong API_KEY in server/.env\n');
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function readState() {
  try {
    if (fs.existsSync(STATE_FILE)) return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch (e) {
    console.error('Failed to read state.json:', e.message);
  }
  return null;
}

function writeState(data) {
  // Atomic write: write to tmp, then rename
  const tmp = STATE_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data), 'utf8');
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

app.use(express.json({ limit: '10mb' })); // state can include uploaded layer data

// Health check
app.get('/health', (_req, res) => {
  res.json({ ok: true, ts: new Date().toISOString() });
});

// GET /state — returns current shared state (no auth required to read)
app.get('/state', (_req, res) => {
  const state = readState();
  if (!state) return res.json({ empty: true });
  res.json(state);
});

// POST /state — saves new state (auth required)
app.post('/state', (req, res) => {
  if (!verifyKey(req)) {
    return res.status(401).json({ error: 'Invalid or missing X-API-Key header' });
  }
  const body = req.body;
  if (!body || body._app !== 'hm-br') {
    return res.status(400).json({ error: 'Invalid state object (missing _app marker)' });
  }
  body._savedAt = new Date().toISOString();
  try {
    writeState(body);
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
server.listen(PORT, () => {
  console.log(`\n🗺  Heat Map state server running on port ${PORT}`);
  console.log(`   GET  http://localhost:${PORT}/state  — read shared state`);
  console.log(`   POST http://localhost:${PORT}/state  — write state (requires X-API-Key)`);
  console.log(`   GET  http://localhost:${PORT}/health — health check\n`);
});

// Graceful shutdown
process.on('SIGTERM', () => { server.close(() => process.exit(0)); });
process.on('SIGINT',  () => { server.close(() => process.exit(0)); });
