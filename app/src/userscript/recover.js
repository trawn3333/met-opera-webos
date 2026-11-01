// Recovery for old engines.
// 1) Restart after crash: if the Met React app crashed before our polyfills existed (webOS injects
//    user scripts only after the page has loaded), restart the page ONCE with this whole userscript
//    (polyfills included) running before the Met's own scripts:
//      - stop every timer / animation-frame loop of the crashed copy,
//      - re-fetch the same page HTML and rewrite the document with document.open/write/close
//        (this also drops every event listener the crashed copy registered on window/document),
//      - our script is inlined at the top of <head>, so it runs first in the new document.
//    Fallback if the page cannot be fetched: re-run the Met bundles in place.
// 2) Watchdog: keeps checking; only if the page has shown nothing for 45 s after load does it show
//    a "did not start" screen, and it removes that screen the moment the page renders.
import { dbg, saveSession, VERSION } from './debugLog';
import { isMetOnDemand } from './util';

var W = window;
// Lifecycle event sink (telemetry), set by index.js.
export var recoverHooks = { onEvent: null };
function emit(name, data) { try { if (recoverHooks.onEvent) recoverHooks.onEvent(name, data); } catch (e) { /* ignore */ } }
var WATCHDOG_MS = 45000;
var restartInfo = W.__mtvRestart || null; // set by the inlined copy when this document is a restart

function navStart() {
  try { return (W.performance && performance.timing && performance.timing.navigationStart) || 0; } catch (e) { return 0; }
}

export var recoverState = {
  crashedAtStart: !!restartInfo,
  rebooted: !!restartInfo,
  method: restartInfo ? restartInfo.method : '',
  watchdog: 'idle',
  renderedAt: null,      // ms after navigation start when the Met page first showed content
  renderedNote: '',
  injectedAt: navStart() ? Date.now() - navStart() : null
};

function rootEl() { return document.getElementById('root'); }

export function appAlive() {
  var r = rootEl();
  return !!r && r.children.length > 0;
}

function bodyHasVisibleContent() {
  if (appAlive()) {
    // 1.3.0: our app shell hides the Met page on purpose (display:none) - rendered children are enough.
    if (document.documentElement.classList.contains('mtv-app')) return true;
    var r = rootEl().getBoundingClientRect();
    if (r.height > 50) return true;
  }
  if (!isMetOnDemand()) return !!(document.body && (document.body.innerText || '').length > 20);
  return false;
}

// Stop every timer and animation-frame loop that exists right now (ids are sequential integers).
function clearAllTimers() {
  try {
    var hi = setTimeout(function () {}, 0);
    for (var i = 1; i <= hi; i++) { clearTimeout(i); clearInterval(i); }
    if (W.requestAnimationFrame) {
      var hr = requestAnimationFrame(function () {});
      for (var j = 1; j <= hr; j++) cancelAnimationFrame(j);
    }
  } catch (e) { /* ignore */ }
}

function webpackGlobal(html) {
  var m = /this\["(webpackJsonp[^"]+)"\]/.exec(html || '');
  return m ? m[1] : null;
}

function selfSource() {
  var f = W.__mtvMain;
  return typeof f === 'function' ? String(f) : null;
}

// Restart by rewriting the document with our script first. Returns false if not possible.
function restartRewrite(done) {
  var src = selfSource();
  if (!src || typeof document.open !== 'function') { done(false); return; }
  var x = new XMLHttpRequest();
  x.open('GET', W.location.href, true);
  x.withCredentials = true;
  x.onload = function () {
    var html = x.responseText || '';
    if (x.status !== 200 || !/<head[^>]*>/i.test(html) || !/id=["']?root/.test(html)) { done(false); return; }
    var inline = src.replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--');
    var boot = '<script>window.__mtvLoaded=false;window.__mtvRestart={method:"rewrite",at:Date.now()};' +
      'window.__mtvMain=' + inline + ';window.__mtvMain();</script>';
    html = html.replace(/<head[^>]*>/i, function (h) { return h + boot; });
    var g = webpackGlobal(html);
    try { if (g) delete W[g]; } catch (e) { W[g] = undefined; }
    dbg('warn', 'restarting the page with polyfills first (document rewrite)');
    emit('crash-restart', { method: 'rewrite', phase: 'rewriting' });
    try { saveSession(); } catch (e) { /* ignore */ }
    clearAllTimers();
    document.open();
    document.write(html);
    document.close();
    done(true);
  };
  x.onerror = function () { done(false); };
  x.send();
}

// Fallback: re-run the Met bundles in place (old listeners of the crashed copy remain).
var rearm = null; // restarts the watchdog loop after timers were cleared
function restartInPlace(onInPlace) {
  var scripts = document.querySelectorAll('script');
  var runtime = null, chunks = [];
  for (var i = 0; i < scripts.length; i++) {
    var s = scripts[i];
    var src = s.getAttribute('src') || '';
    if (/\/static\/js\/[^/]+\.chunk\.js/.test(src)) chunks.push(s.src);
    else if (!src && /webpackJsonp/.test(s.textContent)) runtime = s.textContent;
  }
  if (!runtime || !chunks.length) { dbg('error', 'restart: could not find Met bundles'); return false; }
  recoverState.rebooted = true;
  recoverState.method = 'in-place';
  var g = webpackGlobal(runtime);
  try { if (g) delete W[g]; } catch (e) { W[g] = undefined; }
  clearAllTimers();
  try { if (onInPlace) onInPlace(); } catch (e) { dbg('error', 'restart hook: ' + e); } // re-install polyfills/timers
  if (rearm) setTimeout(rearm, 500);
  var old = rootEl();
  var fresh = document.createElement('div');
  fresh.id = 'root';
  if (old && old.parentNode) old.parentNode.replaceChild(fresh, old); else document.body.insertBefore(fresh, document.body.firstChild);
  var rt = document.createElement('script');
  rt.text = runtime;
  document.body.appendChild(rt);
  chunks.forEach(function (u) {
    var el = document.createElement('script');
    el.src = u;
    el.async = false;
    el.onerror = function () { dbg('error', 'restart: failed to load ' + u); };
    document.body.appendChild(el);
  });
  dbg('warn', 'Met app had crashed; restarted its bundles in place (' + chunks.length + ' chunks)');
  emit('crash-restart', { method: 'in-place', chunks: chunks.length });
  return true;
}

// Exposed for testing: true if a restart was started.
export function restartMetApp(onInPlace) {
  if (W.__mtvRestartCount >= 1) { dbg('error', 'Met app is still not running after a restart; not retrying'); emit('crash-restart', { phase: 'gave-up' }); return false; }
  W.__mtvRestartCount = (W.__mtvRestartCount || 0) + 1;
  recoverState.crashedAtStart = true;
  restartRewrite(function (ok) {
    if (ok) return;
    dbg('warn', 'document rewrite not possible; falling back to in-place restart');
    restartInPlace(onInPlace);
  });
  return true;
}

var failEl = null;
function showFailure(onFail) {
  if (failEl && document.documentElement.contains(failEl)) return;
  recoverState.watchdog = 'fired';
  try { onFail(); } catch (e) { /* ignore */ }
  failEl = document.createElement('div');
  failEl.className = 'mtv-fail';
  failEl.style.cssText = 'position:fixed;left:0;top:0;right:0;bottom:0;z-index:2147483600;background:#14100c;color:#f4ead7;' +
    'font:30px/1.5 Georgia,serif;text-align:center;padding-top:260px;';
  failEl.innerHTML = '<div style="font-size:48px;color:#f2c14e;margin-bottom:24px">The Met Opera page did not start</div>' +
    '<div>OK: reload &nbsp;\u00b7&nbsp; GREEN: show debug log &nbsp;\u00b7&nbsp; BLUE: safe mode &nbsp;\u00b7&nbsp; BACK: exit</div>' +
    '<div style="font-size:24px;opacity:.75;margin-top:24px">This screen disappears by itself if the page finishes loading.</div>' +
    '<div style="font-size:22px;opacity:.6;margin-top:30px">' + navigator.userAgent.replace(/[<>&]/g, '') + '</div>' +
    '<div style="position:absolute;right:56px;top:28px;font-size:22px;color:#e3b65b;letter-spacing:.06em">Met Opera TV v' + VERSION + '</div>';
  (document.body || document.documentElement).appendChild(failEl);
  dbg('error', 'watchdog: page has shown nothing ' + (WATCHDOG_MS / 1000) + 's after load');
  emit('watchdog-shown', { afterLoadMs: WATCHDOG_MS, restarted: recoverState.rebooted, method: recoverState.method });
}

function hideFailure() {
  if (failEl && failEl.parentNode) failEl.parentNode.removeChild(failEl);
  failEl = null;
}

// Call once on start. onFail removes our styles/overlays; onRecovered re-applies them.
export function startRecovery(onFail, onRecovered, onInPlaceRestart) {
  if (!isMetOnDemand()) return;
  var loadAt = null;
  var started = Date.now();
  if (appAlive()) {
    recoverState.renderedNote = 'before the userscript ran';
  }
  function tick() {
    rearm = tick;
    var now = Date.now();
    if (loadAt === null && document.readyState === 'complete') loadAt = now;
    var alive = bodyHasVisibleContent();
    if (alive) {
      if (recoverState.renderedAt === null) {
        recoverState.renderedAt = navStart() ? now - navStart() : now - started;
        dbg('info', 'Met page rendered (' + Math.round(recoverState.renderedAt / 100) / 10 + 's after navigation' +
          (recoverState.renderedNote ? ', ' + recoverState.renderedNote : '') + ')');
        var pt = {};
        try { var tm = performance.timing; pt = { dclMs: tm.domContentLoadedEventEnd ? tm.domContentLoadedEventEnd - tm.navigationStart : null, loadMs: tm.loadEventEnd ? tm.loadEventEnd - tm.navigationStart : null }; } catch (e) { /* ignore */ }
        emit('page-rendered', { renderedAtMs: recoverState.renderedAt, beforeUserscript: !!recoverState.renderedNote,
          userscriptAtMs: recoverState.injectedAt, dclMs: pt.dclMs, loadMs: pt.loadMs, restarted: recoverState.rebooted, method: recoverState.method, path: W.location.pathname });
      }
      if (failEl) {
        hideFailure();
        recoverState.watchdog = 'recovered';
        dbg('warn', 'watchdog: page rendered late; removed the failure screen');
        emit('watchdog-cleared', { renderedAtMs: recoverState.renderedAt });
        try { onRecovered(); } catch (e) { /* ignore */ }
      } else if (recoverState.watchdog !== 'recovered') {
        recoverState.watchdog = 'ok';
      }
    } else if (loadAt !== null) {
      recoverState.watchdog = 'waiting (' + Math.round((now - loadAt) / 1000) + 's since load)';
      // Root empty after load: React 17 renders synchronously while its scripts run, so an empty root
      // 1.5s after load means the Met app crashed.
      if (!appAlive() && now - loadAt > 1500 && !W.__mtvRestartCount && !restartInfo) {
        dbg('warn', 'Met app root is empty after load (crashed?)');
        restartMetApp(onInPlaceRestart);
      }
      if (now - loadAt > WATCHDOG_MS && !failEl) showFailure(onFail);
    }
    // Keep checking for the life of the page (cheap): fast at first, then every 2s.
    setTimeout(tick, now - started < 60000 ? 500 : 2000);
  }
  tick();
}

export function failureShown() { return !!failEl && document.documentElement.contains(failEl); }
