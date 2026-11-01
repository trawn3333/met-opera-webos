// Local, bundled search index of the whole archive (tools/build-search-index.py) + a fast fuzzy,
// diacritic-insensitive matcher. Typical query on webOS 4: a few ms.
import IDX_TEXT from './index.idx';

var D = null;             // parsed index
var vocab = null;         // folded word -> id
var words = null;         // id -> folded word
var titleW, compW, personW, personRole;

var FOLD = { '\u00f8': 'o', '\u0142': 'l', '\u00df': 'ss', '\u00e6': 'ae', '\u0153': 'oe', '\u0111': 'd', '\u0131': 'i', '\u00f0': 'd', '\u00fe': 'th' };
export function fold(s) {
  s = String(s || '').toLowerCase();
  try { if (s.normalize) s = s.normalize('NFD'); } catch (e) { /* ignore */ }
  s = s.replace(/[\u0300-\u036f]/g, '').replace(/[\u00f8\u0142\u00df\u00e6\u0153\u0111\u0131\u00f0\u00fe]/g, function (c) { return FOLD[c]; });
  return s.replace(/['\u2019]/g, '').replace(/[^a-z0-9]+/g, ' ').replace(/^ +| +$/g, '');
}
function wid(w) { var id = vocab[w]; if (id === undefined) { id = words.length; vocab[w] = id; words.push(w); } return id; }
function wordsOf(s) { var f = fold(s); if (!f) return []; var p = f.split(' '), out = []; for (var i = 0; i < p.length; i++) if (p[i]) out.push(wid(p[i])); return out; }

export function load() {
  if (D) return D;
  var t0 = Date.now();
  D = JSON.parse(IDX_TEXT);
  vocab = {}; words = [];
  titleW = D.t.map(wordsOf);
  personW = D.p.map(wordsOf);
  compW = D.tc.map(function (list) { var o = []; for (var i = 0; i < list.length; i++) o = o.concat(personW[list[i]]); return o; });
  personRole = D.p.map(function () { return { c: 0, s: 0, k: 0 }; });
  for (var i = 0; i < D.r.length; i++) {
    var r = D.r[i];
    if (r[4] >= 0) personRole[r[4]].c++;
    for (var j = 0; j < r[5].length; j++) personRole[r[5][j]].s++;
  }
  for (i = 0; i < D.tc.length; i++) for (j = 0; j < D.tc[i].length; j++) personRole[D.tc[i][j]].k++;
  D.loadMs = Date.now() - t0;
  return D;
}
export function stats() { load(); return { titles: D.t.length, people: D.p.length, performances: D.r.length, words: words.length, built: D.b, loadMs: D.loadMs }; }

// Bounded edit distance (<= max) between a and b (Damerau transpositions count 1).
function within(a, b, max) {
  var la = a.length, lb = b.length;
  if (Math.abs(la - lb) > max) return false;
  var prev2 = null, prev = [], cur, i, j;
  for (j = 0; j <= lb; j++) prev[j] = j;
  for (i = 1; i <= la; i++) {
    cur = [i];
    var rowMin = i;
    for (j = 1; j <= lb; j++) {
      var cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      var v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (prev2 && i > 1 && j > 1 && a.charCodeAt(i - 1) === b.charCodeAt(j - 2) && a.charCodeAt(i - 2) === b.charCodeAt(j - 1)) v = Math.min(v, prev2[j - 2] + 1);
      cur[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return false;
    prev2 = prev; prev = cur;
  }
  return prev[lb] <= max;
}

// Score of every vocabulary word for one query token: exact 1, prefix .9, typo-tolerant prefix .6, infix .45
function tokenScores(tok) {
  var out = {}, n = 0, L = tok.length;
  var max = L >= 8 ? 2 : L >= 4 ? 1 : 0;
  for (var i = 0; i < words.length; i++) {
    var w = words[i], sc = 0;
    if (w === tok) sc = 1;
    else if (w.length > L && w.lastIndexOf(tok, 0) === 0) sc = 0.9;
    else if (max && w.length >= L - 1) {
      if (within(tok, w.slice(0, L), max) || within(tok, w.slice(0, L + 1), max) || (L > 2 && within(tok, w.slice(0, L - 1), max))) sc = 0.6;
    }
    if (!sc && L >= 3 && w.indexOf(tok) > 0) sc = 0.45;
    if (sc) { out[i] = sc; n++; }
  }
  return n ? out : null;
}
function best(ws, sc) { var b = 0; for (var i = 0; i < ws.length; i++) { var v = sc[ws[i]]; if (v > b) b = v; } return b; }

// Returns {perfs:[{r, score, via}], titles:[{i, score, n}], people:[{i, score, role}]} for a raw query.
export function search(q, limit) {
  load();
  var toks = fold(q).split(' ').filter(Boolean);
  if (!toks.length) return { perfs: [], titles: [], people: [], q: '' };
  var T = [];
  for (var i = 0; i < toks.length; i++) {
    var ts = tokenScores(toks[i]);
    var yr = /^\d{2,4}$/.test(toks[i]) ? toks[i] : null;
    if (!ts && !yr) return { perfs: [], titles: [], people: [], q: q };
    T.push({ s: ts || {}, yr: yr });
  }
  // per title / person token scores
  var nt = D.t.length, np = D.p.length, k;
  var tTok = [], cTok = [], pTok = [];
  for (k = 0; k < T.length; k++) {
    var a = new Array(nt), c = new Array(nt), p = new Array(np);
    for (i = 0; i < nt; i++) { a[i] = best(titleW[i], T[k].s); c[i] = best(compW[i], T[k].s); }
    for (i = 0; i < np; i++) p[i] = best(personW[i], T[k].s);
    tTok.push(a); cTok.push(c); pTok.push(p);
  }
  // titles (name or composer)
  var titles = [];
  for (i = 0; i < nt; i++) {
    var s = 0, ok = true, nameHits = 0;
    for (k = 0; k < T.length && ok; k++) { var v = Math.max(tTok[k][i] * 3, cTok[k][i] * 2); if (!v) ok = false; s += v; if (tTok[k][i]) nameHits++; }
    if (ok) titles.push({ i: i, score: s + (nameHits === T.length ? 1 : 0), n: D.t[i] });
  }
  titles.sort(function (x, y) { return y.score - x.score || (x.n < y.n ? -1 : 1); });
  // people
  var people = [];
  for (i = 0; i < np; i++) {
    var ps = 0, pok = true;
    for (k = 0; k < T.length && pok; k++) { if (!pTok[k][i]) pok = false; ps += pTok[k][i] * 2.5; }
    if (pok) { var ro = personRole[i]; people.push({ i: i, score: ps + Math.min(1, (ro.s + ro.c) / 40), n: D.p[i], role: ro.k ? 'composer' : ro.c > ro.s ? 'conductor' : 'singer', count: ro.s + ro.c }); }
  }
  people.sort(function (x, y) { return y.score - x.score || y.count - x.count; });
  // performances
  var perfs = [];
  for (i = 0; i < D.r.length; i++) {
    var r = D.r[i], tot = 0, good = true, via = '';
    for (k = 0; k < T.length && good; k++) {
      var b2 = Math.max(tTok[k][r[1]] * 3, cTok[k][r[1]] * 2);
      if (r[4] >= 0 && pTok[k][r[4]] * 1.6 > b2) { b2 = pTok[k][r[4]] * 1.6; via = via || 'c' + r[4]; }
      for (var j = 0; j < r[5].length; j++) if (pTok[k][r[5][j]] * 1.8 > b2) { b2 = pTok[k][r[5][j]] * 1.8; via = 's' + r[5][j]; }
      if (T[k].yr && r[2].lastIndexOf(T[k].yr, 0) === 0) b2 = Math.max(b2, T[k].yr.length === 4 ? 2.2 : 1.2);
      if (!b2) good = false;
      tot += b2;
    }
    if (!good) continue;
    tot += r[3] === 'H' ? 0.35 : r[3] === 'V' ? 0.2 : 0;
    tot += (+r[2].slice(0, 4) - 1930) / 1000;     // tiny preference for newer recordings
    perfs.push({ r: r, score: tot, via: via });
  }
  perfs.sort(function (x, y) { return y.score - x.score; });
  limit = limit || 60;
  return { perfs: perfs.slice(0, limit), titles: titles.slice(0, 8), people: people.slice(0, 8), total: perfs.length, q: q };
}
export function titleName(i) { load(); return D.t[i]; }
export function personName(i) { load(); return D.p[i]; }
export function perfById(id) { load(); for (var i = 0; i < D.r.length; i++) if (D.r[i][0] === id) return D.r[i]; return null; }
