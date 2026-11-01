// met-tv-telemetry: tiny logging/analytics API for the "Met Opera" LG webOS app (com.peasanttech.metopera).
// Storage: D1 (binding DB). Secrets: INGEST_KEY (X-Met-Key, embedded in the app), READ_TOKEN (Bearer, for reads).
const MAX_BODY = 64 * 1024;
const MAX_EVENTS = 100;
const RETAIN_MS = 30 * 24 * 3600 * 1000;
const RL_WINDOW_MS = 60 * 1000;   // per-device fixed window
const RL_MAX_REQS = 30;           // requests per device per minute
const RL_MAX_EVENTS = 600;        // events per device per minute
const TYPES = ['error', 'warn', 'console', 'lifecycle', 'usage'];
const MAX_REPORT_BODY = 1536 * 1024;   // problem reports (DOM snapshot): <= 1.5 MB on the wire (gzip or JSON)
const MAX_REPORT_RAW = 6 * 1024 * 1024; // <= 6 MB once decompressed; stored gzip-compressed
const REPORT_RL_HOUR = 12;              // reports per device per hour
const SENSITIVE_KEY = /^(password|passwd|pass|pwd|token|access_?token|refresh_?token|id_?token|secret|authorization|cookie|creds?|credentials|p)$/i;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Met-Key, Authorization',
  'Access-Control-Max-Age': '86400',
};

function json(obj, status = 200, extra = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...CORS, ...extra },
  });
}

function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || !b) return false;
  let diff = a.length ^ b.length;
  for (let i = 0; i < b.length; i++) diff |= (a.charCodeAt(i % (a.length || 1)) || 0) ^ b.charCodeAt(i);
  return diff === 0;
}

// ---- privacy scrubbing ----
function redactString(s) {
  if (typeof s !== 'string' || !s) return s;
  return s
    // the app's saved-credentials payload: {"u":"...","p":"..."} (possibly JSON-escaped inside another string)
    .replace(/\{\s*\\*"u\\*"\s*:\s*\\*"(?:[^"\\]|\\.)*?\\*"\s*,\s*\\*"p\\*"\s*:\s*\\*"(?:[^"\\]|\\.)*?\\*"\s*\}/g, '[redacted-creds]')
    .replace(/(mtv\.creds\\*["']?\s*[:=,]\s*)(\S+)/gi, '$1[redacted]')
    // key=value / "key":"value" forms
    .replace(/((?:password|passwd|pass|pwd|token|access_token|refresh_token|secret)\\*["']?\s*[:=]\s*\\*["']?)([^"'&\s,;}\\]+)/gi, '$1[redacted]')
    .replace(/(Bearer\s+)[A-Za-z0-9._~+\/=-]+/g, '$1[redacted]');
}

function scrub(v, depth = 0) {
  if (depth > 6) return '[depth]';
  if (typeof v === 'string') return redactString(v.slice(0, 2000));
  if (Array.isArray(v)) return v.slice(0, 50).map((x) => scrub(x, depth + 1));
  if (v && typeof v === 'object') {
    const out = {};
    let n = 0;
    for (const k of Object.keys(v)) {
      if (n++ >= 50) break;
      out[k] = SENSITIVE_KEY.test(k) ? '[redacted]' : scrub(v[k], depth + 1);
    }
    return out;
  }
  return v;
}

function str(v, max) {
  if (v === undefined || v === null) return null;
  if (typeof v !== 'string') v = typeof v === 'object' ? JSON.stringify(v) : String(v);
  return redactString(v.slice(0, max));
}
function int(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function engineFromUA(ua) {
  if (!ua) return null;
  const chrome = /Chrome\/(\d+)/.exec(ua);
  const webos = /Web0S|webOS|WebOS/.test(ua);
  if (chrome) return (webos ? 'webOS ' : '') + 'Chrome ' + chrome[1];
  const wk = /AppleWebKit\/(\d+)/.exec(ua);
  if (wk) return (webos ? 'webOS ' : '') + 'WebKit ' + wk[1];
  return ua.slice(0, 40);
}

// ---- ingest ----
async function ingest(request, env, url) {
  const key = request.headers.get('X-Met-Key') || url.searchParams.get('k'); // ?k= for sendBeacon (no custom headers)
  if (!safeEqual(key || '', env.INGEST_KEY)) return json({ ok: false, error: 'bad ingest key' }, 401);

  const cl = Number(request.headers.get('Content-Length') || 0);
  if (cl > MAX_BODY) return json({ ok: false, error: 'payload too large', max: MAX_BODY }, 413);
  const buf = await request.arrayBuffer();
  if (buf.byteLength > MAX_BODY) return json({ ok: false, error: 'payload too large', max: MAX_BODY }, 413);

  let body;
  try { body = JSON.parse(new TextDecoder().decode(buf)); } catch (e) { return json({ ok: false, error: 'invalid JSON' }, 400); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ ok: false, error: 'body must be an object' }, 400);

  const deviceId = typeof body.deviceId === 'string' ? body.deviceId.trim().slice(0, 64) : '';
  if (!/^[A-Za-z0-9._:-]{4,64}$/.test(deviceId)) return json({ ok: false, error: 'deviceId required (4-64 chars [A-Za-z0-9._:-])' }, 400);
  if (!Array.isArray(body.events) || body.events.length === 0) return json({ ok: false, error: 'events[] required' }, 400);
  if (body.events.length > MAX_EVENTS) return json({ ok: false, error: 'too many events', max: MAX_EVENTS }, 413);

  const now = Date.now();
  const win = Math.floor(now / RL_WINDOW_MS);
  const rl = await env.DB.prepare(
    `INSERT INTO rate (device_id, win, reqs, evts) VALUES (?1, ?2, 1, ?3)
     ON CONFLICT(device_id, win) DO UPDATE SET reqs = reqs + 1, evts = evts + ?3
     RETURNING reqs, evts`
  ).bind(deviceId, win, body.events.length).first();
  if (rl && (rl.reqs > RL_MAX_REQS || rl.evts > RL_MAX_EVENTS)) {
    const retry = Math.ceil(((win + 1) * RL_WINDOW_MS - now) / 1000);
    return json({ ok: false, error: 'rate limited', retryAfter: retry }, 429, { 'Retry-After': String(retry) });
  }

  const ua = str(body.ua || request.headers.get('User-Agent'), 300);
  const engine = str(body.engine, 60) || engineFromUA(ua);
  const appVersion = str(body.appVersion, 32);
  const sessionId = str(body.sessionId, 64);
  const country = (request.cf && request.cf.country) || null;

  const stmt = env.DB.prepare(
    `INSERT INTO events (received_at, ts, device_id, session_id, app_version, engine, ua, country, type, message, source, line, col, stack, url, data)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)`
  );
  const batch = [];
  let rejected = 0;
  for (const ev of body.events) {
    if (!ev || typeof ev !== 'object' || !TYPES.includes(ev.type)) { rejected++; continue; }
    let ts = int(ev.ts);
    if (ts !== null && ts < 1e12) ts = ts * 1000;           // accept seconds
    if (ts === null || ts > now + 86400000 || ts < now - RETAIN_MS) ts = now;
    let data = null;
    if (ev.data !== undefined && ev.data !== null) {
      data = JSON.stringify(scrub(ev.data));
      if (data.length > 4000) data = JSON.stringify({ truncated: true, head: data.slice(0, 3900) });
    }
    batch.push(stmt.bind(
      now, ts, deviceId, sessionId, appVersion, engine, ua, country, ev.type,
      str(ev.message, 2000), str(ev.source, 300), int(ev.line), int(ev.col),
      str(ev.stack, 4000), str(ev.url, 500), data
    ));
  }
  if (batch.length) await env.DB.batch(batch);
  return json({ ok: true, accepted: batch.length, rejected });
}

// ---- reads ----
function authRead(request, env) {
  const h = request.headers.get('Authorization') || '';
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return !!m && safeEqual(m[1].trim(), env.READ_TOKEN);
}

function parseTime(v, dflt) {
  if (!v) return dflt;
  if (/^\d+$/.test(v)) { const n = Number(v); return n < 1e12 ? n * 1000 : n; }
  const rel = /^(\d+)([mhd])$/.exec(v);          // e.g. 15m, 6h, 7d
  if (rel) return Date.now() - Number(rel[1]) * { m: 60e3, h: 3600e3, d: 86400e3 }[rel[2]];
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : dflt;
}

async function listEvents(env, url) {
  const q = url.searchParams;
  const since = parseTime(q.get('since'), Date.now() - 24 * 3600e3);
  const until = parseTime(q.get('until'), Date.now() + 60e3);
  const limit = Math.min(Math.max(int(q.get('limit')) || 100, 1), 500);
  const where = ['received_at >= ?', 'received_at <= ?'];
  const args = [since, until];
  if (q.get('type')) {
    const types = q.get('type').split(',').filter((t) => TYPES.includes(t));
    if (types.length) { where.push(`type IN (${types.map(() => '?').join(',')})`); args.push(...types); }
  }
  for (const [p, col] of [['deviceId', 'device_id'], ['sessionId', 'session_id'], ['appVersion', 'app_version']]) {
    if (q.get(p)) { where.push(`${col} = ?`); args.push(q.get(p)); }
  }
  if (q.get('q')) { where.push('(message LIKE ? OR stack LIKE ?)'); args.push('%' + q.get('q') + '%', '%' + q.get('q') + '%'); }
  const order = q.get('order') === 'asc' ? 'ASC' : 'DESC';
  args.push(limit);
  const { results } = await env.DB.prepare(
    `SELECT id, received_at, ts, device_id, session_id, app_version, engine, country, type, message, source, line, col, stack, url, data
     FROM events WHERE ${where.join(' AND ')} ORDER BY id ${order} LIMIT ?`
  ).bind(...args).all();
  for (const r of results) {
    r.time = new Date(r.ts).toISOString();
    if (r.data) { try { r.data = JSON.parse(r.data); } catch (e) { /* keep string */ } }
  }
  return json({ ok: true, since: new Date(since).toISOString(), count: results.length, events: results });
}

async function summary(env, url) {
  const since = parseTime(url.searchParams.get('since'), Date.now() - 7 * 86400e3);
  const day = Date.now() - 86400e3;
  const [byType, byType24, latestErrors, sessions, versions, engines, devices, totals] = await env.DB.batch([
    env.DB.prepare('SELECT type, COUNT(*) AS n FROM events WHERE received_at >= ? GROUP BY type ORDER BY n DESC').bind(since),
    env.DB.prepare('SELECT type, COUNT(*) AS n FROM events WHERE received_at >= ? GROUP BY type ORDER BY n DESC').bind(day),
    env.DB.prepare(`SELECT id, ts, device_id, session_id, app_version, engine, message, source, line, col, url,
                    substr(stack, 1, 600) AS stack FROM events WHERE type = 'error' AND received_at >= ? ORDER BY id DESC LIMIT 20`).bind(since),
    env.DB.prepare(`SELECT session_id, device_id, app_version, engine, MIN(ts) AS first_ts, MAX(ts) AS last_ts, COUNT(*) AS events,
                    SUM(type = 'error') AS errors, SUM(type = 'warn') AS warns
                    FROM events WHERE received_at >= ? GROUP BY session_id, device_id ORDER BY last_ts DESC LIMIT 25`).bind(since),
    env.DB.prepare(`SELECT app_version, COUNT(*) AS events, COUNT(DISTINCT session_id) AS sessions, SUM(type='error') AS errors, MAX(ts) AS last_ts
                    FROM events WHERE received_at >= ? GROUP BY app_version ORDER BY last_ts DESC`).bind(since),
    env.DB.prepare(`SELECT engine, COUNT(*) AS events, COUNT(DISTINCT session_id) AS sessions, MAX(ts) AS last_ts
                    FROM events WHERE received_at >= ? GROUP BY engine ORDER BY last_ts DESC`).bind(since),
    env.DB.prepare(`SELECT device_id, COUNT(*) AS events, COUNT(DISTINCT session_id) AS sessions, MAX(ts) AS last_ts, MAX(app_version) AS app_version
                    FROM events WHERE received_at >= ? GROUP BY device_id ORDER BY last_ts DESC LIMIT 25`).bind(since),
    env.DB.prepare('SELECT COUNT(*) AS events, COUNT(DISTINCT session_id) AS sessions, COUNT(DISTINCT device_id) AS devices, MIN(received_at) AS oldest FROM events'),
  ]);
  const iso = (rows, keys) => rows.results.map((r) => { for (const k of keys) if (r[k]) r[k + '_iso'] = new Date(r[k]).toISOString(); return r; });
  const counts = (rows) => Object.fromEntries(rows.results.map((r) => [r.type, r.n]));
  return json({
    ok: true,
    since: new Date(since).toISOString(),
    countsByType: counts(byType),
    countsByTypeLast24h: counts(byType24),
    latestErrors: iso(latestErrors, ['ts']),
    sessions: iso(sessions, ['first_ts', 'last_ts']),
    appVersions: iso(versions, ['last_ts']),
    engineVersions: iso(engines, ['last_ts']),
    devices: iso(devices, ['last_ts']),
    allTime: totals.results[0],
    retentionDays: RETAIN_MS / 86400e3,
  });
}

// ---- problem reports (DOM / player snapshots) ----
function redactDeep(text) {
  // Second safety net (the app already sanitizes): e-mails, JWTs, bearer tokens, credential payloads, input values.
  return redactString(text)
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[email]')
    .replace(/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, '[jwt]')
    .replace(/(\svalue=\\?")[^"\\]*(\\?")/gi, '$1$2');
}
async function gzip(text) {
  const cs = new CompressionStream('gzip');
  const stream = new Blob([text]).stream().pipeThrough(cs);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
async function gunzip(bytes) {
  const ds = new DecompressionStream('gzip');
  const stream = new Blob([bytes]).stream().pipeThrough(ds);
  return await new Response(stream).text();
}
async function ingestReport(request, env, url) {
  const key = request.headers.get('X-Met-Key') || url.searchParams.get('k');
  if (!safeEqual(key || '', env.INGEST_KEY)) return json({ ok: false, error: 'bad ingest key' }, 401);
  const cl = Number(request.headers.get('Content-Length') || 0);
  if (cl > MAX_REPORT_BODY) return json({ ok: false, error: 'payload too large', max: MAX_REPORT_BODY }, 413);
  const buf = await request.arrayBuffer();
  if (buf.byteLength > MAX_REPORT_BODY) return json({ ok: false, error: 'payload too large', max: MAX_REPORT_BODY }, 413);
  const u8 = new Uint8Array(buf);
  let text;
  if (u8.length > 2 && u8[0] === 0x1f && u8[1] === 0x8b) {
    try { text = await gunzip(u8); } catch (e) { return json({ ok: false, error: 'bad gzip' }, 400); }
  } else text = new TextDecoder().decode(u8);
  if (text.length > MAX_REPORT_RAW) return json({ ok: false, error: 'payload too large (decompressed)', max: MAX_REPORT_RAW }, 413);
  let body;
  try { body = JSON.parse(text); } catch (e) { return json({ ok: false, error: 'invalid JSON' }, 400); }
  const deviceId = typeof body.deviceId === 'string' ? body.deviceId.trim().slice(0, 64) : '';
  if (!/^[A-Za-z0-9._:-]{4,64}$/.test(deviceId)) return json({ ok: false, error: 'deviceId required' }, 400);
  const now = Date.now();
  const win = Math.floor(now / 3600000);
  const rl = await env.DB.prepare(
    `INSERT INTO rate (device_id, win, reqs, evts) VALUES (?1, ?2, 1, 0)
     ON CONFLICT(device_id, win) DO UPDATE SET reqs = reqs + 1 RETURNING reqs`
  ).bind('R:' + deviceId, win).first();
  if (rl && rl.reqs > REPORT_RL_HOUR) return json({ ok: false, error: 'rate limited (reports per hour)' }, 429, { 'Retry-After': '600' });
  text = redactDeep(text);
  const gz = await gzip(text);
  const ua = str(body.ua || request.headers.get('User-Agent'), 300);
  const kind = str(body.kind, 40) || 'manual';
  const summary = body.summary && typeof body.summary === 'object' ? JSON.stringify(scrub(body.summary)).slice(0, 2000) : null;
  const r = await env.DB.prepare(
    `INSERT INTO reports (received_at, device_id, session_id, app_version, engine, kind, url, summary, size_raw, size_gz, payload)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11) RETURNING id`
  ).bind(now, deviceId, str(body.sessionId, 64), str(body.appVersion, 32), engineFromUA(ua), kind, str(body.url, 500), summary, text.length, gz.byteLength, gz).first();
  // Also visible in the normal event stream.
  await env.DB.prepare(
    `INSERT INTO events (received_at, ts, device_id, session_id, app_version, engine, ua, country, type, message, url, data)
     VALUES (?1, ?1, ?2, ?3, ?4, ?5, ?6, ?7, 'lifecycle', 'problem-report', ?8, ?9)`
  ).bind(now, deviceId, str(body.sessionId, 64), str(body.appVersion, 32), engineFromUA(ua), ua, (request.cf && request.cf.country) || null,
    str(body.url, 500), JSON.stringify({ reportId: r.id, kind, sizeRaw: text.length, sizeGz: gz.byteLength })).run();
  return json({ ok: true, id: r.id, sizeRaw: text.length, sizeGz: gz.byteLength });
}
async function listReports(env, url) {
  const since = parseTime(url.searchParams.get('since'), Date.now() - 7 * 86400e3);
  const limit = Math.min(200, Math.max(1, int(url.searchParams.get('limit')) || 50));
  const dev = url.searchParams.get('deviceId');
  let sql = 'SELECT id, received_at, device_id, session_id, app_version, engine, kind, url, summary, size_raw, size_gz FROM reports WHERE received_at >= ?1';
  const args = [since];
  if (dev) { sql += ' AND device_id = ?2'; args.push(dev); }
  sql += ' ORDER BY id DESC LIMIT ' + limit;
  const rs = await env.DB.prepare(sql).bind(...args).all();
  return json({ ok: true, reports: rs.results.map((r) => ({ ...r, received_at_iso: new Date(r.received_at).toISOString(), summary: r.summary ? JSON.parse(r.summary) : null })) });
}
async function getReport(env, id, url) {
  const r = await env.DB.prepare('SELECT * FROM reports WHERE id = ?1').bind(id).first();
  if (!r) return json({ ok: false, error: 'not found' }, 404);
  const bytes = r.payload instanceof ArrayBuffer ? new Uint8Array(r.payload) : new Uint8Array(r.payload);
  if (url.searchParams.get('raw') === 'gz') {
    return new Response(bytes, { headers: { 'Content-Type': 'application/gzip', 'Content-Disposition': `attachment; filename="report-${id}.json.gz"`, ...CORS } });
  }
  const text = await gunzip(bytes);
  return new Response(text, { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...CORS } });
}

async function cleanup(env) {
  const cutoff = Date.now() - RETAIN_MS;
  const r = await env.DB.batch([
    env.DB.prepare('DELETE FROM events WHERE received_at < ?').bind(cutoff),
    env.DB.prepare("DELETE FROM rate WHERE win < ? AND device_id NOT LIKE 'R:%'").bind(Math.floor(Date.now() / RL_WINDOW_MS) - 60),
    env.DB.prepare('DELETE FROM reports WHERE received_at < ?').bind(cutoff),
    env.DB.prepare("DELETE FROM rate WHERE device_id LIKE 'R:%' AND win < ?").bind(Math.floor(Date.now() / 3600000) - 48),
  ]);
  return { deletedEvents: r[0].meta.changes, deletedRate: r[1].meta.changes + r[3].meta.changes, deletedReports: r[2].meta.changes };
}

// ---- Thumbnails (generated posters for catalog titles without proper Met artwork) ----
// D1 table `thumbs`; public GET (edge-cached via the Cache API), PUT/list with the READ_TOKEN bearer.
const THUMB_RE = /^\/v1\/thumbs\/([a-z0-9-]{1,120})\.jpg$/;
async function getThumb(request, env, ctx, slug) {
  const cache = caches.default;
  const key = new Request(new URL(request.url).origin + '/v1/thumbs/' + slug + '.jpg', { method: 'GET' });
  let hit = await cache.match(key);
  if (hit) return hit;
  const row = await env.DB.prepare('SELECT bytes, etag FROM thumbs WHERE slug = ?').bind(slug).first();
  if (!row) return new Response('not found', { status: 404, headers: { 'Cache-Control': 'public, max-age=300', ...CORS } });
  const res = new Response(new Uint8Array(row.bytes), { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=604800', ETag: '"' + row.etag + '"', ...CORS } });
  ctx.waitUntil(cache.put(key, res.clone()));
  return res;
}
async function putThumb(request, env, ctx, slug) {
  const buf = await request.arrayBuffer();
  const b = new Uint8Array(buf);
  if (b.length < 1000 || b.length > 400000 || b[0] !== 0xff || b[1] !== 0xd8) return json({ ok: false, error: 'expected a JPEG 1-400 KB' }, 400);
  const d = await crypto.subtle.digest('SHA-1', buf);
  const etag = [...new Uint8Array(d)].slice(0, 10).map((x) => x.toString(16).padStart(2, '0')).join('');
  await env.DB.prepare('INSERT INTO thumbs (slug, bytes, etag, size, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(slug) DO UPDATE SET bytes = excluded.bytes, etag = excluded.etag, size = excluded.size, updated_at = excluded.updated_at')
    .bind(slug, buf, etag, b.length, Date.now()).run();
  ctx.waitUntil(caches.default.delete(new Request(new URL(request.url).origin + '/v1/thumbs/' + slug + '.jpg')));
  return json({ ok: true, slug, size: b.length, etag });
}

// ---- Pop-up facts (1.4.0): small per-title JSON documents, source of truth = facts/titles/*.json in the repo ----
// D1 table `facts` (created on first PUT); public GET edge-cached via the Cache API (1 day), PUT with the READ_TOKEN bearer.
const FACT_RE = /^\/v1\/facts\/([a-z0-9-]{1,80})\.json$/;
const FACTS_DDL = 'CREATE TABLE IF NOT EXISTS facts (slug TEXT PRIMARY KEY, json TEXT NOT NULL, etag TEXT, size INTEGER, updated_at INTEGER)';
async function getFacts(request, env, ctx, slug) {
  const cache = caches.default;
  const key = new Request(new URL(request.url).origin + '/v1/facts/' + slug + '.json', { method: 'GET' });
  const hit = await cache.match(key);
  if (hit) return hit;
  let row = null;
  try { row = await env.DB.prepare('SELECT json, etag FROM facts WHERE slug = ?').bind(slug).first(); } catch (e) { row = null; }
  if (!row) return new Response('{"ok":false,"error":"not found"}', { status: 404, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=600', ...CORS } });
  const res = new Response(row.json, { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=86400', ETag: '"' + row.etag + '"', ...CORS } });
  ctx.waitUntil(cache.put(key, res.clone()));
  return res;
}
async function putFacts(request, env, ctx, slug) {
  const text = await request.text();
  if (text.length < 2 || text.length > 200000) return json({ ok: false, error: 'expected JSON up to 200 KB' }, 400);
  try { JSON.parse(text); } catch (e) { return json({ ok: false, error: 'bad JSON' }, 400); }
  const d = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(text));
  const etag = [...new Uint8Array(d)].slice(0, 10).map((x) => x.toString(16).padStart(2, '0')).join('');
  await env.DB.prepare(FACTS_DDL).run();
  await env.DB.prepare('INSERT INTO facts (slug, json, etag, size, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(slug) DO UPDATE SET json = excluded.json, etag = excluded.etag, size = excluded.size, updated_at = excluded.updated_at')
    .bind(slug, text, etag, text.length, Date.now()).run();
  ctx.waitUntil(caches.default.delete(new Request(new URL(request.url).origin + '/v1/facts/' + slug + '.json')));
  return json({ ok: true, slug, size: text.length, etag });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    try {
      if (url.pathname === '/v1/events' && request.method === 'POST') return await ingest(request, env, url);
      if (url.pathname === '/v1/reports' && request.method === 'POST') return await ingestReport(request, env, url);
      const rm = /^\/v1\/reports(?:\/(\d+))?$/.exec(url.pathname);
      if (rm && request.method === 'GET') {
        if (!authRead(request, env)) return json({ ok: false, error: 'unauthorized' }, 401, { 'WWW-Authenticate': 'Bearer' });
        return rm[1] ? await getReport(env, Number(rm[1]), url) : await listReports(env, url);
      }
      const tm = THUMB_RE.exec(url.pathname);
      if (tm && (request.method === 'GET' || request.method === 'HEAD')) return await getThumb(request, env, ctx, tm[1]);
      if (tm && request.method === 'PUT') {
        if (!authRead(request, env)) return json({ ok: false, error: 'unauthorized' }, 401, { 'WWW-Authenticate': 'Bearer' });
        return await putThumb(request, env, ctx, tm[1]);
      }
      const fm = FACT_RE.exec(url.pathname);
      if (fm && (request.method === 'GET' || request.method === 'HEAD')) return await getFacts(request, env, ctx, fm[1]);
      if (fm && request.method === 'PUT') {
        if (!authRead(request, env)) return json({ ok: false, error: 'unauthorized' }, 401, { 'WWW-Authenticate': 'Bearer' });
        return await putFacts(request, env, ctx, fm[1]);
      }
      if (url.pathname === '/v1/thumbs' && request.method === 'GET') {
        if (!authRead(request, env)) return json({ ok: false, error: 'unauthorized' }, 401, { 'WWW-Authenticate': 'Bearer' });
        const r = await env.DB.prepare('SELECT slug, size, etag, updated_at FROM thumbs ORDER BY slug').all();
        return json({ ok: true, count: r.results.length, thumbs: r.results });
      }
      if (url.pathname === '/' || url.pathname === '/v1/health') return json({ ok: true, service: 'met-tv-telemetry' });
      if (url.pathname === '/v1/events' || url.pathname === '/v1/summary' || url.pathname === '/v1/cleanup') {
        if (!authRead(request, env)) return json({ ok: false, error: 'unauthorized' }, 401, { 'WWW-Authenticate': 'Bearer' });
        if (url.pathname === '/v1/events' && request.method === 'GET') return await listEvents(env, url);
        if (url.pathname === '/v1/summary' && request.method === 'GET') return await summary(env, url);
        if (url.pathname === '/v1/cleanup' && request.method === 'POST') return json({ ok: true, ...(await cleanup(env)) });
        return json({ ok: false, error: 'method not allowed' }, 405);
      }
      return json({ ok: false, error: 'not found' }, 404);
    } catch (e) {
      return json({ ok: false, error: 'internal error', detail: String(e && e.message || e).slice(0, 200) }, 500);
    }
  },
  async scheduled(event, env, ctx) {
    ctx.waitUntil(cleanup(env));
  },
};
