// Remote-first playback controls (1.2.0): our own large overlay over the Met's Brightcove/video.js
// player in full screen. Drives the player's own API (play/pause/currentTime/textTracks/audioTracks);
// never touches the stream. Key model:
//   hidden : OK = play/pause · LEFT/RIGHT = seek (hold to accelerate) · UP/DOWN/any = show controls
//            BACK = leave the player (handled by index.js)
//   shown  : UP/DOWN move between the scrub bar and the button row · LEFT/RIGHT seek on the scrub
//            bar or move along the buttons · OK activates · BACK hides (closes a popup first)
//   media keys (play/pause/ff/rw/stop) work in both states. Auto-hides after 4 s without keys.
import { KEY } from './keys';
import { getPlayer, getVjs, setFullscreen, isFullscreen, fmt, pictureMode, cyclePictureMode, MODE_LABEL, fitInfo } from './player';
import { tlm } from './tlm';
import { toast } from './toast';
import { lsGet, lsSet } from './util';
import { dbg } from './debugLog';

var HIDE_MS = 4000;
var root = null, els = {};
var visible = false, hideTimer = null, tick = null;
var zone = 'btn', sel = 3;            // focus: 'scrub' | 'btn' | 'menu'
var menu = null;                      // { kind, items: [{label, sub, act}], sel }
var pending = null, commitTimer = null, lastSeekKey = 0, seekRepeat = 0, seekStartT = 0;
var hooks = { onExit: null, onReport: null };
var stats = { opened: 0, seeks: 0, seekSecs: 0, buttons: {}, keysHidden: 0 };
export function setPlayerHooks(h) { for (var k in h) hooks[k] = h[k]; }

// Inline SVG icons (webOS system fonts lack most media-control glyphs).
function svg(d) { return '<svg viewBox="0 0 24 24" width="40" height="40" fill="currentColor" aria-hidden="true">' + d + '</svg>'; }
var ICON = {
  exit: svg('<path d="M20 11H7.8l5.6-5.6L12 4l-8 8 8 8 1.4-1.4L7.8 13H20z"/>'),
  prev: svg('<path d="M6 6h2v12H6zm3.5 6L18 18V6z"/>'),
  rw: svg('<path d="M12 5V1L7 6l5 5V7c3.3 0 6 2.7 6 6s-2.7 6-6 6-6-2.7-6-6H4c0 4.4 3.6 8 8 8s8-3.6 8-8-3.6-8-8-8z"/><text x="12" y="16.2" font-size="7" font-weight="700" text-anchor="middle" font-family="Arial">10</text>'),
  play: svg('<path d="M8 5v14l11-7z"/>'),
  pause: svg('<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>'),
  ff: svg('<path d="M12 5V1l5 5-5 5V7c-3.3 0-6 2.7-6 6s2.7 6 6 6 6-2.7 6-6h2c0 4.4-3.6 8-8 8s-8-3.6-8-8 3.6-8 8-8z"/><text x="12" y="16.2" font-size="7" font-weight="700" text-anchor="middle" font-family="Arial">30</text>'),
  next: svg('<path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/>'),
  chapters: svg('<path d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z"/>'),
  cc: svg('<path d="M19 4H5c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm-8 7H9.5v-.5h-2v3h2V13H11v1c0 .55-.45 1-1 1H7c-.55 0-1-.45-1-1v-4c0-.55.45-1 1-1h3c.55 0 1 .45 1 1v1zm7 0h-1.5v-.5h-2v3h2V13H18v1c0 .55-.45 1-1 1h-3c-.55 0-1-.45-1-1v-4c0-.55.45-1 1-1h3c.55 0 1 .45 1 1v1z"/>'),
  audio: svg('<path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>'),
  pic: svg('<path d="M21 3H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H3V5h18v14zM5 7h14v10H5z" fill-rule="evenodd"/>'),
  report: svg('<path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/>')
};
var BTNS = [
  { id: 'exit', label: 'Title' },
  { id: 'prev', label: 'Prev scene' },
  { id: 'rw', label: '\u221210 s' },
  { id: 'play', label: 'Play' },
  { id: 'ff', label: '+30 s' },
  { id: 'next', label: 'Next scene' },
  { id: 'chapters', label: 'Scenes' },
  { id: 'cc', label: 'Subtitles' },
  { id: 'audio', label: 'Audio' },
  { id: 'pic', label: 'Picture' },
  { id: 'report', label: 'Report problem' }
];
var PLAY_IDX = 3;

function esc(s) { return String(s === undefined || s === null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

function ensure() {
  var host = document.querySelector('.Player') || document.body;
  if (root && host.contains(root)) return;
  if (!root) {
    root = document.createElement('div');
    root.className = 'mtv-po';
    var b = '';
    for (var i = 0; i < BTNS.length; i++) b += '<div class="mtv-po-btn" data-i="' + i + '"><i>' + ICON[BTNS[i].id] + '</i><span>' + BTNS[i].label + '</span></div>';
    root.innerHTML =
      '<div class="mtv-po-top"><div class="mtv-po-title"></div><div class="mtv-po-sub"></div></div>' +
      '<div class="mtv-po-badge"></div>' +
      '<div class="mtv-po-bot">' +
        '<div class="mtv-po-times"><span class="mtv-po-cur"></span><span class="mtv-po-ch"></span><span class="mtv-po-dur"></span></div>' +
        '<div class="mtv-po-scrub"><div class="mtv-po-buf"></div><div class="mtv-po-prog"></div><div class="mtv-po-ticks"></div><div class="mtv-po-knob"></div><div class="mtv-po-tip"></div></div>' +
        '<div class="mtv-po-btns">' + b + '</div>' +
        '<div class="mtv-po-hint">OK play/pause \u00b7 \u25C0 \u25B6 seek (hold = faster) \u00b7 \u25B2 \u25BC move \u00b7 BACK hide</div>' +
      '</div>' +
      '<div class="mtv-po-menu"></div>';
    els = {
      title: root.querySelector('.mtv-po-title'), sub: root.querySelector('.mtv-po-sub'), badge: root.querySelector('.mtv-po-badge'),
      cur: root.querySelector('.mtv-po-cur'), dur: root.querySelector('.mtv-po-dur'), ch: root.querySelector('.mtv-po-ch'),
      scrub: root.querySelector('.mtv-po-scrub'), buf: root.querySelector('.mtv-po-buf'), prog: root.querySelector('.mtv-po-prog'),
      ticks: root.querySelector('.mtv-po-ticks'), knob: root.querySelector('.mtv-po-knob'), tip: root.querySelector('.mtv-po-tip'),
      btns: root.querySelectorAll('.mtv-po-btn'), menu: root.querySelector('.mtv-po-menu')
    };
    root.addEventListener('click', function (e) {
      var t = e.target;
      while (t && t !== root && !t.hasAttribute('data-i') && !t.hasAttribute('data-m')) t = t.parentElement;
      if (!t || t === root) return;
      if (t.hasAttribute('data-m')) { menu.sel = +t.getAttribute('data-m'); menuActivate(); }
      else { zone = 'btn'; sel = +t.getAttribute('data-i'); activate(); }
    });
  }
  host.appendChild(root);
  ticksFor = -1;
}

export function isShown() { return visible; }

export function show(z) {
  ensure();
  if (!visible) {
    visible = true; stats.opened++;
    if (stats.opened === 1) tlm('player-overlay', { action: 'first-open', fit: fitInfo() });
    root.classList.add('mtv-show');
    document.documentElement.classList.add('mtv-po-open');
    clearInterval(tick); tick = setInterval(update, 500);
  }
  if (z) zone = z;
  update(); paint(); bump();
}
export function hide() {
  if (!root) return;
  visible = false; menu = null;
  root.classList.remove('mtv-show');
  document.documentElement.classList.remove('mtv-po-open');
  els.menu.style.display = 'none';
  clearInterval(tick); clearTimeout(hideTimer);
  update();
}
function bump() {
  clearTimeout(hideTimer);
  hideTimer = setTimeout(function () { if (!menu) hide(); else bump(); }, menu ? HIDE_MS * 3 : HIDE_MS);
}

// ---- chapters (Brightcove cue points: {startTime, endTime, title, act}) ----
function chapters() {
  var vjs = getVjs();
  var cps = vjs && vjs.mediainfo && vjs.mediainfo.cuePoints || [];
  var out = [];
  for (var i = 0; i < cps.length; i++) {
    var c = cps[i];
    var st = +(c.startTime !== undefined ? c.startTime : c.time);
    if (!isFinite(st)) continue;
    out.push({ t: st, end: +c.endTime || 0, title: c.title || c.name || ('Scene ' + (i + 1)), act: c.act || '' });
  }
  out.sort(function (a, b) { return a.t - b.t; });
  return out;
}
function chapterAt(chs, t) { var cur = -1; for (var i = 0; i < chs.length; i++) if (chs[i].t <= t + 0.5) cur = i; return cur; }

var ticksFor = -1;
function drawTicks(chs, d) {
  if (!d || ticksFor === chs.length + d) return;
  ticksFor = chs.length + d;
  var h = '', lastAct = null;
  for (var i = 0; i < chs.length; i++) {
    var actStart = chs[i].act && chs[i].act !== lastAct;
    lastAct = chs[i].act;
    h += '<i class="' + (actStart ? 'mtv-act' : '') + '" style="left:' + (chs[i].t / d * 100).toFixed(2) + '%"></i>';
  }
  els.ticks.innerHTML = h;
}

function title() {
  var vjs = getVjs();
  var t = vjs && vjs.mediainfo && vjs.mediainfo.name;
  if (!t) { var h = document.querySelector('.PerformanceInfo h1, .PerformanceInfo h2, h1'); t = h ? h.textContent : document.title; }
  return String(t || '').replace(/\s+/g, ' ').trim();
}

function update() {
  if (!root) return;
  var p = getPlayer();
  if (!p) return;
  var d = p.duration(), t = pending !== null ? pending : p.time();
  var paused = p.paused();
  els.badge.innerHTML = paused ? ICON.pause + '<span>Paused</span>' : '';
  els.badge.style.display = paused && !visible ? 'block' : 'none';
  if (!visible) return;
  var chs = chapters();
  var ci = chapterAt(chs, t);
  els.title.textContent = title();
  els.sub.textContent = ci >= 0 ? (chs[ci].act ? 'Act ' + chs[ci].act + ' \u00b7 ' : '') + chs[ci].title : '';
  els.cur.textContent = fmt(t);
  els.dur.textContent = d ? '\u2212' + fmt(Math.max(0, d - t)) + '  /  ' + fmt(d) : '';
  els.ch.textContent = chs.length ? 'Scene ' + (ci + 1) + ' of ' + chs.length : '';
  var pct = d ? Math.min(100, t / d * 100) : 0;
  els.prog.style.width = pct + '%';
  els.knob.style.left = pct + '%';
  els.buf.style.width = (d ? Math.min(100, p.buffered() / d * 100) : 0) + '%';
  els.tip.style.left = pct + '%';
  els.tip.textContent = pending !== null ? fmt(pending) + '  (' + (pending >= seekStartT ? '+' : '\u2212') + fmt(Math.abs(pending - seekStartT)) + ')' : '';
  els.tip.style.display = pending !== null ? 'block' : 'none';
  drawTicks(chs, d);
  var pb = els.btns[PLAY_IDX];
  if (pb.getAttribute('data-p') !== String(paused)) {
    pb.setAttribute('data-p', String(paused));
    pb.querySelector('i').innerHTML = paused ? ICON.play : ICON.pause;
    pb.querySelector('span').textContent = paused ? 'Play' : 'Pause';
  }
  els.btns[9].querySelector('span').textContent = 'Picture: ' + (MODE_LABEL[pictureMode()] || '');
}

function paint() {
  if (!root) return;
  els.scrub.classList.toggle('mtv-sel', zone === 'scrub' && !menu);
  for (var i = 0; i < els.btns.length; i++) els.btns[i].classList.toggle('mtv-sel', zone === 'btn' && !menu && i === sel);
  if (menu) {
    var h = '<h3>' + esc(menu.title) + '</h3><div class="mtv-po-mlist">';
    for (var j = 0; j < menu.items.length; j++) {
      var it = menu.items[j];
      h += (it.head ? '<h4>' + esc(it.head) + '</h4>' : '') + '<div class="mtv-po-mi' + (j === menu.sel ? ' mtv-sel' : '') + (it.on ? ' mtv-on' : '') + '" data-m="' + j + '">' +
        '<b>' + esc(it.label) + '</b>' + (it.sub ? '<span>' + esc(it.sub) + '</span>' : '') + '</div>';
    }
    els.menu.innerHTML = h + '</div>';
    els.menu.style.display = 'block';
    var cur = els.menu.querySelector('.mtv-sel'), list = els.menu.querySelector('.mtv-po-mlist');
    if (cur && list) list.scrollTop = Math.max(0, cur.offsetTop - list.clientHeight / 2);
  } else els.menu.style.display = 'none';
}

// ---- seeking (accumulates while LEFT/RIGHT are pressed/held, commits 600 ms after the last press) ----
function seekStep(dir) {
  var p = getPlayer();
  if (!p) return;
  var now = Date.now();
  seekRepeat = now - lastSeekKey < 350 ? seekRepeat + 1 : 0;
  lastSeekKey = now;
  var step = seekRepeat < 4 ? 10 : seekRepeat < 12 ? 30 : seekRepeat < 24 ? 60 : 180;
  if (pending === null) { seekStartT = p.time(); pending = seekStartT; }
  var d = p.duration();
  pending = Math.max(0, Math.min(d ? d - 2 : 1e9, pending + dir * step));
  update();
  clearTimeout(commitTimer);
  commitTimer = setTimeout(commitSeek, 600);
}
function commitSeek() {
  clearTimeout(commitTimer);
  if (pending === null) return;
  var p = getPlayer();
  if (p) { p.time(pending); stats.seeks++; stats.seekSecs += Math.round(pending - seekStartT); }
  pending = null;
  update();
}
function jumpTo(t, how) {
  var p = getPlayer();
  if (!p) return;
  pending = null;
  p.time(Math.max(0, t));
  stats.seeks++;
  stats.buttons[how] = (stats.buttons[how] || 0) + 1;
  update();
}

// ---- buttons ----
function activate() {
  var id = BTNS[sel].id;
  var p = getPlayer();
  stats.buttons[id] = (stats.buttons[id] || 0) + 1;
  if (id === 'play') { togglePlay(); }
  else if (id === 'rw') { if (p) jumpTo(p.time() - 10, 'rw'); }
  else if (id === 'ff') { if (p) jumpTo(p.time() + 30, 'ff'); }
  else if (id === 'prev' || id === 'next') {
    var chs = chapters();
    if (!chs.length || !p) { toast('No scene list for this video', 2000); return; }
    var t = p.time(), ci = chapterAt(chs, t);
    var to = id === 'next' ? ci + 1 : (ci >= 0 && t - chs[ci].t > 5 ? ci : ci - 1);
    if (to < 0) to = 0;
    if (to >= chs.length) { toast('Last scene', 1500); return; }
    jumpTo(chs[to].t, id);
    toast((chs[to].act ? 'Act ' + chs[to].act + ' \u00b7 ' : '') + chs[to].title, 2500);
  }
  else if (id === 'chapters') openChapters();
  else if (id === 'cc') openCaptions();
  else if (id === 'audio') openAudio();
  else if (id === 'pic') { var m = cyclePictureMode(); toast('Picture: ' + MODE_LABEL[m], 2500); update(); }
  else if (id === 'report') { if (hooks.onReport) hooks.onReport(); }
  else if (id === 'exit') { exitPlayer(); return; }
  paint();
}

export function togglePlay() {
  var p = getPlayer();
  if (!p) return;
  if (p.paused()) p.play(); else p.pause();
  setTimeout(update, 50);
}

export function exitPlayer() {
  var p = getPlayer();
  if (p && !p.paused()) p.pause();
  hide();
  setFullscreen(false);
  sendStats();
  if (hooks.onExit) hooks.onExit();
}

function openMenu(kind, titleText, items, cur) {
  menu = { kind: kind, title: titleText, items: items, sel: Math.max(0, cur) };
  zone = 'menu';
  paint(); bump();
}
function closeMenu() { menu = null; zone = 'btn'; paint(); bump(); }

function openChapters() {
  var chs = chapters(), p = getPlayer();
  if (!chs.length) { toast('No scene list for this video', 2000); return; }
  var ci = chapterAt(chs, p ? p.time() : 0), lastAct = null, items = [];
  for (var i = 0; i < chs.length; i++) {
    var c = chs[i];
    items.push({ label: (i + 1) + '. ' + c.title, sub: fmt(c.t), head: c.act && c.act !== lastAct ? 'Act ' + c.act : '', on: i === ci, act: c.t });
    lastAct = c.act;
  }
  openMenu('chapters', 'Scenes', items, ci);
}

function trackList(kind) {
  var vjs = getVjs(), out = [];
  var tl = vjs ? (kind === 'text' ? vjs.textTracks() : vjs.audioTracks()) : null;
  if (!tl) { var v = document.querySelector('.Player video'); tl = v ? (kind === 'text' ? v.textTracks : v.audioTracks) : null; }
  for (var i = 0; tl && i < tl.length; i++) {
    var t = tl[i];
    if (kind === 'text' && t.kind !== 'captions' && t.kind !== 'subtitles') continue;
    out.push(t);
  }
  return out;
}
var LANG = { en: 'English', de: 'German', fr: 'French', it: 'Italian', es: 'Spanish', ru: 'Russian', cs: 'Czech', pl: 'Polish', sv: 'Swedish', se: 'Swedish',
  ja: 'Japanese', zh: 'Chinese', ko: 'Korean', pt: 'Portuguese', nl: 'Dutch', hu: 'Hungarian', fi: 'Finnish', no: 'Norwegian', nb: 'Norwegian', da: 'Danish', he: 'Hebrew', uk: 'Ukrainian' };
// Brightcove labels are often bare codes ("en", "en-cc", "se"): show readable names.
export function langName(t) {
  var raw = String(t.label || t.language || '').replace(/^\s+|\s+$/g, '');
  var m = /^([a-z]{2,3})(?:[-_ ]?(cc|sdh|hi|[a-z]{2}))?$/i.exec(raw);
  if (!m) return raw || 'Track';
  var name = LANG[m[1].toLowerCase()] || raw;
  var extra = m[2] ? m[2].toLowerCase() : '';
  if (extra === 'cc' || extra === 'sdh' || extra === 'hi') name += ' (captions for the deaf/HoH)';
  else if (extra) name += ' (' + extra.toUpperCase() + ')';
  if (/^(main)$/i.test(t.kind || '') && name === raw) name = raw;
  return name;
}

function openCaptions() {
  var tracks = trackList('text');
  if (!tracks.length) { toast('No subtitles for this video', 2000); return; }
  var items = [{ label: 'Off', on: true, act: null }], cur = 0;
  for (var i = 0; i < tracks.length; i++) {
    var on = tracks[i].mode === 'showing';
    if (on) { items[0].on = false; cur = i + 1; }
    items.push({ label: langName(tracks[i]), sub: tracks[i].language || tracks[i].label || '', on: on, act: tracks[i] });
  }
  openMenu('cc', 'Subtitles', items, cur);
}
function openAudio() {
  var tracks = trackList('audio');
  if (!tracks.length) { toast('Only one audio track', 2000); return; }
  var items = [], cur = 0;
  for (var i = 0; i < tracks.length; i++) {
    if (tracks[i].enabled) cur = i;
    items.push({ label: langName(tracks[i]), sub: (tracks[i].kind || '') + (tracks[i].language ? ' \u00b7 ' + tracks[i].language : ''), on: tracks[i].enabled, act: tracks[i] });
  }
  openMenu('audio', 'Audio', items, cur);
}

function menuActivate() {
  var it = menu.items[menu.sel];
  var kind = menu.kind;
  if (kind === 'chapters') { jumpTo(it.act, 'chapter-list'); closeMenu(); return; }
  if (kind === 'resume') { if (it.act !== null) jumpTo(it.act, 'resume'); tlm('resume', { choice: it.act !== null ? 'resume' : 'start-over' }); menu = null; hide(); return; }
  if (kind === 'cc') {
    var tracks = trackList('text');
    for (var i = 0; i < tracks.length; i++) tracks[i].mode = tracks[i] === it.act ? 'showing' : 'disabled';
    tlm('track-change', { type: 'subtitles', to: it.act ? (it.act.language || it.act.label || '?') : 'off', available: tracks.length });
    toast('Subtitles: ' + (it.act ? langName(it.act) : 'off'), 2000);
  } else if (kind === 'audio') {
    var at = trackList('audio');
    for (var j = 0; j < at.length; j++) at[j].enabled = at[j] === it.act;
    tlm('track-change', { type: 'audio', to: it.act.language || it.act.label || '?', available: at.length });
    toast('Audio: ' + langName(it.act), 2000);
  }
  closeMenu();
}

// ---- resume (local, per title; only when the Met did not already resume) ----
var LS_RESUME = 'mtv.resume';
var resumeChecked = '', saveTick = 0;
function resumeKey() { return window.location.pathname; }
export function trackResume() {
  var p = getPlayer();
  if (!p || !isFullscreen()) return;
  var key = resumeKey(), t = p.time(), d = p.duration();
  if (resumeChecked !== key && !p.paused() && t > 0.5) {
    resumeChecked = key;
    var all = lsGet(LS_RESUME, {}) || {};
    var s = all[key];
    if (s && t < 30 && s.t > 60 && (!d || s.t < d - 180)) {
      show('menu');
      openMenu('resume', 'Continue where you left off?', [
        { label: 'Resume from ' + fmt(s.t), act: s.t, on: true },
        { label: 'Start from the beginning', act: null }
      ], 0);
    }
  }
  if (++saveTick % 15 === 0 && !p.paused() && d) {
    var store = lsGet(LS_RESUME, {}) || {};
    if (t > 60 && t < d - 120) store[key] = { t: Math.round(t), d: Math.round(d), at: Date.now() };
    else if (t >= d - 120) delete store[key];
    var keys = Object.keys(store);
    if (keys.length > 60) { keys.sort(function (a, b) { return store[a].at - store[b].at; }); for (var i = 0; i < keys.length - 60; i++) delete store[keys[i]]; }
    lsSet(LS_RESUME, store);
  }
}

function sendStats() {
  if (!stats.opened && !stats.seeks) return;
  tlm('player-controls', { opened: stats.opened, seeks: stats.seeks, seekSecs: stats.seekSecs, buttons: stats.buttons, keysHidden: stats.keysHidden, mode: pictureMode() });
  stats = { opened: 0, seeks: 0, seekSecs: 0, buttons: {}, keysHidden: 0 };
}

export function initPlayerUI() {
  setInterval(function () {
    try { trackResume(); } catch (e) { /* ignore */ }
    try { if (!isFullscreen() && visible) hide(); else update(); } catch (e2) { /* ignore */ }
  }, 1000);
  setInterval(sendStats, 5 * 60 * 1000);
}

// Returns true when the key was consumed. Only called while the full-screen player is active.
export function handleKey(k) {
  var p = getPlayer();
  // Media keys: always.
  if (k === KEY.PLAY) { if (p) p.play(); show(); return true; }
  if (k === KEY.PAUSE) { if (p) p.pause(); show(); return true; }
  if (k === KEY.PLAY_PAUSE) { togglePlay(); show(); return true; }
  if (k === KEY.FF) { if (p) jumpTo(p.time() + 30, 'key-ff'); show('scrub'); return true; }
  if (k === KEY.RW) { if (p) jumpTo(p.time() - 10, 'key-rw'); show('scrub'); return true; }
  if (k === KEY.STOP) { exitPlayer(); return true; }

  if (!visible) {
    stats.keysHidden++;
    if (k === KEY.BACK || k === KEY.ESC || k === KEY.BACKSPACE) return false; // index.js: leave the player
    if (k === KEY.ENTER) { togglePlay(); update(); return true; }
    if (k === KEY.LEFT || k === KEY.RIGHT) { show('scrub'); seekStep(k === KEY.RIGHT ? 1 : -1); return true; }
    if (k === KEY.UP || k === KEY.DOWN) { sel = PLAY_IDX; show('btn'); return true; }
    show(); return true;
  }

  bump();
  if (k === KEY.BACK || k === KEY.ESC || k === KEY.BACKSPACE) {
    if (menu) { if (menu.kind === 'resume') { menu = null; hide(); } else closeMenu(); }
    else { commitSeek(); hide(); }
    return true;
  }
  if (menu) {
    if (k === KEY.UP) { menu.sel = Math.max(0, menu.sel - 1); paint(); }
    else if (k === KEY.DOWN) { menu.sel = Math.min(menu.items.length - 1, menu.sel + 1); paint(); }
    else if (k === KEY.ENTER) menuActivate();
    else if (k === KEY.LEFT && menu.kind !== 'resume') closeMenu();
    return true;
  }
  if (zone === 'scrub') {
    if (k === KEY.LEFT || k === KEY.RIGHT) { seekStep(k === KEY.RIGHT ? 1 : -1); return true; }
    if (k === KEY.DOWN) { commitSeek(); zone = 'btn'; paint(); return true; }
    if (k === KEY.ENTER) { if (pending !== null) commitSeek(); else togglePlay(); return true; }
    return true;
  }
  // button row
  if (k === KEY.LEFT) { sel = Math.max(0, sel - 1); paint(); return true; }
  if (k === KEY.RIGHT) { sel = Math.min(BTNS.length - 1, sel + 1); paint(); return true; }
  if (k === KEY.UP) { zone = 'scrub'; paint(); return true; }
  if (k === KEY.DOWN) { return true; }
  if (k === KEY.ENTER) { activate(); return true; }
  return true;
}
