// Optional speed-ups ("Speed-ups" in the RED panel, OFF by default since 1.0.2).
// Nothing here blocks, rewrites or intercepts any request or script: the Met site and every
// third-party script it loads (Brightcove, analytics, etc.) run exactly as they would in a browser.
// The only thing this does when enabled is delay catalog tile artwork until it is near the screen.
import { inDocument, closest, log } from './util';

// Catalog artwork hosts whose <img> loads may be delayed until near the viewport.
var DEFER_IMG = /^(https?:)?\/\/(cdn\.ondemand\.metopera\.org|www\.metopera\.org\/ondemand\/imagelinks|cf-images\.[a-z0-9-]+\.prod\.boltdns\.net)\//i;

var stats = { deferred: 0, loaded: 0 };
export function getStats() { return stats; }

var io = null;
var pending = [];
var pumpTimer = null;
// Survive an in-page restart (document rewrite keeps the same prototypes): always use the originals.
var nativeSetAttr = Element.prototype.setAttribute.__mtvOrig || Element.prototype.setAttribute;
var srcDesc = HTMLImageElement.__mtvSrcDesc || Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');

function realSet(img, url) {
  stats.loaded++;
  img.removeAttribute('data-mtv-src');
  if (srcDesc && srcDesc.set) srcDesc.set.call(img, url); else nativeSetAttr.call(img, 'src', url);
}

function pump() {
  pumpTimer = null;
  var now = Date.now();
  var keep = [];
  for (var i = 0; i < pending.length; i++) {
    var it = pending[i];
    if (it.img.getAttribute('data-mtv-src') !== it.url) continue; // superseded
    if (inDocument(it.img)) {
      // Only tiles in grids wait for the viewport; anything else loads immediately.
      if (closest(it.img, '.Grid, .Tile, .Grid-contents')) io.observe(it.img);
      else realSet(it.img, it.url);
    } else if (now - it.t > 3000) {
      realSet(it.img, it.url);
    } else {
      keep.push(it);
    }
  }
  pending = keep;
  if (pending.length) pumpTimer = setTimeout(pump, 250);
}

function defer(img, url) {
  stats.deferred++;
  nativeSetAttr.call(img, 'data-mtv-src', url);
  pending.push({ img: img, url: url, t: Date.now() });
  if (!pumpTimer) pumpTimer = setTimeout(pump, 0);
}

function shouldDefer(img, url) {
  return typeof url === 'string' && DEFER_IMG.test(url) && !img.hasAttribute('data-mtv-eager');
}

function deferImages() {
  if (typeof window.IntersectionObserver !== 'function' || !srcDesc || !srcDesc.set) return;
  io = new IntersectionObserver(function (entries) {
    for (var i = 0; i < entries.length; i++) {
      var e = entries[i];
      if (e.isIntersecting || e.intersectionRatio > 0) {
        var img = e.target;
        io.unobserve(img);
        var url = img.getAttribute('data-mtv-src');
        if (url) realSet(img, url);
      }
    }
  }, { rootMargin: '800px 0px 800px 0px' });

  var wrapped = function (name, value) {
    if (this.tagName === 'IMG' && (name === 'src' || name === 'SRC') && shouldDefer(this, String(value))) { defer(this, String(value)); return; }
    return nativeSetAttr.apply(this, arguments);
  };
  wrapped.__mtvOrig = nativeSetAttr;
  Element.prototype.setAttribute = wrapped;
  HTMLImageElement.__mtvSrcDesc = srcDesc;
  Object.defineProperty(HTMLImageElement.prototype, 'src', {
    configurable: true,
    enumerable: srcDesc.enumerable,
    get: function () { return this.getAttribute('data-mtv-src') || srcDesc.get.call(this); },
    set: function (value) {
      if (shouldDefer(this, String(value))) { defer(this, String(value)); return; }
      srcDesc.set.call(this, value);
    }
  });
}

export function initPerf() {
  try { deferImages(); } catch (e) { log('deferImages failed', e); }
}
