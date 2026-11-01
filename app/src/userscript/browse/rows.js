// The Browse (home) screen model: a hero (what the Met features + picks for this viewer) and a
// deliberately unpredictable "smattering" of our category rows. Shuffled per day AND per visit
// (seed = date + visit counter), so every return home looks a little different.
import { getTitles, getTitle } from '../cat/catalog';
import { category, FORMATS } from '../cat/model';
import { COMPOSERS, LANGS, ERAS, MOODS, composerName, composerShort, info } from '../cat/catalogData';
import { lsGet, lsSet } from '../util';

// Small deterministic PRNG (mulberry32).
export function rng(seed) {
  var a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    var t = a;
    t = Math.imul ? Math.imul(t ^ (t >>> 15), t | 1) : mul(t ^ (t >>> 15), t | 1);
    t ^= t + (Math.imul ? Math.imul(t ^ (t >>> 7), t | 61) : mul(t ^ (t >>> 7), t | 61));
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function mul(a, b) { var ah = (a >>> 16) & 0xffff, al = a & 0xffff, bh = (b >>> 16) & 0xffff, bl = b & 0xffff; return ((al * bl) + (((ah * bl + al * bh) << 16) >>> 0) | 0); }
function hash(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h * 16777619) >>> 0; } return h; }
export function shuffle(list, r) { var a = list.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(r() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
function pick(list, r) { return list.length ? list[Math.floor(r() * list.length)] : null; }

// Each Browse visit gets a new seed; within a visit (BACK from a title) the layout stays stable.
var visitSeed = 0;
export function newVisit() {
  var d = new Date();
  var day = d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
  var n = (lsGet('mtv.visits', 0) || 0) + 1;
  lsSet('mtv.visits', n);
  visitSeed = hash(day + ':' + n);
  return visitSeed;
}
export function currentSeed() { return visitSeed || newVisit(); }

function nPerf(t) { return t.hd + t.sd + t.audio; }
function operas() { return getTitles().filter(function (t) { return t.kind === 'opera' && t.cur && nPerf(t) > 0; }); }

// Taste profile from local watch history (titles played in this app) + the Met's continue watching.
export function taste(featured) {
  var hist = lsGet('mtv.hist', []) || [];
  var names = hist.map(function (h) { return h.n; });
  if (featured && featured.cont) featured.cont.forEach(function (c) { names.push(c.title); });
  if (featured && featured.fav) featured.fav.forEach(function (c) { names.push(c.title); });
  var comp = {}, era = {}, mood = {}, seen = {};
  names.forEach(function (n, i) {
    seen[n] = 1;
    var cur = info(n);
    if (!cur) return;
    var w = i < 5 ? 2 : 1;
    cur.composers.forEach(function (c) { comp[c] = (comp[c] || 0) + w; });
    cur.eras.forEach(function (e) { era[e] = (era[e] || 0) + w; });
    cur.moods.forEach(function (m) { mood[m] = (mood[m] || 0) + w; });
  });
  function top(o) { return Object.keys(o).sort(function (a, b) { return o[b] - o[a]; }); }
  return { names: names, seen: seen, composers: top(comp), eras: top(era), moods: top(mood), last: names[0] || '' };
}

function heroFromTitle(t, label, r) {
  if (!t) return null;
  var cur = t.cur;
  return { kind: 'title', name: t.name, title: t.name, label: label, img: t.img, imgLarge: true,
    sub: cur ? cur.composers.map(composerName).join(' & ') + (cur.year ? ' \u00b7 premiered ' + cur.year : '') : '',
    desc: (t.hd ? t.hd + ' HD' : '') + (t.sd ? (t.hd ? ', ' : '') + t.sd + ' telecast' : '') + (t.audio ? ((t.hd || t.sd) ? ', ' : '') + t.audio + ' radio' : '') + ' performance' + (nPerf(t) === 1 ? '' : 's') + ' in the archive' };
}

export function heroItems(featured, r) {
  var out = [], used = {};
  function add(x) { if (x && !used[x.kind + ':' + (x.id || x.name)]) { used[x.kind + ':' + (x.id || x.name)] = 1; out.push(x); } }
  var f = featured || { hero: [], cont: [], fav: [] };
  f.hero.forEach(function (p) { add({ kind: 'perf', id: p.id, name: p.name, title: p.title, label: 'Featured by the Met', img: p.img, sub: (p.sub || '').replace(/\|/g, '\u00b7'), desc: p.desc, p: p }); });
  var cont = f.cont.filter(function (p) { return p.pos > 60000 && (!p.rt || p.pos < (p.rt - 3) * 60000); });
  cont.slice(0, 2).forEach(function (p) { add({ kind: 'perf', id: p.id, name: p.name, title: p.title, label: 'Continue watching', img: p.img, sub: dateLine(p), desc: p.desc, p: p, progress: p.rt ? p.pos / (p.rt * 60000) : 0 }); });
  var tp = taste(f), all = operas();
  // Picks for this viewer: an unseen work by a favourite composer, and one in a favourite style.
  if (tp.composers.length) {
    var ck = tp.composers[Math.floor(r() * Math.min(3, tp.composers.length))];
    var cand = all.filter(function (t) { return t.cur.composers.indexOf(ck) >= 0 && !tp.seen[t.name]; });
    add(heroFromTitle(pick(cand, r), 'Because you like ' + composerShort(ck), r));
  }
  if (tp.moods.length) {
    var mk = tp.moods[0];
    var cand2 = all.filter(function (t) { return t.cur.moods.indexOf(mk) >= 0 && !tp.seen[t.name] && t.hd; });
    add(heroFromTitle(pick(cand2, r), 'More ' + label(MOODS, mk).split(' ')[0].toLowerCase() + ' opera for you', r));
  }
  var gems = category('gems').titles.filter(function (t) { return !tp.seen[t.name]; });
  add(heroFromTitle(pick(gems, r), 'Hidden gem', r));
  var newest = category('new').titles.slice(0, 8);
  add(heroFromTitle(pick(newest, r), 'Newly added to the archive', r));
  return out.slice(0, 7);
}
function dateLine(p) { return (p.d ? p.d.slice(0, 4) : '') + (p.cond ? ' \u00b7 ' + p.cond : '') + (p.f === 'hd' ? ' \u00b7 Live in HD' : p.f === 'sd' ? ' \u00b7 Telecast' : ' \u00b7 Radio'); }
function label(pairs, k) { for (var i = 0; i < pairs.length; i++) if (pairs[i][0] === k) return pairs[i][1]; return k; }

// Rows below the hero.
export function browseRows(featured, seed) {
  var r = rng(seed || currentSeed());
  var rows = [];
  rows.push({ type: 'hero', title: '', items: heroItems(featured, r) });
  var f = featured || { cont: [], fav: [] };
  if (f.cont && f.cont.length) rows.push({ type: 'perfs', named: true, title: 'Continue watching', items: f.cont.slice(0, 20), kindTag: 'cont' });

  var tp = taste(f);
  function cardsRow(id, title, sub, opts) {
    var c = category(id);
    var items = c.titles;
    if (!items.length) return null;
    if (!(opts && opts.keepOrder)) items = shuffle(items, r);
    return { type: 'cards', title: title || c.title, sub: sub, cat: id, items: items.slice(0, 24), count: c.titles.length, accent: opts && opts.accent };
  }
  var pool = [];
  var comps = {};
  operas().forEach(function (t) { t.cur.composers.forEach(function (c) { comps[c] = (comps[c] || 0) + 1; }); });
  var bigComps = Object.keys(comps).filter(function (k) { return comps[k] >= 3; });
  shuffle(bigComps, r).slice(0, 2).forEach(function (k) { pool.push(cardsRow('composer:' + k, 'Spotlight: ' + composerName(k), comps[k] + ' works in the archive')); });
  var m = pick(MOODS, r); pool.push(cardsRow('mood:' + m[0], m[1]));
  var e = pick(ERAS, r); pool.push(cardsRow('era:' + e[0], e[1], 'In order of premiere', { keepOrder: r() < 0.5 }));
  var langs = ['it', 'de', 'fr', 'en', 'ru', 'cs'];
  var lk = pick(langs, r); pool.push(cardsRow('lang:' + lk, 'Sung in ' + LANGS[lk]));
  var decs = ['1950', '1960', '1970', '1980', '1990', '2000', '2010', '2020'];
  if (r() < 0.5) { var dk = pick(decs, r); pool.push(cardsRow('decade:' + dk, 'Time machine: the ' + dk + 's', 'Performances recorded in that decade')); }
  else pool.push(cardsRow('format:' + pick(['sd', 'audio'], r)));
  var specials = [['starter', 'Perfect first operas'], ['short', 'Under 2\u00bd hours'], ['long', 'Epic evenings'], ['shakespeare', ''], ['premieres', ''], ['kind:concert', ''], ['kind:playlist', ''], ['kind:film', ''], ['ring', '']];
  shuffle(specials, r).slice(0, 3).forEach(function (s) { pool.push(cardsRow(s[0], s[1] || null, '', { keepOrder: s[0] === 'ring' })); });
  if (tp.last && info(tp.last)) {
    var lc = info(tp.last);
    var sim = operas().filter(function (t) {
      if (t.name === tp.last) return false;
      var sc = 0;
      t.cur.composers.forEach(function (c) { if (lc.composers.indexOf(c) >= 0) sc += 2; });
      t.cur.eras.forEach(function (x) { if (lc.eras.indexOf(x) >= 0) sc += 1; });
      t.cur.moods.forEach(function (x) { if (lc.moods.indexOf(x) >= 0) sc += 1; });
      t._sim = sc; return sc >= 2;
    });
    sim = shuffle(sim, r).sort(function (a, b) { return b._sim - a._sim; }).slice(0, 18);
    if (sim.length >= 3) pool.push({ type: 'cards', title: 'Because you watched ' + tp.last, items: sim, count: sim.length });
  }
  pool = shuffle(pool.filter(Boolean), r);
  // Hidden gems always appear, somewhere in the first three rows.
  var gems = cardsRow('gems', 'Hidden gems', 'Superb works you may not know yet', { accent: true });
  if (gems) pool.splice(Math.floor(r() * 3), 0, gems);
  if (f.fav && f.fav.length) pool.splice(2 + Math.floor(r() * 3), 0, { type: 'perfs', named: true, title: 'Your favorites', items: f.fav.slice(0, 20), kindTag: 'fav' });
  rows = rows.concat(pool);
  // Finish with a shuffled handful of category chips + the full Categories screen.
  var chips = [];
  ERAS.forEach(function (x) { chips.push({ label: x[1], cat: 'era:' + x[0] }); });
  MOODS.forEach(function (x) { chips.push({ label: x[1], cat: 'mood:' + x[0] }); });
  Object.keys(LANGS).forEach(function (k) { if (k !== 'other') chips.push({ label: 'Sung in ' + LANGS[k], cat: 'lang:' + k }); });
  ['hd', 'sd', 'audio'].forEach(function (k) { chips.push({ label: FORMATS[k], cat: 'format:' + k }); });
  chips = shuffle(chips, r).slice(0, 9).map(function (x) { x.n = category(x.cat).titles.length; return x; }).filter(function (x) { return x.n > 0; });
  chips.unshift({ label: 'All categories', cat: 'categories', n: -1, unit: '', sub: 'composer, style, mood, decade\u2026' });
  chips.push({ label: 'All titles A\u2013Z', cat: 'all', n: getTitles().length, unit: 'titles' });
  rows.push({ type: 'chips', title: 'Explore', items: chips });
  return rows;
}
