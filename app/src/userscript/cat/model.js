// Builds the Categories screen rows from catalog titles + the curated table.
import { getTitles, getTitle } from './catalog';
import { COMPOSERS, LANGS, ERAS, MOODS, GEMS, STARTERS, SHAKESPEARE, RING, composerShort, composerName } from './catalogData';

function operas() { return getTitles().filter(function (t) { return t.kind === 'opera' && t.cur; }); }
function nPerf(t) { return t.hd + t.sd + t.audio; }
function byNames(list) {
  var out = [];
  for (var i = 0; i < list.length; i++) { var t = getTitle(list[i]); if (t && nPerf(t) > 0) out.push(t); }
  return out;
}
function sortAZ(a, b) { var x = (a.sort || a.name).toLowerCase(), y = (b.sort || b.name).toLowerCase(); return x < y ? -1 : x > y ? 1 : 0; }
function sortPremiere(a, b) { return (a.cur ? a.cur.year : 0) - (b.cur ? b.cur.year : 0) || sortAZ(a, b); }

// ---- category definitions: id -> {title, titles(), filter?} ----
// filter limits which performances are highlighted on a title page (format / decade).
export function category(id) {
  var p = id.split(':');
  var kind = p[0], key = p.slice(1).join(':');
  var all = operas();
  var list, title, filter = null, order = sortAZ;
  if (kind === 'composer') {
    title = composerName(key);
    list = all.filter(function (t) { return t.cur.composers.indexOf(key) >= 0; });
    order = sortPremiere;
  } else if (kind === 'lang') {
    title = 'Sung in ' + (LANGS[key] || key);
    list = all.filter(function (t) { return t.cur.langs.indexOf(key) >= 0; });
  } else if (kind === 'era') {
    title = label(ERAS, key);
    list = all.filter(function (t) { return t.cur.eras.indexOf(key) >= 0; });
    order = sortPremiere;
  } else if (kind === 'mood') {
    title = label(MOODS, key);
    list = all.filter(function (t) { return t.cur.moods.indexOf(key) >= 0; });
  } else if (kind === 'format') {
    title = FORMATS[key];
    filter = { f: key };
    list = getTitles().filter(function (t) { return t[key] > 0; });
  } else if (kind === 'decade') {
    title = 'Performed in the ' + key + 's';
    filter = { dec: key };
    list = getTitles().filter(function (t) { return t.dec && t.dec[key] > 0; });
  } else if (kind === 'gems') { title = 'Hidden gems'; list = byNames(GEMS); order = null; }
  else if (kind === 'starter') { title = 'Starter operas'; list = byNames(STARTERS); order = null; }
  else if (kind === 'short') {
    title = 'Under 2\u00bd hours';
    list = all.filter(function (t) { return t.rt > 0 && t.rt <= 150; });
    order = function (a, b) { return a.rt - b.rt; };
  } else if (kind === 'long') {
    title = 'Epic evenings (3\u00be h+)';
    list = all.filter(function (t) { return t.rt >= 225; });
    order = function (a, b) { return b.rt - a.rt; };
  } else if (kind === 'shakespeare') { title = 'Shakespeare at the opera'; list = byNames(SHAKESPEARE); order = null; }
  else if (kind === 'ring') { title = 'Wagner\u2019s Ring, in order'; list = byNames(RING); order = null; }
  else if (kind === 'premieres') {
    title = 'World premieres at the Met';
    list = all.filter(function (t) { return t.cur.flags.indexOf('W') >= 0; });
    order = sortPremiere;
  } else if (kind === 'kind') {
    title = KINDS[key];
    list = getTitles().filter(function (t) { return t.kind === key; });
    order = function (a, b) { return a.newest < b.newest ? 1 : a.newest > b.newest ? -1 : 0; };
  } else if (kind === 'new') {
    title = 'Newest performances';
    list = getTitles().slice().filter(function (t) { return t.newest; });
    order = function (a, b) { return a.newest < b.newest ? 1 : a.newest > b.newest ? -1 : 0; };
    list.sort(order); list = list.slice(0, 30); order = null;
  } else if (kind === 'all') { title = 'All titles A\u2013Z'; list = getTitles().slice(); }
  else { title = id; list = []; }
  list = list.filter(function (t) { return nPerf(t) > 0; });
  if (order) list.sort(order);
  return { id: id, title: title, titles: list, filter: filter };
}

export var FORMATS = { hd: 'Live in HD video', sd: 'Classic Met telecasts', audio: 'Radio broadcasts (audio)' };
export var KINDS = { concert: 'Galas, concerts & recitals', playlist: 'Singer playlists', film: 'Films & documentaries', podcast: 'Aria Code podcast' };
function label(pairs, k) { for (var i = 0; i < pairs.length; i++) if (pairs[i][0] === k) return pairs[i][1]; return k; }

// ---- the home view: rows of cards (titles) or chips (sub-categories) ----
export function homeRows() {
  var rows = [];
  var all = operas();
  function cards(id, sub) { var c = category(id); rows.push({ type: 'cards', title: c.title, sub: sub, cat: id, items: c.titles, count: c.titles.length }); }
  function chips(title, list) { rows.push({ type: 'chips', title: title, items: list.filter(function (x) { return x.n > 0; }) }); }

  cards('gems', 'Superb works you may not know yet');

  var comp = {};
  all.forEach(function (t) { t.cur.composers.forEach(function (c) { comp[c] = (comp[c] || 0) + 1; }); });
  var ck = Object.keys(comp).sort(function (a, b) { return comp[b] - comp[a] || (composerShort(a) < composerShort(b) ? -1 : 1); });
  var top = ck.filter(function (k) { return comp[k] >= 2; });
  var compChips = top.map(function (k) { return { label: composerShort(k), n: comp[k], cat: 'composer:' + k }; });
  compChips.push({ label: 'All composers A\u2013Z', n: ck.length, cat: 'composers', unit: 'composers' });
  chips('By composer', compChips);

  var lang = {};
  all.forEach(function (t) { t.cur.langs.forEach(function (l) { lang[l] = (lang[l] || 0) + 1; }); });
  chips('By language', Object.keys(LANGS).map(function (k) { return { label: LANGS[k], n: lang[k] || 0, cat: 'lang:' + k }; })
    .sort(function (a, b) { return b.n - a.n; }));

  chips('By era & style', ERAS.map(function (e) { return { label: e[1], n: category('era:' + e[0]).titles.length, cat: 'era:' + e[0] }; }));
  chips('By mood', MOODS.map(function (m) { return { label: m[1], n: category('mood:' + m[0]).titles.length, cat: 'mood:' + m[0] }; }));

  var fmt = [];
  ['hd', 'sd', 'audio'].forEach(function (f) {
    var n = 0, tt = getTitles(); for (var i = 0; i < tt.length; i++) n += tt[i][f];
    fmt.push({ label: FORMATS[f], n: n, unit: 'performances', cat: 'format:' + f, sub: category('format:' + f).titles.length + ' titles' });
  });
  chips('Format', fmt);

  var dec = {};
  getTitles().forEach(function (t) { for (var k in t.dec) dec[k] = (dec[k] || 0) + t.dec[k]; });
  chips('By decade of performance', Object.keys(dec).sort().reverse().map(function (k) { return { label: k + 's', n: dec[k], unit: 'performances', cat: 'decade:' + k }; }));

  cards('starter', 'Perfect first operas');
  cards('short', 'Typical running time incl. intermissions');
  cards('ring');
  cards('shakespeare');
  cards('premieres', 'Commissioned or first staged by the Met');
  cards('long', 'For a long winter night');
  cards('new', 'Most recent performance dates in the archive');
  cards('kind:concert');
  cards('kind:playlist');
  cards('kind:film');
  rows.push({ type: 'chips', title: 'Everything', items: [
    { label: 'All titles A\u2013Z', n: getTitles().length, cat: 'all', unit: 'titles' },
    { label: 'Aria Code podcast', n: category('kind:podcast').titles.length ? (getTitle('Aria Code') || {}).audio || 1 : 0, cat: 'kind:podcast', unit: 'episodes' },
    { label: 'Refresh catalog', n: -1, act: 'refresh' }
  ].filter(function (x) { return x.n !== 0; }) });
  return rows;
}

export function composerRows() {
  var comp = {};
  operas().forEach(function (t) { t.cur.composers.forEach(function (c) { comp[c] = (comp[c] || 0) + 1; }); });
  var keys = Object.keys(comp).sort(function (a, b) {
    var x = COMPOSERS[a].split(' ').pop(), y = COMPOSERS[b].split(' ').pop();
    return x < y ? -1 : x > y ? 1 : 0;
  });
  return keys.map(function (k) { return { label: composerName(k), n: comp[k], cat: 'composer:' + k }; });
}
