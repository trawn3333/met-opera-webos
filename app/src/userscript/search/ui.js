// Search mode: rapid-fire, as-you-type search over the bundled archive index.
//   left : query box (a real <input>, so the LG system keyboard / Magic Remote typing also works)
//          + an on-screen keyboard grid driven by the remote arrows
//   right: results update on every keystroke (<= 50 ms debounce): playable performances first,
//          plus matching titles / people as chips; recent searches when the box is empty.
// The Met's own /client/search is a fallback when the local index finds little.
import { search, load, titleName, personName, stats, fold } from './engine';
import { getTitle, imgUrl } from '../cat/catalog';
import { info, composerShort } from '../cat/catalogData';
import { KEY } from '../keys';
import { lsGet, lsSet } from '../util';
import { mw } from '../net';
import { tlm } from '../tlm';
import { dbg } from '../debugLog';

var root = null, inp = null, kbEl = null, resEl = null, chipsEl = null, listEl = null, infoEl = null;
var hooks = { play: null, openTitle: null, close: null, focusBar: null };
export function setSearchHooks(h) { for (var k in h) hooks[k] = h[k]; }
var q = '', res = null, metExtra = [], zone = 'kb', kr = 0, kc = 0, li = 0, ci = 0, ri = 0;
var timer = null, metTimer = null, lastRun = 0, typedSince = 0;
var RECENT = 'mtv.recentQ';
var SUGGEST = ['rosenkav', 'dvorak', 'davidsen', 'puccini 2024', 'netrebko', 'ring', 'levine wagner', 'callas'];

var KB = [
  ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
  ['h', 'i', 'j', 'k', 'l', 'm', 'n'],
  ['o', 'p', 'q', 'r', 's', 't', 'u'],
  ['v', 'w', 'x', 'y', 'z', '\'', '-'],
  ['1', '2', '3', '4', '5', '6', '7'],
  ['8', '9', '0', 'SPACE', 'SPACE', 'DEL', 'DEL'],
  ['CLEAR', 'CLEAR', 'CLEAR', 'TYPE', 'TYPE', 'TYPE', 'TYPE']
];
var KLABEL = { SPACE: 'Space', DEL: '\u232b Delete', CLEAR: 'Clear', TYPE: '\u2328 TV keyboard' };

function esc(s) { return String(s === undefined || s === null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

export function isOpen() { return !!root && root.classList.contains('mtv-open'); }

function ensure() {
  if (root && document.documentElement.contains(root)) return;
  root = document.createElement('div');
  root.className = 'mtv-search';
  var kb = '';
  for (var r = 0; r < KB.length; r++) {
    for (var c = 0; c < KB[r].length; c++) {
      var k = KB[r][c];
      if (c > 0 && KB[r][c - 1] === k) continue;
      var span = 1; while (c + span < KB[r].length && KB[r][c + span] === k) span++;
      kb += '<button type="button" class="mtv-key' + (KLABEL[k] ? ' mtv-key-w' : '') + '" data-k="' + esc(k) + '" data-r="' + r + '" data-c="' + c + '" style="width:' + (span * 92 - 10) + 'px">' + esc(KLABEL[k] || k) + '</button>';
    }
    kb += '<br>';
  }
  root.innerHTML = '<div class="mtv-s-left"><div class="mtv-s-qbox"><span class="mtv-s-icon">\u2315</span><input class="mtv-s-input" type="text" autocomplete="off" autocorrect="off" spellcheck="false" placeholder="Title, composer, singer, conductor\u2026"></div>' +
    '<div class="mtv-s-kb">' + kb + '</div><div class="mtv-s-info"></div></div>' +
    '<div class="mtv-s-right"><div class="mtv-s-chips"></div><div class="mtv-s-vp"><div class="mtv-s-list"></div></div></div>';
  document.body.appendChild(root);
  inp = root.querySelector('.mtv-s-input');
  kbEl = root.querySelector('.mtv-s-kb');
  chipsEl = root.querySelector('.mtv-s-chips');
  listEl = root.querySelector('.mtv-s-list');
  infoEl = root.querySelector('.mtv-s-info');
  inp.addEventListener('input', function () { setQuery(inp.value, true); });
  inp.addEventListener('focus', function () { zone = 'input'; paintFocus(false); });
  root.addEventListener('click', function (e) {
    var t = e.target;
    while (t && t !== root && !t.hasAttribute('data-k') && !t.hasAttribute('data-li') && !t.hasAttribute('data-ci') && !t.hasAttribute('data-ri')) t = t.parentElement;
    if (!t || t === root) return;
    if (t.hasAttribute('data-k')) { zone = 'kb'; kr = +t.getAttribute('data-r'); kc = +t.getAttribute('data-c'); press(t.getAttribute('data-k')); }
    else if (t.hasAttribute('data-li')) { zone = 'list'; li = +t.getAttribute('data-li'); activate(); }
    else if (t.hasAttribute('data-ci')) { zone = 'chips'; ci = +t.getAttribute('data-ci'); activate(); }
    else if (t.hasAttribute('data-ri')) { zone = 'recent'; ri = +t.getAttribute('data-ri'); activate(); }
  });
}

export function open() {
  ensure();
  root.classList.add('mtv-open');
  var t0 = Date.now();
  load();
  var st = stats();
  infoEl.textContent = 'Searching ' + st.performances + ' performances \u00b7 ' + st.titles + ' titles \u00b7 ' + st.people + ' artists (index ' + st.built + ')';
  if (!q) { zone = 'kb'; kr = 0; kc = 0; }
  inp.value = q;
  run();
  paintFocus(true);
  tlm('search', { action: 'open', indexMs: Date.now() - t0 });
}
export function close() {
  if (!root) return;
  root.classList.remove('mtv-open');
  try { inp.blur(); } catch (e) { /* ignore */ }
}
export function containsFocus() { return isOpen() && root.contains(document.activeElement); }

var lastMs = 0;
function setQuery(v, fromInput) {
  q = String(v || '').slice(0, 60);
  if (!fromInput && inp.value !== q) inp.value = q;
  typedSince = Date.now();
  clearTimeout(timer);
  // Rapid fire: run right away if idle, otherwise coalesce keystrokes (max 50 ms behind).
  var wait = Date.now() - lastRun > 120 ? 0 : 50;
  timer = setTimeout(run, wait);
}

function run() {
  lastRun = Date.now();
  var t0 = Date.now();
  res = q ? search(q, 60) : null;
  var ms = Date.now() - t0;
  lastMs = ms;
  metExtra = [];
  render();
  clearTimeout(metTimer);
  if (q && fold(q).length >= 3 && (!res || res.perfs.length < 3)) metTimer = setTimeout(metFallback, 350);
  if (q) dbg('info', 'search "' + q + '": ' + (res ? res.total : 0) + ' perfs in ' + ms + ' ms');
}

// Met fallback: /client/search/<q>?brief -> [{type:'opera'|'person', name, id}]
function metFallback() {
  var my = q;
  mw('GET', '/search/' + encodeURIComponent(my) + '?brief', null, function (err, d) {
    if (my !== q || err || !d || !d.length) return;
    var have = {};
    if (res) { res.titles.forEach(function (t) { have['t' + t.n] = 1; }); res.people.forEach(function (p) { have['p' + p.n] = 1; }); }
    metExtra = d.filter(function (x) { return x && x.name && !have[(x.type === 'person' ? 'p' : 't') + x.name]; }).slice(0, 6)
      .map(function (x) { return { kind: x.type === 'person' ? 'person' : 'title', name: x.name, met: true }; });
    tlm('search', { action: 'met-fallback', n: metExtra.length });
    if (metExtra.length) { renderChips(); paintFocus(false); }
  }, { timeout: 8000 });
}

function chipItems() {
  var out = [];
  if (!res) return out;
  res.titles.slice(0, 4).forEach(function (t) { out.push({ kind: 'title', name: t.n }); });
  res.people.slice(0, 4).forEach(function (p) { out.push({ kind: 'person', name: p.n, role: p.role }); });
  return out.concat(metExtra);
}

function fmtTag(m) { return m === 'H' ? '<i class="mtv-b-hd">HD</i>' : m === 'V' ? '<i class="mtv-b-sd">Telecast</i>' : '<i class="mtv-b-au">Audio</i>'; }
function dateStr(d) { var M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']; var p = d.split('-'); return M[+p[1] - 1] + ' ' + (+p[2]) + ', ' + p[0]; }
function hl(name, toks) {
  var f = fold(name), hit = false;
  for (var i = 0; i < toks.length; i++) if (toks[i].length >= 2 && (' ' + f).indexOf(' ' + toks[i].slice(0, 3)) >= 0) hit = true;
  return hit ? '<b>' + esc(name) + '</b>' : esc(name);
}

function render() {
  renderChips();
  var h = '';
  if (!q) {
    var rec = lsGet(RECENT, []) || [];
    h += '<h3>' + (rec.length ? 'Recent searches' : 'Try') + '</h3>';
    var list = rec.length ? rec : SUGGEST;
    for (var i = 0; i < list.length; i++) h += '<button type="button" class="mtv-s-rec" data-ri="' + i + '">' + esc(list[i]) + '</button>';
    if (rec.length) { h += '<h3>Try</h3>'; for (var j = 0; j < 4; j++) h += '<button type="button" class="mtv-s-rec" data-ri="' + (list.length + j) + '">' + esc(SUGGEST[j]) + '</button>'; }
    listEl.innerHTML = h;
    listEl.style.transform = listEl.style.webkitTransform = 'translate3d(0,0,0)';
    if (zone === 'list' || zone === 'chips') zone = 'kb';
    paintFocus(false);
    return;
  }
  var toks = fold(q).split(' ');
  if (!res || !res.perfs.length) {
    listEl.innerHTML = '<div class="mtv-s-none">No performances match \u201c' + esc(q) + '\u201d' + (metExtra.length ? '' : ' \u2014 checking the Met\u2026') + '</div>';
  } else {
    for (var k = 0; k < res.perfs.length; k++) {
      var p = res.perfs[k], r = p.r, tn = titleName(r[1]);
      var t = getTitle(tn), cur = info(tn);
      var cast = r[5].slice(0, 4).map(function (x) { return hl(personName(x), toks); }).join(', ');
      var cond = r[4] >= 0 ? hl(personName(r[4]), toks) : '';
      var img = t && t.img ? '<img alt="" data-src="' + esc(imgUrl(t.img, true)) + '">' : '';
      h += '<button type="button" class="mtv-s-row" data-li="' + k + '"><div class="mtv-s-img">' + img + (r[3] === 'A' ? '<em>\u266b</em>' : '') + '</div><div class="mtv-s-txt">' +
        '<div class="mtv-s-t">' + hl(tn, toks) + '</div>' +
        '<div class="mtv-s-m">' + fmtTag(r[3]) + ' ' + esc(dateStr(r[2])) + (r[6] ? ' \u00b7 ' + Math.floor(r[6] / 60) + 'h' + ('0' + r[6] % 60).slice(-2) : '') +
        (cur ? ' \u00b7 ' + esc(cur.composers.map(composerShort).join(' & ')) : '') + '</div>' +
        '<div class="mtv-s-c">' + (cond ? 'cond. ' + cond + (cast ? ' \u00b7 ' : '') : '') + cast + '</div></div></button>';
    }
    if (res.total > res.perfs.length) h += '<div class="mtv-s-more">' + (res.total - res.perfs.length) + ' more \u2014 keep typing to narrow down</div>';
    listEl.innerHTML = h;
  }
  li = Math.min(li, Math.max(0, (res ? res.perfs.length : 0) - 1));
  if (zone === 'list' && (!res || !res.perfs.length)) zone = 'kb';
  loadImgs();
  paintFocus(false);
}
function renderChips() {
  var items = chipItems(), h = '';
  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    h += '<button type="button" class="mtv-s-chip mtv-s-chip-' + it.kind + '" data-ci="' + i + '"><b>' + esc(it.name) + '</b><span>' +
      (it.kind === 'title' ? 'title' : (it.role || 'artist')) + (it.met ? ' \u00b7 Met search' : '') + '</span></button>';
  }
  chipsEl.innerHTML = h;
  chipsEl.style.display = h ? 'block' : 'none';
  if (ci >= items.length) ci = Math.max(0, items.length - 1);
}
function loadImgs() {
  var rows = listEl.querySelectorAll('img[data-src]');
  for (var i = 0; i < rows.length; i++) {
    var b = rows[i].parentNode.parentNode, idx = +b.getAttribute('data-li');
    if (idx >= li - 2 && idx <= li + 9) { rows[i].src = rows[i].getAttribute('data-src'); rows[i].removeAttribute('data-src'); rows[i].onerror = function () { this.style.display = 'none'; }; }
  }
}

function keyAt(r, c) { var row = KB[r]; return row ? row[Math.min(c, row.length - 1)] : null; }
function keyEl(r, c) {
  var k = keyAt(r, c), c0 = c;
  while (c0 > 0 && KB[r][c0 - 1] === k) c0--;
  return kbEl.querySelector('[data-r="' + r + '"][data-c="' + c0 + '"]');
}

function paintFocus(moveFocus) {
  if (!root) return;
  var prev = root.querySelectorAll('.mtv-f');
  for (var i = 0; i < prev.length; i++) prev[i].classList.remove('mtv-f');
  var el = null;
  if (zone === 'kb') el = keyEl(kr, kc);
  else if (zone === 'list') el = listEl.querySelector('[data-li="' + li + '"]');
  else if (zone === 'chips') el = chipsEl.querySelector('[data-ci="' + ci + '"]');
  else if (zone === 'recent') el = listEl.querySelector('[data-ri="' + ri + '"]');
  else if (zone === 'input') el = root.querySelector('.mtv-s-qbox');
  if (el) el.classList.add('mtv-f');
  root.querySelector('.mtv-s-qbox').classList.toggle('mtv-typing', document.activeElement === inp);
  if (zone === 'list' || zone === 'recent') {
    var vp = root.querySelector('.mtv-s-vp');
    if (el) {
      var y = Math.max(0, el.offsetTop - vp.clientHeight / 2 + el.offsetHeight / 2);
      y = Math.min(y, Math.max(0, listEl.scrollHeight - vp.clientHeight));
      listEl.style.transform = listEl.style.webkitTransform = 'translate3d(0,' + (-y) + 'px,0)';
    }
    if (zone === 'list') loadImgs();
  } else if (zone !== 'chips') {
    listEl.style.transform = listEl.style.webkitTransform = 'translate3d(0,0,0)';
  }
  if (moveFocus !== false || (el && document.activeElement !== inp)) {
    if (el && el.focus && zone !== 'input') { try { el.focus(); } catch (e) { /* ignore */ } }
  }
}

function press(k) {
  if (k === 'SPACE') setQuery(q + ' ');
  else if (k === 'DEL') setQuery(q.slice(0, -1));
  else if (k === 'CLEAR') setQuery('');
  else if (k === 'TYPE') { zone = 'input'; paintFocus(false); try { inp.focus(); } catch (e) { /* ignore */ } return; }
  else setQuery(q + k);
  paintFocus(true);
}

function addRecent() {
  var s = q.replace(/^\s+|\s+$/g, '');
  if (s.length < 2) return;
  var rec = (lsGet(RECENT, []) || []).filter(function (x) { return x.toLowerCase() !== s.toLowerCase(); });
  rec.unshift(s);
  if (rec.length > 8) rec.length = 8;
  lsSet(RECENT, rec);
}

function activate() {
  if (zone === 'kb') { press(keyAt(kr, kc)); return; }
  if (zone === 'recent') {
    var rec = lsGet(RECENT, []) || [];
    var all = rec.length ? rec.concat(SUGGEST.slice(0, 4)) : SUGGEST;
    if (all[ri]) { setQuery(all[ri]); zone = 'kb'; run(); if (res && res.perfs.length) { zone = 'list'; li = 0; } paintFocus(true); }
    return;
  }
  if (zone === 'list' && res && res.perfs[li]) {
    var p = res.perfs[li];
    addRecent();
    tlm('search', { action: 'play', rank: li, qLen: q.length, via: p.via ? p.via.charAt(0) : 't' });
    if (hooks.play) hooks.play(p.r[0], { title: titleName(p.r[1]), from: 'search' });
    return;
  }
  if (zone === 'chips') {
    var it = chipItems()[ci];
    if (!it) return;
    addRecent();
    tlm('search', { action: 'chip', kind: it.kind, met: !!it.met });
    if (it.kind === 'title') { if (hooks.openTitle) hooks.openTitle(it.name); }
    else { setQuery(it.name); run(); zone = res && res.perfs.length ? 'list' : 'kb'; li = 0; paintFocus(true); }
  }
}

// Typed characters from a USB/Bluetooth keyboard or the Magic Remote's keyboard when our grid has focus.
function typedChar(e) {
  var k = e.keyCode;
  if (e.key && e.key.length === 1 && /[\w '\-\u00c0-\u024f]/.test(e.key)) return e.key.toLowerCase();
  if (k >= 65 && k <= 90) return String.fromCharCode(k + 32);
  if (k >= 48 && k <= 57 && !e.shiftKey) return String.fromCharCode(k);
  if (k === 32) return ' ';
  return null;
}

// Returns true if the key was consumed. (BACK handling is in index.js.)
export function handleKey(k, e) {
  if (!isOpen()) return false;
  var typing = document.activeElement === inp;
  if (typing) {
    if (k === KEY.DOWN || k === KEY.ENTER) { inp.blur(); zone = res && res.perfs.length && k === KEY.ENTER ? 'list' : 'kb'; li = 0; paintFocus(true); return true; }
    if (k === KEY.UP) { inp.blur(); if (hooks.focusBar) hooks.focusBar(); return true; }
    return false;   // let the input / system keyboard have it
  }
  var ch = e ? typedChar(e) : null;
  if (ch && !(k >= 37 && k <= 40)) { setQuery(q + ch); if (zone !== 'kb' && zone !== 'input') zone = 'kb'; paintFocus(true); return true; }
  if (k === KEY.BACKSPACE && q) { setQuery(q.slice(0, -1)); return true; }
  var nRes = res ? res.perfs.length : 0, nChips = chipItems().length;
  var nRec = !q ? ((lsGet(RECENT, []) || []).length ? (lsGet(RECENT, []) || []).length + 4 : SUGGEST.length) : 0;
  if (zone === 'input') {
    if (k === KEY.DOWN) { zone = 'kb'; kr = 0; }
    else if (k === KEY.RIGHT) { zone = nRes ? 'list' : nRec ? 'recent' : 'input'; }
    else if (k === KEY.UP) { if (hooks.focusBar) hooks.focusBar(); return true; }
    else if (k === KEY.ENTER) { try { inp.focus(); } catch (e2) { /* ignore */ } paintFocus(false); return true; }
    paintFocus(true); return true;
  }
  if (zone === 'kb') {
    if (k === KEY.UP) { if (kr === 0) zone = 'input'; else kr--; }
    else if (k === KEY.DOWN) { if (kr < KB.length - 1) kr++; }
    else if (k === KEY.LEFT) { var c0 = kc; while (c0 > 0 && KB[kr][c0 - 1] === KB[kr][kc]) c0--; if (c0 > 0) kc = c0 - 1; }
    else if (k === KEY.RIGHT) {
      var c1 = kc; while (c1 < KB[kr].length - 1 && KB[kr][c1 + 1] === KB[kr][kc]) c1++;
      if (c1 < KB[kr].length - 1) kc = c1 + 1;
      else if (nRes) { zone = 'list'; }
      else if (nChips) { zone = 'chips'; ci = 0; }
      else if (nRec) { zone = 'recent'; ri = 0; }
    } else if (k === KEY.ENTER) { activate(); return true; }
    else return false;
    paintFocus(true); return true;
  }
  if (zone === 'list') {
    if (k === KEY.UP) { if (li > 0) li--; else if (nChips) { zone = 'chips'; } }
    else if (k === KEY.DOWN) { if (li < nRes - 1) li++; }
    else if (k === KEY.LEFT) { zone = 'kb'; }
    else if (k === KEY.ENTER) { activate(); return true; }
    else return false;
    paintFocus(true); return true;
  }
  if (zone === 'chips') {
    if (k === KEY.LEFT) { if (ci > 0) ci--; else zone = 'kb'; }
    else if (k === KEY.RIGHT) { if (ci < nChips - 1) ci++; }
    else if (k === KEY.DOWN) { if (nRes) zone = 'list'; }
    else if (k === KEY.UP) { if (hooks.focusBar) hooks.focusBar(); return true; }
    else if (k === KEY.ENTER) { activate(); return true; }
    else return false;
    paintFocus(true); return true;
  }
  if (zone === 'recent') {
    if (k === KEY.UP) { if (ri > 0) ri--; }
    else if (k === KEY.DOWN) { if (ri < nRec - 1) ri++; }
    else if (k === KEY.LEFT) { zone = 'kb'; }
    else if (k === KEY.ENTER) { activate(); return true; }
    else return false;
    paintFocus(true); return true;
  }
  return false;
}
export function refocus() { if (isOpen()) paintFocus(true); }
export function debugState() { return { q: q, zone: zone, kr: kr, kc: kc, li: li, results: res ? res.perfs.length : 0, shown: res ? res.q : '', runMs: lastMs, chips: chipItems().length }; }
export function typeForTest(s) { setQuery(s); }
