/* Met Opera (com.peasanttech.metopera) telemetry client. ES5, no fetch/Promise needed.
 * Sends batched events to the met-tv-telemetry Worker. Never pass Met credentials to it.
 * API (window.MetTelemetry, or module.exports under CommonJS/esbuild):
 *   MetTelemetry.init({ appVersion: '1.0.2', captureErrors: true, flushMs: 30000 })
 *   MetTelemetry.error(errOrMessage, extra)   MetTelemetry.warn(msg, extra)   MetTelemetry.console(msg, extra)
 *   MetTelemetry.lifecycle(name, data)        MetTelemetry.usage(name, data)
 *   MetTelemetry.track(type, message, extra)  // extra: {source,line,col,stack,url,data}
 *   MetTelemetry.flush()                      MetTelemetry.setEnabled(false)
 */
(function (root) {
  'use strict';
  var ENDPOINT = 'https://YOUR-WORKER.YOUR-SUBDOMAIN.workers.dev/v1/events';
  var INGEST_KEY = '__INGEST_KEY_REMOVED__'; // low-security static key, only deters noise
  var LS_QUEUE = 'mtv.tlm.queue', LS_DEVICE = 'mtv.tlm.device', LS_OFF = 'mtv.tlm.off';
  var MAX_QUEUE = 300, MAX_BATCH = 100, MAX_BYTES = 60000;
  var TYPES = { error: 1, warn: 1, console: 1, lifecycle: 1, usage: 1 };
  var SENSITIVE = /^(password|passwd|pass|pwd|token|access_?token|refresh_?token|secret|authorization|cookie|creds?|credentials|p)$/i;

  var W = root || {};
  var queue = [], sending = false, timer = null, backoffUntil = 0, backoffMs = 0;
  var cfg = { appVersion: 'dev', flushMs: 30000, captureErrors: false, enabled: true };
  var deviceId = null, sessionId = null, inited = false;

  function now() { return new Date().getTime(); }
  function rnd(n) { var s = '', c = 'abcdefghijklmnopqrstuvwxyz0123456789'; for (var i = 0; i < n; i++) s += c.charAt(Math.floor(Math.random() * c.length)); return s; }
  function lsGet(k) { try { return W.localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { W.localStorage.setItem(k, v); } catch (e) { /* full / disabled */ } }
  function lsDel(k) { try { W.localStorage.removeItem(k); } catch (e) { /* ignore */ } }
  function toJSON(v) { try { return JSON.stringify(v); } catch (e) { return null; } }

  // Client-side scrub (the Worker scrubs again): never ship creds / tokens.
  function redact(s) {
    if (typeof s !== 'string') return s;
    return s.slice(0, 2000)
      .replace(/\{\s*\\*"u\\*"\s*:\s*\\*"(?:[^"\\]|\\.)*?\\*"\s*,\s*\\*"p\\*"\s*:\s*\\*"(?:[^"\\]|\\.)*?\\*"\s*\}/g, '[redacted-creds]')
      .replace(/(mtv\.creds\\*["']?\s*[:=,]\s*)(\S+)/gi, '$1[redacted]')
      .replace(/((?:password|passwd|pass|pwd|token|secret)\\*["']?\s*[:=]\s*\\*["']?)([^"'&\s,;}\\]+)/gi, '$1[redacted]');
  }
  function scrub(v, d) {
    d = d || 0;
    if (d > 5) return '[depth]';
    if (typeof v === 'string') return redact(v);
    if (v === null || typeof v !== 'object') return v;
    if (Object.prototype.toString.call(v) === '[object Array]') { var a = []; for (var i = 0; i < v.length && i < 30; i++) a.push(scrub(v[i], d + 1)); return a; }
    var o = {}, n = 0;
    for (var k in v) { if (!Object.prototype.hasOwnProperty.call(v, k)) continue; if (n++ > 40) break; o[k] = SENSITIVE.test(k) ? '[redacted]' : scrub(v[k], d + 1); }
    return o;
  }

  function persist() { if (queue.length) lsSet(LS_QUEUE, toJSON(queue) || '[]'); else lsDel(LS_QUEUE); }
  function loadQueue() {
    try { var q = JSON.parse(lsGet(LS_QUEUE) || '[]'); if (q && q.length) queue = q.concat(queue); } catch (e) { /* corrupt -> drop */ }
    if (queue.length > MAX_QUEUE) queue = queue.slice(queue.length - MAX_QUEUE);
  }

  function track(type, message, extra) {
    if (!cfg.enabled || !TYPES[type]) return;
    extra = extra || {};
    var ev = { ts: now(), type: type, message: redact(String(message === undefined ? '' : message)) };
    if (extra.source) ev.source = redact(String(extra.source)).slice(0, 300);
    if (extra.line != null) ev.line = extra.line;
    if (extra.col != null) ev.col = extra.col;
    if (extra.stack) ev.stack = redact(String(extra.stack)).slice(0, 4000);
    ev.url = redact(String(extra.url || (W.location && W.location.href) || '')).slice(0, 500);
    if (extra.data !== undefined) ev.data = scrub(extra.data);
    queue.push(ev);
    if (queue.length > MAX_QUEUE) queue.splice(0, queue.length - MAX_QUEUE);
    persist();
    if (type === 'error' && queue.length >= 10) schedule(2000); // errors flush sooner
  }

  // Take a batch that fits MAX_BATCH events and ~MAX_BYTES.
  function makeBatch() {
    var evs = [], bytes = 300;
    for (var i = 0; i < queue.length && evs.length < MAX_BATCH; i++) {
      var len = (toJSON(queue[i]) || '').length + 1;
      if (bytes + len > MAX_BYTES) { if (!evs.length) { queue.splice(i, 1); i--; continue; } break; } // drop a single oversized event
      evs.push(queue[i]); bytes += len;
    }
    return { n: evs.length, body: toJSON({ deviceId: deviceId, sessionId: sessionId, appVersion: cfg.appVersion, ua: (W.navigator && W.navigator.userAgent) || '', events: evs }) };
  }
  function drop(n) { queue.splice(0, n); persist(); }

  function flush() {
    if (!inited || sending || !queue.length || !cfg.enabled || now() < backoffUntil || typeof XMLHttpRequest === 'undefined') return;
    var b = makeBatch();
    if (!b.n) { persist(); return; }
    sending = true;
    var x = new XMLHttpRequest();
    try {
      x.open('POST', ENDPOINT, true);
      x.setRequestHeader('Content-Type', 'application/json');
      x.setRequestHeader('X-Met-Key', INGEST_KEY);
      x.timeout = 15000;
    } catch (e) { sending = false; return; }
    x.onreadystatechange = function () {
      if (x.readyState !== 4) return;
      sending = false;
      var s = x.status;
      if (s >= 200 && s < 300) { drop(b.n); backoffMs = 0; if (queue.length) schedule(1000); }
      else if (s === 400 || s === 413) { drop(b.n); }                      // bad batch: never retry it
      else if (s === 429) { var ra = parseInt(x.getResponseHeader('Retry-After'), 10) || 60; backoffUntil = now() + ra * 1000; }
      else { backoffMs = Math.min(backoffMs ? backoffMs * 2 : 15000, 600000); backoffUntil = now() + backoffMs; } // offline / 5xx / 401
    };
    try { x.send(b.body); } catch (e2) { sending = false; }
  }

  function schedule(ms) { setTimeout(flush, ms); }

  // On page hide/unload: hand the batch to sendBeacon (no custom headers -> key in query, text/plain avoids preflight).
  function beaconFlush() {
    persist();
    if (!inited || !queue.length || !cfg.enabled) return;
    var nav = W.navigator;
    if (!nav || typeof nav.sendBeacon !== 'function') return; // queue stays in localStorage for next launch
    var b = makeBatch(), ok = false;
    try {
      var payload = typeof Blob !== 'undefined' ? new Blob([b.body], { type: 'text/plain' }) : b.body;
      ok = nav.sendBeacon(ENDPOINT + '?k=' + encodeURIComponent(INGEST_KEY), payload);
    } catch (e) { ok = false; }
    if (ok) drop(b.n);
  }

  function captureErrors() {
    if (!W.addEventListener) return;
    W.addEventListener('error', function (e) {
      if (e && e.message) track('error', e.message, { source: e.filename, line: e.lineno, col: e.colno, stack: e.error && e.error.stack });
      else if (e && e.target && e.target !== W) track('error', 'resource failed: ' + (e.target.tagName || ''), { source: e.target.src || e.target.href });
    }, true);
    W.addEventListener('unhandledrejection', function (e) {
      var r = e && e.reason;
      track('error', 'unhandledrejection: ' + (r && r.message ? r.message : String(r)), { stack: r && r.stack });
    });
  }

  function init(opts) {
    if (inited) return api;
    opts = opts || {};
    for (var k in opts) if (Object.prototype.hasOwnProperty.call(opts, k)) cfg[k] = opts[k];
    if (lsGet(LS_OFF) === '1') cfg.enabled = false;
    deviceId = lsGet(LS_DEVICE);
    if (!deviceId || !/^[A-Za-z0-9._:-]{4,64}$/.test(deviceId)) { deviceId = 'tv-' + rnd(16); lsSet(LS_DEVICE, deviceId); }
    sessionId = W.__mtvTlmSession || (W.__mtvTlmSession = 's-' + now().toString(36) + '-' + rnd(6)); // survives in-place restarts
    inited = true;
    loadQueue();
    if (cfg.captureErrors) captureErrors();
    if (W.addEventListener) {
      W.addEventListener('pagehide', beaconFlush);
      W.addEventListener('beforeunload', beaconFlush);
      if (W.document && W.document.addEventListener) W.document.addEventListener('visibilitychange', function () { if (W.document.visibilityState === 'hidden') beaconFlush(); });
    }
    timer = setInterval(flush, cfg.flushMs || 30000);
    schedule(3000);
    return api;
  }

  var api = {
    init: init, track: track, flush: flush,
    error: function (e, extra) {
      extra = extra || {};
      if (e && typeof e === 'object' && e.message !== undefined) { if (!extra.stack) extra.stack = e.stack; track('error', (e.name || 'Error') + ': ' + e.message, extra); }
      else track('error', e, extra);
    },
    warn: function (m, x) { track('warn', m, x); },
    console: function (m, x) { track('console', m, x); },
    lifecycle: function (name, data) { track('lifecycle', name, { data: data }); },
    usage: function (name, data) { track('usage', name, { data: data }); },
    setEnabled: function (on) { cfg.enabled = !!on; if (on) lsDel(LS_OFF); else { lsSet(LS_OFF, '1'); queue = []; persist(); } },
    // Problem report (DOM/player snapshot): body is a JSON string or gzip bytes (Uint8Array). cb(ok, status, responseText)
    postReport: function (body, gz, cb) {
      if (!inited || typeof XMLHttpRequest === 'undefined') { if (cb) cb(false, 0, 'telemetry not ready'); return; }
      var x = new XMLHttpRequest();
      try {
        x.open('POST', ENDPOINT.replace(/\/v1\/events$/, '/v1/reports'), true);
        x.setRequestHeader('Content-Type', gz ? 'application/gzip' : 'application/json');
        x.setRequestHeader('X-Met-Key', INGEST_KEY);
        x.timeout = 45000;
      } catch (e) { if (cb) cb(false, 0, String(e)); return; }
      x.onreadystatechange = function () { if (x.readyState === 4 && cb) cb(x.status >= 200 && x.status < 300, x.status, String(x.responseText || '').slice(0, 300)); };
      try { x.send(body); } catch (e2) { if (cb) cb(false, 0, String(e2)); }
    },
    ids: function () { return { deviceId: deviceId, sessionId: sessionId, appVersion: cfg.appVersion }; },
    info: function () { return { deviceId: deviceId, sessionId: sessionId, queued: queue.length, enabled: cfg.enabled, endpoint: ENDPOINT }; }
  };

  W.MetTelemetry = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : this);
