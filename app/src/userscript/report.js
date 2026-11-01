// "Report a problem": snapshot of the page + player state, sanitized, gzip-compressed, POSTed to
// the telemetry worker (/v1/reports). Manual (hold GREEN ~1s, OK in the GREEN log, button in the
// player controls / settings) or automatic on playback failure (rate-limited).
//
// PRIVACY: the snapshot never contains cookies, localStorage, input values, inline <script> bodies
// (they can carry session state), e-mail addresses, JWTs / bearer tokens, signed-URL query tokens,
// or the saved Met account (mtv.creds, plain or encoded). A final check scans the serialized
// payload for the saved account strings and refuses to send if any survive.
import { gzipSync, strToU8 } from 'fflate';
import T from './telemetry';
import { VERSION, getErrors, getLog, getConsole, getNet, dbg } from './debugLog';
import { envInfo } from './envInfo';
import { getCreds } from './relogin';
import { lsGet, lsSet } from './util';
import { tlm, tlmEnabled } from './tlm';
import { toast } from './toast';

var W = window;
var MAX_DOM = 1500000;        // chars of sanitized HTML before compression
var MAX_GZ = 500 * 1024;      // compressed upload cap
var stateProvider = null;     // app/player state from index.js
export function setReportStateProvider(fn) { stateProvider = fn; }

// ---------- sanitizing ----------
function secretStrings() {
  var out = [];
  function add(s) {
    if (!s || typeof s !== 'string' || s.length < 3) return;
    var forms = [s, encodeURIComponent(s), JSON.stringify(s).slice(1, -1),
      s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')];
    for (var i = 0; i < forms.length; i++) if (forms[i] && out.indexOf(forms[i]) < 0) out.push(forms[i]);
  }
  try {
    var c = getCreds();
    if (c) { add(c.u); add(c.p); }
    var raw = W.localStorage.getItem('mtv.creds');
    if (raw) { add(raw); try { var o = JSON.parse(raw); add(o.u); add(o.p); } catch (e) { /* ignore */ } }
  } catch (e) { /* ignore */ }
  out.sort(function (a, b) { return b.length - a.length; });
  return out;
}
function replaceAll(s, needle, rep) { return needle ? s.split(needle).join(rep) : s; }

var SECRET_PARAM = /([?&;](?:[^=&\s"'<>\\]*(?:token|sig|signature|policy|key|auth|hdnts|hmac|session|jwt|code|ticket|pass|pwd|email|user)[^=&\s"'<>\\]*)=)[^&\s"'<>\\]+/gi;

export function sanitizeText(s, secrets) {
  s = String(s === undefined || s === null ? '' : s);
  secrets = secrets || secretStrings();
  for (var i = 0; i < secrets.length; i++) s = replaceAll(s, secrets[i], '[redacted-account]');
  return s
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[email]')
    .replace(/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{6,}/g, '[jwt]')
    .replace(/(Bearer\s+)[A-Za-z0-9._~+\/=-]+/gi, '$1[redacted]')
    .replace(/((?:password|passwd|pwd|access_?token|refresh_?token|id_?token|auth_?token|secret|authorization|cookie|set-cookie|sessionid|session_id)\\*["']?\s*[:=]\s*\\*["']?)([^"'&\s,;}\\<]+)/gi, '$1[redacted]')
    .replace(SECRET_PARAM, '$1[redacted]');
}

export function sanitizeDom(html, secrets) {
  html = String(html || '');
  html = html
    // Inline scripts can carry app state / session data: keep the tag and src, drop the body.
    .replace(/(<script\b[^>]*>)([\s\S]*?)(<\/script>)/gi, function (m, a, body, c) { return body.length ? a + '/* ' + body.length + ' chars removed */' + c : m; })
    // Styles are big and not needed (computed info for the player is captured separately).
    .replace(/(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi, function (m, a, body, c) { return body.length > 200 ? a + '/* ' + body.length + ' chars removed */' + c : m; })
    // Form state: input/option values, textarea/contenteditable text.
    .replace(/(<(?:input|option|select|button)\b[^>]*?\s)value\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '$1value=""')
    .replace(/(<textarea\b[^>]*>)([\s\S]*?)(<\/textarea>)/gi, '$1$3')
    .replace(/\s(?:data-(?:token|auth|session|user|email)[\w-]*)\s*=\s*("[^"]*"|'[^']*')/gi, '')
    // Size: long SVG paths and data: URIs.
    .replace(/(\sd=")([^"]{200,})(")/g, function (m, a, d, c) { return a + d.slice(0, 40) + '\u2026' + c; })
    .replace(/(data:[\w\/+.-]+;base64,)[A-Za-z0-9+\/=]{80,}/g, '$1[\u2026]');
  return sanitizeText(html, secrets);
}

// ---------- capture ----------
function ranges(tr) {
  var out = [];
  try { for (var i = 0; tr && i < tr.length && i < 20; i++) out.push([Math.round(tr.start(i) * 10) / 10, Math.round(tr.end(i) * 10) / 10]); } catch (e) { /* ignore */ }
  return out;
}
function srcKind(u) {
  u = String(u || '');
  if (!u) return '';
  if (u.indexOf('blob:') === 0) return 'blob (MSE)';
  var m = /^(https?:)\/\/([^\/?#]+)([^?#]*)/.exec(u);
  if (!m) return u.slice(0, 40);
  return m[1] + '//' + m[2] + m[3].slice(0, 120) + (u.indexOf('?') > 0 ? ' (+query)' : '');
}
function list(tl, fn) { var out = []; try { for (var i = 0; tl && i < tl.length && i < 30; i++) out.push(fn(tl[i])); } catch (e) { /* ignore */ } return out; }
function rect(el) { try { var r = el.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)]; } catch (e) { return null; } }

export function mediaState(v) {
  var s = {};
  try {
    var cs = W.getComputedStyle(v);
    s = {
      tag: v.tagName.toLowerCase(), id: v.id || undefined, cls: String(v.className || '').slice(0, 120),
      src: srcKind(v.getAttribute('src')), currentSrc: srcKind(v.currentSrc),
      sources: list(v.querySelectorAll('source'), function (x) { return { type: x.type, src: srcKind(x.src) }; }),
      readyState: v.readyState, networkState: v.networkState,
      error: v.error ? { code: v.error.code, message: String(v.error.message || '').slice(0, 200) } : null,
      videoWidth: v.videoWidth, videoHeight: v.videoHeight, rect: rect(v),
      objectFit: cs.objectFit || cs.getPropertyValue('object-fit') || '', transform: cs.transform || cs.webkitTransform,
      currentTime: Math.round(v.currentTime * 10) / 10, duration: v.duration, paused: v.paused, ended: v.ended, seeking: v.seeking,
      muted: v.muted, volume: v.volume, playbackRate: v.playbackRate,
      buffered: ranges(v.buffered), seekable: ranges(v.seekable), played: ranges(v.played).length,
      textTracks: list(v.textTracks, function (t) { return { kind: t.kind, label: t.label, lang: t.language, mode: t.mode, cues: t.cues ? t.cues.length : null }; }),
      audioTracks: list(v.audioTracks, function (t) { return { id: t.id, kind: t.kind, label: t.label, lang: t.language, enabled: t.enabled }; }),
      videoTracks: list(v.videoTracks, function (t) { return { id: t.id, label: t.label, selected: t.selected }; }),
      decodedFrames: v.webkitDecodedFrameCount, droppedFrames: v.webkitDroppedFrameCount
    };
    if (v.getVideoPlaybackQuality) { var q = v.getVideoPlaybackQuality(); s.quality = { total: q.totalVideoFrames, dropped: q.droppedVideoFrames }; }
  } catch (e) { s.captureError = String(e && e.message || e); }
  return s;
}

function vjsState() {
  var out = [];
  try {
    var vj = W.videojs || W.bc && W.bc.videojs;
    var players = vj && vj.getPlayers ? vj.getPlayers() : {};
    for (var id in players) {
      var p = players[id];
      if (!p) continue;
      var s = { id: id };
      var g = function (k, fn) { try { s[k] = fn(); } catch (e) { s[k] = 'err: ' + (e && e.message); } };
      g('version', function () { return vj.VERSION; });
      g('tech', function () { return p.techName_; });
      g('currentType', function () { return p.currentType(); });
      g('currentSrc', function () { return srcKind(p.currentSrc()); });
      g('sources', function () { return (p.currentSources() || []).map(function (x) { return { type: x.type, src: srcKind(x.src), keySystems: x.keySystems ? Object.keys(x.keySystems) : undefined }; }); });
      g('readyState', function () { return p.readyState(); });
      g('paused', function () { return p.paused(); });
      g('ended', function () { return p.ended(); });
      g('hasStarted', function () { return p.hasStarted(); });
      g('isFullscreen', function () { return p.isFullscreen(); });
      g('userActive', function () { return p.userActive(); });
      g('currentTime', function () { return p.currentTime(); });
      g('duration', function () { return p.duration(); });
      g('bufferedPercent', function () { return p.bufferedPercent(); });
      g('error', function () { var e = p.error(); return e ? { code: e.code, message: String(e.message || '').slice(0, 300), type: e.type } : null; });
      g('dimensions', function () { return [p.currentWidth(), p.currentHeight()]; });
      g('fluid', function () { return p.fluid ? p.fluid() : undefined; });
      g('aspectRatio', function () { return p.aspectRatio ? p.aspectRatio() : undefined; });
      g('className', function () { return String(p.el().className).slice(0, 300); });
      g('rect', function () { return rect(p.el()); });
      g('textTracks', function () { return list(p.textTracks(), function (t) { return { kind: t.kind, label: t.label, lang: t.language, mode: t.mode }; }); });
      g('audioTracks', function () { return list(p.audioTracks(), function (t) { return { id: t.id, kind: t.kind, label: t.label, lang: t.language, enabled: t.enabled }; }); });
      g('mediainfo', function () {
        var m = p.mediainfo;
        return m ? { id: m.id, name: String(m.name || '').slice(0, 120), duration: m.duration, cuePoints: (m.cuePoints || []).length,
          sources: (m.sources || []).map(function (x) { return { type: x.type, container: x.container, codec: x.codec, w: x.width, h: x.height, br: x.avg_bitrate }; }).slice(0, 12) } : null;
      });
      g('vhs', function () {
        var t = p.tech && p.tech({ IWillNotUseThisInPlugins: true });
        var v = t && (t.vhs || t.hls);
        if (!v) return null;
        var media = v.playlists && v.playlists.media && v.playlists.media();
        return { bandwidth: v.bandwidth, systemBandwidth: v.systemBandwidth, mediaRes: media && media.attributes ? media.attributes.RESOLUTION : null,
          mediaBw: media && media.attributes ? media.attributes.BANDWIDTH : null, stats: v.stats ? { mediaRequests: v.stats.mediaRequests, mediaRequestsErrored: v.stats.mediaRequestsErrored, mediaBytesTransferred: v.stats.mediaBytesTransferred } : null };
      });
      out.push(s);
    }
  } catch (e) { out.push({ captureError: String(e && e.message || e) }); }
  return out;
}

export function buildSnapshot(kind, extra) {
  var secrets = secretStrings();
  var dom = '';
  try { dom = document.documentElement.outerHTML; } catch (e) { dom = '<!-- outerHTML failed: ' + e + ' -->'; }
  var rawLen = dom.length;
  dom = sanitizeDom(dom, secrets);
  if (dom.length > MAX_DOM) dom = dom.slice(0, MAX_DOM) + '\n<!-- truncated at ' + MAX_DOM + ' of ' + dom.length + ' chars -->';
  var media = [];
  try { var vs = document.querySelectorAll('video, audio'); for (var i = 0; i < vs.length && i < 8; i++) media.push(mediaState(vs[i])); } catch (e) { /* ignore */ }
  var env = {};
  try { env = envInfo(); } catch (e) { env = { error: String(e) }; }
  var app = {};
  try { app = stateProvider ? stateProvider() : {}; } catch (e) { app = { error: String(e) }; }
  var vv = W.visualViewport;
  var snap = {
    kind: kind, appVersion: VERSION, at: new Date().toISOString ? new Date().toISOString() : String(new Date()),
    url: sanitizeText(W.location.href, secrets), title: sanitizeText(document.title, secrets), referrer: sanitizeText(document.referrer, secrets),
    viewport: { innerWidth: W.innerWidth, innerHeight: W.innerHeight, outerWidth: W.outerWidth, outerHeight: W.outerHeight,
      clientWidth: document.documentElement.clientWidth, clientHeight: document.documentElement.clientHeight,
      screen: [W.screen && W.screen.width, W.screen && W.screen.height], availScreen: [W.screen && W.screen.availWidth, W.screen && W.screen.availHeight],
      devicePixelRatio: W.devicePixelRatio, scrollY: W.pageYOffset, visualViewport: vv ? { w: vv.width, h: vv.height, scale: vv.scale } : null,
      fullscreenElement: (function () { var f = document.fullscreenElement || document.webkitFullscreenElement; return f ? (f.tagName + '.' + String(f.className).slice(0, 60)) : null; })() },
    env: env, app: app, extra: extra || null,
    media: media, players: vjsState(),
    console: getConsole(), network: getNet(), errors: getErrors(), log: getLog(),
    activeElement: (function () { var a = document.activeElement; return a ? a.tagName + (a.id ? '#' + a.id : '') + '.' + String(a.className || '').slice(0, 80) : null; })(),
    domChars: { raw: rawLen, sanitized: dom.length },
    dom: dom
  };
  return { snap: snap, secrets: secrets };
}

// Serialize + final leak check. Returns { json, leaked }.
export function serialize(built) {
  var json = JSON.stringify(built.snap);
  // Everything except the DOM went through JSON only (console lines etc.): run the text filters over the whole payload.
  json = sanitizeText(json, built.secrets);
  var leaked = 0;
  for (var i = 0; i < built.secrets.length; i++) if (json.indexOf(built.secrets[i]) >= 0) leaked++;
  return { json: json, leaked: leaked };
}

function summaryOf(snap) {
  var m = snap.media[0] || {};
  return { kind: snap.kind, path: W.location.pathname, media: snap.media.length,
    readyState: m.readyState, networkState: m.networkState, error: m.error ? m.error.code : null,
    video: m.videoWidth ? m.videoWidth + 'x' + m.videoHeight : null, viewport: snap.viewport.innerWidth + 'x' + snap.viewport.innerHeight + '@' + snap.viewport.devicePixelRatio,
    domKB: Math.round(snap.dom.length / 1024), console: snap.console.length, network: snap.network.length };
}

var sending = false;
export function sendReport(kind, extra, cb) {
  if (sending) { if (cb) cb(false, 'busy'); return; }
  sending = true;
  var done = function (ok, msg) { sending = false; if (cb) try { cb(ok, msg); } catch (e) { /* ignore */ } };
  try {
    var built = buildSnapshot(kind, extra);
    var ids = T.ids ? T.ids() : {};
    var body = { deviceId: ids.deviceId, sessionId: ids.sessionId, appVersion: VERSION, ua: navigator.userAgent, kind: kind,
      url: built.snap.url, summary: summaryOf(built.snap), snapshot: null };
    var ser = serialize(built);
    if (ser.leaked) { dbg('error', 'report blocked: account data survived sanitizing'); tlm('report-blocked', { kind: kind }); done(false, 'blocked (privacy check)'); return; }
    // Splice the snapshot in without re-stringifying it.
    var head = JSON.stringify(body);
    var json = head.slice(0, head.lastIndexOf('null')) + ser.json + '}';
    var payload = json, gz = false;
    try {
      payload = gzipSync(strToU8(json), { level: 6 });
      gz = true;
      // Too big even compressed: drop the DOM tail until it fits.
      var guard = 0;
      while (payload.length > MAX_GZ && guard++ < 4) {
        built.snap.dom = built.snap.dom.slice(0, Math.floor(built.snap.dom.length / 2)) + '\n<!-- truncated to fit upload -->';
        ser = serialize(built);
        json = head.slice(0, head.lastIndexOf('null')) + ser.json + '}';
        payload = gzipSync(strToU8(json), { level: 6 });
      }
    } catch (e) {
      gz = false; payload = json.length > 1400000 ? json.slice(0, 0) : json; // no gzip: only small JSON
      if (!payload) { built.snap.dom = built.snap.dom.slice(0, 300000); ser = serialize(built); payload = head.slice(0, head.lastIndexOf('null')) + ser.json + '}'; }
    }
    dbg('info', 'report ' + kind + ': ' + Math.round(json.length / 1024) + ' KB' + (gz ? ' -> ' + Math.round(payload.length / 1024) + ' KB gzip' : ''));
    T.postReport(payload, gz, function (ok, status, text) {
      var id = null;
      try { id = JSON.parse(text).id; } catch (e) { /* ignore */ }
      if (ok) dbg('info', 'report sent #' + id);
      else dbg('warn', 'report failed: HTTP ' + status + ' ' + text);
      done(ok, ok ? 'Report #' + id + ' sent' : (status === 429 ? 'too many reports, try later' : 'HTTP ' + status));
    });
  } catch (e) {
    dbg('error', 'report build failed: ' + (e && e.message || e));
    done(false, 'error: ' + (e && e.message || e));
  }
}

// Manual report with on-screen feedback.
export function reportProblem(source) {
  toast('Sending problem report\u2026', 8000);
  tlm('report-problem', { source: source || 'key' });
  sendReport('manual', { trigger: source || 'key' }, function (ok, msg) {
    toast(ok ? '\u2713 ' + msg + ' \u2014 thank you' : '\u2717 Report not sent: ' + msg, 4000);
  });
}

// ---------- automatic reports on playback failure ----------
var LS_AUTO = 'mtv.autoReports';
var AUTO_PER_HOUR = 3, AUTO_PER_DAY = 8, SAME_GAP = 30 * 60 * 1000;
function autoAllowed(key) {
  var now = Date.now();
  var hist = (lsGet(LS_AUTO, []) || []).filter(function (h) { return now - h.t < 86400000; });
  var hour = hist.filter(function (h) { return now - h.t < 3600000; }).length;
  var same = hist.filter(function (h) { return h.k === key && now - h.t < SAME_GAP; }).length;
  if (hour >= AUTO_PER_HOUR || hist.length >= AUTO_PER_DAY || same) return false;
  hist.push({ t: now, k: key });
  lsSet(LS_AUTO, hist);
  return true;
}
export function autoReport(reason, detail) {
  try {
    tlm('playback-failure', { reason: reason, path: W.location.pathname, detail: detail });
    if (!tlmEnabled()) return;
    var key = reason + '|' + W.location.pathname;
    if (!autoAllowed(key)) { dbg('info', 'auto report suppressed (rate limit): ' + reason); return; }
    dbg('warn', 'playback problem (' + reason + '): sending automatic report');
    sendReport('auto:' + reason, detail, function (ok, msg) { dbg(ok ? 'info' : 'warn', 'auto report: ' + msg); });
  } catch (e) { /* never break playback */ }
}

// Watches the current watch page: <video> error, stalled > 20 s while playing, no media after 30 s.
export function initPlaybackWatch(isWatchPage) {
  var lastT = -1, lastMove = Date.now(), pageSince = Date.now(), lastPath = '', noVideoSent = '', stallSent = 0;
  var errSent = '';
  function mediaFailed(how, detail) {
    var key = W.location.pathname;
    if (errSent === key || !isWatchPage()) return;
    errSent = key;
    autoReport(how, detail);
  }
  document.addEventListener('error', function (e) {
    var t = e.target;
    if (!t) return;
    if ((t.tagName === 'VIDEO' || t.tagName === 'AUDIO') && t.error) mediaFailed('media-error', { code: t.error.code, message: String(t.error.message || '').slice(0, 200) });
    else if (t.tagName === 'SOURCE' && t.parentNode && t.parentNode.tagName === 'VIDEO') {
      var v = t.parentNode; // the last <source> failing leaves the element with NETWORK_NO_SOURCE
      setTimeout(function () { if (v.networkState === 3) mediaFailed('media-error', { code: 'no-source', type: t.type }); }, 300);
    }
  }, true);
  setInterval(function () {
    try {
      var path = W.location.pathname;
      if (path !== lastPath) { lastPath = path; pageSince = Date.now(); lastT = -1; lastMove = Date.now(); errSent = ''; }
      if (!isWatchPage()) return;
      var v = document.querySelector('.Player video') || document.querySelector('video, audio');
      if (!v) {
        if (Date.now() - pageSince > 30000 && noVideoSent !== path) { noVideoSent = path; autoReport('no-video', { waitedMs: Date.now() - pageSince }); }
        return;
      }
      if (v.error) mediaFailed('media-error', { code: v.error.code, message: String(v.error.message || '').slice(0, 200), via: 'poll' });
      var host = document.querySelector('.Player .video-js');
      if (host && /\bvjs-error\b/.test(host.className)) {
        var md = host.querySelector('.vjs-modal-dialog-content, .vjs-error-display');
        mediaFailed('player-error', { text: md ? String(md.textContent || '').replace(/\s+/g, ' ').slice(0, 200) : '' });
      }
      var playing = !v.paused && !v.ended;
      if (!playing || v.currentTime !== lastT) { lastT = v.currentTime; lastMove = Date.now(); return; }
      if (Date.now() - lastMove > 20000 && Date.now() - stallSent > 60000) {
        stallSent = Date.now();
        autoReport('stalled', { secs: Math.round((Date.now() - lastMove) / 1000), readyState: v.readyState, networkState: v.networkState, t: Math.round(v.currentTime) });
      }
    } catch (e) { /* ignore */ }
  }, 2000);
}
