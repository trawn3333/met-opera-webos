// 1.3.0 playback engine: OUR OWN <video>, no Met player, no Met chrome.
//
// Why: up to 1.2.0 we drove the Met's title page + Brightcove/video.js player and tried to pin its
// <video> full screen. On the TV that path never reached playback in 1.2.0 (title page loaded, no
// 'play' ever fired, so full screen + our controls never engaged), and the Met's header/track list/
// end-screen overlays sat on top. Now we play the stream ourselves, exactly as the Met's player does:
//   1. GET  middleware /client/performance/<id>              -> name, extId, cue points, resume position
//   2. GET  middleware /client/authorization?reference_id=..  -> 204 when the account may watch it
//   3. GET  edge.api.brightcove.com/playback/v1/.../ref:<extId> (public policy key from the Met's
//      Brightcove player config) -> clear (no DRM) HLS (to 1080p) + progressive MP4 (720p) + VTT tracks
// The <video> is a direct child of our player root, position:fixed, sized to the exact letterboxed
// picture rect (webOS: the hardware video plane scales the picture into the element box and ignores
// object-fit). Progress is mirrored to the Met (/client/event update-video-position every 10 s, like the
// site) so Continue Watching stays in sync. Fallbacks: next source -> fresh stream URLs -> error screen
// with "Try again" / "Use the Met's player" (the old page player) / Back.
import { castOf } from './cast/cast';
import { toast } from './toast';
import { lsGet, lsSet } from './util';
import { tlm } from './tlm';
import { dbg } from './debugLog';
import { req, mw } from './net';
import { KEY } from './keys';
import { autoReport } from './report';

var BC_CFG = 'https://players.brightcove.net/76009399001/ybIjNjWYs_default/config.json';
var BC_EDGE = 'https://edge.api.brightcove.com/playback/v1/accounts/76009399001/videos/ref:';
var PK_KEY = 'mtv.bcpk';
var START_TIMEOUT = 20000, STALL_MS = 25000, SYNC_MS = 10000;
var MODES = ['fit', 'full'];
export var MODE_LABEL = { fit: 'Exact fit', full: 'Full screen box' };
export var STREAM_LABEL = { auto: 'Auto (HD, adaptive)', hls: 'HLS adaptive', mp4: 'MP4 720p (most compatible)' };

var S = null;               // current playback session
var root = null, vEl = null, capEl = null, audEl = null, loadEl = null, errEl = null;
var hooks = { onOpen: null, onClose: null, onError: null, openMetPage: null, onStarted: null, relogin: null };
export function setEngineHooks(h) { for (var k in h) hooks[k] = h[k]; }
var tickTimer = null;

function esc(s) { return String(s === undefined || s === null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

// ---------- public state ----------
export function isFullscreen() { return !!S; }               // "in playback mode" (name kept for older call sites)
export function isPlaying() { return !!S; }
export function isPerformancePage() { return /^\/(performance\/detail|broadcast|radio)\//.test(window.location.pathname); }
export function getVideoEl() { return vEl; }
export function current() { return S ? { id: S.id, name: S.meta ? S.meta.name : S.info.title, audio: S.audio, src: S.srcKind || '', phase: S.phase } : null; }
export function getPlayer() {
  var v = vEl;
  if (!S || !v) return null;
  return {
    video: v,
    paused: function () { return v.paused; },
    play: function () { var p = v.play(); if (p && typeof p.catch === 'function') p.catch(function () {}); },
    pause: function () { v.pause(); },
    time: function (t) { if (typeof t === 'number') { try { v.currentTime = t; } catch (e) { /* not seekable yet */ } } return v.currentTime || 0; },
    duration: function () { var d = v.duration; if (isFinite(d) && d > 0) return d; return S && S.meta && S.meta.runTime ? S.meta.runTime / 1000 : 0; },
    buffered: function () { try { var b = v.buffered; return b && b.length ? b.end(b.length - 1) : 0; } catch (e) { return 0; } },
    userActive: function () {},
    hasStarted: function () { return !!(S && S.startedAt); }
  };
}
export function title() { return S ? (S.meta && S.meta.name) || S.info.title || '' : ''; }
export function subtitle() {
  if (!S || !S.meta) return '';
  var m = S.meta, d = String(m.performanceDate || '').slice(0, 10), bits = [];
  if (d) bits.push(fmtDate(d));
  bits.push(S.audio ? 'Radio broadcast' : m.resolutionType === 'HD' ? 'Live in HD' : 'Met telecast');
  return bits.join(' \u00b7 ');
}
export function chapters() { return S && S.chs ? S.chs : []; }
// 1.3.2: the performance's cast (Met data) for the Cast panel.
export function castInfo() { return S && S.meta ? castOf(S.meta) : null; }

// ---------- picture + stream settings ----------
export function pictureMode() { var m = lsGet('mtv.picMode2', 'fit'); return MODES.indexOf(m) >= 0 ? m : 'fit'; }
export function setPictureMode(m) { lsSet('mtv.picMode2', m); applyFit(true); tlm('picture-mode', { mode: m }); }
export function cyclePictureMode() { var m = MODES[(MODES.indexOf(pictureMode()) + 1) % MODES.length]; setPictureMode(m); return m; }
export function streamPref() { var s = lsGet('mtv.stream', 'auto'); return STREAM_LABEL[s] ? s : 'auto'; }
export function setStreamPref(s) {
  lsSet('mtv.stream', s);
  tlm('stream-pref', { to: s });
  if (S && S.srcs) { var at = vEl ? vEl.currentTime : 0; S.order = sourceOrder(S.srcs); startSource(0, at, 'pref'); }
}
export function syncEnabled() { return lsGet('mtv.sync', true) !== false; }

// Letterboxed rect of a w x h picture inside the W x H viewport.
export function fitRect(vw, vh, W, H) {
  if (!vw || !vh) return { x: 0, y: 0, w: W, h: H };
  var s = Math.min(W / vw, H / vh);
  var w = Math.round(vw * s), h = Math.round(vh * s);
  return { x: Math.round((W - w) / 2), y: Math.round((H - h) / 2), w: w, h: h };
}
function viewport() { return { W: window.innerWidth || document.documentElement.clientWidth || 1920, H: window.innerHeight || document.documentElement.clientHeight || 1080 }; }
export function applyFit(force) {
  if (!vEl) return;
  var vp = viewport();
  var r = pictureMode() === 'fit' && vEl.videoWidth ? fitRect(vEl.videoWidth, vEl.videoHeight, vp.W, vp.H) : { x: 0, y: 0, w: vp.W, h: vp.H };
  var s = vEl.style;
  var want = [r.x + 'px', r.y + 'px', r.w + 'px', r.h + 'px'];
  if (force || s.left !== want[0] || s.top !== want[1] || s.width !== want[2] || s.height !== want[3]) {
    s.left = want[0]; s.top = want[1]; s.width = want[2]; s.height = want[3];
  }
}
export function fitInfo() {
  var v = vEl;
  var r = v ? v.getBoundingClientRect() : null;
  var dev = null;
  try { var sys = window.webOSSystem || window.PalmSystem; var d = sys && sys.deviceInfo; d = typeof d === 'string' ? JSON.parse(d) : d; if (d) dev = (d.screenWidth || '?') + 'x' + (d.screenHeight || '?'); } catch (e) { /* ignore */ }
  var vp = viewport();
  var exp = v && v.videoWidth ? fitRect(v.videoWidth, v.videoHeight, vp.W, vp.H) : null;
  return {
    engine: 'own', mode: pictureMode(), src: S ? S.srcKind : '', video: v ? v.videoWidth + 'x' + v.videoHeight : 'none',
    element: r ? [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)].join(',') : '',
    expected: exp ? [exp.x, exp.y, exp.w, exp.h].join(',') : '',
    viewport: vp.W + 'x' + vp.H, dpr: window.devicePixelRatio, screen: window.screen ? window.screen.width + 'x' + window.screen.height : '',
    plane: dev, metChromeVisible: metChromeVisible()
  };
}
// Any Met element still painting over/around the video? (should always be 0 in our player)
export function metChromeVisible() {
  var n = 0;
  try {
    var kids = document.body.children;
    for (var i = 0; i < kids.length; i++) {
      var k = kids[i];
      if (/\bmtv-/.test(k.className || '') || k.tagName === 'SCRIPT' || k.tagName === 'STYLE' || k.tagName === 'NOSCRIPT') continue;
      var r = k.getBoundingClientRect();
      var cs = window.getComputedStyle(k);
      if (r.width > 0 && r.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden') n++;
    }
  } catch (e) { /* ignore */ }
  return n;
}

// ---------- DOM ----------
function ensureRoot() {
  if (root && document.documentElement.contains(root)) return;
  root = document.createElement('div');
  root.className = 'mtv-pl';
  root.innerHTML = '<div class="mtv-pl-aud"></div><div class="mtv-pl-cap"></div>' +
    '<div class="mtv-pl-load"><div class="mtv-spin"></div><div class="mtv-pl-load-t"></div><div class="mtv-pl-load-s"></div></div>' +
    '<div class="mtv-pl-err"></div>';
  document.body.appendChild(root);
  audEl = root.querySelector('.mtv-pl-aud');
  capEl = root.querySelector('.mtv-pl-cap');
  loadEl = root.querySelector('.mtv-pl-load');
  errEl = root.querySelector('.mtv-pl-err');
  errEl.addEventListener('click', function (e) {
    var b = e.target; while (b && b !== errEl && !b.hasAttribute('data-x')) b = b.parentElement;
    if (b && b !== errEl) errAction(b.getAttribute('data-x'));
  });
}
export function playerRoot() { ensureRoot(); return root; }

function showLoading(t, s) {
  loadEl.style.display = 'block';
  loadEl.querySelector('.mtv-pl-load-t').textContent = t || '';
  loadEl.querySelector('.mtv-pl-load-s').textContent = s || '';
}
function hideLoading() { if (loadEl) loadEl.style.display = 'none'; }

function makeVideo() {
  killVideo();
  vEl = document.createElement('video');
  vEl.className = 'mtv-pl-video';
  vEl.setAttribute('preload', 'auto');
  vEl.setAttribute('playsinline', '');
  vEl.setAttribute('webkit-playsinline', '');
  vEl.setAttribute('tabindex', '-1');
  var s = vEl.style;
  s.position = 'fixed'; s.left = '0px'; s.top = '0px'; s.width = viewport().W + 'px'; s.height = viewport().H + 'px';
  s.margin = '0'; s.padding = '0'; s.border = '0'; s.background = '#000'; s.zIndex = '0';
  var evs = ['loadedmetadata', 'playing', 'pause', 'waiting', 'error', 'ended', 'timeupdate', 'seeked', 'canplay'];
  for (var i = 0; i < evs.length; i++) vEl.addEventListener(evs[i], onMedia, false);
  root.insertBefore(vEl, root.firstChild);
}
function killVideo() {
  if (!vEl) return;
  var v = vEl;
  vEl = null;
  try { v.pause(); } catch (e) { /* ignore */ }
  try { v.removeAttribute('src'); v.load(); } catch (e2) { /* releases the hardware decoder on webOS */ }
  if (v.parentNode) v.parentNode.removeChild(v);
}

// ---------- open / close ----------
// info: {title, img, from}
export function open(perfId, info) {
  if (!perfId) return;
  if (S) close('replaced');
  ensureRoot();
  S = { id: perfId, info: info || {}, t0: Date.now(), phase: 'meta', srcIdx: 0, order: [], loaded: false, startedAt: 0, errors: [],
    stalls: 0, refetched: false, lastT: 0, lastMove: Date.now(), lastSync: 0, watched: 0, lastTick: Date.now(), tracks: [], thumbs: null };
  var my = S;
  root.style.display = 'block';
  root.className = 'mtv-pl';
  errEl.style.display = 'none';
  audEl.style.display = 'none';
  capEl.innerHTML = '';
  showLoading(my.info.title || '', 'Starting\u2026');
  if (hooks.onOpen) hooks.onOpen();
  clearInterval(tickTimer);
  tickTimer = setInterval(tick, 1000);
  dbg('info', 'play ' + perfId + ' (' + (my.info.title || '') + ')');
  mw('GET', '/performance/' + encodeURIComponent(perfId), null, function (err, meta, status) {
    if (S !== my) return;
    if (err || !meta || !meta.extId) return fail('meta', { error: err || 'no extId', status: status });
    my.meta = meta;
    my.audio = meta.mediaType !== 'VIDEO';
    my.chs = parseChapters(meta.cuePoints);
    showLoading(meta.name, subtitle());
    if (my.audio) showAudioArt();
    my.phase = 'auth';
    mw('GET', '/authorization?reference_id=' + encodeURIComponent(meta.extId), null, function (e2, d2, st2) {
      if (S !== my) return;
      if (st2 === 401 || st2 === 403) return fail('not-entitled', { status: st2 });
      if (e2) dbg('warn', 'authorization check: ' + e2 + ' (continuing)');
      my.phase = 'stream-info';
      playbackInfo(meta.extId, false, function (e3, bc) {
        if (S !== my) return;
        if (e3 || !bc) return fail('stream-info', { error: e3 });
        useInfo(bc);
        startSource(0, resumePoint(), 'start');
      });
    });
  });
}

function useInfo(bc) {
  S.bc = { duration: bc.duration, poster: bc.poster };
  S.srcs = pickSources(bc.sources || []);
  S.order = sourceOrder(S.srcs);
  S.tracks = textTracksFrom(bc.text_tracks || []);
  S.thumbSrc = thumbTrackFrom(bc.text_tracks || []);
  if (!S.chs.length && bc.cue_points) S.chs = parseChapters(bc.cue_points);
  autoSubtitles();
}

export function close(reason) {
  if (!S) return;
  var my = S;
  try { syncPosition(true); } catch (e) { /* ignore */ }
  try { saveLocal(); } catch (e2) { /* ignore */ }
  tlm('playback-end', { reason: reason || 'back', src: my.srcKind || '', watchedSec: Math.round(my.watched), at: vEl ? Math.round(vEl.currentTime) : 0,
    stalls: my.stalls, errors: my.errors.length, started: !!my.startedAt, audio: !!my.audio });
  S = null;
  clearInterval(tickTimer);
  killVideo();
  if (root) { root.style.display = 'none'; capEl.innerHTML = ''; audEl.style.display = 'none'; errEl.style.display = 'none'; hideLoading(); }
  if (hooks.onClose) hooks.onClose(reason);
}
// Compatibility with the 1.2.0 call sites: setFullscreen(false) == leave playback.
export function setFullscreen(on) { if (!on) close('exit'); }

// ---------- stream info ----------
function policyKey(force, cb) {
  var c = lsGet(PK_KEY, null);
  if (!force && c && c.k && Date.now() - c.t < 7 * 86400000) { cb(null, c.k); return; }
  req(BC_CFG, { json: true, timeout: 20000 }, function (err, d) {
    var k = d && d.video_cloud && d.video_cloud.policy_key;
    if (err || !k) { if (c && c.k) { cb(null, c.k); return; } cb(err || 'no policy key'); return; }
    lsSet(PK_KEY, { k: k, t: Date.now() });
    cb(null, k);
  });
}
function playbackInfo(extId, forceKey, cb) {
  policyKey(forceKey, function (err, pk) {
    if (err) { cb('policy key: ' + err); return; }
    req(BC_EDGE + encodeURIComponent(extId), { json: true, timeout: 25000, headers: { Accept: 'application/json;pk=' + pk } }, function (e2, d, st) {
      if ((st === 401 || st === 403) && !forceKey) { playbackInfo(extId, true, cb); return; }
      cb(e2, d);
    });
  });
}
function pickSources(list) {
  var hls = null, mp4 = null, mp4h = -1;
  for (var i = 0; i < list.length; i++) {
    var s = list[i];
    if (!s || !s.src || !/^https:/.test(s.src)) continue;
    if (/mpegurl/i.test(s.type || '')) { if (!hls) hls = s.src; }
    else if ((s.container || '').toUpperCase() === 'MP4' && (s.height || 0) > mp4h) { mp4 = s.src; mp4h = s.height || 0; }
  }
  return { hls: hls, mp4: mp4, mp4h: mp4h };
}
function canHls() {
  try { var t = document.createElement('video'); return !!(t.canPlayType && (t.canPlayType('application/vnd.apple.mpegurl') || t.canPlayType('application/x-mpegURL'))); } catch (e) { return false; }
}
function sourceOrder(s) {
  var pref = streamPref(), h = canHls(), out = [];
  function add(k) { var u = k === 'hls' ? (h ? s.hls : null) : s.mp4; if (u) out.push({ k: k, url: u }); }
  if (pref === 'mp4' || (S && S.audio)) { add('mp4'); add('hls'); }
  else { add('hls'); add('mp4'); }
  return out;
}

// ---------- start / switch sources ----------
function startSource(i, at, why) {
  if (!S) return;
  var src = S.order[i];
  if (!src) {
    if (!S.refetched && S.meta) {   // stream URLs carry expiring tokens: get fresh ones once
      S.refetched = true;
      var my = S;
      playbackInfo(S.meta.extId, false, function (e, bc) {
        if (S !== my) return;
        if (e || !bc) return fail('media', { errors: my.errors.slice(-4), refetch: e });
        useInfo(bc);
        startSource(0, at, 'refetch');
      });
      return;
    }
    return fail('media', { errors: S.errors.slice(-4) });
  }
  S.srcIdx = i; S.srcKind = src.k + (src.k === 'mp4' && S.srcs.mp4h > 0 ? S.srcs.mp4h : ''); S.loaded = false; S.pendingSeek = at > 1 ? at : 0;
  S.phase = 'loading'; S.srcT0 = Date.now(); S.lastMove = Date.now();
  dbg('info', 'source ' + S.srcKind + ' (' + why + ')' + (at ? ' at ' + Math.round(at) + 's' : ''));
  makeVideo();
  vEl.src = src.url;
  try { vEl.load(); } catch (e) { /* ignore */ }
  var p = vEl.play();
  if (p && typeof p.catch === 'function') p.catch(function (e) { dbg('warn', 'play(): ' + (e && e.message)); });
  clearTimeout(S.startTimer);
  var my = S, idx = i;
  S.startTimer = setTimeout(function () {
    if (S !== my || my.loaded || my.srcIdx !== idx) return;
    my.errors.push({ src: my.srcKind, e: 'start-timeout' });
    tlm('playback-fallback', { from: my.srcKind, why: 'no metadata in ' + START_TIMEOUT / 1000 + 's' });
    startSource(idx + 1, at, 'start-timeout');
  }, START_TIMEOUT);
}

function onMedia(e) {
  var v = e.target;
  if (!S || v !== vEl) return;
  var t = e.type;
  if (t === 'loadedmetadata') {
    S.loaded = true;
    clearTimeout(S.startTimer);
    applyFit(true);
    if (S.pendingSeek) { try { v.currentTime = S.pendingSeek; } catch (e1) { /* ignore */ } S.pendingSeek = 0; }
  } else if (t === 'playing') {
    hideLoading();
    errEl.style.display = 'none';
    S.phase = 'playing';
    S.lastMove = Date.now();
    if (!S.startedAt) {
      S.startedAt = Date.now();
      var info = { state: 'playing', engine: 'own', src: S.srcKind, startMs: S.startedAt - S.t0, size: v.videoWidth + 'x' + v.videoHeight,
        audioOnly: !!S.audio, from: S.info.from || '', resumed: S.resumedFrom ? Math.round(S.resumedFrom) : 0, fallbacks: S.srcIdx };
      tlm('playback', info);
      dbg('info', 'playing: ' + JSON.stringify(info));
      addHistory();
      var my = S;
      setTimeout(function () { if (S === my) tlm('video-fit', fitInfo()); }, 3000);
      if (hooks.onStarted) hooks.onStarted(S.resumedFrom || 0);
      setTimeout(function () { try { thumbAt(0); } catch (e) { /* prefetch seek previews */ } }, 4000);
    }
  } else if (t === 'pause') {
    syncPosition(false);
  } else if (t === 'error') {
    var code = v.error ? v.error.code : '?';
    S.errors.push({ src: S.srcKind, e: 'media-' + code, at: Math.round(v.currentTime || 0) });
    dbg('warn', 'media error ' + code + ' on ' + S.srcKind);
    tlm('playback-fallback', { from: S.srcKind, why: 'media error ' + code, loaded: S.loaded });
    var at = Math.max(S.lastT, v.currentTime || 0, S.pendingSeek || 0);
    if (S.loaded && S.errors.length < 6) startSource(S.srcIdx, at, 'retry-after-error');   // mid-stream hiccup: same source again
    else startSource(S.srcIdx + 1, at, 'error');
  } else if (t === 'ended') {
    syncPosition(true, true);
    toast('The end \u2014 BACK to return', 6000);
  } else if (t === 'timeupdate') {
    renderCaption(v.currentTime);
  }
}

// Once a second: watched time, stall watchdog, progress sync, letterbox check, audio-art scene.
function tick() {
  if (!S || !vEl) return;
  var v = vEl, now = Date.now();
  var dt = (now - S.lastTick) / 1000; S.lastTick = now;
  if (!v.paused && v.currentTime !== S.lastT) { if (Math.abs(v.currentTime - S.lastT) < 3) S.watched += Math.min(dt, 2); S.lastT = v.currentTime; S.lastMove = now; }
  if (v.paused || v.ended || !S.loaded) S.lastMove = now;
  if (now - S.lastMove > STALL_MS) {
    S.stalls++;
    S.lastMove = now;
    tlm('playback-stall', { src: S.srcKind, n: S.stalls, readyState: v.readyState, networkState: v.networkState, at: Math.round(v.currentTime) });
    if (S.stalls === 2) autoReport('stalled', { perf: S.id, src: S.srcKind, readyState: v.readyState, networkState: v.networkState });
    startSource(S.stalls >= 2 ? S.srcIdx + 1 : S.srcIdx, v.currentTime, 'stall');
    return;
  }
  if (!v.paused && now - S.lastSync >= SYNC_MS) syncPosition(false);
  if (Math.floor(now / 1000) % 15 === 0) saveLocal();
  applyFit(false);
  if (S.audio) updateAudioArt();
}

// ---------- failure UI ----------
var errSel = 0;
function fail(kind, detail) {
  if (!S) return;
  var my = S;
  my.phase = 'failed:' + kind;
  clearTimeout(my.startTimer);
  hideLoading();
  killVideo();
  var msg = kind === 'not-entitled' ? 'The Met says this account can\u2019t play this right now (signed out or subscription needed).' :
    kind === 'meta' ? 'Couldn\u2019t load this performance from the Met.' :
    kind === 'stream-info' ? 'Couldn\u2019t get the video stream for this performance.' :
    'The video stream failed to play.';
  tlm('playback-failure', { reason: kind, perf: my.id, detail: detail });
  if (kind === 'media' || kind === 'stream-info') autoReport(kind === 'media' ? 'media-error' : 'stream-info', { perf: my.id, detail: detail });
  errEl.innerHTML = '<h2>' + esc(title() || 'Playback problem') + '</h2><p>' + esc(msg) + '</p>' +
    '<div class="mtv-pl-err-btns"><button type="button" data-x="retry">Try again</button>' +
    (kind === 'not-entitled' ? '<button type="button" data-x="signin">Sign in again</button>' : '') +
    '<button type="button" data-x="met">Use the Met\u2019s player</button><button type="button" data-x="back">Back</button></div>' +
    '<p class="mtv-pl-err-d">' + esc(kind + (detail ? ' \u00b7 ' + JSON.stringify(detail).slice(0, 160) : '')) + '</p>';
  errEl.style.display = 'block';
  errSel = 0;
  paintErr();
  if (hooks.onError) hooks.onError(kind);
}
function paintErr() {
  var bs = errEl.querySelectorAll('button');
  for (var i = 0; i < bs.length; i++) bs[i].classList.toggle('mtv-f', i === errSel);
  if (bs[errSel]) bs[errSel].focus();
}
export function errorShown() { return !!S && errEl && errEl.style.display === 'block'; }
function errAction(x) {
  if (!S) return;
  var id = S.id, info = S.info;
  if (x === 'retry') { open(id, info); }
  else if (x === 'signin') { if (hooks.relogin) hooks.relogin(function () { open(id, info); }); }
  else if (x === 'met') { close('met-player'); if (hooks.openMetPage) hooks.openMetPage('/performance/detail/' + id); }
  else close('error-back');
}
export function handleErrorKey(k) {
  var bs = errEl.querySelectorAll('button');
  if (k === KEY.LEFT || k === KEY.UP) { errSel = Math.max(0, errSel - 1); paintErr(); return true; }
  if (k === KEY.RIGHT || k === KEY.DOWN) { errSel = Math.min(bs.length - 1, errSel + 1); paintErr(); return true; }
  if (k === KEY.ENTER) { errAction(bs[errSel].getAttribute('data-x')); return true; }
  if (k === KEY.BACK || k === KEY.ESC || k === KEY.BACKSPACE) { close('error-back'); return true; }
  return true;
}

// ---------- resume + progress sync + history ----------
function resumePoint() {
  var d = S.meta && S.meta.runTime ? S.meta.runTime / 1000 : 0;
  var met = S.meta && S.meta.position ? S.meta.position / 1000 : 0;
  var loc = (lsGet('mtv.resume2', {}) || {})[S.id];
  var t = met || (loc && loc.t) || 0;
  if (S.info.startAt !== undefined) t = S.info.startAt;
  if (t < 60 || (d && t > d - 180)) return 0;
  S.resumedFrom = t;
  return t;
}
function saveLocal() {
  if (!S || !vEl || !S.startedAt) return;
  var t = vEl.currentTime, d = getPlayer().duration();
  var store = lsGet('mtv.resume2', {}) || {};
  if (t > 60 && (!d || t < d - 120)) store[S.id] = { t: Math.round(t), d: Math.round(d), at: Date.now() };
  else if (d && t >= d - 120) delete store[S.id];
  var keys = Object.keys(store);
  if (keys.length > 80) { keys.sort(function (a, b) { return store[a].at - store[b].at; }); for (var i = 0; i < keys.length - 80; i++) delete store[keys[i]]; }
  lsSet('mtv.resume2', store);
}
// Mirrors the Met web player: update-video-position {contentId, position ms}; delete when (nearly) finished.
function syncPosition(final, ended) {
  if (!S || !vEl || !S.startedAt) return;
  S.lastSync = Date.now();
  if (!syncEnabled()) return;
  var t = vEl.currentTime || 0, d = getPlayer().duration();
  if (t < 5 && !ended) return;
  var done = ended || (d && t / d > 0.98);
  mw('POST', '/event', { eventType: done ? 'delete-video-position' : 'update-video-position', data: done ? { contentId: S.id } : { contentId: S.id, position: Math.round(t * 1000) } },
    function (err) { if (err) dbg('warn', 'position sync: ' + err); });
}
function addHistory() {
  var h = lsGet('mtv.hist', []) || [];
  var name = S.meta && (S.meta.opera || S.meta.name) || S.info.title || '';
  h = h.filter(function (x) { return x.id !== S.id; });
  h.unshift({ id: S.id, n: name, t: Date.now(), a: S.audio ? 1 : 0 });
  if (h.length > 60) h.length = 60;
  lsSet('mtv.hist', h);
}

// ---------- chapters (Met cue points: metadata "title=Act I: ...|artists=...") ----------
function parseChapters(cps) {
  var out = [];
  for (var i = 0; cps && i < cps.length; i++) {
    var c = cps[i];
    if (!c || c.type === 'AD') continue;
    var st = +(c.time !== undefined ? c.time : c.startTime);
    if (!isFinite(st)) continue;
    var m = /(?:^|\|)title=([^|]*)/.exec(c.metadata || '');
    var t = m ? m[1] : (c.title || c.name || '');
    if (!t || /^track\d+$/.test(t)) t = 'Scene ' + (out.length + 1);
    var act = '';
    var am = /^(Act [IVX\d]+|Prologue|Epilogue|Part [IVX\d]+)\s*[:\-\u2013]\s*(.+)$/i.exec(t);
    if (am) { act = am[1].replace(/^Act\s+/i, ''); t = am[2]; }
    var ar = /(?:^|\|)artists=([^|]*)/.exec(c.metadata || '');
    var artists = ar && ar[1] ? ar[1].split(/\s*,\s*/).filter(function (x) { return !!x; }) : [];
    out.push({ t: st, title: t, act: act, artists: artists });
  }
  out.sort(function (a, b) { return a.t - b.t; });
  // carry the act forward for scenes without an "Act X:" prefix
  var last = '';
  for (var j = 0; j < out.length; j++) { if (out[j].act) last = out[j].act; else if (last && !/credit|introduction|intermission|curtain/i.test(out[j].title)) out[j].act = last; }
  return out;
}

// ---------- subtitles: our own VTT renderer (big, readable, lifted above the controls) ----------
function textTracksFrom(list) {
  var out = [];
  for (var i = 0; i < list.length; i++) {
    var t = list[i];
    if (t.kind !== 'subtitles' && t.kind !== 'captions') continue;
    var src = '';
    var ss = t.sources || [];
    for (var j = 0; j < ss.length; j++) if (/^https:/.test(ss[j].src || '')) { src = ss[j].src; break; }
    if (!src && /^https:/.test(t.src || '')) src = t.src;
    if (!src) continue;
    out.push({ kind: t.kind, label: t.label || t.srclang || '', language: t.srclang || '', src: src, mode: 'disabled', cues: null });
  }
  out.sort(function (a, b) { return (a.language === 'en' ? 0 : 1) - (b.language === 'en' ? 0 : 1) || (a.kind === 'captions' ? 1 : 0) - (b.kind === 'captions' ? 1 : 0); });
  return out;
}
function thumbTrackFrom(list) {
  for (var i = 0; i < list.length; i++) {
    var t = list[i];
    if (t.kind !== 'metadata' || !/thumb/i.test(t.label || '')) continue;
    var ss = t.sources || [];
    for (var j = 0; j < ss.length; j++) if (/^https:/.test(ss[j].src || '')) return ss[j].src;
    if (/^https:/.test(t.src || '')) return t.src;
    if (/^http:/.test(t.src || '')) return t.src.replace(/^http:/, 'https:');
  }
  return '';
}
export function textTracks() { return S ? S.tracks : []; }
function trackKey(t) { return t ? t.language + (t.kind === 'captions' || /cc/i.test(t.label) ? '-cc' : '') : 'off'; }
export function setTextTrack(t, quiet) {
  if (!S) return;
  for (var i = 0; i < S.tracks.length; i++) S.tracks[i].mode = S.tracks[i] === t ? 'showing' : 'disabled';
  if (!quiet) lsSet('mtv.subs', trackKey(t));
  capEl.innerHTML = '';
  S.capCue = null;
  if (t && !t.cues && !t.loading) {
    t.loading = true;
    var my = S;
    req(t.src, { timeout: 30000 }, function (err, text) {
      t.loading = false;
      if (err || !text) { dbg('warn', 'subtitles load failed: ' + err); if (S === my && !quiet) toast('Subtitles could not be loaded', 2500); return; }
      t.cues = parseVTT(text);
      if (S === my && vEl) renderCaption(vEl.currentTime);
    });
  }
}
function autoSubtitles() {
  var want = lsGet('mtv.subs', 'en');
  if (want === 'off' || !S.tracks.length) return;
  for (var i = 0; i < S.tracks.length; i++) if (trackKey(S.tracks[i]) === want) { setTextTrack(S.tracks[i], true); return; }
  var lang = want.split('-')[0];
  for (i = 0; i < S.tracks.length; i++) if (S.tracks[i].language === lang) { setTextTrack(S.tracks[i], true); return; }
}
function vttTime(s) {
  var p = s.split(':');
  var sec = parseFloat(p.pop().replace(',', '.'));
  var m = p.length ? +p.pop() : 0, h = p.length ? +p.pop() : 0;
  return h * 3600 + m * 60 + sec;
}
export function parseVTT(text) {
  var blocks = String(text).replace(/\r/g, '').split(/\n\n+/), out = [];
  for (var i = 0; i < blocks.length; i++) {
    var lines = blocks[i].split('\n');
    for (var j = 0; j < lines.length; j++) {
      var m = /^\s*((?:\d+:)?\d+:\d+[.,]\d+)\s+-->\s+((?:\d+:)?\d+:\d+[.,]\d+)/.exec(lines[j]);
      if (m) { out.push({ s: vttTime(m[1]), e: vttTime(m[2]), x: lines.slice(j + 1).join('\n') }); break; }
    }
  }
  out.sort(function (a, b) { return a.s - b.s; });
  return out;
}
function cueHTML(x) {
  return esc(x.replace(/<(?!\/?[ib]>)[^>]*>/g, '')).replace(/&lt;(\/?[ib])&gt;/g, '<$1>').replace(/\n/g, '<br>');
}
function renderCaption(t) {
  if (!S || !capEl) return;
  var tr = null;
  for (var i = 0; i < S.tracks.length; i++) if (S.tracks[i].mode === 'showing') tr = S.tracks[i];
  var cue = null;
  if (tr && tr.cues) {
    var c = tr.cues, lo = 0, hi = c.length - 1;
    while (lo <= hi) { var mid = (lo + hi) >> 1; if (c[mid].s <= t) lo = mid + 1; else hi = mid - 1; }
    for (var k = hi; k >= 0 && k > hi - 4; k--) if (c[k].s <= t && c[k].e > t) { cue = c[k]; break; }
  }
  if (cue === S.capCue) return;
  S.capCue = cue;
  capEl.innerHTML = cue ? '<span>' + cueHTML(cue.x) + '</span>' : '';
}

// ---------- seek preview thumbnails (Brightcove "thumbnails" VTT: one jpg per ~10 s) ----------
export function thumbAt(t) {
  if (!S || !S.thumbSrc) return '';
  if (!S.thumbs) {
    if (!S.thumbsLoading) {
      S.thumbsLoading = true;
      var my = S;
      req(S.thumbSrc, { timeout: 20000 }, function (err, text) { if (S === my && !err && text) my.thumbs = parseVTT(text); });
    }
    return '';
  }
  var c = S.thumbs, lo = 0, hi = c.length - 1;
  while (lo <= hi) { var mid = (lo + hi) >> 1; if (c[mid].s <= t) lo = mid + 1; else hi = mid - 1; }
  var u = hi >= 0 ? String(c[hi].x).replace(/^\s+|\s+$/g, '') : '';
  return /^https?:/.test(u) ? u.replace(/^http:/, 'https:') : '';
}

// ---------- audio-only performances (radio broadcasts) ----------
function bestImage(m) {
  var cand = [m.slide && m.slide.image, m.tile && m.tile.image, m.mobileTile && m.mobileTile.image];
  for (var i = 0; i < cand.length; i++) if (cand[i] && cand[i].url) return String(cand[i].url).replace(/^http:/, 'https:');
  return S && S.info.img || '';
}
function showAudioArt() {
  var m = S.meta;
  var img = bestImage(m);
  audEl.innerHTML = (img ? '<div class="mtv-pl-aud-bg" style="background-image:url(&quot;' + esc(img) + '&quot;)"></div>' : '') +
    '<div class="mtv-pl-aud-in">' + (img ? '<img alt="" src="' + esc(img) + '">' : '') +
    '<div class="mtv-pl-aud-k">\u266b Met radio broadcast</div><h1>' + esc(m.name) + '</h1><div class="mtv-pl-aud-d">' + esc(subtitle()) + '</div>' +
    '<div class="mtv-pl-aud-c">' + esc(String(m.shortCast || '').split('<br')[0]) + '</div><div class="mtv-pl-aud-s"></div></div>';
  audEl.style.display = 'block';
}
function updateAudioArt() {
  var s = audEl.querySelector('.mtv-pl-aud-s');
  if (!s || !vEl) return;
  var chs = S.chs, t = vEl.currentTime, ci = -1;
  for (var i = 0; i < chs.length; i++) if (chs[i].t <= t + 0.5) ci = i;
  var txt = ci >= 0 ? (chs[ci].act ? 'Act ' + chs[ci].act + ' \u00b7 ' : '') + chs[ci].title : '';
  if (s.textContent !== txt) s.textContent = txt;
}

// ---------- misc ----------
function fmtDate(d) {
  var M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var p = d.split('-');
  return p.length < 3 ? d : M[+p[1] - 1] + ' ' + (+p[2]) + ', ' + p[0];
}
export function fmt(t) {
  t = Math.max(0, Math.floor(t || 0));
  var h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  return (h ? h + ':' + (m < 10 ? '0' : '') : '') + m + ':' + (s < 10 ? '0' : '') + s;
}
export function seekBy(delta, quiet) {
  var p = getPlayer();
  if (!p) return false;
  var d = p.duration() || 0;
  var t = Math.max(0, Math.min(d ? d - 1 : Infinity, p.time() + delta));
  p.time(t);
  if (!quiet) toast((delta > 0 ? '\u25B6\u25B6 ' : '\u25C0\u25C0 ') + fmt(t) + (d ? ' / ' + fmt(d) : ''), 1500);
  return true;
}
export function mediaKey(action) {
  var p = getPlayer();
  if (!p) return false;
  if (action === 'play') p.play();
  else if (action === 'pause') p.pause();
  else if (action === 'toggle') { if (p.paused()) p.play(); else p.pause(); }
  else if (action === 'stop') close('stop');
  else if (action === 'ff' || action === 'rw') { if (hooks.sceneJump) hooks.sceneJump(action === 'ff' ? 1 : -1, 'media-' + action); }   // 1.3.2: scenes, no small skips
  return true;
}
export function engineState() {
  if (!S) return null;
  return { id: S.id, phase: S.phase, src: S.srcKind, srcIdx: S.srcIdx, sources: S.order ? S.order.map(function (o) { return o.k; }) : [], loaded: S.loaded,
    startMs: S.startedAt ? S.startedAt - S.t0 : null, stalls: S.stalls, errors: S.errors.slice(-6), tracks: S.tracks.length, chapters: S.chs ? S.chs.length : 0,
    audio: !!S.audio, thumbs: S.thumbs ? S.thumbs.length : (S.thumbSrc ? 'loading' : 'none'), resumedFrom: S.resumedFrom || 0, fit: fitInfo(), sync: syncEnabled() };
}
export function initEngine() {
  window.addEventListener('resize', function () { applyFit(true); });
}
