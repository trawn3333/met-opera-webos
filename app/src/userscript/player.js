// Talks only to the Met's own Brightcove/video.js player that the page already created.
// We never fetch or play streams ourselves.
//
// Full-screen "fit" (1.2.0): LG's guidance for the webOS video plane is a <video> that is itself
// position:fixed at 0,0 with the app's UI size in px (1920x1080 here), with no transform, border or
// opacity on it, because the hardware plane ignores object-fit and scales the decoded picture
// into the element box. We pin the element there with inline !important styles (so the Met's
// fluid/padding layout can't stretch it), letterbox inside it, hide the site chrome,
// and keep re-checking while playing because React/video.js re-render. Picture modes for Matt to try:
//   std    : fixed 0,0 innerWidth x innerHeight (LG recommendation; default)
//   native : the same, plus the Fullscreen API on the player element
//   fit    : the element box is the exact letterboxed picture rect (for engines that crop with object-fit)
import { toast } from './toast';
import { lsGet, lsSet } from './util';
import { tlm } from './tlm';
import { dbg } from './debugLog';

var FS_CLASS = 'mtv-fs';
var MODES = ['std', 'native', 'fit'];
export var MODE_LABEL = { std: 'Standard', native: 'Native full screen', fit: 'Exact fit' };
var enforceTimer = null;
var touched = [];   // elements we put inline styles on: [el, oldStyleAttr]

export function getPlayerEl() {
  return document.querySelector('.Player video-js, .Player .video-js, video-js#player, .video-js');
}
export function getVideoEl() {
  var host = getPlayerEl();
  return (host && host.querySelector('video')) || document.querySelector('.Player video') || document.querySelector('video');
}
export function getVjs() {
  var host = getPlayerEl();
  var vjs = host ? host.player || null : null;
  if (!vjs && window.videojs && typeof window.videojs.getPlayer === 'function' && host && host.id) {
    try { vjs = window.videojs.getPlayer(host.id); } catch (e) { vjs = null; }
  }
  return vjs;
}

// Returns a minimal adapter over the video.js player (preferred) or the raw <video>.
export function getPlayer() {
  var vjs = getVjs();
  var video = getVideoEl();
  if (!vjs && !video) return null;
  return {
    vjs: vjs, video: video,
    paused: function () { return vjs ? vjs.paused() : video.paused; },
    play: function () {
      var p = vjs ? vjs.play() : video.play();
      if (p && typeof p.catch === 'function') p.catch(function () {});
    },
    pause: function () { if (vjs) vjs.pause(); else video.pause(); },
    time: function (t) {
      if (typeof t === 'number') { if (vjs) vjs.currentTime(t); else video.currentTime = t; }
      return vjs ? vjs.currentTime() : video.currentTime;
    },
    duration: function () { var d = vjs ? vjs.duration() : video.duration; return isFinite(d) ? d : 0; },
    buffered: function () { var b = (vjs ? vjs.buffered() : video.buffered); try { return b && b.length ? b.end(b.length - 1) : 0; } catch (e) { return 0; } },
    userActive: function () { /* our own overlay replaces the Met controls in full screen */ },
    hasStarted: function () { return vjs ? !!vjs.hasStarted() : video.currentTime > 0; }
  };
}

export function isPerformancePage() {
  return /^\/(performance\/detail|broadcast|radio)\//.test(window.location.pathname);
}

export function isFullscreen() {
  return document.documentElement.classList.contains(FS_CLASS);
}

export function pictureMode() { var m = lsGet('mtv.picMode', 'std'); return MODES.indexOf(m) >= 0 ? m : 'std'; }
export function cyclePictureMode() {
  var m = MODES[(MODES.indexOf(pictureMode()) + 1) % MODES.length];
  lsSet('mtv.picMode', m);
  if (isFullscreen()) { exitNative(); applyFit(true); if (m === 'native') enterNative(); }
  tlm('picture-mode', { mode: m });
  return m;
}

function pin(el, css) {
  if (!el) return;
  var found = false;
  for (var i = 0; i < touched.length; i++) if (touched[i][0] === el) { found = true; break; }
  if (!found) touched.push([el, el.getAttribute('style')]);
  for (var k in css) el.style.setProperty(k, css[k], 'important');
}
function unpinAll() {
  for (var i = 0; i < touched.length; i++) {
    var el = touched[i][0], old = touched[i][1];
    if (old === null) el.removeAttribute('style'); else el.setAttribute('style', old);
  }
  touched = [];
}

// Letterboxed rect of a w x h picture inside the W x H viewport.
export function fitRect(vw, vh, W, H) {
  if (!vw || !vh) return { x: 0, y: 0, w: W, h: H };
  var s = Math.min(W / vw, H / vh);
  var w = Math.round(vw * s), h = Math.round(vh * s);
  return { x: Math.round((W - w) / 2), y: Math.round((H - h) / 2), w: w, h: h };
}

export function applyFit(force) {
  if (!isFullscreen()) return;
  var W = window.innerWidth || 1920, H = window.innerHeight || 1080;
  var full = { position: 'fixed', left: '0px', top: '0px', width: W + 'px', height: H + 'px', margin: '0', padding: '0',
    transform: 'none', '-webkit-transform': 'none', border: '0', 'max-width': 'none', 'max-height': 'none', 'min-width': '0', 'min-height': '0',
    opacity: '1', filter: 'none', 'background-color': '#000' };
  var player = document.querySelector('.Player');
  var host = getPlayerEl();
  var video = getVideoEl();
  pin(player, full);
  pin(host, full);
  pin(player && player.parentElement, { transform: 'none', '-webkit-transform': 'none', filter: 'none', opacity: '1' });
  if (!video) return;
  var mode = pictureMode();
  var r = mode === 'fit' ? fitRect(video.videoWidth, video.videoHeight, W, H) : { x: 0, y: 0, w: W, h: H };
  var want = { position: 'fixed', left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px', margin: '0', padding: '0',
    transform: 'none', '-webkit-transform': 'none', border: '0', opacity: '1', 'object-fit': 'contain', 'object-position': '50% 50%',
    'max-width': 'none', 'max-height': 'none', 'background-color': '#000', 'z-index': '0' };
  var cur = video.style;
  if (force || cur.left !== want.left || cur.top !== want.top || cur.width !== want.width || cur.height !== want.height || cur.position !== 'fixed') pin(video, want);
}

function enterNative() {
  var el = document.querySelector('.Player') || getPlayerEl();
  if (!el) return;
  var fn = el.requestFullscreen || el.webkitRequestFullscreen || el.webkitRequestFullScreen;
  try {
    var p = fn && fn.call(el);
    if (p && p.catch) p.catch(function (e) { dbg('warn', 'native fullscreen refused: ' + (e && e.message)); });
  } catch (e) { dbg('warn', 'native fullscreen failed: ' + e.message); }
}
function exitNative() {
  var d = document;
  var cur = d.fullscreenElement || d.webkitFullscreenElement || d.webkitCurrentFullScreenElement;
  if (!cur) return;
  var fn = d.exitFullscreen || d.webkitExitFullscreen || d.webkitCancelFullScreen;
  try { var p = fn && fn.call(d); if (p && p.catch) p.catch(function () {}); } catch (e) { /* ignore */ }
}

export function setFullscreen(on) {
  var was = isFullscreen();
  document.documentElement.classList.toggle(FS_CLASS, !!on);
  clearInterval(enforceTimer);
  if (on) {
    window.scrollTo(0, 0);
    applyFit(true);
    if (pictureMode() === 'native') enterNative();
    enforceTimer = setInterval(function () { applyFit(false); }, 1000);
    if (!was) setTimeout(reportFit, 2500);
  } else {
    exitNative();
    unpinAll();
  }
  // video.js recalculates layout on resize.
  try { window.dispatchEvent(new Event('resize')); } catch (e) { /* old engines */ }
}

// Telemetry: video picture vs element vs viewport (to diagnose zoom/crop on the TV).
export function fitInfo() {
  var v = getVideoEl();
  var r = v ? v.getBoundingClientRect() : null;
  var dev = null;
  try { var sys = window.webOSSystem || window.PalmSystem; var d = sys && sys.deviceInfo; d = typeof d === 'string' ? JSON.parse(d) : d; if (d) dev = (d.screenWidth || '?') + 'x' + (d.screenHeight || '?'); } catch (e) { /* ignore */ }
  var cs = v ? window.getComputedStyle(v) : null;
  return {
    mode: pictureMode(), video: v ? v.videoWidth + 'x' + v.videoHeight : 'none',
    element: r ? [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)].join(',') : '',
    viewport: window.innerWidth + 'x' + window.innerHeight, dpr: window.devicePixelRatio, screen: window.screen ? window.screen.width + 'x' + window.screen.height : '',
    plane: dev, objectFit: cs ? (cs.objectFit || '') : '',
    nativeFs: !!(document.fullscreenElement || document.webkitFullscreenElement)
  };
}
function reportFit() { if (isFullscreen()) tlm('video-fit', fitInfo()); }

function fmt(t) {
  t = Math.max(0, Math.floor(t || 0));
  var h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  return (h ? h + ':' + (m < 10 ? '0' : '') : '') + m + ':' + (s < 10 ? '0' : '') + s;
}
export { fmt };

export function seekBy(delta, quiet) {
  var p = getPlayer();
  if (!p) return false;
  var d = p.duration() || 0;
  var t = Math.max(0, Math.min(d ? d - 1 : Infinity, p.time() + delta));
  p.time(t);
  if (!quiet) toast((delta > 0 ? '\u25B6\u25B6 ' : '\u25C0\u25C0 ') + fmt(t) + (d ? ' / ' + fmt(d) : ''), 1500);
  return true;
}

// Returns true if handled.
export function mediaKey(action) {
  var p = getPlayer();
  if (!p) return false;
  if (action === 'play') { p.play(); setFullscreen(true); }
  else if (action === 'pause') { p.pause(); }
  else if (action === 'toggle') { if (p.paused()) { p.play(); setFullscreen(true); } else { p.pause(); } }
  else if (action === 'stop') { p.pause(); setFullscreen(false); }
  else if (action === 'ff') { seekBy(30); }
  else if (action === 'rw') { seekBy(-10); }
  return true;
}

// Go full-screen automatically when playback starts (from the Met's own play button too).
export function initAutoFullscreen() {
  document.addEventListener('play', function (e) {
    var t = e.target;
    if (t && t.tagName === 'VIDEO' && isPerformancePage() && !isFullscreen()) setFullscreen(true);
  }, true);
  window.addEventListener('resize', function () { if (isFullscreen()) applyFit(true); });
  document.addEventListener('loadedmetadata', function (e) { if (e.target && e.target.tagName === 'VIDEO' && isFullscreen()) applyFit(true); }, true);
}

// Leave full-screen state when the SPA navigates away from a performance page.
export function onRouteChange() {
  if (!isPerformancePage() && isFullscreen()) setFullscreen(false);
}
