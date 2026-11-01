// Remote-first playback controls: our own large overlay over OUR OWN <video> (player.js, 1.3.0).
// Key model:
//   hidden : OK = play/pause · LEFT/RIGHT = previous/next SCENE (Met scene markers, toast with the name)
//            UP/DOWN = show controls, focus on the LAST USED button (remembered in localStorage)
//            BACK = leave the player (handled by index.js)
//   shown  : UP/DOWN move between the scrub bar and the button row · on the scrub bar LEFT/RIGHT move in
//            LARGE steps (5% of the running time, 2-5 min; faster when held) · OK activates · BACK hides
//   media keys: play/pause/stop; FF/REW = next/previous scene. 1.3.2: no short (10/30 s) skips anywhere.
//   Auto-hides after 4 s without keys.
import { KEY } from './keys';
import { getPlayer, isFullscreen, fmt, pictureMode, setPictureMode, MODE_LABEL, STREAM_LABEL, streamPref, setStreamPref, fitInfo,
  chapters as engChapters, title as engTitle, subtitle as engSub, textTracks, setTextTrack, getVideoEl, close as closePlayer, thumbAt, playerRoot, castInfo, setEngineHooks, current } from './player';
import { castItems } from './cast/cast';
import { productionFor, productionItems } from './cast/credits';
import { tlm } from './tlm';
import { popFactsOn, setPopFacts, startSession as factsStart, stopSession as factsStop, tick as factsTick, sessionInfo as factsInfo, dismiss as factsDismiss } from './facts/popFacts';
import { toast } from './toast';
import { lsGet, lsSet } from './util';
import { dbg } from './debugLog';

var HIDE_MS = 4000;
var root = null, els = {};
var visible = false, hideTimer = null, tick = null;
var zone = 'btn', sel = 2;            // focus: 'scrub' | 'btn' | 'menu'
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
  play: svg('<path d="M8 5v14l11-7z"/>'),
  pause: svg('<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>'),
  next: svg('<path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/>'),
  chapters: svg('<path d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z"/>'),
  cast: svg('<path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/>'),
  cc: svg('<path d="M19 4H5c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm-8 7H9.5v-.5h-2v3h2V13H11v1c0 .55-.45 1-1 1H7c-.55 0-1-.45-1-1v-4c0-.55.45-1 1-1h3c.55 0 1 .45 1 1v1zm7 0h-1.5v-.5h-2v3h2V13H18v1c0 .55-.45 1-1 1h-3c-.55 0-1-.45-1-1v-4c0-.55.45-1 1-1h3c.55 0 1 .45 1 1v1z"/>'),
  audio: svg('<path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>'),
  pic: svg('<path d="M21 3H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H3V5h18v14zM5 7h14v10H5z" fill-rule="evenodd"/>'),
  report: svg('<path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/>'),
  facts: svg('<path d="M20 2H4a2 2 0 0 0-2 2v18l4-4h14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2zm-7 12h-2v-2h2v2zm1.6-5.4c-.5.7-1.1 1-1.4 1.5-.2.3-.2.6-.2 1.4h-2c0-1.1.2-1.8.6-2.3.5-.7 1.2-1 1.5-1.5.4-.6.1-1.7-1.1-1.7-.8 0-1.2.6-1.4 1.2l-1.8-.7C9.2 5.3 10.3 4.5 12 4.5c2.5 0 3.6 2.4 2.6 4.1z"/>')
};
var BTNS = [
  { id: 'exit', label: 'Back' },
  { id: 'prev', label: 'Prev scene' },
  { id: 'play', label: 'Play' },
  { id: 'next', label: 'Next scene' },
  { id: 'chapters', label: 'Scenes' },
  { id: 'cast', label: 'Cast' },
  { id: 'facts', label: 'Pop-up facts' },
  { id: 'cc', label: 'Subtitles' },
  { id: 'audio', label: 'Audio' },
  { id: 'pic', label: 'Picture & stream' },
  { id: 'report', label: 'Report problem' }
];
var PLAY_IDX = 2;
function btnIdx(id) { for (var i = 0; i < BTNS.length; i++) if (BTNS[i].id === id) return i; return -1; }
// 1.3.2: remember the last controls action (persisted). Back / Report are never remembered (OK by habit
// would leave the player or send a report).
var LAST_KEY = 'mtv.ctlLast';
function rememberSel() { var id = BTNS[sel] && BTNS[sel].id; if (id && id !== 'exit' && id !== 'report') lsSet(LAST_KEY, id); }
export function rememberedButton() { var id = lsGet(LAST_KEY, ''); var i = btnIdx(id); return i >= 0 ? BTNS[i].id : 'play'; }
function startSel() { var i = btnIdx(lsGet(LAST_KEY, '')); return i >= 0 ? i : PLAY_IDX; }

function esc(s) { return String(s === undefined || s === null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

function ensure() {
  var host = playerRoot();
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
        '<div class="mtv-po-scrub"><div class="mtv-po-buf"></div><div class="mtv-po-prog"></div><div class="mtv-po-ticks"></div><div class="mtv-po-knob"></div><div class="mtv-po-tip"><img alt=""><span></span></div></div>' +
        '<div class="mtv-po-btns">' + b + '</div>' +
        '<div class="mtv-po-hint">OK select \u00b7 \u25B2 bar: \u25C0 \u25B6 big jumps (hold = faster) \u00b7 controls hidden: \u25C0 \u25B6 previous / next scene \u00b7 BACK hide</div>' +
      '</div>' +
      '<div class="mtv-po-menu"></div>';
    els = {
      title: root.querySelector('.mtv-po-title'), sub: root.querySelector('.mtv-po-sub'), badge: root.querySelector('.mtv-po-badge'),
      cur: root.querySelector('.mtv-po-cur'), dur: root.querySelector('.mtv-po-dur'), ch: root.querySelector('.mtv-po-ch'),
      scrub: root.querySelector('.mtv-po-scrub'), buf: root.querySelector('.mtv-po-buf'), prog: root.querySelector('.mtv-po-prog'),
      ticks: root.querySelector('.mtv-po-ticks'), knob: root.querySelector('.mtv-po-knob'), tip: root.querySelector('.mtv-po-tip'),
      tipImg: root.querySelector('.mtv-po-tip img'), tipTxt: root.querySelector('.mtv-po-tip span'),
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
function chapters() { return engChapters(); }
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

function title() { return engTitle(); }

var castScene = -2;
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
  els.sub.textContent = (ci >= 0 ? (chs[ci].act ? 'Act ' + chs[ci].act + ' \u00b7 ' : '') + chs[ci].title + '   \u2014   ' : '') + engSub();
  els.cur.textContent = fmt(t);
  els.dur.textContent = d ? '\u2212' + fmt(Math.max(0, d - t)) + '  /  ' + fmt(d) : '';
  els.ch.textContent = chs.length ? 'Scene ' + (ci + 1) + ' of ' + chs.length : '';
  var pct = d ? Math.min(100, t / d * 100) : 0;
  els.prog.style.width = pct + '%';
  els.knob.style.left = pct + '%';
  els.buf.style.width = (d ? Math.min(100, p.buffered() / d * 100) : 0) + '%';
  els.tip.style.left = pct + '%';
  els.tipTxt.textContent = pending !== null ? fmt(pending) + '  (' + (pending >= seekStartT ? '+' : '\u2212') + fmt(Math.abs(pending - seekStartT)) + ')' : '';
  var th = pending !== null ? thumbAt(pending) : '';
  if (th) { if (els.tipImg.getAttribute('src') !== th) els.tipImg.setAttribute('src', th); els.tipImg.style.display = 'block'; } else els.tipImg.style.display = 'none';
  els.tip.style.display = pending !== null ? 'block' : 'none';
  if (pending !== null) {   // keep the preview inside the bar near the ends (it is centred on the knob)
    var bw = els.tip.parentNode.offsetWidth, tw = els.tip.offsetWidth;
    if (bw && tw) els.tip.style.left = Math.max(tw / 2, Math.min(bw - tw / 2, bw * pct / 100)) + 'px';
  }
  drawTicks(chs, d);
  if (menu && menu.kind === 'cast' && ci !== castScene) refreshCast(ci);
  var pb = els.btns[PLAY_IDX];
  if (pb.getAttribute('data-p') !== String(paused)) {
    pb.setAttribute('data-p', String(paused));
    pb.querySelector('i').innerHTML = paused ? ICON.play : ICON.pause;
    pb.querySelector('span').textContent = paused ? 'Play' : 'Pause';
  }
}

function paint() {
  if (!root) return;
  factsLabel();
  els.scrub.classList.toggle('mtv-sel', zone === 'scrub' && !menu);
  for (var i = 0; i < els.btns.length; i++) els.btns[i].classList.toggle('mtv-sel', zone === 'btn' && !menu && i === sel);
  if (menu) {
    var h = '<h3>' + esc(menu.title) + '</h3><div class="mtv-po-mlist">';
    for (var j = 0; j < menu.items.length; j++) {
      var it = menu.items[j];
      h += (it.head ? '<h4>' + esc(it.head) + '</h4>' : '') + '<div class="mtv-po-mi' + (j === menu.sel ? ' mtv-sel' : '') + (it.on ? ' mtv-on' : '') + '" data-m="' + j + '">' +
        '<b>' + esc(it.label) + (it.trouser ? ' <i class="mtv-trouser">trouser role</i>' : '') + '</b>' + (it.sub ? '<span>' + esc(it.sub) + '</span>' : '') +
        (it.note ? '<em>' + esc(it.note) + '</em>' : '') + '</div>';
    }
    els.menu.className = 'mtv-po-menu' + (menu.kind === 'cast' ? ' mtv-po-cast' : '');
    els.menu.innerHTML = h + '</div>';
    els.menu.style.display = 'block';
    var cur = els.menu.querySelector('.mtv-sel'), list = els.menu.querySelector('.mtv-po-mlist');
    if (cur && list) list.scrollTop = Math.max(0, cur.offsetTop - list.clientHeight / 2);
  } else els.menu.style.display = 'none';
}

// ---- seeking (accumulates while LEFT/RIGHT are pressed/held, commits 800 ms after the last press) ----
function seekStep(dir) {
  var p = getPlayer();
  if (!p) return;
  var now = Date.now();
  seekRepeat = now - lastSeekKey < 450 ? seekRepeat + 1 : 0;
  lastSeekKey = now;
  var d = p.duration();
  // Coarse only (1.3.2): 5% of the running time, kept between 2 and 5 minutes; x2 / x4 when held.
  var base = d ? Math.max(120, Math.min(300, d * 0.05)) : 300;
  var step = base * (seekRepeat < 4 ? 1 : seekRepeat < 10 ? 2 : 4);
  if (pending === null) { seekStartT = p.time(); pending = seekStartT; }
  pending = Math.max(0, Math.min(d ? d - 2 : 1e9, pending + dir * step));
  update();
  clearTimeout(commitTimer);
  commitTimer = setTimeout(commitSeek, 900);
}
export function seekStepSize() { var p = getPlayer(), d = p ? p.duration() : 0; return d ? Math.max(120, Math.min(300, d * 0.05)) : 300; }
// Previous / next scene with a toast naming it (and who sings). Returns false when there are no scenes.
export function sceneJump(dir, how) {
  var p = getPlayer();
  var chs = chapters();
  if (!p) return false;
  if (!chs.length) { toast('No scene list for this video', 2000); return false; }
  var t = p.time(), ci = chapterAt(chs, t);
  var to = dir > 0 ? ci + 1 : (ci >= 0 && t - chs[ci].t > 5 ? ci : ci - 1);
  if (to < 0) to = 0;
  if (to >= chs.length) { toast('This is the last scene', 1800); return true; }
  jumpTo(chs[to].t, how);
  var c = chs[to], who = '';
  var cast = castInfo();
  if (c.artists && c.artists.length) {
    var names = [];
    for (var i = 0; i < c.artists.length && names.length < 4; i++) {
      var a = c.artists[i];
      if (/orchestra|chorus/i.test(a) || (cast && cast.conductor === a)) continue;
      var role = '';
      if (cast) for (var j = 0; j < cast.roles.length; j++) if (cast.roles[j].singer === a && cast.roles[j].role) { role = cast.roles[j].role; break; }
      names.push(role ? role + ' (' + a + ')' : a);
    }
    who = names.join(', ');
  }
  toast('<div class="mtv-scene-toast"><small>Scene ' + (to + 1) + ' of ' + chs.length + (c.act ? ' \u00b7 Act ' + esc(c.act) : '') + '</small><b>' + esc(c.title) + '</b>' + (who ? '<span>' + esc(who) + '</span>' : '') + '</div>', 3000, true);
  return true;
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
  rememberSel();
  var p = getPlayer();
  stats.buttons[id] = (stats.buttons[id] || 0) + 1;
  if (id === 'play') { togglePlay(); }
  else if (id === 'prev' || id === 'next') { sceneJump(id === 'next' ? 1 : -1, id); }
  else if (id === 'chapters') openChapters();
  else if (id === 'cast') openCast();
  else if (id === 'facts') { setPopFacts(!popFactsOn()); factsLabel(); toast('Pop-up facts: ' + (popFactsOn() ? 'on' : 'off'), 1800); }
  else if (id === 'cc') openCaptions();
  else if (id === 'audio') openAudio();
  else if (id === 'pic') openPicture();
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
  sendStats();
  closePlayer('back');
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

// ---- Cast (1.3.2): Met cast + roles, scene-aware from the cue point "artists" ----
function castTitle(chs, ci) { return 'Cast' + (ci >= 0 ? '  \u00b7  ' + (chs[ci].act ? 'Act ' + chs[ci].act + ': ' : '') + chs[ci].title : ''); }
function prodItems() { var c = current(); return productionItems(productionFor(c && c.id)); }
function openCast() {
  var cast = castInfo();
  if (!cast || (!cast.roles.length && !cast.conductor)) { toast('The Met lists no cast for this video', 2200); return; }
  var chs = chapters(), p = getPlayer(), ci = chapterAt(chs, p ? p.time() : 0);
  castScene = ci;
  openMenu('cast', castTitle(chs, ci), castItems(cast, ci >= 0 ? chs[ci] : null).concat(prodItems()), 0);
  tlm('cast', { action: 'open', roles: cast.roles.length, scene: ci, sceneArtists: ci >= 0 && chs[ci].artists ? chs[ci].artists.length : 0 });
}
function refreshCast(ci) {
  var cast = castInfo(), chs = chapters();
  castScene = ci;
  if (!cast || !menu) return;
  menu.title = castTitle(chs, ci);
  menu.items = castItems(cast, ci >= 0 ? chs[ci] : null).concat(prodItems());
  if (menu.sel >= menu.items.length) menu.sel = 0;
  paint();
}

function trackList(kind) {
  if (kind === 'text') return textTracks().slice();
  var v = getVideoEl(), out = [], tl = v && v.audioTracks;
  for (var i = 0; tl && i < tl.length; i++) out.push(tl[i]);
  return out.length > 1 ? out : [];
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
  if (kind === 'cast') { closeMenu(); return; }
  if (kind === 'resume') { jumpTo(it.act, 'resume'); tlm('resume', { choice: it.act > 0 ? 'resume' : 'start-over' }); menu = null; hide(); return; }
  if (kind === 'pic') {
    if (it.act.pic) { setPictureMode(it.act.pic); toast('Picture: ' + MODE_LABEL[it.act.pic], 2000); }
    if (it.act.stream) { setStreamPref(it.act.stream); toast('Stream: ' + STREAM_LABEL[it.act.stream], 2500); }
    closeMenu(); return;
  }
  if (kind === 'cc') {
    var tracks = trackList('text');
    setTextTrack(it.act);
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

// ---- resume prompt (playback already continued from the saved point; offer to start over) ----
export function showResume(t) {
  if (!t || !isFullscreen()) return;
  show('menu');
  openMenu('resume', 'Continued where you left off', [
    { label: 'Continue from ' + fmt(t), act: t, on: true },
    { label: 'Start from the beginning', act: 0 }
  ], 0);
}

function openPicture() {
  var pm = pictureMode(), sp = streamPref(), items = [];
  items.push({ head: 'Picture', label: MODE_LABEL.fit, sub: 'Whole picture, letterboxed to the video\u2019s real shape (recommended)', on: pm === 'fit', act: { pic: 'fit' } });
  items.push({ label: MODE_LABEL.full, sub: 'Video box fills the screen; the TV scales the picture', on: pm === 'full', act: { pic: 'full' } });
  var first = true;
  for (var k in STREAM_LABEL) { items.push({ head: first ? 'Stream' : '', label: STREAM_LABEL[k], on: sp === k, act: { stream: k } }); first = false; }
  var cur = 0; for (var i = 0; i < items.length; i++) if (items[i].on) { cur = i; break; }
  var fi = fitInfo();
  openMenu('pic', 'Picture & stream  \u00b7  ' + fi.video + ' via ' + fi.src, items, cur);
}

function sendStats() {
  if (!stats.opened && !stats.seeks) return;
  tlm('player-controls', { opened: stats.opened, seeks: stats.seeks, seekSecs: stats.seekSecs, buttons: stats.buttons, keysHidden: stats.keysHidden, mode: pictureMode() });
  stats = { opened: 0, seeks: 0, seekSecs: 0, buttons: {}, keysHidden: 0 };
}

// ---- 1.4.0 pop-up facts (1.4.1: per-performance scope via session id) ----
function factsLabel() {
  if (!root) return;
  var i = btnIdx('facts');
  if (i >= 0) els.btns[i].querySelector('span').textContent = 'Pop-up facts: ' + (popFactsOn() ? 'on' : 'off');
}
var factsFor = null;
function factsStep() {
  var c = current(), p = getPlayer();
  if (!c || !p) { if (factsFor) { factsStop(); factsFor = null; } return; }
  if (factsFor !== c.id) {
    factsFor = c.id;
    factsStart({ id: c.id, name: c.opera || c.name || title(), root: playerRoot() });
  }
  var prod = productionFor(c.id);
  factsTick(p.time(), { chapters: chapters(), duration: p.duration(), prodPremiere: prod ? prod.premiere : '', paused: p.paused(), root: playerRoot() });
}
export function factsState() { return { on: popFactsOn(), session: factsInfo() }; }
export function factsHide() { factsDismiss(true); }

export function initPlayerUI() {
  setEngineHooks({ sceneJump: sceneJump });
  setInterval(function () {
    try { if (!isFullscreen() && visible) hide(); else update(); } catch (e2) { /* ignore */ }
    try { factsStep(); } catch (e3) { dbg('warn', 'pop-up facts: ' + (e3 && e3.message)); }
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
  if (k === KEY.FF || k === KEY.RW) { sceneJump(k === KEY.FF ? 1 : -1, k === KEY.FF ? 'key-ff' : 'key-rw'); return true; }
  if (k === KEY.STOP) { exitPlayer(); return true; }

  if (!visible) {
    stats.keysHidden++;
    if (k === KEY.BACK || k === KEY.ESC || k === KEY.BACKSPACE) return false; // index.js: leave the player
    if (k === KEY.ENTER) { togglePlay(); update(); return true; }
    if (k === KEY.LEFT || k === KEY.RIGHT) { sceneJump(k === KEY.RIGHT ? 1 : -1, k === KEY.RIGHT ? 'hidden-right' : 'hidden-left'); return true; }
    if (k === KEY.UP || k === KEY.DOWN) { sel = startSel(); show('btn'); return true; }
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
  if (k === KEY.LEFT) { sel = Math.max(0, sel - 1); rememberSel(); paint(); return true; }
  if (k === KEY.RIGHT) { sel = Math.min(BTNS.length - 1, sel + 1); rememberSel(); paint(); return true; }
  if (k === KEY.UP) { zone = 'scrub'; paint(); return true; }
  if (k === KEY.DOWN) { return true; }
  if (k === KEY.ENTER) { activate(); return true; }
  return true;
}
