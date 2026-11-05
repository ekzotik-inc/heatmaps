// Журнал действий и версии данных для страницы «Админ» (решение владельца
// 06.11.2026: «логи действий всех учёток, видимость ошибок, откат последних
// обновлений»).
//
// Журнал — записи { id, at, username, action, map, level, status, count,
// detail }. Одинаковые подряд записи (тот же человек, действие, карта, итог)
// в течение LOG_MERGE_MS склеиваются в одну со счётчиком: автосохранение карты
// иначе забило бы журнал сотнями строк. Хранится последние LOG_MAX записей.
//
// Версии — копия данных (состояние карты, общие слои) ПЕРЕД изменением,
// сжатая gzip. Изменение данных (точки, слои, зоны, карты общего слоя) —
// всегда своя версия, её можно отменить прямо из строки журнала; прочие
// сохранения (вид карты) одного человека в пределах gapMs — одна версия.
// На ключ хранится versionsKeep версий.
//
// PostgreSQL — таблицы audit_log и state_versions; без базы — файлы в
// DATA_DIR (audit.json и каталог versions/).
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const LOG_MAX = 5000;
const LOG_MERGE_MS = 5 * 60 * 1000;

function createJournal({ getDb, dataDir, gapMs = 10 * 60 * 1000, versionsKeep = 20 }) {
  const auditFile = path.join(dataDir, 'audit.json');
  const versionsDir = path.join(dataDir, 'versions');
  const versionsIndex = path.join(versionsDir, 'index.json');
  let fileLog = null;          // без базы: записи в памяти + файл
  let fileTimer = null;
  let nextId = 1;
  const lastByKey = new Map();  // ключ склейки → { id, at }
  let chain = Promise.resolve();
  const queue = fn => { const run = chain.then(fn); chain = run.catch(() => {}); return run; };

  async function init() {
    const db = getDb();
    if (db) {
      await db.query(`CREATE TABLE IF NOT EXISTS audit_log (
        id BIGSERIAL PRIMARY KEY, at TEXT NOT NULL, username TEXT NOT NULL DEFAULT '', action TEXT NOT NULL,
        map TEXT NOT NULL DEFAULT '', level TEXT NOT NULL DEFAULT 'info', status INT NOT NULL DEFAULT 0,
        count INT NOT NULL DEFAULT 1, detail TEXT NOT NULL DEFAULT '{}')`);
      await db.query(`CREATE TABLE IF NOT EXISTS state_versions (
        id BIGSERIAL PRIMARY KEY, key TEXT NOT NULL, at TEXT NOT NULL, saved_at TEXT NOT NULL DEFAULT '',
        username TEXT NOT NULL DEFAULT '', reason TEXT NOT NULL DEFAULT '', bytes INT NOT NULL DEFAULT 0,
        summary TEXT NOT NULL DEFAULT '{}', data BYTEA NOT NULL)`);
      await db.query('CREATE INDEX IF NOT EXISTS state_versions_key ON state_versions (key, id)');
      return;
    }
    try { fileLog = JSON.parse(fs.readFileSync(auditFile, 'utf8')); } catch (_) { fileLog = []; }
    if (!Array.isArray(fileLog)) fileLog = [];
    nextId = fileLog.reduce((a, e) => Math.max(a, e.id || 0), 0) + 1;
  }
  function flushFile() {
    clearTimeout(fileTimer);
    fileTimer = setTimeout(() => {
      try { fs.writeFileSync(auditFile + '.tmp', JSON.stringify(fileLog)); fs.renameSync(auditFile + '.tmp', auditFile); } catch (_) {}
    }, 500);
    if (fileTimer.unref) fileTimer.unref();
  }

  // Записать событие. Ошибки журнала никогда не ломают сам запрос.
  function add({ username = '', action, map = '', level = 'info', status = 0, detail = {} }) {
    const at = new Date().toISOString();
    const key = [username, action, map, level, status, detail.error || '', detail.key || '', detail.username || '', detail.change || '', detail.version || ''].join('|');
    return queue(async () => {
      const db = getDb();
      const last = lastByKey.get(key);
      if (last && Date.now() - last.t < LOG_MERGE_MS) {
        last.t = Date.now();
        if (db) await db.query('UPDATE audit_log SET at = $1, count = count + 1 WHERE id = $2', [at, last.id]);
        else { const e = fileLog.find(x => x.id === last.id); if (e) { e.at = at; e.count++; flushFile(); } }
        return;
      }
      const json = JSON.stringify(detail || {});
      let id;
      if (db) {
        id = (await db.query(`INSERT INTO audit_log (at, username, action, map, level, status, detail)
          VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`, [at, username, action, map, level, status, json])).rows[0].id;
        if (Number(id) % 100 === 0) await db.query('DELETE FROM audit_log WHERE id <= $1', [Number(id) - LOG_MAX]);
      } else {
        id = nextId++;
        fileLog.push({ id, at, username, action, map, level, status, count: 1, detail: json });
        if (fileLog.length > LOG_MAX) fileLog.splice(0, fileLog.length - LOG_MAX);
        flushFile();
      }
      lastByKey.set(key, { id: Number(id), t: Date.now() });
      if (lastByKey.size > 500) lastByKey.delete(lastByKey.keys().next().value);
    }).catch(e => console.warn('Journal write failed:', e.message));
  }

  // Последние записи, свежие сверху по времени последнего повтора (склеенная
  // строка поднимается наверх). before — время, с которого листать дальше.
  async function list({ before = 0, limit = 100, level = '', username = '' } = {}) {
    const db = getDb();
    const lim = Math.max(1, Math.min(Number(limit) || 100, 500));
    let rows;
    if (db) {
      const where = [], args = [];
      if (before) { args.push(String(before)); where.push(`at < $${args.length}`); }
      if (level) { args.push(level); where.push(`level = $${args.length}`); }
      if (username) { args.push(username); where.push(`username = $${args.length}`); }
      args.push(lim);
      rows = (await db.query(`SELECT id, at, username, action, map, level, status, count, detail FROM audit_log
        ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY at DESC, id DESC LIMIT $${args.length}`, args)).rows;
    } else {
      rows = fileLog.filter(e => (!before || e.at < String(before)) && (!level || e.level === level) && (!username || e.username === username))
        .sort((x, y) => (y.at < x.at ? -1 : y.at > x.at ? 1 : y.id - x.id)).slice(0, lim);
    }
    return rows.map(r => ({ ...r, id: Number(r.id), count: Number(r.count), status: Number(r.status), detail: safeParse(r.detail) }));
  }
  async function countSince(level, sinceIso) {
    const db = getDb();
    if (db) return Number((await db.query('SELECT COALESCE(SUM(count),0) AS n FROM audit_log WHERE level = $1 AND at >= $2', [level, sinceIso])).rows[0].n);
    return fileLog.filter(e => e.level === level && e.at >= sinceIso).reduce((a, e) => a + e.count, 0);
  }

  /* ── Версии ───────────────────────────────────────────────────────── */
  function readIndex() { try { return JSON.parse(fs.readFileSync(versionsIndex, 'utf8')); } catch (_) { return []; } }
  function writeIndex(list) {
    fs.mkdirSync(versionsDir, { recursive: true });
    fs.writeFileSync(versionsIndex + '.tmp', JSON.stringify(list)); fs.renameSync(versionsIndex + '.tmp', versionsIndex);
  }
  async function lastVersion(key) {
    const db = getDb();
    if (db) {
      const r = await db.query('SELECT id, at, username FROM state_versions WHERE key = $1 ORDER BY id DESC LIMIT 1', [key]);
      return r.rows[0] || null;
    }
    return readIndex().filter(v => v.key === key).pop() || null;
  }
  // Сохранить данные ПЕРЕД изменением. force — всегда (откат), иначе серия
  // правок одного человека в пределах gapMs даёт одну версию.
  function save(key, data, { username = '', reason = 'change', force = false, summary = {} } = {}) {
    if (!data) return Promise.resolve(false);
    return queue(async () => {
      const last = await lastVersion(key);
      if (!force && last && last.username === username && Date.now() - Date.parse(last.at) < gapMs) return false;
      const gz = zlib.gzipSync(JSON.stringify(data));
      const at = new Date().toISOString(), savedAt = String(data._savedAt || '');
      const db = getDb();
      if (db) {
        const id = (await db.query(`INSERT INTO state_versions (key, at, saved_at, username, reason, bytes, summary, data)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`, [key, at, savedAt, username, reason, gz.length, JSON.stringify(summary), gz])).rows[0].id;
        await db.query(`DELETE FROM state_versions WHERE key = $1 AND id NOT IN
          (SELECT id FROM state_versions WHERE key = $1 ORDER BY id DESC LIMIT $2)`, [key, versionsKeep]);
        return Number(id);
      }
      const list = readIndex();
      const id = list.reduce((a, v) => Math.max(a, v.id), 0) + 1;
      fs.mkdirSync(versionsDir, { recursive: true });
      fs.writeFileSync(path.join(versionsDir, `${id}.gz`), gz);
      list.push({ id, key, at, saved_at: savedAt, username, reason, bytes: gz.length, summary: JSON.stringify(summary) });
      const mine = list.filter(v => v.key === key);
      const drop = new Set(mine.slice(0, Math.max(0, mine.length - versionsKeep)).map(v => v.id));
      drop.forEach(d => fs.rmSync(path.join(versionsDir, `${d}.gz`), { force: true }));
      writeIndex(list.filter(v => !drop.has(v.id)));
      return id;
    }).catch(e => { console.warn('Version save failed:', e.message); return false; });
  }
  async function listVersions(key) {
    const db = getDb();
    let rows;
    if (db) {
      rows = (await db.query(`SELECT id, key, at, saved_at, username, reason, bytes, summary FROM state_versions
        ${key ? 'WHERE key = $1' : ''} ORDER BY id DESC LIMIT 200`, key ? [key] : [])).rows;
    } else {
      rows = readIndex().filter(v => !key || v.key === key).reverse().slice(0, 200);
    }
    return rows.map(r => ({ id: Number(r.id), key: r.key, at: r.at, savedAt: r.saved_at, username: r.username, reason: r.reason, bytes: Number(r.bytes), summary: safeParse(r.summary) }));
  }
  async function getVersion(id) {
    const db = getDb();
    if (db) {
      const r = await db.query('SELECT id, key, data FROM state_versions WHERE id = $1', [Number(id)]);
      if (!r.rows.length) return null;
      return { id: Number(r.rows[0].id), key: r.rows[0].key, data: JSON.parse(zlib.gunzipSync(r.rows[0].data).toString('utf8')) };
    }
    const meta = readIndex().find(v => v.id === Number(id));
    if (!meta) return null;
    try { return { id: meta.id, key: meta.key, data: JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(versionsDir, `${meta.id}.gz`))).toString('utf8')) }; } catch (_) { return null; }
  }
  async function dropVersions(key) {
    const db = getDb();
    if (db) { await db.query('DELETE FROM state_versions WHERE key = $1', [key]); return; }
    const list = readIndex();
    list.filter(v => v.key === key).forEach(v => fs.rmSync(path.join(versionsDir, `${v.id}.gz`), { force: true }));
    writeIndex(list.filter(v => v.key !== key));
  }
  async function versionsBytes() {
    const db = getDb();
    if (db) return Number((await db.query('SELECT COALESCE(SUM(bytes),0) AS b FROM state_versions')).rows[0].b);
    return readIndex().reduce((a, v) => a + (v.bytes || 0), 0);
  }
  const settle = () => chain;
  return { init, add, list, countSince, save, listVersions, getVersion, dropVersions, versionsBytes, settle };
}
function safeParse(t) { try { return JSON.parse(t || '{}'); } catch (_) { return {}; } }

module.exports = { createJournal, LOG_MAX, LOG_MERGE_MS };
