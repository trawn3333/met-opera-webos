// The Categories screen: our own full-screen overlay under the top bar. Rows of cards / chips,
// driven by its own lightweight key handling (row/column model) so it stays fast on webOS 4/5:
// only rows near the focus get their cards built, and only cards near the focus load images.
// Selecting a performance opens the Met's own title page (their player does the playback).
import { homeRows, category, composerRows, FORMATS } from './model';
import { getTitle, getPerformances, refreshLists, listsStale, catalogStatus, imgUrl } from './catalog';
import { info, composerShort, composerName, LANGS, ERAS, MOODS } from './catalogData';
import { KEY } from '../keys';
import { dbg } from '../debugLog';
import { tlm } from '../tlm';
import { toast } from '../toast';

var root = null, head = null, rowsEl = null;
var stack = [];            // view stack
var view = null;           // current view {kind, rows, r, c, ...}
var rowEls = [];
var lastF = null;          // focused card (class mtv-f mirrors :focus; also visible when the window lacks focus)
var hooks = { openPath: null, focusBar: null, onClose: null };
export function setHooks(h) { for (var k in h) hooks[k] = h[k]; }

var GRID_COLS = 5, CHIP_COLS = 6, PERF_COLS = 4, ROW_CAP = 40;

function esc(s) { return String(s === undefined || s === null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
function plural(n, w) { return n + ' ' + w + (n === 1 ? '' : 's'); }

export function isOpen() { return !!root && root.classList.contains('mtv-open'); }
export function containsFocus() { return isOpen() && root.contains(document.activeElement); }

function ensure() {
  if (root && document.documentElement.contains(root)) return;
  root = document.createElement('div');
  root.className = 'mtv-cat';
  root.setAttribute('role', 'dialog');
  root.innerHTML = '<div class="mtv-cat-head"><div class="mtv-cat-crumb"></div><h1></h1><p class="mtv-cat-sub"></p></div>' +
    '<div class="mtv-cat-vp"><div class="mtv-cat-rows"></div></div>' +
    '<div class="mtv-cat-hint">OK open \u00b7 BACK go back \u00b7 UP from the top row: menu</div>';
  document.body.appendChild(root);
  head = root.querySelector('.mtv-cat-head');
  rowsEl = root.querySelector('.mtv-cat-rows');
  root.addEventListener('click', function (e) {
    var b = e.target;
    while (b && b !== root && !b.hasAttribute('data-r')) b = b.parentElement;
    if (!b || b === root) return;
    view.r = +b.getAttribute('data-r'); view.c = +b.getAttribute('data-c');
    activate();
  });
}

export function open(viewSpec) {
  ensure();
  document.documentElement.classList.add('mtv-cat-open');
  root.classList.add('mtv-open');
  stack = [];
  show(viewSpec || { kind: 'home' }, false);
  tlm('categories', { action: 'open' });
  if (listsStale()) {
    refreshLists(false, function (err, changed, st) {
      tlm('catalog-refresh', { result: err || 'ok', auto: true, titles: st ? st.titles : 0, ms: st ? st.ms : 0 });
      if (!err && changed && isOpen() && view.kind === 'home') rerender();
    });
  }
}

export function close() {
  if (!root) return;
  root.classList.remove('mtv-open');
  document.documentElement.classList.remove('mtv-cat-open');
  rowsEl.innerHTML = '';
  rowEls = [];
  stack = [];
  view = null;
  if (hooks.onClose) hooks.onClose();
}

// BACK: previous view, or close at the top level. Returns true if handled.
export function back() {
  if (!isOpen()) return false;
  if (stack.length) { var v = stack.pop(); show(v, false, true); return true; }
  close();
  return true;
}

function show(spec, push, restoring) {
  if (push && view) stack.push(view);
  view = restoring ? spec : { kind: spec.kind, id: spec.id, name: spec.name, filter: spec.filter, r: 0, c: 0 };
  build();
  render();
  focusCurrent();
}
function rerender() { var r = view.r, c = view.c; build(); view.r = Math.min(r, view.rows.length - 1); view.c = c; render(); focusCurrent(); }

// ---------- views -> rows ----------
function chunk(items, n, rowProto) {
  var rows = [];
  for (var i = 0; i < items.length; i += n) {
    var r = {}; for (var k in rowProto) r[k] = rowProto[k];
    r.items = items.slice(i, i + n);
    if (i > 0) r.title = '';
    rows.push(r);
  }
  return rows;
}

function build() {
  var v = view, st = catalogStatus();
  if (v.kind === 'home') {
    v.head = { crumb: 'Met Opera on Demand', title: 'Categories', sub: 'Browse the Met archive by composer, language, style, mood, format and decade' +
      (st.refreshing ? ' \u00b7 updating catalog\u2026' : '') };
    v.rows = homeRows();
  } else if (v.kind === 'cat') {
    var c = category(v.id);
    v.cat = c;
    v.head = { crumb: 'Categories', title: c.title, sub: plural(c.titles.length, 'title') + (c.filter && c.filter.dec ? ' with performances from the ' + c.filter.dec + 's' : '') };
    v.rows = c.titles.length ? chunk(c.titles, GRID_COLS, { type: 'cards', title: '', filter: c.filter }) : [{ type: 'msg', title: 'Nothing here yet', items: [] }];
  } else if (v.kind === 'composers') {
    var list = composerRows();
    v.head = { crumb: 'Categories', title: 'All composers A\u2013Z', sub: plural(list.length, 'composer') };
    v.rows = chunk(list, CHIP_COLS, { type: 'chips', title: '' });
  } else if (v.kind === 'title') {
    buildTitle(v);
  }
}

function fmtLabel(f) { return f === 'hd' ? 'HD video' : f === 'sd' ? 'Telecast' : 'Audio'; }
function dateStr(d) {
  if (!d) return '';
  var M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var p = d.split('-');
  return M[+p[1] - 1] + ' ' + (+p[2]) + ', ' + p[0];
}
function hm(min) { if (!min) return ''; var h = Math.floor(min / 60), m = min % 60; return h + 'h' + (m < 10 ? '0' : '') + m; }

function buildTitle(v) {
  var t = getTitle(v.name) || { name: v.name, hd: 0, sd: 0, audio: 0 };
  var cur = info(v.name);
  var bits = [];
  if (cur) {
    bits.push(cur.composers.map(composerName).join(' / '));
    if (cur.year) bits.push('premiered ' + cur.year);
    bits.push(cur.langs.map(function (l) { return LANGS[l]; }).join(' / '));
    bits.push(cur.eras.map(function (e) { return pairLabel(ERAS, e); }).join(' / '));
    if (cur.moods.length) bits.push(cur.moods.map(function (m) { return pairLabel(MOODS, m).split(' ')[0]; }).join(', '));
  }
  var prev = stack.length ? stack[stack.length - 1] : null;
  v.head = { crumb: 'Categories' + (prev && prev.kind !== 'home' && prev.head ? ' \u203a ' + prev.head.title : ''), title: v.name, sub: bits.join(' \u00b7 ') };
  if (!v.perfs) {
    v.rows = [{ type: 'msg', title: 'Loading performances from the Met\u2026', items: [] }];
    if (!v.loading) {
      v.loading = true;
      getPerformances(v.name, function (err, list) {
        v.loading = false;
        if (view !== v) { if (list) v.perfs = list; return; }
        if (err && !list) { v.rows = [{ type: 'msg', title: 'Could not load performances (' + err + '). Press OK to retry.', items: [{ retry: true }] }]; v.err = true; render(); focusCurrent(); return; }
        v.perfs = list;
        build(); render(); focusCurrent();
      });
    }
    return;
  }
  var rows = [];
  var f = v.filter;
  function add(title, list) { if (list.length) rows.push.apply(rows, chunk(list, PERF_COLS, { type: 'perfs', title: title + '  (' + list.length + ')' })); }
  if (f && f.dec) add('From the ' + f.dec + 's', v.perfs.filter(function (p) { return p.d.slice(0, 3) + '0' === f.dec; }));
  var fmts = ['hd', 'sd', 'audio'];
  if (f && f.f) fmts = [f.f].concat(fmts.filter(function (x) { return x !== f.f; }));
  fmts.forEach(function (x) {
    var lst = v.perfs.filter(function (p) { return p.f === x && !(f && f.dec && p.d.slice(0, 3) + '0' === f.dec); });
    add((f && f.dec ? 'Other ' : '') + FORMATS[x], lst);
  });
  if (!rows.length) rows.push({ type: 'msg', title: 'No performances available.', items: [] });
  v.rows = rows;
}
function pairLabel(pairs, k) { for (var i = 0; i < pairs.length; i++) if (pairs[i][0] === k) return pairs[i][1]; return k; }

// ---------- rendering ----------
function render() {
  var v = view;
  head.querySelector('.mtv-cat-crumb').textContent = v.head.crumb || '';
  head.querySelector('h1').textContent = v.head.title || '';
  head.querySelector('.mtv-cat-sub').textContent = v.head.sub || '';
  rowsEl.innerHTML = '';
  rowEls = [];
  rowsEl.style.transform = rowsEl.style.webkitTransform = 'translate3d(0,0,0)';
  for (var i = 0; i < v.rows.length; i++) {
    var row = v.rows[i];
    var sec = document.createElement('section');
    var audioOnly = row.type === 'perfs' && row.items.every(function (p) { return p.f === 'audio'; });
    sec.className = 'mtv-crow mtv-crow-' + row.type + (row.title ? '' : ' mtv-crow-cont') + (audioOnly ? ' mtv-crow-audio' : '');
    var count = row.type === 'cards' && row.count !== undefined ? ' <small>' + row.count + '</small>' : '';
    sec.innerHTML = (row.title ? '<h2>' + esc(row.title) + count + (row.sub ? ' <span>' + esc(row.sub) + '</span>' : '') + '</h2>' : '') + '<div class="mtv-cstrip"></div>';
    rowsEl.appendChild(sec);
    rowEls.push({ el: sec, strip: sec.querySelector('.mtv-cstrip'), filled: false, x: 0 });
  }
  if (v.r >= v.rows.length) v.r = Math.max(0, v.rows.length - 1);
}

function cardHTML(t) {
  var cur = t.cur;
  var sub = cur ? cur.composers.map(composerShort).join(' & ') + (cur.year ? ' \u00b7 ' + cur.year : '') : (t.kind === 'opera' ? '' : t.newest ? t.newest.slice(0, 4) : '');
  var b = [];
  if (t.hd) b.push('<i class="mtv-b-hd">HD ' + t.hd + '</i>');
  if (t.sd) b.push('<i class="mtv-b-sd">Telecast ' + t.sd + '</i>');
  if (t.audio) b.push('<i class="mtv-b-au">Audio ' + t.audio + '</i>');
  var img = t.img ? '<img alt="" data-src="' + esc(imgUrl(t.img, true)) + '">' : '<span class="mtv-noimg">' + esc(t.name) + '</span>';
  return '<div class="mtv-card-img">' + img + '</div><div class="mtv-card-t">' + esc(t.name) + '</div>' +
    '<div class="mtv-card-s">' + esc(sub) + '</div><div class="mtv-card-b">' + b.join('') + '</div>';
}
function chipHTML(x) {
  if (x.act === 'refresh') {
    var st = catalogStatus();
    var when = st.updated ? 'updated ' + ago(st.updated) : 'built-in snapshot';
    return '<b>Refresh catalog</b><span>' + esc(st.refreshing ? 'updating\u2026' : when) + '</span>';
  }
  return '<b>' + esc(x.label) + '</b><span>' + esc(x.n + ' ' + (x.unit || (x.n === 1 ? 'title' : 'titles'))) + (x.sub ? ' \u00b7 ' + esc(x.sub) : '') + '</span>';
}
function ago(t) { var m = Math.round((Date.now() - t) / 60000); return m < 60 ? m + ' min ago' : m < 2880 ? Math.round(m / 60) + ' h ago' : Math.round(m / 1440) + ' days ago'; }
function perfHTML(p) {
  var img = p.img && p.f !== 'audio' ? '<div class="mtv-perf-img"><img alt="" data-src="' + esc(imgUrl(p.img, true)) + '"></div>' :
    '<div class="mtv-perf-aud">' + (p.f === 'audio' ? '\u266b Met radio broadcast' : '\u25b6 ' + fmtLabel(p.f)) + '</div>';
  var tags = '<i class="mtv-b-' + (p.f === 'hd' ? 'hd' : p.f === 'sd' ? 'sd' : 'au') + '">' + fmtLabel(p.f) + '</i>' + (p.cc ? '<i>CC</i>' : '') + (p.ad ? '<i>AD</i>' : '');
  return img + '<div class="mtv-perf-d">' + esc(dateStr(p.d)) + '</div><div class="mtv-card-b">' + tags + (p.rt ? ' <em>' + hm(p.rt) + '</em>' : '') + '</div>' +
    (p.cond ? '<div class="mtv-perf-c">' + esc(p.cond) + '</div>' : '') + '<div class="mtv-perf-cast">' + esc(p.cast) + '</div>';
}

function fillRow(i) {
  var re = rowEls[i], row = view.rows[i];
  if (!re || re.filled) return;
  re.filled = true;
  var html = '';
  var items = row.items.slice(0, ROW_CAP);
  for (var c = 0; c < items.length; c++) {
    var it = items[c];
    var cls = row.type === 'chips' ? 'mtv-chip' : row.type === 'perfs' ? 'mtv-card mtv-perf' : row.type === 'msg' ? 'mtv-chip mtv-retry' : 'mtv-card';
    var inner = row.type === 'chips' ? chipHTML(it) : row.type === 'perfs' ? perfHTML(it) : row.type === 'msg' ? '<b>Retry</b>' : cardHTML(it);
    html += '<button type="button" class="' + cls + '" data-r="' + i + '" data-c="' + c + '"><div class="mtv-in">' + inner + '</div></button>';
  }
  if (row.type === 'cards' && row.cat && row.items.length > ROW_CAP) {
    html += '<button type="button" class="mtv-chip mtv-more" data-r="' + i + '" data-c="' + items.length + '"><b>See all</b><span>' + row.items.length + ' titles</span></button>';
  }
  if (row.type === 'cards' && view.kind === 'home' && row.cat && row.items.length <= ROW_CAP && row.items.length > 6) {
    html += '<button type="button" class="mtv-chip mtv-more" data-r="' + i + '" data-c="' + items.length + '"><b>See all</b><span>as a grid</span></button>';
  }
  re.strip.innerHTML = html;
}
function rowLen(i) { var re = rowEls[i]; if (!re) return 0; fillRow(i); return re.strip.children.length; }

function loadImages(i, c) {
  var re = rowEls[i];
  if (!re || !re.filled) return;
  var kids = re.strip.children;
  for (var k = Math.max(0, c - 2); k < Math.min(kids.length, c + 8); k++) {
    var img = kids[k].querySelector('img[data-src]');
    if (img) { img.src = img.getAttribute('data-src'); img.removeAttribute('data-src'); img.onerror = onImgErr; }
  }
}
function onImgErr() { var p = this.parentNode; if (p) { p.className += ' mtv-img-failed'; this.style.display = 'none'; } }

function el(r, c) { var re = rowEls[r]; return re && re.strip.children[c]; }

export function focusCurrent() {
  if (!view || !rowEls.length) return;
  var r = view.r;
  for (var i = Math.max(0, r - 1); i < Math.min(rowEls.length, r + 4); i++) fillRow(i);
  var n = rowLen(r);
  if (!n) {   // empty message row: move to the first row that has something
    for (var j = 0; j < rowEls.length; j++) if (rowLen(j)) { view.r = r = j; n = rowLen(j); break; }
  }
  if (view.c >= n) view.c = Math.max(0, n - 1);
  var target = el(r, view.c);
  if (lastF && lastF !== target) lastF.classList.remove('mtv-f');
  if (target) { target.classList.add('mtv-f'); lastF = target; }
  for (i = Math.max(0, r - 1); i < Math.min(rowEls.length, r + 3); i++) loadImages(i, i === r ? view.c : (rowEls[i].x ? Math.round(view.c) : 0));
  positionRows();
  if (target) {
    target.focus();
    // focus() may scroll overflow:hidden ancestors; we position with transforms instead.
    var vp = root.querySelector('.mtv-cat-vp');
    vp.scrollTop = 0; vp.scrollLeft = 0;
    rowEls[r].el.scrollLeft = 0; rowEls[r].strip.scrollLeft = 0;
    positionStrip(r, target);
  }
}

function positionRows() {
  var re = rowEls[view.r];
  if (!re) return;
  var vpH = root.querySelector('.mtv-cat-vp').clientHeight;
  var top = re.el.offsetTop;
  var total = rowsEl.scrollHeight;
  var y = Math.max(0, top - 6);
  if (total - y < vpH) y = Math.max(0, total - vpH + 20);
  if (view.r === 0) y = 0;
  rowsEl.style.transform = rowsEl.style.webkitTransform = 'translate3d(0,' + (-y) + 'px,0)';
}
function positionStrip(r, target) {
  var re = rowEls[r];
  var w = re.el.clientWidth;
  var left = target.offsetLeft, right = left + target.offsetWidth;
  var x = re.x;
  if (left - x < 0) x = Math.max(0, left - 40);
  if (right - x > w - 60) x = right - w + 140;
  if (x < 0) x = 0;
  re.x = x;
  re.strip.style.transform = re.strip.style.webkitTransform = 'translate3d(' + (-x) + 'px,0,0)';
}

// ---------- keys ----------
// Returns true if the key was handled.
export function handleKey(k) {
  if (!isOpen() || !view) return false;
  if (!root.contains(document.activeElement)) return false;
  if (k === KEY.LEFT) { if (view.c > 0) { view.c--; focusCurrent(); } return true; }
  if (k === KEY.RIGHT) { if (view.c < rowLen(view.r) - 1) { view.c++; focusCurrent(); } return true; }
  if (k === KEY.DOWN || k === KEY.UP) {
    var d = k === KEY.DOWN ? 1 : -1;
    var r = view.r + d;
    while (r >= 0 && r < rowEls.length && !rowLen(r)) r += d;
    if (r < 0) { if (hooks.focusBar) hooks.focusBar(); return true; }
    if (r >= rowEls.length) return true;
    // Keep the visual column when moving between grid rows; in the home view keep each row's own position.
    var curEl = el(view.r, view.c);
    view.r = r;
    if (view.kind === 'home') {
      view.c = rowEls[r].lastC || 0;
    } else if (curEl) {
      view.c = Math.min(view.c, rowLen(r) - 1);
    }
    focusCurrent();
    return true;
  }
  if (k === KEY.ENTER) { activate(); return true; }
  return false;
}

function activate() {
  var row = view.rows[view.r];
  if (!row) return;
  if (rowEls[view.r]) rowEls[view.r].lastC = view.c;
  var it = row.items[view.c];
  if (row.type === 'msg') { if (view.kind === 'title') { view.perfs = null; build(); render(); focusCurrent(); } return; }
  if (!it) {   // "See all"
    if (row.cat) { tlm('categories', { action: 'view', cat: row.cat }); show({ kind: 'cat', id: row.cat }, true); }
    return;
  }
  if (row.type === 'chips') {
    if (it.act === 'refresh') { doRefresh(); return; }
    if (it.cat === 'composers') { tlm('categories', { action: 'view', cat: 'composers' }); show({ kind: 'composers' }, true); return; }
    tlm('categories', { action: 'view', cat: it.cat });
    show({ kind: 'cat', id: it.cat }, true);
    return;
  }
  if (row.type === 'cards') {
    tlm('categories', { action: 'title', title: it.name, from: view.kind === 'cat' ? view.id : row.cat });
    show({ kind: 'title', name: it.name, filter: row.filter || (view.cat && view.cat.filter) }, true);
    return;
  }
  if (row.type === 'perfs') {
    tlm('categories', { action: 'play-page', title: view.name, format: it.f, decade: it.d.slice(0, 3) + '0' });
    var path = it.path;
    close();
    if (hooks.openPath) hooks.openPath(path);
  }
}

function doRefresh() {
  toast('Updating the catalog from the Met\u2026', 2500);
  var t0 = Date.now();
  refreshLists(true, function (err, changed, st) {
    tlm('catalog-refresh', { result: err || 'ok', auto: false, titles: st ? st.titles : 0, ms: Date.now() - t0 });
    toast(err ? 'Catalog update failed (' + err + ')' : 'Catalog updated: ' + (st ? st.titles : '') + ' titles', 3000);
    if (isOpen() && view.kind === 'home') rerender();
  });
  rerender();
}

export function debugState() { return view ? { kind: view.kind, r: view.r, c: view.c, rows: view.rows.length, stack: stack.length, title: view.head && view.head.title } : null; }
