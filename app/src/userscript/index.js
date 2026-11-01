// Met Opera TV userscript: injected by webOS into every page the app opens
// (webOSUserScripts/userScript.js). Entry point.
//
// Design rule: every feature is isolated in try/catch (see `safe`) so one failure can never break
// the Met page; polyfills and error capture run first; safe mode disables everything cosmetic.
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
import { getPlayerEl, mediaKey, isPerformancePage, isFullscreen, setFullscreen, seekBy, getPlayer, initAutoFullscreen, onRouteChange } from './player';
import * as panel from './settingsPanel';
import { autoRelogin, loginState, getStatusText, HOME_URL } from './relogin';
import { toast } from './toast';
import * as bar from './topBar';
import * as cat from './cat/screen';
import { navHooks, candidates } from './spatialNav';
import * as pui from './playerUI';
import { reportProblem, initPlaybackWatch, setReportStateProvider, buildSnapshot, serialize, sendReport } from './report';
import { pictureMode, fitInfo } from './player';
import { startRecovery, restartMetApp, recoverState, recoverHooks, failureShown, appAlive } from './recover';

function safe(name, fn) {
  try { return fn(); } catch (e) { dbg('error', name + ' failed: ' + (e && e.message ? e.message : e)); return undefined; }
}

var safeMode = false;

if (window.__mtvLoaded) {
  dbg('info', 'already loaded');
} else if (isLocalPage()) {
  // The local launcher page only redirects; nothing to do here.
  window.__mtvLoaded = true;
} else {
  window.__mtvLoaded = true;
  start();
}

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
      return { fullscreen: isFullscreen(), pictureMode: pictureMode(), fit: isFullscreen() ? fitInfo() : null, playerControls: pui.isShown(),
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
    if (!safeMode && isMetOnDemand()) safe('top bar', initMenu);
    safe('focus tracking', initFocusTracking);
    safe('auto fullscreen', initAutoFullscreen);
    safe('external links', fixExternalLinks);
    safe('routes', watchRoutes);
    safe('playback telemetry', watchPlayback);
    safe('player controls', function () {
      pui.initPlayerUI();
      pui.setPlayerHooks({ onExit: function () { setTimeout(focusPlaySoon, 300); }, onReport: function () { reportProblem('player-button'); } });
    });
    if (isMetOnDemand()) safe('playback failure watch', function () { initPlaybackWatch(isPerformancePage); });
    if (isMetOnDemand()) {
      safe('auto relogin', function () {
        autoRelogin(function needsCreds() {
          // Only prompt over a page that actually rendered; never over a blank/crashed page.
          setTimeout(function () {
            if (!appAlive() || failureShown()) return;
            if (!lsGet('mtv.panelSeen', false)) panel.open();
            else toast('Not signed in \u2014 press RED to save your Met account', 5000);
          }, 1500);
        }, function (msg) { panel.setStatus(msg); });
      });
    }
    setTimeout(function () {
      safe('initial focus', function () {
        if (isPerformancePage()) focusPlaySoon();
        else if (!document.activeElement || document.activeElement === document.body) focusFirst();
      });
    }, 2000);
    if (!lsGet('mtv.hintShown', 0) && !safeMode) {
      safe('hint', function () { toast('Tip: RED = settings \u00b7 GREEN = debug log \u00b7 hold GREEN = report a problem', 6000); lsSet('mtv.hintShown', 1); });
    }
    setTimeout(function () {
      safe('telemetry diagnostics', function () {
        if (window.__mtvTlmDiagSent) return;
        window.__mtvTlmDiagSent = true;
        var env = envInfo();
        tlm('diagnostics', { engine: env.platform, device: env.device, screen: env.screen, codecs: env.codecs,
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
      safe('route change', onRouteChange);
      safe('bar route', function () { bar.highlightRoute(); });
      setTimeout(function () {
        safe('route focus', function () {
          if (isPerformancePage()) focusPlaySoon();
          else if (!document.activeElement || document.activeElement === document.body) focusFirst();
        });
      }, 800);
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

// ---- Title pages: start with focus on Play (the player loads a moment after the page) ----
var lastUserKey = 0;
var PLAY_SEL = [
  '.Player .bcc-play-pause-toggle',            // the Met's own (Brightcove "tracks player") play button
  '.Player .vjs-big-play-button',
  '.Player .vjs-play-control',
  '.Player .player-overlay-end-screen button', // signed out: "Start free 7-day trial" paywall
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
    if (window.location.pathname !== path || lastUserKey > started || panel.isOpen()) return;
    var el = findPlay();
    if (el) {
      if (!el.hasAttribute('tabindex') && !/^(BUTTON|A|INPUT)$/.test(el.tagName)) el.setAttribute('tabindex', '0');
      focusEl(el);
      if (document.activeElement === el) { dbg('info', 'focus on Play: ' + (el.className || el.tagName)); return; }
    }
    if (Date.now() - started < 10000) setTimeout(attempt, 400);
    else if (!document.activeElement || document.activeElement === document.body) focusFirst();
  })();
}

// ---- Top menu bar + Categories screen ----
function initMenu() {
  bar.initBar();
  cat.setHooks({ openPath: function (p) { spaNav(p); }, focusBar: bar.focusBar, onClose: function () { bar.highlightRoute(); } });
  navHooks.upEdge = function () { return isFullscreen() ? false : bar.focusBar(); }; // never steal focus from the player
  bar.setActions({
    home: function () { closeCat(); spaNav('/', function () { window.scrollTo(0, 0); setTimeout(function () { focusFirst(); }, 600); }); },
    categories: function () { bar.highlightRoute('categories'); cat.open(); },
    archive: function () {
      closeCat();
      spaNav('/', function () {
        waitFor(function () { return document.querySelector('.VideoAndAudioCatalog-header') && document.querySelector('.SearchFilters'); }, function (ok) {
          if (!ok) { toast('The Met archive filter has not loaded yet', 3000); return; }
          var hdr = document.querySelector('.VideoAndAudioCatalog-header');
          window.scrollTo(0, Math.max(0, hdr.getBoundingClientRect().top + window.pageYOffset - 180));
          var c = candidates(document.querySelector('.SearchFilters'));
          if (c.length) focusEl(c[0].el);
        });
      });
    },
    search: function () {
      closeCat();
      spaNav('/search', function () {
        waitFor(function () { return document.querySelector('#root input[type="text"], #root input[type="search"], #root input:not([type])'); }, function (ok, inp) { if (ok) focusEl(inp); });
      });
    },
    'continue': function () { closeCat(); goToRow(/^Continue Watching/i, 'Continue Watching is empty (or you are signed out)'); },
    favorites: function () { closeCat(); goToRow(/^My Favorites/i, 'No favorites yet (or you are signed out)'); },
    settings: function () { panel.open(); },
    leaveDown: function (last) {
      if (cat.isOpen()) { cat.focusCurrent(); return; }
      if (last && document.documentElement.contains(last) && !panel.isOpen()) {
        var r = last.getBoundingClientRect();
        if (r.width > 0 && r.bottom > 64 && r.top < window.innerHeight) { focusEl(last); return; }
      }
      focusFirst();
    }
  });
}
function closeCat() { if (cat.isOpen()) cat.close(); }
function afterCatClose() { setTimeout(function () { if (!document.activeElement || document.activeElement === document.body) focusFirst(); }, 50); }

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
function waitFor(test, cb, ms) {
  var t0 = Date.now();
  (function poll() {
    var r = null;
    try { r = test(); } catch (e) { r = null; }
    if (r) { cb(true, r); return; }
    if (Date.now() - t0 > (ms || 10000)) { cb(false); return; }
    setTimeout(poll, 300);
  })();
}
// Scroll to one of the Met's own home rows (e.g. Continue Watching) and focus its first tile.
function goToRow(re, emptyMsg) {
  spaNav('/', function () {
    var find = function () {
      var hs = document.querySelectorAll('.Grid-header, .Grid h2');
      for (var i = 0; i < hs.length; i++) if (re.test((hs[i].textContent || '').replace(/^\s+/, ''))) return hs[i];
      return null;
    };
    waitFor(function () { return find() || (document.querySelectorAll('.Grid-header').length > 2 && 'none'); }, function (ok, h) {
      if (!ok || h === 'none') { toast(emptyMsg, 3500); return; }
      var grid = closest(h, '.Grid') || h.parentNode.parentNode;
      window.scrollTo(0, Math.max(0, h.getBoundingClientRect().top + window.pageYOffset - 150));
      var c = candidates(grid), pick = null;
      for (var i = 0; i < c.length && !pick; i++) if (closest(c[i].el, '.Tile')) pick = c[i].el; // first tile, not the row header link
      if (pick || c.length) focusEl(pick || c[0].el);
    }, 8000);
  });
}

// Playback telemetry: one event per title page when the Met's player actually starts (no personal data).
function watchPlayback() {
  var sentFor = '';
  document.addEventListener('playing', function (e) {
    var p = window.location.pathname;
    if (sentFor === p || !e.target || e.target.tagName !== 'VIDEO') return;
    sentFor = p;
    var v = e.target;
    tlm('playback', { state: 'playing', kind: p.split('/')[1] || '', size: (v.videoWidth || 0) + 'x' + (v.videoHeight || 0),
      fullscreen: isFullscreen(), audioOnly: !v.videoWidth });
  }, true);
}

// ---- Exit confirmation at the home screen ----
var exitEl = null;
var exitTimer = null;
function confirmExit() {
  if (!exitEl || !document.documentElement.contains(exitEl)) {
    exitEl = document.createElement('div');
    exitEl.className = 'mtv-exit';
    // Inline fallback styles so it is visible even in safe mode.
    exitEl.style.cssText = 'position:fixed;left:0;top:0;right:0;bottom:0;z-index:2147483500;background:rgba(0,0,0,.8);';
    exitEl.innerHTML = '<div class="mtv-panel-box" style="width:760px;margin:320px auto 0;background:#1d1712;color:#f4ead7;border:2px solid #c9a227;border-radius:14px;padding:36px 48px;text-align:center;font:26px Georgia,serif">' +
      '<h2 style="font-weight:normal;color:#f2c14e">Exit Met Opera?</h2>' +
      '<button type="button" data-x="yes" style="font:26px Georgia,serif;padding:12px 28px;margin:10px">Exit</button>' +
      '<button type="button" data-x="no" style="font:26px Georgia,serif;padding:12px 28px;margin:10px">Stay</button></div>';
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
function closeExit() { if (exitEl) { exitEl.classList.remove('mtv-open'); exitEl.style.display = 'none'; } }
function exitOpen() { return !!exitEl && exitEl.classList.contains('mtv-open'); }

function isHome() {
  var p = window.location.pathname;
  return isMetOnDemand() && (p === '/' || p === '' || p.indexOf('/screen/') === 0);
}

function closeMetLoginModal() {
  var btn = document.querySelector('.Login .Login-close');
  if (btn) { btn.click(); return true; }
  return false;
}

function handleBack() {
  if (overlayOpen()) { toggleOverlay(); return; }
  if (failureShown()) { exitApp(); return; }
  if (exitOpen()) { exitApp(); return; }           // BACK twice at home = exit
  if (panel.isOpen()) { panel.close(); return; }
  if (cat.isOpen()) { cat.back(); if (!cat.isOpen()) afterCatClose(); return; }
  if (bar.inBar(document.activeElement)) { bar.handleKey(KEY.DOWN); return; }
  if (closeMetLoginModal()) return;
  if (isFullscreen()) {                            // BACK with hidden controls leaves the full-screen player
    pui.exitPlayer();
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
// A hold is only recognised when the TV delivers key-repeat or keyup events, so a lost keyup can
// never turn a normal press into a report.
var greenDown = 0, greenTimer = null, greenSawUp = false, greenRepeat = false, greenWasOpen = false, greenConsumed = false, greenLastKd = 0;
function onGreenDown() {
  var now = Date.now(), gap = now - greenLastKd;
  greenLastKd = now;
  if (greenConsumed && gap < 400) return;          // still holding after the report fired (key repeat)
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
  try { handleKey(e); } catch (err) { dbg('error', 'key handler: ' + (err && err.message ? err.message : err)); }
}

function handleKey(e) {
  var k = e.keyCode;
  var active = document.activeElement;
  var typing = isTyping(active);

  // Debug + safe mode keys work in every state.
  if (k === KEY.GREEN) { e.preventDefault(); e.stopPropagation(); onGreenDown(); return; }
  if (k === KEY.BLUE) { e.preventDefault(); e.stopPropagation(); toggleSafeMode(); return; }
  if (overlayOpen() && (k === KEY.UP || k === KEY.DOWN)) { e.preventDefault(); e.stopPropagation(); scrollOverlay(k === KEY.DOWN ? 1 : -1); return; }
  if (overlayOpen() && k === KEY.ENTER) { e.preventDefault(); e.stopPropagation(); toggleOverlay(); reportProblem('green-log-ok'); return; }

  // Full-screen player: our remote-first controls get every key except RED/YELLOW (settings/menu).
  if (isFullscreen() && !safeMode && !panel.isOpen() && !exitOpen() && !failureShown() && !overlayOpen() && k !== KEY.RED && k !== KEY.YELLOW) {
    var handled = false;
    try { handled = pui.handleKey(k); } catch (err0) { dbg('error', 'player controls: ' + (err0 && err0.message)); }
    if (handled) { e.preventDefault(); e.stopPropagation(); return; }
  }

  // Failure screen: OK reloads the Met home page.
  if (failureShown() && k === KEY.ENTER) { e.preventDefault(); window.location.replace(HOME_URL); return; }

  // BACK (461) on the remote; ESC for desktop testing. Backspace only when not typing.
  if (k === KEY.BACK || k === KEY.ESC || (k === KEY.BACKSPACE && !typing)) {
    e.preventDefault(); e.stopPropagation();
    if (typing) active.blur(); // dismiss the field (and on-screen keyboard), then act as BACK
    handleBack();
    return;
  }

  if (k === KEY.RED) { e.preventDefault(); e.stopPropagation(); panel.toggle(); return; }
  if (panel.isOpen() || exitOpen()) { /* modal: fall through to spatial nav inside it */ }
  else {
    // YELLOW: jump to the top menu from anywhere (not in the full-screen player).
    if (k === KEY.YELLOW && !isFullscreen() && bar.focusBar()) { e.preventDefault(); e.stopPropagation(); return; }
    if (bar.handleKey(k)) { e.preventDefault(); e.stopPropagation(); return; }
    if (cat.isOpen()) {
      if (cat.handleKey(k)) { e.preventDefault(); e.stopPropagation(); return; }
      if (k >= 37 && k <= 40 || k === KEY.ENTER) { e.preventDefault(); e.stopPropagation(); cat.focusCurrent(); return; }
    }
  }

  // Media keys
  var media = null;
  if (k === KEY.PLAY) media = 'play';
  else if (k === KEY.PAUSE) media = 'pause';
  else if (k === KEY.PLAY_PAUSE) media = 'toggle';
  else if (k === KEY.STOP) media = 'stop';
  else if (k === KEY.FF) media = 'ff';
  else if (k === KEY.RW) media = 'rw';
  if (media) {
    if (mediaKey(media)) { e.preventDefault(); e.stopPropagation(); }
    return;
  }

  // In the full-screen player with nothing focused: OK toggles play, LEFT/RIGHT seek,
  // UP/DOWN bring focus into the Met player's own controls.
  if (isFullscreen() && !panel.isOpen() && !exitOpen()) {
    var inControls = active && active !== document.body && closest(active, '.Player') &&
      active.tagName !== 'VIDEO' && active.tagName !== 'VIDEO-JS';
    if (!inControls) {
      if (k === KEY.ENTER) { e.preventDefault(); e.stopPropagation(); mediaKey('toggle'); return; }
      if (k === KEY.LEFT || k === KEY.RIGHT) { e.preventDefault(); e.stopPropagation(); seekBy(k === KEY.RIGHT ? 10 : -10); return; }
    }
  }

  // Arrow keys -> spatial navigation (let text inputs keep LEFT/RIGHT for the caret).
  var dir = k === KEY.LEFT ? 'left' : k === KEY.RIGHT ? 'right' : k === KEY.UP ? 'up' : k === KEY.DOWN ? 'down' : null;
  if (dir) {
    if (typing && (dir === 'left' || dir === 'right')) return;
    // Sliders (volume/progress) in the Met player handle LEFT/RIGHT themselves.
    if (active && active.getAttribute && active.getAttribute('role') === 'slider' && (dir === 'left' || dir === 'right')) return;
    e.preventDefault(); e.stopPropagation();
    navigate(dir);
    if (isFullscreen()) { var pl = getPlayer(); if (pl) pl.userActive(); }
    return;
  }

  // OK on a focused non-native control (div with role=button / tabindex) -> click it.
  if (k === KEY.ENTER && active && active !== document.body && !typing) {
    var tag = active.tagName;
    if (tag !== 'A' && tag !== 'BUTTON' && tag !== 'INPUT' && tag !== 'SELECT' && tag !== 'TEXTAREA') {
      e.preventDefault(); e.stopPropagation();
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
  snapshot: function (kind) { return serialize(buildSnapshot(kind || 'test')); }, sendReport: sendReport
};
