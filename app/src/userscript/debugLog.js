// Debug capture + on-screen overlay (GREEN key).
// Captures ALL page console output that matters (the Met site's and ours): console.error,
// console.warn, console.log lines that look like problems, uncaught errors (with file:line:col and
// stack), unhandled promise rejections and failed scripts/media. Keeps the last 50, newest first,
// and persists them to localStorage so the previous page session can be read after a reload/crash.
// Buffers live on window so they survive an in-place page restart (document rewrite).
import { tlmCaptured } from './tlm';

var W = window;
var buf = W.__mtvLogBuf || (W.__mtvLogBuf = []);    // our own info/warn/error lines
var errs = W.__mtvErrBuf || (W.__mtvErrBuf = []);   // captured console/errors (page + ours)
var con = W.__mtvConBuf || (W.__mtvConBuf = []); // every console line (any level), for problem reports
var net = W.__mtvNetBuf || (W.__mtvNetBuf = []); // failed network requests (XHR/fetch/resources), for problem reports
var MAX_CON = 200;
var MAX_NET = 100;
var MAX = 80;
var MAX_ERRS = 50;
var LS_CUR = 'mtv.log.current';
var LS_PREV = 'mtv.log.prev';
var overlay = null;
var refreshTimer = null;
var infoProvider = null;
var saveTimer = null;
var prevSession = null;

export var VERSION = typeof __MTV_VERSION__ !== 'undefined' ? __MTV_VERSION__ : 'dev';

function ts() {
  var d = new Date();
  function p(n) { return (n < 10 ? '0' : '') + n; }
  return p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
}

function push(arr, item, max) { arr.push(item); while (arr.length > max) arr.shift(); }

function short(u) {
  u = String(u || '');
  var m = /^https?:\/\/([^/]+)(\/[^?#]*)?/.exec(u);
  if (!m) return u.slice(0, 100);
  var file = (m[2] || '/').split('/').pop() || '/';
  return m[1] + '/\u2026/' + file.slice(0, 60);
}

// "at fn (https://host/path/file.js:1:2345)" -> "host/…/file.js:1:2345"
function frameSrc(line) {
  var m = /(https?:\/\/[^\s)]+):(\d+):(\d+)/.exec(line || '');
  if (m) return short(m[1]) + ':' + m[2] + ':' + m[3];
  m = /\(?([^\s()]+):(\d+):(\d+)\)?\s*$/.exec(line || ''); // e.g. "<anonymous>:1:206" (inline/eval code)
  return m ? m[1].slice(-60) + ':' + m[2] + ':' + m[3] : '';
}

function firstFrame(stack) {
  var lines = String(stack || '').split('\n');
  for (var i = 0; i < lines.length; i++) { var f = frameSrc(lines[i]); if (f && /^\s*at /.test(lines[i])) return f; }
  return '';
}

function stackOf(x) {
  if (!x || !x.stack) return '';
  return String(x.stack).split('\n').slice(0, 6).map(function (l) { return l.trim(); }).join('\n').slice(0, 700);
}

function fmtArg(a) {
  if (a === null || a === undefined) return String(a);
  if (a.stack && a.message !== undefined) return String(a.name || 'Error') + ': ' + a.message;
  if (typeof a === 'object') { try { return JSON.stringify(a).slice(0, 300); } catch (e) { return Object.prototype.toString.call(a); } }
  return String(a);
}

// ---- persistence ----
function lsSet(k, v) { try { W.localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* full / disabled */ } }
function lsGet(k) { try { var s = W.localStorage.getItem(k); return s ? JSON.parse(s) : null; } catch (e) { return null; } }

export function saveSession() {
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  lsSet(LS_CUR, {
    v: VERSION, started: W.__mtvSessionStart, saved: new Date().toString().slice(0, 24),
    url: W.location.href, ua: navigator.userAgent, errs: errs.slice(-MAX_ERRS), log: buf.slice(-40)
  });
}
function scheduleSave() { if (!saveTimer) saveTimer = setTimeout(saveSession, 700); }

// Called once per page load (not again after an in-place restart): last load's log becomes "previous".
function rotateSession() {
  if (W.__mtvSessionStart) { prevSession = lsGet(LS_PREV); return; }
  W.__mtvSessionStart = new Date().toString().slice(0, 24);
  var cur = lsGet(LS_CUR);
  if (cur) lsSet(LS_PREV, cur);
  prevSession = cur || lsGet(LS_PREV);
  saveSession();
}

// ---- recording ----
export function recordError(level, msg, src, stack) {
  push(errs, { t: ts(), l: level, m: String(msg).slice(0, 400), s: String(src || '').slice(0, 140), k: stack || '' }, MAX_ERRS);
  tlmCaptured(level, msg, src, stack);
  scheduleSave();
  if (overlay && overlay.style.display === 'block') render();
}

function origConsole(name) {
  var c = W.console;
  return (c && c['__mtvOrig_' + name]) || (c && c[name]);
}

export function dbg(level, msg) {
  push(buf, ts() + ' ' + level.toUpperCase() + ' ' + msg, MAX);
  push(con, stamp() + ' ' + level + ' [met-tv] ' + String(msg).slice(0, 500), MAX_CON);
  if (level === 'error') recordError('error', '[met-tv] ' + msg, 'met-tv userscript');
  else scheduleSave();
  try {
    var f = origConsole(level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log');
    if (f) f.call(W.console, '[met-tv] ' + level + ': ' + msg);
  } catch (e) { /* ignore */ }
  if (overlay && overlay.style.display === 'block') render();
}

export function getLog() { return buf.slice(); }
export function getConsole() { return con.slice(); }
export function getNet() { return net.slice(); }
function stamp() { var d = new Date(); return d.toISOString ? d.toISOString().slice(11, 23) : ts(); }
// URLs without query/fragment (signed stream URLs carry tokens there).
function bareUrl(u) { return String(u || '').split(/[?#]/)[0].slice(0, 300); }
export function recordNet(kind, method, url, status, note) {
  push(net, { t: stamp(), k: kind, m: method || '', u: bareUrl(url), s: status, n: note ? String(note).slice(0, 120) : undefined }, MAX_NET);
}

// Passive observers for failed requests (never block/alter anything: same request, same response).
function watchNetwork() {
  var XP = W.XMLHttpRequest && W.XMLHttpRequest.prototype;
  if (XP && !XP.__mtvNet) {
    XP.__mtvNet = true;
    var open = XP.open;
    XP.open = function (method, url) {
      try { this.__mtvM = method; this.__mtvU = url; } catch (e) { /* ignore */ }
      return open.apply(this, arguments);
    };
    var send = XP.send;
    XP.send = function () {
      var x = this;
      try {
        x.addEventListener('loadend', function () {
          try { if (x.status === 0 || x.status >= 400) recordNet('xhr', x.__mtvM, x.__mtvU, x.status, x.status === 0 ? 'network error/aborted' : ''); } catch (e) { /* ignore */ }
        });
      } catch (e) { /* ignore */ }
      return send.apply(this, arguments);
    };
  }
  if (typeof W.fetch === 'function' && !W.fetch.__mtvNet) {
    var f = W.fetch;
    var wrapped = function (input, init) {
      var p = f.apply(this, arguments);
      try {
        var u = typeof input === 'string' ? input : input && input.url;
        var m = (init && init.method) || (input && input.method) || 'GET';
        p.then(function (r) { if (r && r.status >= 400) recordNet('fetch', m, u, r.status); },
          function (e) { recordNet('fetch', m, u, 0, e && e.message); });
      } catch (e) { /* ignore */ }
      return p;
    };
    wrapped.__mtvNet = true;
    W.fetch = wrapped;
  }
}
export function getErrors() { return errs.slice(); }

var PROBLEM = /error|fail|exception|warn|denied|refused|cannot|can't|unable|undefined|not supported|unsupported|timeout|abort|blocked|crash|invalid/i;

function hookConsole(name, level, filter) {
  var c = W.console;
  if (!c || typeof c[name] !== 'function') return;
  if (c['__mtvOrig_' + name]) c[name] = c['__mtvOrig_' + name]; // re-wrap cleanly after an in-place restart
  var orig = c[name];
  c['__mtvOrig_' + name] = orig;
  if (name === 'error') c.__mtvOrigError = orig; // compatibility with 1.0.1 code paths
  c[name] = function () {
    try {
      var args = arguments;
      var first = args.length ? String(args[0]) : '';
      try { push(con, stamp() + ' ' + name + ' ' + Array.prototype.map.call(args, fmtArg).join(' ').slice(0, 500), MAX_CON); } catch (e0) { /* ignore */ }
      if (first.indexOf('[met-tv]') !== 0) {
        var msg = Array.prototype.map.call(args, fmtArg).join(' ');
        if (!filter || filter.test(msg)) {
          var errArg = null;
          for (var i = 0; i < args.length; i++) if (args[i] && args[i].stack) { errArg = args[i]; break; }
          // Source: the error's own stack if one was logged, else the caller of console.x.
          var stack = errArg ? stackOf(errArg) : '';
          var src = stack ? firstFrame(stack) : '';
          if (!src) { try { var st = String(new Error().stack).split('\n'); src = frameSrc(st[2] || '') || frameSrc(st[3] || ''); } catch (e) { /* ignore */ } }
          recordError(level, msg, src || 'console.' + name, stack);
        }
      }
    } catch (e) { /* never break the page's console */ }
    return orig.apply(c, arguments);
  };
}

// Install as early as possible (first thing the userscript does).
export function captureErrors() {
  try { rotateSession(); } catch (e) { /* ignore */ }
  try {
    W.addEventListener('error', function (e) {
      var t = e.target;
      if (t && t !== W && t.tagName) { // a resource failed to load: not a JS error
        var u = String(t.currentSrc || t.src || t.href || t.data || '');
        push(buf, ts() + ' WARN resource failed: ' + t.tagName.toLowerCase() + ' ' + u.slice(0, 100), MAX);
        recordNet('resource', t.tagName.toLowerCase(), u, 0, 'load error');
        if (/^(SCRIPT|LINK|VIDEO|AUDIO|SOURCE|IFRAME)$/.test(t.tagName)) recordError('resource', 'failed to load ' + t.tagName.toLowerCase(), short(u));
        return;
      }
      var stack = stackOf(e.error);
      var src = e.filename ? short(e.filename) + ':' + e.lineno + ':' + (e.colno || 0) : (firstFrame(stack) || (e.lineno ? 'inline:' + e.lineno + ':' + (e.colno || 0) : 'page'));
      var msg = e.message || (e.error && e.error.message) || String(e);
      recordError('exception', msg, src, stack);
    }, true);
    W.addEventListener('unhandledrejection', function (e) {
      var r = e.reason;
      var msg = r && r.message !== undefined ? (r.name || 'Error') + ': ' + r.message : fmtArg(r);
      var stack = stackOf(r);
      recordError('rejection', 'unhandled rejection: ' + msg, firstFrame(stack) || 'promise', stack);
    });
    W.addEventListener('pagehide', saveSession);
    W.addEventListener('beforeunload', saveSession);
    hookConsole('error', 'error', null);
    hookConsole('warn', 'warn', null);
    hookConsole('log', 'log', PROBLEM);
    hookConsole('info', 'log', PROBLEM);
    hookConsole('debug', 'log', PROBLEM);
    watchNetwork();
  } catch (e) { /* ignore */ }
}

export function setInfoProvider(fn) { infoProvider = fn; }

function esc(s) {
  return String(s).replace(/[&<>]/g, function (ch) { return ch === '&' ? '&amp;' : ch === '<' ? '&lt;' : '&gt;'; });
}

var LEVEL_COLOR = { exception: '#ff8a80', rejection: '#ff8a80', error: '#ffab91', warn: '#ffe082', resource: '#ce93d8', log: '#b0bec5' };

function errList(list) {
  if (!list || !list.length) return '<div style="color:#888">none</div>';
  return list.slice().reverse().map(function (x) {
    return '<div style="margin:0 0 6px"><span style="color:#888">' + esc(x.t) + '</span> <b style="color:' + (LEVEL_COLOR[x.l] || '#ddd') + '">' +
      esc(x.l.toUpperCase()) + '</b> ' + esc(x.m) +
      '<div style="color:#8fa;margin-left:24px">\u21b3 ' + esc(x.s || '?') + '</div>' +
      (x.k ? '<pre style="margin:0 0 0 24px;color:#999;white-space:pre-wrap;font:13px/1.2 monospace">' + esc(x.k) + '</pre>' : '') + '</div>';
  }).join('');
}

function render() {
  var info = {};
  try { info = infoProvider ? infoProvider() : {}; } catch (e) { info = { infoError: String(e) }; }
  var head = Object.keys(info).map(function (k) { return '<b>' + esc(k) + ':</b> ' + esc(info[k]); }).join('<br>');
  var prev = prevSession;
  var keep = overlay.scrollTop;
  overlay.innerHTML =
    '<div style="color:#f2c14e;font-size:17px">Met Opera TV ' + esc(VERSION) + ' debug log \u2014 GREEN close \u00b7 UP/DOWN scroll \u00b7 OK send problem report \u00b7 BLUE safe mode</div>' +
    '<div style="margin-top:8px;color:#9fd49f">' + head + '</div>' +
    '<h3 style="color:#f2c14e;margin:14px 0 6px;font:bold 16px monospace">Console & errors this session (' + errs.length + ', newest first)</h3>' + errList(errs) +
    '<h3 style="color:#f2c14e;margin:14px 0 6px;font:bold 16px monospace">Userscript log</h3>' +
    '<pre style="white-space:pre-wrap;word-break:break-all;margin:0;font:14px/1.25 monospace;color:#ddd">' + esc(buf.slice(-25).join('\n')) + '</pre>' +
    '<h3 style="color:#f2c14e;margin:14px 0 6px;font:bold 16px monospace">Previous session' +
    (prev ? ' (v' + esc(prev.v) + ', started ' + esc(prev.started || '?') + ', last saved ' + esc(prev.saved || '?') + ')</h3>' +
      '<div style="color:#999">' + esc(prev.url || '') + '</div>' + errList(prev.errs) +
      '<pre style="white-space:pre-wrap;word-break:break-all;margin:6px 0 0;font:13px/1.2 monospace;color:#aaa">' + esc((prev.log || []).slice(-15).join('\n')) + '</pre>'
      : '</h3><div style="color:#888">none saved</div>');
  overlay.scrollTop = keep;
}

export function toggleOverlay() {
  if (!overlay || !document.documentElement.contains(overlay)) {
    overlay = document.createElement('div');
    overlay.className = 'mtv-log';
    // Inline styles so the overlay works even if our stylesheet failed or safe mode removed it.
    overlay.style.cssText = 'display:none;position:fixed;left:30px;top:30px;right:30px;bottom:30px;z-index:2147483647;' +
      'background:rgba(0,0,0,0.95);color:#e6e6e6;border:2px solid #4caf50;border-radius:10px;padding:16px 24px;' +
      'font:15px/1.3 monospace;overflow-y:auto;overflow-x:hidden;white-space:normal;text-align:left;';
    (document.body || document.documentElement).appendChild(overlay);
  }
  var show = overlay.style.display !== 'block';
  overlay.style.display = show ? 'block' : 'none';
  clearInterval(refreshTimer);
  if (show) { overlay.scrollTop = 0; render(); refreshTimer = setInterval(render, 1000); }
}

// UP/DOWN while the overlay is open.
export function scrollOverlay(dir) {
  if (!overlay) return;
  overlay.scrollTop += (dir > 0 ? 1 : -1) * Math.round(overlay.clientHeight * 0.6);
}

export function overlayOpen() { return !!overlay && overlay.style.display === 'block'; }
