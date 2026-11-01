// What the Met itself is featuring + the signed-in user's Continue Watching / Favorites, read from the
// head of the Met's own home screen (/client/screen/<home id>, the same call the site makes on start).
// That response is ~5 MB; the parts we need (Hero, Rentals, Continue Watching, My Favorites) are its
// first ~300 KB, so we read it progressively, cut whole components out with a small bracket scanner,
// and abort the rest. Cached for 2 h (continue watching changes as you watch).
import { mw } from '../net';
import { lsGet, lsSet } from '../util';
import { dbg } from '../debugLog';
import { tlm } from '../tlm';

var HOME_SCREEN = '712e9fa1-aac8-493f-81a1-133f95c53f19';
var LS = 'mtv.featured';
var TTL = 2 * 3600 * 1000;
var MAX_BYTES = 1500000;
var loading = null;

function img(n) {
  var c = [n.slide && n.slide.image, n.tile && n.tile.image, n.mobileTile && n.mobileTile.image];
  for (var i = 0; i < c.length; i++) if (c[i] && c[i].url) return String(c[i].url).replace(/^http:/, 'https:');
  return '';
}
function singers(sc) {
  var short = String(sc || '').split('<br')[0];
  var semi = short.indexOf(';');
  return { cond: semi >= 0 ? short.slice(0, semi).replace(/^\s+|\s+$/g, '') : '', cast: (semi >= 0 ? short.slice(semi + 1) : short).replace(/^\s+|\s+$/g, '').slice(0, 90) };
}
export function compactNode(n) {
  if (!n || !n.id || (n.contentType && n.contentType !== 'MEDIA_PERFORMANCE')) return null;
  var s = singers(n.shortCast);
  var desc = (n.slide && n.slide.description) || (n.tile && n.tile.description) || '';
  return {
    id: n.id, name: n.name || '', title: n.opera || n.name || '', d: String(n.performanceDate || '').slice(0, 10),
    f: n.mediaType === 'VIDEO' ? (n.resolutionType === 'HD' ? 'hd' : 'sd') : 'audio',
    rt: n.runTime ? Math.round(n.runTime / 60000) : 0, pos: typeof n.position === 'number' ? n.position : +n.position || 0,
    img: img(n), desc: String(desc).slice(0, 260), sub: (n.slide && n.slide.subHeader) || (n.tile && n.tile.subHeader) || '',
    badges: (n.slide && n.slide.badges) || [], cast: s.cast, cond: s.cond, cc: !!n.hasCaptions, ad: !!n.hasAudioDescription,
    path: n.mediaType === 'AUDIO_STREAM' ? '/radio/' + n.id : '/performance/detail/' + n.id
  };
}

// Incremental scanner over a growing JSON text: returns whole objects of the "components" array.
function Scanner() { this.i = -1; this.depth = 0; this.inStr = false; this.esc = false; this.start = -1; this.out = []; }
Scanner.prototype.feed = function (text) {
  if (this.i < 0) {
    var k = text.indexOf('"components":[');
    if (k < 0) return;
    this.i = k + 14;
  }
  for (var i = this.i, n = text.length; i < n; i++) {
    var ch = text.charCodeAt(i);
    if (this.inStr) {
      if (this.esc) this.esc = false;
      else if (ch === 92) this.esc = true;          // backslash
      else if (ch === 34) this.inStr = false;       // "
      continue;
    }
    if (ch === 34) { this.inStr = true; continue; }
    if (ch === 123 || ch === 91) { if (this.depth === 0 && ch === 123) this.start = i; this.depth++; }
    else if (ch === 125 || ch === 93) {
      this.depth--;
      if (this.depth < 0) { this.done = true; this.i = i; return; }  // end of the components array
      if (this.depth === 0 && ch === 125 && this.start >= 0) {
        try { this.out.push(JSON.parse(text.slice(this.start, i + 1))); } catch (e) { /* skip */ }
        this.start = -1;
      }
    }
  }
  this.i = text.length;
};

function wanted(c) { return /hero/i.test(c.type || '') || /continue watching|favorite/i.test(c.name || c.header || ''); }

function summarize(comps) {
  var r = { t: Date.now(), hero: [], cont: [], fav: [] };
  for (var i = 0; i < comps.length; i++) {
    var c = comps[i];
    var nodes = c && c.collection && c.collection.items && c.collection.items.nodes || [];
    var list = [];
    for (var j = 0; j < nodes.length && list.length < 30; j++) { var x = compactNode(nodes[j]); if (x) list.push(x); }
    if (/hero/i.test(c.type || '')) r.hero = r.hero.concat(list);
    else if (/continue watching/i.test(c.name || c.header || '')) r.cont = list;
    else if (/favorite/i.test(c.name || c.header || '')) r.fav = list;
  }
  return r;
}

export function cachedFeatured() { var c = lsGet(LS, null); return c && c.hero ? c : null; }

export function getFeatured(cb, force) {
  var c = cachedFeatured();
  if (!force && c && Date.now() - c.t < TTL) { cb(null, c, true); return; }
  if (loading) { loading.push(cb); return; }
  loading = [cb];
  var sc = new Scanner(), t0 = Date.now(), bytes = 0;
  function finish(err) {
    var res = null;
    if (sc.out.length) { res = summarize(sc.out); lsSet(LS, res); }
    var cbs = loading; loading = null;
    tlm('featured', { ok: !!res, err: err || '', comps: sc.out.length, kb: Math.round(bytes / 1024), ms: Date.now() - t0,
      hero: res ? res.hero.length : 0, cont: res ? res.cont.length : 0, fav: res ? res.fav.length : 0 });
    dbg('info', 'featured: ' + (res ? res.hero.length + ' hero, ' + res.cont.length + ' continue, ' + res.fav.length + ' fav' : 'failed ' + err) + ' (' + Math.round(bytes / 1024) + ' KB, ' + (Date.now() - t0) + ' ms)');
    for (var i = 0; i < cbs.length; i++) cbs[i](res ? null : (err || 'no data'), res || c, false);
  }
  mw('GET', '/screen/' + HOME_SCREEN, null, function (err, data, status, ms, x, aborted) {
    if (aborted) { finish(null); return; }
    if (!err && data && data.screen && data.screen.components) {   // engines without progress events: full parse
      sc.out = data.screen.components.filter(wanted);
      bytes = x && x.responseText ? x.responseText.length : 0;
      finish(null); return;
    }
    if (sc.out.length) { finish(null); return; }
    finish(err || 'empty');
  }, {
    timeout: 45000,
    onprogress: function (x) {
      var text = x.responseText || '';
      bytes = text.length;
      sc.feed(text);
      var got = sc.out.filter(wanted).length;
      var pastFav = false;
      for (var i = 0; i < sc.out.length; i++) if (/favorite/i.test(sc.out[i].name || '')) pastFav = true;
      if (pastFav || got >= 3 || bytes > MAX_BYTES || sc.done) { sc.out = sc.out.filter(wanted); return false; }  // abort the rest
      return true;
    }
  });
}
