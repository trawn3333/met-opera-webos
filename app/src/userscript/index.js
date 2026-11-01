// Met Opera TV userscript: injected by webOS into every page the app opens
// (webOSUserScripts/userScript.js). Entry point.
//
// Design rule: every feature is isolated in try/catch (see `safe`) so one failure can never break
// the Met page; polyfills and error capture run first; safe mode disables everything cosmetic.
//
// 1.3.0: the app takes over the screen. Three modes (html.mtv-mode-*):
//   browse : our Browse/Categories screens (hero + shuffled rows), the Met page hidden underneath
//   search : rapid-fire search over the bundled archive index
//   play   : our own <video> player (player.js); nothing of the Met UI is rendered
//   met    : fallback only - the Met's own page/player, shown with our top bar
import { dbg, captureErrors, toggleOverlay, overlayOpen, scrollOverlay, setInfoProvider, getErrors, VERSION } from './debugLog';
import { installPolyfills, getFilled } from './polyfills';
import { envInfo } from './envInfo';
import { tlmInit, tlm, tlmInfo, tlmEnabled, tlmFlush } from './tlm';
import { repairMixedContentImages, getCompatStats } from './compat';
import { isMetOnDemand, isLocalPage, onReady, lsGet, lsSet, lsDel, exitApp, closest } from './util';
import { KEY, isTyping } from './keys';
import { navigate, focusFirst, focusEl, initFocusTracking } from './spatialNav';
import { injectStyles, applyTextSize, removeStyles } from './tvStyle';
import { initPerf, getStats } from './perf';
import { isPerformancePage, isFullscreen, initEngine, setEngineHooks, engineState, errorShown, handleErrorKey, fitInfo, pictureMode, metChromeVisible } from './player';
import * as eng from './player';
import * as search from './search/ui';
import { reloginNow } from './relogin';
import * as panel from './settingsPanel';
import { autoRelogin, loginState, getStatusText, HOME_URL } from './relogin';
import { toast } from './toast';
import * as bar from './topBar';
import * as cat from './cat/screen';
import * as castSheet from './cast/castModal';
import { navHooks, candidates } from './spatialNav';
import * as pui from './playerUI';
import { reportProblem, initPlaybackWatch, setReportStateProvider, buildSnapshot, serialize, sendReport } from './report';
import { startRecovery, restartMetApp, recoverState, recoverHooks, failureShown, appAlive } from './recover';

function safe(name, fn) {
  try { return fn(); } catch (e) { dbg('error', name + ' failed: ' + (e && e.message ? e.message : e)); return undefined; }
}

var safeMode = false;


var mode = 'browse', prevMode = 'browse';
var appOn = false;
function setMode(m) {
  var h = document.documentElement;
  var all = ['browse', 'search', 'play', 'met'];
  for (var i = 0; i < all.length; i++) h.classList.toggle('mtv-mode-' + all[i], all[i] === m);
  h.classList.toggle('mtv-app', appOn && m !== 'met');
  if (m !== mode) dbg('info', 'mode ' + mode + ' -> ' + m);
  mode = m;
}
export function getMode() { return mode; }

function start() {
  safe('telemetry', function () { tlmInit(VERSION); });
  captureErrors();
  dbg('info', 'userscript ' + VERSION + ' start on ' + window.location.href + ' (readyState=' + document.readyState + ')');
  dbg('info', 'UA: ' + navigator.userAgent);
  safe('polyfills', installPolyfills);
  if (isMetOnDemand()) safe('mixed-content image repair', repairMixedContentImages);
  // 1.0.2: speed-ups became opt-in. Reset any setting saved by 1.0.0/1.0.1 once.
  safe('settings migration', function () {
    if (lsGet('mtv.cfgVer', 0) < 2) { lsDel('mtv.lite'); lsSet('mtv.cfgVer', 2); }
  });
  safeMode = !!lsGet('mtv.safe', false);
  var lite = !safeMode && lsGet('mtv.lite', false);
  // (No flush on crash-restart: the queue is persisted and the restarted copy sends it; flushing here duplicated events.)
  recoverHooks.onEvent = function (name, data) { tlm(name, data); };
  safe('telemetry launch', function () {
    if (window.__mtvRestart) tlm('crash-restart', { method: window.__mtvRestart.method, phase: 'restarted-copy-running' });
    else tlm('launch', { path: window.location.pathname, safeMode: safeMode, speedUps: lite, readyState: document.readyState });
  });
  if (safeMode) dbg('warn', 'SAFE MODE: TV styling and speed-ups disabled (BLUE to leave)');
  // Take over the screen from the very first paint (the Met page stays loaded but hidden).
  if (!safeMode && isMetOnDemand()) safe('early takeover', function () { appOn = true; setMode('browse'); bootSplash(); });
  // Optional speed-ups (OFF by default). Nothing is ever blocked or intercepted.
  if (lite && isMetOnDemand()) safe('speed-ups', initPerf);

  setInfoProvider(function () {
    var env = envInfo();
    var sec = function (ms) { return ms === null || ms === undefined ? '-' : (Math.round(ms / 100) / 10) + 's'; };
    var t = env.timing;
    return {
      url: window.location.href,
      'webOS / engine': env.platform,
      device: env.device,
      screen: env.screen,
      'video support': env.codecs,
      timing: 'load ' + sec(t.load) + ' · userscript ' + sec(recoverState.injectedAt) +
        ' · page rendered ' + (recoverState.renderedAt === null ? 'NOT YET' : sec(recoverState.renderedAt)) +
        (recoverState.renderedNote ? ' (' + recoverState.renderedNote + ')' : ''),
      'met app rendered': appAlive() ? 'yes' : 'NO (root empty)',
      'crashed / restarted': recoverState.crashedAtStart + ' / ' + recoverState.rebooted + (recoverState.method ? ' (' + recoverState.method + ')' : ''),
      watchdog: recoverState.watchdog,
      'signed in': loginState.signedIn + (loginState.lastCheck ? ' (checked ' + loginState.lastCheck + ')' : ''),
      're-login': getStatusText() || '-',
      'saved account': lsGet('mtv.creds', null) ? 'yes' : 'no',
      mode: safeMode ? 'SAFE MODE' : (lite ? 'TV styling + speed-ups' : 'TV styling (no speed-ups)'),
      polyfilled: getFilled().join(', ') || 'none',
      'image repairs': JSON.stringify(getCompatStats()),
      'speed-up stats': lite ? JSON.stringify(getStats()) : 'off',
      telemetry: (function () { var i = tlmInfo(); return (tlmEnabled() ? 'on' : 'off') + ', device ' + i.deviceId + ', session ' + i.sessionId + ', queued ' + i.queued; })()
    };
  });

  safe('keys', function () { document.addEventListener('keydown', onKeyDown, true); document.addEventListener('keyup', onKeyUp, true); });
  safe('report state', function () {
    setReportStateProvider(function () {
      return { mode: mode, playback: engineState(), searchState: search.isOpen() ? search.debugState() : null, catView: cat.debugState(),
        fullscreen: isFullscreen(), pictureMode: pictureMode(), fit: isFullscreen() ? fitInfo() : null, playerControls: pui.isShown(),
        categoriesOpen: cat.isOpen(), settingsOpen: panel.isOpen(), safeMode: safeMode, speedUps: !!lite, signedIn: String(loginState.signedIn),
        savedAccount: !!lsGet('mtv.creds', null), metAppRendered: appAlive(), recover: { crashedAtStart: recoverState.crashedAtStart, rebooted: recoverState.rebooted,
          method: recoverState.method, watchdog: recoverState.watchdog, renderedAt: recoverState.renderedAt }, telemetry: tlmInfo() };
    });
  });
  safe('recovery', function () {
    startRecovery(
      function onFail() { removeStyles(); },
      function onRecovered() { if (!safeMode) { injectStyles(lite); applyTextSize(lsGet('mtv.textSize', 115)); } },
      function onInPlaceRestart() { installPolyfills(); setInterval(tlmFlush, 30000); }
    );
  });

  onReady(function () {
    if (!safeMode) {
      safe('styles', function () { injectStyles(lite); applyTextSize(lsGet('mtv.textSize', 115)); });
    }
    if (!safeMode && isMetOnDemand()) safe('app', initApp);
    safe('focus tracking', initFocusTracking);
    safe('external links', fixExternalLinks);
    safe('routes', watchRoutes);
    safe('playback telemetry', watchPlayback);
    safe('player controls', function () {
      initEngine();
      pui.initPlayerUI();
      pui.setPlayerHooks({ onExit: function () {}, onReport: function () { reportProblem('player-button'); } });
    });
    // The Met page player is only used in the 'met' fallback mode; watch it there.
    if (isMetOnDemand()) safe('playback failure watch', function () { initPlaybackWatch(function () { return mode === 'met' && isPerformancePage(); }); });
    if (isMetOnDemand()) {
      safe('auto relogin', function () {
        autoRelogin(function needsCreds() {
          // Only prompt over a page that actually rendered; never over a blank/crashed page.
          setTimeout(function () {
            if ((!appAlive() && !appOn) || failureShown()) return;
            if (!lsGet('mtv.panelSeen', false)) panel.open();
            else toast('Not signed in \u2014 press RED to save your Met account', 5000);
          }, 1500);
        }, function (msg) { panel.setStatus(msg); });
      });
    }
    setTimeout(function () {
      safe('initial focus', function () {
        if (appOn) { if (mode === 'browse' && cat.isOpen() && !panel.isOpen() && !bar.inBar(document.activeElement) && !cat.containsFocus()) cat.focusCurrent(); }
        else if (isPerformancePage()) focusPlaySoon();
        else if (!document.activeElement || document.activeElement === document.body) focusFirst();
      });
    }, 2000);
    if (!lsGet('mtv.hintShown', 0) && !safeMode) {
      safe('hint', function () { toast('Tip: YELLOW = search \u00b7 RED = settings \u00b7 hold GREEN = report a problem', 6000); lsSet('mtv.hintShown', 1); });
    }
    setTimeout(function () {
      safe('telemetry diagnostics', function () {
        if (window.__mtvTlmDiagSent) return;
        window.__mtvTlmDiagSent = true;
        var env = envInfo();
        tlm('diagnostics', { engine: env.platform, device: env.device, screen: env.screen, codecs: env.codecs, appMode: appOn, hlsNative: canHlsNative(),
          polyfilled: getFilled().join(','), mode: safeMode ? 'safe' : (lite ? 'styling+speedups' : 'styling'),
          metAppRendered: appAlive(), signedIn: String(loginState.signedIn) });
      });
    }, 4000);
    if (safeMode) safe('safe toast', function () { toast('SAFE MODE \u2014 press BLUE to leave', 5000); });
    dbg('info', 'ready');
  });
}

// webOS opens target=_blank links in a separate browser (or nowhere); keep them in-app so BACK works.
function fixExternalLinks() {
  document.addEventListener('click', function (e) {
    var a = closest(e.target, 'a[target="_blank"]');
    if (a && a.href) a.removeAttribute('target');
  }, true);
}

// The Met site is a React SPA: watch pushState/popstate for route changes.
function watchRoutes() {
  var last = window.location.pathname;
  function check() {
    if (window.location.pathname !== last) {
      last = window.location.pathname;
      dbg('info', 'route ' + last);
      if (mode === 'met') {
        setTimeout(function () {
          safe('route focus', function () {
            if (isPerformancePage()) focusPlaySoon();
            else if (!document.activeElement || document.activeElement === document.body) focusFirst();
          });
        }, 800);
      }
    }
  }
  // Wrap the ORIGINAL functions (an in-place restart keeps the same history object).
  var h = window.history;
  var push = h.__mtvPush || (h.__mtvPush = h.pushState);
  h.pushState = function () { var r = push.apply(this, arguments); setTimeout(check, 0); return r; };
  var rep = h.__mtvReplace || (h.__mtvReplace = h.replaceState);
  h.replaceState = function () { var r = rep.apply(this, arguments); setTimeout(check, 0); return r; };
  window.addEventListener('popstate', function () { setTimeout(check, 0); });
}

// ---- 1.3.0 app shell ----
function bootSplash() {
  // Shown by CSS (html.mtv-app:not(.mtv-ready)::before) until our Browse screen is up.
  var css = 'html.mtv-app:not(.mtv-ready),html.mtv-app:not(.mtv-ready) body{background:#0a0a0e !important}' +
    'html.mtv-app:not(.mtv-ready) body>*{visibility:hidden !important}' +
    'html.mtv-app:not(.mtv-ready)::before{content:"MET OPERA  \\00b7  ON DEMAND";position:fixed;left:0;right:0;top:44%;text-align:center;' +
    'font:700 34px/1 Roboto,Arial,sans-serif;letter-spacing:.3em;color:#e3b65b;z-index:2147483647}' +
    'html.mtv-app:not(.mtv-ready)::after{content:"v' + VERSION + '  \\00b7  loading\\2026";position:fixed;left:0;right:0;top:52%;text-align:center;' +
    'font:400 22px/1 Roboto,Arial,sans-serif;letter-spacing:.08em;color:#8d8996;z-index:2147483647}';
  var st = document.createElement('style');
  st.id = 'mtv-boot';
  st.appendChild(document.createTextNode(css));
  (document.head || document.documentElement).appendChild(st);
  setTimeout(function () { document.documentElement.classList.add('mtv-ready'); }, 15000);   // never stay on the splash
}
function canHlsNative() {
  try { var v = document.createElement('video'); return v.canPlayType('application/vnd.apple.mpegurl') || 'no'; } catch (e) { return 'err'; }
}

function initApp() {
  bar.initBar();
  cat.setHooks({
    play: playPerf, focusBar: bar.focusBar,
    onView: function (kind) { bar.highlightRoute(kind === 'browse' ? 'home' : kind === 'home' ? 'categories' : ''); }
  });
  search.setSearchHooks({
    play: playPerf, focusBar: bar.focusBar,
    openTitle: function (name) { closeSearch(true); cat.openView({ kind: 'title', name: name }); }
  });
  setEngineHooks({
    onOpen: function () { if (mode !== 'play') prevMode = mode === 'met' ? 'browse' : mode; setMode('play'); pui.hide(); },
    onClose: function (reason) {
      pui.hide();
      if (reason === 'replaced' || reason === 'met-player') return;
      setMode(prevMode);
      setTimeout(restoreFocus, 30);
    },
    onStarted: function (resumedFrom) { if (resumedFrom) pui.showResume(resumedFrom); },
    openMetPage: function (path) { setMode('met'); spaNav(path); setTimeout(focusPlaySoon, 1200); },
    relogin: function (cb) { reloginNow(true, function (msg) { toast(msg, 4000); }); setTimeout(cb, 8000); }
  });
  navHooks.upEdge = function () { return isFullscreen() ? false : bar.focusBar(); };
  bar.setActions({
    home: function () { goBrowse({ kind: 'browse' }); },
    categories: function () { goBrowse({ kind: 'home' }); },
    archive: function () { goBrowse({ kind: 'cat', id: 'all' }); },
    search: function () { openSearch(); },
    'continue': function () { goBrowse({ kind: 'list', id: 'cont' }); },
    favorites: function () { goBrowse({ kind: 'list', id: 'fav' }); },
    settings: function () { panel.open(); },
    leaveDown: function () {
      if (mode === 'search' && search.isOpen()) { search.refocus(); return; }
      if (mode === 'met') { focusFirst(); return; }
      if (cat.isOpen()) { cat.focusCurrent(); return; }
      focusFirst();
    }
  });
  cat.open({ kind: 'browse' });
  setMode('browse');
  document.documentElement.classList.add('mtv-ready');
  // Leave the heavy Met home page for its light search route underneath (fewer DOM nodes / images
  // working in the background); the Met app itself keeps running (session, cookies, scripts).
  setTimeout(function () { if (mode !== 'met' && (window.location.pathname === '/' || window.location.pathname === '')) spaNav('/search'); }, 6000);
  // Focus guard: nothing in the hidden Met page may hold focus while our UI is up.
  document.addEventListener('focusin', function (e) {
    if (mode === 'met' || !appOn) return;
    var t = e.target;
    if (!t || t === document.body || /\bmtv-/.test(t.className || '') || closest(t, '.mtv-bar, .mtv-cat, .mtv-search, .mtv-pl, .mtv-panel, .mtv-exit, .mtv-log, .mtv-fail')) return;
    try { t.blur(); } catch (err) { /* ignore */ }
    setTimeout(restoreFocus, 0);
  }, true);
}

function goBrowse(spec) {
  if (mode === 'met') leaveMet();
  if (search.isOpen()) search.close();
  setMode('browse');
  cat.openView(spec);
}
function openSearch() {
  if (mode === 'met') leaveMet();
  setMode('search');
  bar.highlightRoute('search');
  search.open();
}
function closeSearch(silent) {
  search.close();
  setMode('browse');
  bar.highlightRoute(cat.viewKind() === 'browse' ? 'home' : '');
  if (!silent) cat.focusCurrent();
}
function playPerf(id, info) {
  if (castSheet.isOpen()) castSheet.close();
  dbg('info', 'play request ' + id + ' from ' + (info && info.from));
  eng.open(id, info);
}
function restoreFocus() {
  if (panel.isOpen() || exitOpen()) return;
  if (mode === 'search' && search.isOpen()) search.refocus();
  else if (mode === 'browse' && cat.isOpen()) cat.focusCurrent();
}
// Leave the Met page fallback: stop its player (unmount by routing away) and show our UI again.
function leaveMet() {
  try { var vs = document.querySelectorAll('#root video'); for (var i = 0; i < vs.length; i++) vs[i].pause(); } catch (e) { /* ignore */ }
  spaNav('/search');
  setMode('browse');
  setTimeout(restoreFocus, 50);
}

// ---- 'met' fallback mode: the Met title page; start with focus on Play ----
var lastUserKey = 0;
var PLAY_SEL = [
  '.Player .bcc-play-pause-toggle',
  '.Player .vjs-big-play-button',
  '.Player .vjs-play-control',
  '.Player .player-overlay-end-screen button',
  '.Player .video-end button',
  '.PerformanceInfo button'
];
function visibleEl(el) {
  if (!el) return false;
  var r = el.getBoundingClientRect();
  if (r.width < 4 || r.height < 4) return false;
  var cs = window.getComputedStyle(el);
  return cs.visibility !== 'hidden' && cs.display !== 'none' && cs.opacity !== '0';
}
export function findPlay() {
  for (var i = 0; i < PLAY_SEL.length; i++) {
    var list = document.querySelectorAll(PLAY_SEL[i]);
    for (var j = 0; j < list.length; j++) {
      if (visibleEl(list[j]) && !list[j].disabled && !/\bbcc-disabled\b/.test(list[j].className)) return list[j];
    }
  }
  return null;
}
function focusPlaySoon() {
  var started = Date.now();
  var path = window.location.pathname;
  (function attempt() {
    if (window.location.pathname !== path || lastUserKey > started || panel.isOpen() || mode !== 'met') return;
    var el = findPlay();
    if (el) {
      if (!el.hasAttribute('tabindex') && !/^(BUTTON|A|INPUT)$/.test(el.tagName)) el.setAttribute('tabindex', '0');
      focusEl(el);
      if (document.activeElement === el) return;
    }
    if (Date.now() - started < 10000) setTimeout(attempt, 400);
    else if (!document.activeElement || document.activeElement === document.body) focusFirst();
  })();
}

// Navigate inside the Met's React app without a page reload (history + popstate, which React Router follows).
function spaNav(path, after) {
  if (window.location.pathname !== path) {
    try {
      window.history.pushState(null, '', path);
      var ev;
      try { ev = new PopStateEvent('popstate', { state: null }); } catch (e1) { ev = document.createEvent('Event'); ev.initEvent('popstate', false, false); }
      window.dispatchEvent(ev);
    } catch (e) { window.location.href = path; return; }
  }
  if (after) setTimeout(after, 50);
}

// Playback telemetry for the Met page player (fallback mode only; our own player reports itself).
function watchPlayback() {
  var sentFor = '';
  document.addEventListener('playing', function (e) {
    if (mode !== 'met') return;
    var p = window.location.pathname;
    if (sentFor === p || !e.target || e.target.tagName !== 'VIDEO') return;
    sentFor = p;
    var v = e.target;
    tlm('playback', { state: 'playing', engine: 'met-page', kind: p.split('/')[1] || '', size: (v.videoWidth || 0) + 'x' + (v.videoHeight || 0), audioOnly: !v.videoWidth });
  }, true);
}

// ---- Exit confirmation at the home screen ----
var exitEl = null;
var exitTimer = null;
function confirmExit() {
  if (!exitEl || !document.documentElement.contains(exitEl)) {
    exitEl = document.createElement('div');
    exitEl.className = 'mtv-exit';
    exitEl.style.cssText = 'position:fixed;left:0;top:0;right:0;bottom:0;z-index:2147483500;background:rgba(0,0,0,.8);';
    exitEl.innerHTML = '<div class="mtv-panel-box" style="width:760px;margin:320px auto 0;background:#17161c;color:#ece8f0;border:2px solid #e3b65b;border-radius:16px;padding:36px 48px;text-align:center;font:26px Roboto,Arial,sans-serif">' +
      '<h2 style="font-weight:300;color:#e3b65b">Exit Met Opera?</h2>' +
      '<button type="button" data-x="yes" style="font:26px Roboto,Arial,sans-serif;padding:12px 28px;margin:10px">Exit</button>' +
      '<button type="button" data-x="no" style="font:26px Roboto,Arial,sans-serif;padding:12px 28px;margin:10px">Stay</button>' +
      '<div style="margin-top:18px;font-size:17px;color:#8d8996">v' + VERSION + '</div></div>';
    exitEl.addEventListener('click', function (e) {
      var x = e.target.getAttribute('data-x');
      if (x === 'yes') exitApp();
      if (x === 'no') closeExit();
    });
    document.body.appendChild(exitEl);
  }
  exitEl.style.display = 'block';
  exitEl.classList.add('mtv-open');
  exitEl.querySelector('[data-x="no"]').focus();
  clearTimeout(exitTimer);
  exitTimer = setTimeout(closeExit, 8000);
}
function closeExit() { if (exitEl) { exitEl.classList.remove('mtv-open'); exitEl.style.display = 'none'; } setTimeout(restoreFocus, 0); }
function exitOpen() { return !!exitEl && exitEl.classList.contains('mtv-open'); }

function isHome() {
  var p = window.location.pathname;
  return isMetOnDemand() && (p === '/' || p === '' || p.indexOf('/screen/') === 0);
}

function handleBack() {
  if (overlayOpen()) { toggleOverlay(); return; }
  if (failureShown()) { exitApp(); return; }
  if (exitOpen()) { exitApp(); return; }           // BACK twice at home = exit
  if (panel.isOpen()) { panel.close(); setTimeout(restoreFocus, 0); return; }
  if (isFullscreen()) { pui.exitPlayer(); return; }
  if (bar.inBar(document.activeElement)) { bar.handleKey(KEY.DOWN); return; }
  if (appOn) {
    if (mode === 'search') { closeSearch(); return; }
    if (mode === 'met') { leaveMet(); return; }
    if (cat.isOpen() && cat.back()) return;
    confirmExit();
    return;
  }
  if (isHome() || !appAlive() && isMetOnDemand()) { confirmExit(); return; }
  if (window.history.length > 1) window.history.back();
  else window.location.href = HOME_URL;
}

function toggleSafeMode() {
  var on = !lsGet('mtv.safe', false);
  lsSet('mtv.safe', on);
  tlm('safe-mode', { on: on });
  dbg('warn', 'safe mode ' + (on ? 'ON' : 'OFF') + ', reloading');
  toast(on ? 'Safe mode ON \u2014 reloading' : 'Safe mode OFF \u2014 reloading', 1500);
  setTimeout(function () { window.location.replace(HOME_URL); }, 800);
}

// GREEN: short press = debug log; hold ~1 s = send a problem report (the short-press toggle is undone).
var greenDown = 0, greenTimer = null, greenSawUp = false, greenRepeat = false, greenWasOpen = false, greenConsumed = false, greenLastKd = 0;
function onGreenDown() {
  var now = Date.now(), gap = now - greenLastKd;
  greenLastKd = now;
  if (greenConsumed && gap < 400) return;
  greenConsumed = false;
  if (greenDown) { greenRepeat = true; return; }
  greenDown = Date.now(); greenRepeat = false; greenWasOpen = overlayOpen();
  toggleOverlay();
  clearTimeout(greenTimer);
  greenTimer = setTimeout(function () {
    if (!greenDown) return;
    var held = greenRepeat || greenSawUp;
    greenDown = 0;
    if (!held) return;
    greenConsumed = true;
    if (overlayOpen() !== greenWasOpen) toggleOverlay();
    reportProblem('hold-green');
  }, 1000);
}
function onKeyUp(e) {
  if (e.keyCode === KEY.GREEN) { greenSawUp = true; greenDown = 0; greenConsumed = false; }
}

function onKeyDown(e) {
  if (e.keyCode >= 37 && e.keyCode <= 40) lastUserKey = Date.now();
  try { cat.noteKey(); } catch (e0) { /* ignore */ }
  try { handleKey(e); } catch (err) { dbg('error', 'key handler: ' + (err && err.message ? err.message : err)); }
}
function consume(e) { e.preventDefault(); e.stopPropagation(); }
function isBackKey(k, typing) { return k === KEY.BACK || k === KEY.ESC || (k === KEY.BACKSPACE && !typing); }

function handleKey(e) {
  var k = e.keyCode;
  var active = document.activeElement;
  var typing = isTyping(active);

  if (k === KEY.GREEN) { consume(e); onGreenDown(); return; }
  if (k === KEY.BLUE) { consume(e); toggleSafeMode(); return; }
  if (overlayOpen() && (k === KEY.UP || k === KEY.DOWN)) { consume(e); scrollOverlay(k === KEY.DOWN ? 1 : -1); return; }
  if (overlayOpen() && k === KEY.ENTER) { consume(e); toggleOverlay(); reportProblem('green-log-ok'); return; }

  // Playback mode: our player gets every key except RED (settings) while no modal is open.
  if (isFullscreen() && !panel.isOpen() && !exitOpen() && !failureShown() && !overlayOpen()) {
    if (errorShown()) { if (k !== KEY.RED) { consume(e); handleErrorKey(k); return; } }
    else if (k !== KEY.RED) {
      var handled = false;
      try { handled = pui.handleKey(k); } catch (err0) { dbg('error', 'player controls: ' + (err0 && err0.message)); }
      if (!handled && isBackKey(k, false)) { pui.exitPlayer(); handled = true; }
      if (handled || k === KEY.YELLOW || (k >= 37 && k <= 40) || k === KEY.ENTER) { consume(e); return; }
    }
  }

  if (castSheet.isOpen()) { consume(e); castSheet.handleKey(k); return; }   // 1.3.2 title-page Cast sheet

  if (failureShown() && k === KEY.ENTER) { e.preventDefault(); window.location.replace(HOME_URL); return; }

  // Search mode keys (typing, grid, results) before generic BACK handling (BACKSPACE deletes there).
  if (mode === 'search' && search.isOpen() && !panel.isOpen() && !exitOpen() && !bar.inBar(active)) {
    if (k === KEY.BACK || k === KEY.ESC) { consume(e); if (typing) { active.blur(); search.refocus(); } else closeSearch(); return; }
    if (search.handleKey(k, e)) { consume(e); return; }
    if (typing) return;
  }

  if (isBackKey(k, typing)) {
    consume(e);
    if (typing) active.blur();
    handleBack();
    return;
  }

  if (k === KEY.RED) { consume(e); panel.toggle(); if (!panel.isOpen()) setTimeout(restoreFocus, 0); return; }
  if (panel.isOpen() || exitOpen()) { /* modal: fall through to spatial nav inside it */ }
  else {
    if (k === KEY.YELLOW) { consume(e); if (appOn) { if (mode === 'search') closeSearch(); else openSearch(); } else bar.focusBar(); return; }
    if (bar.handleKey(k)) { consume(e); return; }
    if (mode === 'search' && search.isOpen()) {
      if (k >= 37 && k <= 40 || k === KEY.ENTER) { consume(e); search.refocus(); return; }
    }
    if (mode === 'browse' && cat.isOpen()) {
      if (cat.handleKey(k)) { consume(e); return; }
      if (k >= 37 && k <= 40 || k === KEY.ENTER) { consume(e); cat.focusCurrent(); return; }
    }
  }

  // Arrow keys -> spatial navigation (Met fallback pages, settings panel, dialogs).
  var dir = k === KEY.LEFT ? 'left' : k === KEY.RIGHT ? 'right' : k === KEY.UP ? 'up' : k === KEY.DOWN ? 'down' : null;
  if (dir) {
    if (typing && (dir === 'left' || dir === 'right')) return;
    if (active && active.getAttribute && active.getAttribute('role') === 'slider' && (dir === 'left' || dir === 'right')) return;
    consume(e);
    navigate(dir);
    return;
  }

  // OK on a focused non-native control (div with role=button / tabindex) -> click it.
  if (k === KEY.ENTER && active && active !== document.body && !typing) {
    var tag = active.tagName;
    if (tag !== 'A' && tag !== 'BUTTON' && tag !== 'INPUT' && tag !== 'SELECT' && tag !== 'TEXTAREA') {
      consume(e);
      active.click();
    }
  }
}

// Exposed for on-box testing / inspector use.
window.__mtv = {
  version: VERSION, navigate: navigate, focusFirst: focusFirst, isPerformancePage: isPerformancePage,
  perfStats: getStats, toggleLog: toggleOverlay, recover: recoverState, findPlay: findPlay,
  restart: restartMetApp, env: envInfo, errors: getErrors, telemetry: tlmInfo,
  categories: cat, bar: bar, spaNav: spaNav, player: pui, report: reportProblem,
  engine: eng, search: search, castSheet: castSheet, mode: function () { return mode; }, play: playPerf, openSearch: openSearch, metChrome: metChromeVisible,
  snapshot: function (kind) { return serialize(buildSnapshot(kind || 'test')); }, sendReport: sendReport
};

// Boot LAST, so every module-level `var x = ...` above is initialised before start() runs
// (1.3.0 bug: start() ran first and `var appOn = false` then reset the takeover flag).
if (window.__mtvLoaded) {
  dbg('info', 'already loaded');
} else if (isLocalPage()) {
  // The local launcher page only redirects; nothing to do here.
  window.__mtvLoaded = true;
} else {
  window.__mtvLoaded = true;
  start();
}
