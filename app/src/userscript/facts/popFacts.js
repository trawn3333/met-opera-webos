// 1.4.0 Pop-up facts: "Pop-Up Video" style trivia bubbles during playback.
// Data: facts/titles/*.json in the repo (every fact sourced + verified by facts/build.js). The top titles are bundled
// (factsData.js); the rest are fetched lazily from the Worker (GET <MTV_WORKER_URL>/v1/facts/<slug>.json) and cached
// in localStorage for 7 days. Without a Worker URL only the bundled titles have facts.
// Timing: facts with a sceneMatch regex pop up early in the first Met scene marker whose title matches; the rest are
// spread through the running time. Bubbles sit top-right (clear of the subtitles at the bottom), never take focus
// (pointer-events none, no tabindex) and dismiss themselves after ~10 s. Toggle: "Pop-up facts" in the controls
// (localStorage mtv.popFacts, default on).
import { INDEX, BUNDLED } from './factsData';
import { WORKER_URL } from '../config';
import { lsGet, lsSet } from '../util';
import { dbg } from '../debugLog';
import { tlm } from '../tlm';

var LS_ON = 'mtv.popFacts', LS_CACHE = 'mtv.facts.', CACHE_MS = 7 * 86400000;
var SHOW_MS = 10000, LEAD = 20, MIN_GAP = 75;
var TYPE = {
  c: { label: 'The composer', icon: '<path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z"/>' },
  a: { label: 'From the artists', icon: '<path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2z"/>' },
  p: { label: 'Opening night', icon: '<path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/>' },
  r: { label: 'The critics', icon: '<path d="M4 4h13v2h2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4zm2 2v12h11V8H6V6zm2 3h7v2H8V9zm0 4h7v2H8v-2z"/>' },
  h: { label: 'History', icon: '<path d="M13 3a9 9 0 1 0 9 9h-2a7 7 0 1 1-7-7V3zm-1 5v5l4.25 2.52.77-1.28-3.52-2.09V8H12z"/>' },
  s: { label: 'On stage', icon: '<path d="M3 3h18v2c-2 0-3 1.5-3 4v10h-3V9c0-2-1-3-3-3s-3 1-3 3v10H6V9c0-2.5-1-4-3-4V3z"/>' },
  b: { label: 'Oops!', icon: '<path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm-3.5 6a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3zm7 0a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3zM8 16.5c.9-1.8 2.3-2.5 4-2.5s3.1.7 4 2.5H8z"/>' },
  m: { label: 'The music', icon: '<path d="M21 3v12.5a3.5 3.5 0 1 1-2-3.15V7l-9 2v8.5a3.5 3.5 0 1 1-2-3.15V5l13-2z"/>' }
};

export function popFactsOn() { return lsGet(LS_ON, true) !== false; }
export function setPopFacts(on) { lsSet(LS_ON, !!on); if (!on) dismiss(true); tlm('popfacts-toggle', { on: !!on }); }

export function fold(s) {
  return String(s || '').toLowerCase().normalize ? String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()
    : String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
// slug for an opera name (the Met's "opera" field, or the title without a year suffix)
export function slugFor(name) {
  var n = fold(String(name || '').replace(/\(\d{4}\)\s*$/, ''));
  if (!n) return null;
  for (var slug in INDEX) {
    if (!Object.prototype.hasOwnProperty.call(INDEX, slug)) continue;
    var m = INDEX[slug];
    for (var i = 0; i < m.length; i++) if (fold(m[i]) === n) return slug;
  }
  return null;
}

// cb(doc|null). doc = {slug, title, facts: [[id, type, sceneMatch, scope, text, attribution, url]]}
export function loadFacts(name, cb) {
  var slug = slugFor(name);
  if (!slug) { cb(null); return; }
  if (BUNDLED[slug]) { cb(BUNDLED[slug]); return; }
  var c = lsGet(LS_CACHE + slug, null);
  if (c && c.doc && Date.now() - c.at < CACHE_MS) { cb(c.doc); return; }
  if (!WORKER_URL) { cb(null); return; }
  var x = new XMLHttpRequest(), done = false;
  var fin = function (doc) { if (done) return; done = true; cb(doc); };
  try {
    x.open('GET', WORKER_URL + '/v1/facts/' + slug + '.json', true);
    x.timeout = 15000;
    x.onreadystatechange = function () {
      if (x.readyState !== 4) return;
      var doc = null;
      if (x.status === 200) { try { doc = JSON.parse(x.responseText); } catch (e) { doc = null; } }
      if (doc && doc.facts) lsSet(LS_CACHE + slug, { at: Date.now(), doc: doc });
      else dbg('warn', 'pop-up facts: ' + slug + ' HTTP ' + x.status);
      fin(doc && doc.facts ? doc : (c && c.doc) || null);
    };
    x.ontimeout = function () { fin((c && c.doc) || null); };
    x.send();
  } catch (e) { fin((c && c.doc) || null); }
}

// Plan: [{at (s), f (row)}] sorted. chs = [{t, title, act}], prodPremiere = 'YYYY-MM-DD' or ''.
export function plan(doc, chs, duration, prodPremiere) {
  if (!doc || !doc.facts || !duration) return [];
  var rows = doc.facts.filter(function (f) { return !f[3] || f[3] === 'production:' + prodPremiere; });
  var out = [], general = [], used = {};
  var ends = [];
  for (var i = 0; i < chs.length; i++) ends.push(i + 1 < chs.length ? chs[i + 1].t : duration);
  for (var k = 0; k < rows.length; k++) {
    var f = rows[k], placed = false;
    if (f[2]) {
      var re = null;
      try { re = new RegExp(f[2], 'i'); } catch (e) { re = null; }
      for (var j = 0; re && j < chs.length && !placed; j++) {
        var full = (chs[j].act ? 'Act ' + chs[j].act + ': ' : '') + chs[j].title;
        if (!re.test(chs[j].title) && !re.test(full)) continue;
        var n = used[j] || 0, len = ends[j] - chs[j].t;
        var at = chs[j].t + LEAD + n * MIN_GAP;
        if (at + 12 > ends[j] && n > 0) break;            // scene too short for another one
        if (len < 25) at = chs[j].t + 3;
        used[j] = n + 1; out.push({ at: at, f: f, scene: j }); placed = true;
      }
    }
    if (!placed) general.push(f);
  }
  // keep scene-tied pop-ups MIN_GAP apart: slide a crowded one later inside its scene, else let it float as a general fact
  out.sort(function (a, b) { return a.at - b.at; });
  var kept = [];
  for (var q = 0; q < out.length; q++) {
    var o = out[q], prev = kept.length ? kept[kept.length - 1].at : -1e9;
    if (o.at < prev + MIN_GAP) {
      var moved = prev + MIN_GAP;
      if (moved + 12 <= ends[o.scene]) o.at = moved; else { general.push(o.f); continue; }
    }
    kept.push(o);
  }
  out = kept;
  // spread the general facts through the free time, keeping MIN_GAP from everything already planned
  var start = Math.min(120, duration * 0.05), end = duration - 120;
  if (general.length && end > start) {
    var step = (end - start) / (general.length + 1);
    for (var g = 0; g < general.length; g++) {
      var want = start + step * (g + 1), best = -1;
      for (var tries = 0; tries < 12; tries++) {
        var cand = want + (tries % 2 ? 1 : -1) * Math.ceil(tries / 2) * (MIN_GAP / 2);
        if (cand < start || cand > end) continue;
        if (!out.some(function (o) { return Math.abs(o.at - cand) < MIN_GAP; })) { best = cand; break; }
      }
      if (best >= 0) out.push({ at: best, f: general[g] });
    }
  }
  out.sort(function (a, b) { return a.at - b.at; });
  return out;
}

// ---------- runtime ----------
var host = null, cur = null, curTimer = null, shown = {}, schedule = [], session = null, lastT = -1;
function esc(s) { return String(s === undefined || s === null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
function srcLabel(url) {
  var m = /^https?:\/\/([^/]+)/.exec(url || '');
  if (!m) return '';
  var h = m[1].replace(/^www\./, '');
  return /wikipedia\.org$/.test(h) ? 'Wikipedia' : /metopera\.org$/.test(h) ? 'Met Opera Archives' : h;
}

// Called by the player when a performance starts (or changes). opts: {id, name, chapters, duration, prodPremiere, root}
export function startSession(opts) {
  stopSession();
  session = { id: opts.id, root: opts.root, doc: null, planned: false, opts: opts };
  var s = session;
  loadFacts(opts.name, function (doc) {
    if (s !== session) return;
    s.doc = doc;
    dbg('info', 'pop-up facts: ' + (doc ? doc.slug + ' (' + doc.facts.length + ')' : 'none for ' + opts.name));
  });
}
export function stopSession() { session = null; schedule = []; shown = {}; lastT = -1; dismiss(true); }
export function sessionInfo() { return session ? { id: session.id, slug: session.doc && session.doc.slug, planned: schedule.length, shown: Object.keys(shown).length, next: schedule.filter(function (x) { return !shown[x.f[0]]; }).slice(0, 3).map(function (x) { return [Math.round(x.at), x.f[0]]; }) } : null; }
export function plannedSchedule() { return schedule.slice(); }

// Called ~1/s by the player with the current time. ctx: {chapters, duration, prodPremiere, paused, root}
export function tick(t, ctx) {
  if (!session || !session.doc) return;
  if (!session.planned && ctx.duration) {
    schedule = plan(session.doc, ctx.chapters || [], ctx.duration, ctx.prodPremiere || '');
    session.planned = true;
    dbg('info', 'pop-up facts planned: ' + schedule.length);
  }
  var jumped = lastT >= 0 && Math.abs(t - lastT) > 5;
  lastT = t;
  if (!popFactsOn() || ctx.paused || cur) return;
  for (var i = 0; i < schedule.length; i++) {
    var x = schedule[i];
    if (shown[x.f[0]]) continue;
    // due now (allow a small window; after a jump, only facts within the window are shown, the passed ones wait for a rewind)
    if (t >= x.at && t < x.at + (jumped ? 4 : 8)) { pop(x.f, ctx.root || session.root); shown[x.f[0]] = 1; return; }
  }
}

// f = [id, type letter, sceneMatch, scope, text, attribution, sourceUrl, kicker?]; kicker (optional) replaces the type label.
export function pop(f, root) {
  dismiss(true);
  var ty = TYPE[f[1]] || TYPE.h;
  var el = document.createElement('div');
  el.className = 'mtv-pop mtv-pop-t-' + (f[1] || 'h');
  el.setAttribute('aria-live', 'polite');
  var src = srcLabel(f[6]);
  el.innerHTML = '<div class="mtv-pop-bub"><i class="mtv-pop-ic"><svg viewBox="0 0 24 24" width="30" height="30" fill="currentColor" aria-hidden="true">' + ty.icon + '</svg></i>' +
    '<div class="mtv-pop-tx"><small>' + esc(f[7] || ty.label) + '</small><p>' + esc(f[4]) + '</p>' +
    '<em>' + esc(f[5] || '') + (src && (f[5] || '').indexOf(src) < 0 ? (f[5] ? ' \u00b7 ' : '') + esc(src) : '') + '</em></div></div>';
  (root || document.body).appendChild(el);
  cur = el;
  // force layout, then animate in
  void el.offsetWidth;
  el.classList.add('mtv-pop-in');
  clearTimeout(curTimer);
  curTimer = setTimeout(function () { dismiss(false); }, SHOW_MS);
  tlm('popfact', { id: f[0], type: f[1] });
  return el;
}
export function dismiss(now) {
  clearTimeout(curTimer);
  var el = cur;
  cur = null;
  if (!el) return;
  if (now) { if (el.parentNode) el.parentNode.removeChild(el); return; }
  el.classList.remove('mtv-pop-in');
  el.classList.add('mtv-pop-out');
  setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 450);
}
export function isPopShown() { return !!cur; }
