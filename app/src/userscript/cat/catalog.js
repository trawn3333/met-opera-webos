// Catalog data for the Categories screen.
// Source of truth = the Met's own middleware endpoints (the same ones the site's React app calls):
//   GET /client/filter[?media_type=hd|sd|audio]  -> every title (+ video/audio counts)
//   GET /client/filter/<title, lower-case>        -> every performance of one title
// A small build-time snapshot (seed.json, made from those endpoints) makes the screen instant on first
// open; the live lists refresh in the background (12 h) and per-title performance lists are fetched on
// demand and cached in localStorage (3 days, at most 40 titles). We only read catalog metadata.
import SEED from './seed.json';
import { info, kindOf } from './catalogData';
import { MIDDLEWARE, lsGet, lsSet, lsDel } from '../util';
import { dbg } from '../debugLog';

var LIST_KEY = 'mtv.cat.lists';
var OP_PREFIX = 'mtv.cat.op.';
var OP_INDEX = 'mtv.cat.opIdx';
var LIST_TTL = 12 * 3600 * 1000;
var OP_TTL = 3 * 24 * 3600 * 1000;
var OP_MAX = 40;

export function xhrJSON(path, cb) {
  var x = new XMLHttpRequest();
  var done = false;
  var t0 = Date.now();
  function fin(err, data) { if (done) return; done = true; cb(err, data, Date.now() - t0); }
  try {
    x.open('GET', MIDDLEWARE + path, true);
    x.withCredentials = true;              // same as the site's fetch(..., {credentials:'include'})
    x.setRequestHeader('user-platform', 'Web');
    x.setRequestHeader('origin-hostname', window.location.hostname);
    x.timeout = 45000;
    x.onload = function () {
      if (x.status < 200 || x.status >= 300) return fin('HTTP ' + x.status);
      try { fin(null, JSON.parse(x.responseText)); } catch (e) { fin('bad JSON'); }
    };
    x.onerror = function () { fin('network'); };
    x.ontimeout = function () { fin('timeout'); };
    x.send();
  } catch (e) { fin(String(e && e.message || e)); }
}

// ---------- images ----------
// size: true/'small' = card (384x216), false = 640x360, 'large' = hero (1280x720)
export var THUMBS_BASE = 'https://YOUR-WORKER.YOUR-SUBDOMAIN.workers.dev/v1/thumbs/';
export function imgUrl(code, size) {
  if (!code) return '';
  var c0 = code.charAt(0);
  if (c0 === 'B') {
    return 'https://cf-images.us-east-1.prod.boltdns.net/v1/static/76009399001/' + code.slice(1) + '/' + (size === 'large' ? '1280x720' : size ? '384x216' : '640x360') + '/match/image.jpg';
  }
  if (c0 === 'M') return 'https://www.metopera.org/ondemand/imagelinks/' + code.slice(1);
  if (c0 === 'T') return THUMBS_BASE + code.slice(1) + '.jpg';      // 1.3.0 generated poster (960x540)
  return code;
}
function imgCode(u) {
  if (!u) return '';
  var m = /^https?:\/\/cf-images\.us-east-1\.prod\.boltdns\.net\/v1\/static\/76009399001\/([0-9a-f-]+)\/([0-9a-f-]+)\/\d+x\d+\/match\/image\.jpg$/.exec(u);
  if (m) return 'B' + m[1] + '/' + m[2];
  m = /^https?:\/\/www\.metopera\.org\/ondemand\/imagelinks\/(.+)$/.exec(u);
  if (m) return 'M' + m[1];
  return u.replace(/^http:/, 'https:');
}

// ---------- titles (one entry per Met "opera" title) ----------
var titles = null;   // array
var byName = null;
var listsState = { source: 'snapshot ' + SEED.built, updated: 0, refreshing: false, error: '' };

function fromSeed(r) {
  // [name, sort, hd, sd, audio, typicalRuntimeMin, decades, image, audioDescribed, newestDate]
  // r[10] = 1: the title image replaces the performances' own art (generic cards / squares, see tools/make-thumbs.js)
  return { name: r[0], sort: r[1], hd: r[2], sd: r[3], audio: r[4], rt: r[5], dec: r[6], img: r[7], ad: r[8], newest: r[9], fx: r[10] || 0, kind: kindOf(r[0]), cur: info(r[0]) };
}

function build() {
  titles = [];
  byName = {};
  for (var i = 0; i < SEED.titles.length; i++) {
    var t = fromSeed(SEED.titles[i]);
    titles.push(t); byName[t.name] = t;
  }
  var L = lsGet(LIST_KEY, null);
  if (L && L.all) applyLists(L);
}

// Live lists: {t, all:[[name, sort, videoCount, audioCount]], hd:[names], sd:[names]}
function applyLists(L) {
  var hd = {}, sd = {}, i;
  for (i = 0; i < (L.hd || []).length; i++) hd[L.hd[i]] = 1;
  for (i = 0; i < (L.sd || []).length; i++) sd[L.sd[i]] = 1;
  var keep = {};
  for (i = 0; i < L.all.length; i++) {
    var r = L.all[i];
    var t = byName[r[0]];
    if (!t) {   // a title added after this build: classified only if it is in the curated table
      t = { name: r[0], sort: r[1], hd: 0, sd: 0, audio: 0, rt: 0, dec: {}, img: '', ad: 0, newest: '', kind: kindOf(r[0]), cur: info(r[0]), isNew: true };
      titles.push(t); byName[t.name] = t;
    }
    keep[t.name] = 1;
    t.audio = r[3];
    // The list only says how many videos; split HD / SD using the media_type lists.
    if (r[2] !== t.hd + t.sd) {
      if (hd[t.name] && !sd[t.name]) { t.hd = r[2]; t.sd = 0; } else if (sd[t.name] && !hd[t.name]) { t.sd = r[2]; t.hd = 0; } else { t.hd = Math.max(0, r[2] - t.sd); }
    }
    if (!hd[t.name] && L.hd) t.hd = 0;
    if (!sd[t.name] && L.sd) t.sd = 0;
  }
  // Titles the Met removed.
  titles = titles.filter(function (t) { return keep[t.name]; });
  byName = {};
  for (i = 0; i < titles.length; i++) byName[titles[i].name] = titles[i];
  listsState.updated = L.t;
  listsState.source = 'Met catalog';
}

export function getTitles() { if (!titles) build(); return titles; }
export function getTitle(name) { if (!titles) build(); return byName[name] || null; }
export function catalogStatus() { if (!titles) build(); return listsState; }

export function listsStale() {
  var L = lsGet(LIST_KEY, null);
  return !L || !L.t || Date.now() - L.t > LIST_TTL;
}

// Refresh title lists from the Met (4 small requests, sequential to stay gentle on the TV).
export function refreshLists(force, cb) {
  if (!titles) build();
  if (listsState.refreshing) { if (cb) cb('busy'); return; }
  if (!force && !listsStale()) { if (cb) cb(null, false); return; }
  listsState.refreshing = true;
  listsState.error = '';
  var out = { t: 0, all: null, hd: null, sd: null };
  var t0 = Date.now();
  xhrJSON('/filter', function (err, d) {
    if (err || !d || !d.results) return fail(err || 'no results');
    out.all = d.results.map(function (r) { return [r.name, r.sort, r.videoCount || 0, r.audioCount || 0]; });
    xhrJSON('/filter?media_type=hd', function (e2, d2) {
      if (!e2 && d2 && d2.results) out.hd = d2.results.map(function (r) { return r.name; });
      xhrJSON('/filter?media_type=sd', function (e3, d3) {
        if (!e3 && d3 && d3.results) out.sd = d3.results.map(function (r) { return r.name; });
        out.t = Date.now();
        lsSet(LIST_KEY, out);
        build();
        listsState.refreshing = false;
        if (force) clearTitleCache();
        dbg('info', 'catalog lists refreshed: ' + out.all.length + ' titles in ' + (Date.now() - t0) + ' ms');
        if (cb) cb(null, true, { titles: out.all.length, ms: Date.now() - t0 });
      });
    });
  });
  function fail(e) {
    listsState.refreshing = false;
    listsState.error = String(e);
    dbg('warn', 'catalog refresh failed: ' + e);
    if (cb) cb(String(e));
  }
}

// ---------- performances of one title (on demand) ----------
// Compact record: {id, d: 'YYYY-MM-DD', f: 'hd'|'sd'|'audio', rt: minutes, cast, cond, comp, img, ad, cc}
function compactPerf(p) {
  var cond = '', comp = '';
  var cast = p.cast || [];
  for (var i = 0; i < cast.length; i++) {
    var c = cast[i];
    if (!c || !c.person) continue;
    if (c.role === 'CONDUCTOR' && !cond) cond = c.person.name;
    if (c.role === 'COMPOSER' && !comp) comp = c.person.name;
  }
  var short = String(p.shortCast || '').split('<br')[0];
  var semi = short.indexOf(';');
  var singers = semi >= 0 ? short.slice(semi + 1) : short;
  var tile = (p.tile && p.tile.image && p.tile.image.url) || '';
  return {
    id: p.id, d: String(p.performanceDate || '').slice(0, 10),
    f: p.mediaType === 'VIDEO' ? (p.resolutionType === 'HD' ? 'hd' : 'sd') : 'audio',
    rt: p.runTime ? Math.round(p.runTime / 60000) : 0,
    cast: singers.replace(/^\s+|\s+$/g, '').slice(0, 90), cond: cond, comp: comp,
    img: imgCode(tile), ad: !!p.hasAudioDescription, cc: !!p.hasCaptions,
    path: p.mediaType === 'AUDIO_STREAM' ? '/radio/' + p.id : '/performance/detail/' + p.id
  };
}

function touchIndex(name) {
  var idx = lsGet(OP_INDEX, []);
  var i = idx.indexOf(name);
  if (i >= 0) idx.splice(i, 1);
  idx.unshift(name);
  while (idx.length > OP_MAX) lsDel(OP_PREFIX + idx.pop());
  lsSet(OP_INDEX, idx);
}
function clearTitleCache() {
  var idx = lsGet(OP_INDEX, []);
  for (var i = 0; i < idx.length; i++) lsDel(OP_PREFIX + idx[i]);
  lsSet(OP_INDEX, []);
}

var inflight = {};
export function getPerformances(name, cb) {
  var c = lsGet(OP_PREFIX + name, null);
  if (c && c.p && Date.now() - c.t < OP_TTL) { cb(null, c.p, true); return; }
  if (inflight[name]) { inflight[name].push(cb); return; }
  inflight[name] = [cb];
  xhrJSON('/filter/' + encodeURIComponent(name.toLowerCase()), function (err, d, ms) {
    var cbs = inflight[name]; delete inflight[name];
    var list = null;
    if (!err && d && d.length !== undefined) {
      var seen = {};
      list = [];
      for (var i = 0; i < d.length; i++) {
        if (!d[i] || seen[d[i].id]) continue;
        seen[d[i].id] = 1;
        list.push(compactPerf(d[i]));
      }
      list.sort(function (a, b) { return a.d < b.d ? 1 : a.d > b.d ? -1 : 0; });
      lsSet(OP_PREFIX + name, { t: Date.now(), p: list });
      touchIndex(name);
      // Keep the title's aggregates in sync with what we just saw.
      var t = getTitle(name);
      if (t) {
        var dec = {};
        for (var j = 0; j < list.length; j++) { var k = list[j].d.slice(0, 3) + '0'; dec[k] = (dec[k] || 0) + 1; }
        t.dec = dec;
        if (!t.img) { for (j = 0; j < list.length; j++) if (list[j].img) { t.img = list[j].img; break; } }
        if (t.fx) for (j = 0; j < list.length; j++) list[j].img = t.img;
      }
    } else if (c && c.p) {
      list = c.p;  // stale cache is better than nothing
    }
    for (var n = 0; n < cbs.length; n++) cbs[n](list ? null : (err || 'no data'), list, false, ms);
  });
}
