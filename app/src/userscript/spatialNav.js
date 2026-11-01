// Lightweight spatial navigation for the arrow keys.
// Deliberately simpler (and cheaper on old TV CPUs) than the WICG polyfill:
// one querySelectorAll + one getBoundingClientRect pass per key press.
import { closest, inDocument } from './util';

var FOCUSABLE = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])', 'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])', '[role="button"]', '[role="slider"]', '[role="tab"]'
].join(',');

// Things we hide via CSS or never want to land on.
var SKIP = '.skip-link, .mtv-hidden, .footer, [aria-hidden="true"], [inert]';

var lastTile = null;
// Set by index.js: called when UP finds nothing above (moves focus to the top bar). Returns true if handled.
export var navHooks = { upEdge: null };
// Our own top bar / categories screen handle their own keys; keep them out of page navigation.
var OWN_UI = '.mtv-bar, .mtv-cat, .mtv-po, .mtv-search, .mtv-pl';

function visible(el, rect) {
  if (rect.width < 2 || rect.height < 2) return false;
  if (el.disabled) return false;
  if (closest(el, SKIP)) return false;
  var cs = window.getComputedStyle(el);
  if (cs.visibility === 'hidden' || cs.display === 'none' || parseFloat(cs.opacity) === 0) return false;
  return true;
}

// The current "modal" scope: our own panel, the Met login dialog, or the page.
export function scopeRoot() {
  var panel = document.querySelector('.mtv-panel.mtv-open, .mtv-exit.mtv-open');
  if (panel) return panel;
  var dialogs = document.querySelectorAll('[aria-modal="true"], .Login');
  for (var i = dialogs.length - 1; i >= 0; i--) {
    var r = dialogs[i].getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return dialogs[i];
  }
  if (document.documentElement.classList.contains('mtv-fs')) {
    var player = document.querySelector('.Player');
    if (player) return player;
  }
  return document.body;
}

export function candidates(root) {
  root = root || scopeRoot();
  var list = root.querySelectorAll(FOCUSABLE);
  var out = [];
  var skipOwn = root === document.body;
  for (var i = 0; i < list.length; i++) {
    var el = list[i];
    if (skipOwn && closest(el, OWN_UI)) continue;
    var rect = el.getBoundingClientRect();
    if (visible(el, rect)) out.push({ el: el, r: rect });
  }
  return out;
}

function center(r) { return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }

// Score a candidate relative to the origin rect for a direction. Lower is better; -1 = not in that direction.
function score(o, c, dir) {
  var oc = center(o), cc = center(c);
  var primary, ortho, overlap;
  var SLOP = 4;
  if (dir === 'right') {
    if (c.left < o.right - SLOP && cc.x <= oc.x + SLOP) return -1;
    primary = Math.max(0, c.left - o.right);
    overlap = Math.min(o.bottom, c.bottom) - Math.max(o.top, c.top);
    ortho = Math.abs(cc.y - oc.y);
  } else if (dir === 'left') {
    if (c.right > o.left + SLOP && cc.x >= oc.x - SLOP) return -1;
    primary = Math.max(0, o.left - c.right);
    overlap = Math.min(o.bottom, c.bottom) - Math.max(o.top, c.top);
    ortho = Math.abs(cc.y - oc.y);
  } else if (dir === 'down') {
    if (c.top < o.bottom - SLOP && cc.y <= oc.y + SLOP) return -1;
    primary = Math.max(0, c.top - o.bottom);
    overlap = Math.min(o.right, c.right) - Math.max(o.left, c.left);
    ortho = Math.abs(cc.x - oc.x);
  } else {
    if (c.bottom > o.top + SLOP && cc.y >= oc.y - SLOP) return -1;
    primary = Math.max(0, o.top - c.bottom);
    overlap = Math.min(o.right, c.right) - Math.max(o.left, c.left);
    ortho = Math.abs(cc.x - oc.x);
  }
  // Prefer elements that share a row/column with the origin, but not at any distance
  // (e.g. a centred "Load more" button directly below a row should beat a tile 1500px further down).
  // Orthogonal cost: the gap between the two projections (0 if they overlap) plus a little
  // centre-distance so wide elements (section headers) are not unfairly penalised.
  var aligned = overlap > 0 ? 0 : 1;
  var gap = overlap > 0 ? 0 : -overlap;
  return aligned * 300 + primary + gap * 2 + ortho * 0.1;
}

function firstBelow(list, block) {
  var best = null, bestKey = Infinity;
  for (var i = 0; i < list.length; i++) {
    var el = list[i].el;
    if (block.contains(el) || closest(el, '#app-header')) continue;
    var r = list[i].r;
    var absTop = r.top + window.pageYOffset;
    var key = absTop * 10 + r.left / 100;
    if (key < bestKey) { bestKey = key; best = el; }
  }
  return best;
}

export function focusEl(el) {
  if (!el) return;
  try { el.focus({ preventScroll: true }); } catch (e) { el.focus(); }
  revealEl(el);
  markTile(el);
}

function revealEl(el) {
  // Center vertically if outside a comfortable band; scrollIntoViewIfNeeded handles horizontal carousels.
  var r = el.getBoundingClientRect();
  var h = window.innerHeight;
  var margin = Math.round(h * 0.15);
  if (typeof el.scrollIntoViewIfNeeded === 'function') {
    el.scrollIntoViewIfNeeded(false);
    r = el.getBoundingClientRect();
  }
  if (r.top < margin || r.bottom > h - margin) {
    window.scrollBy(0, Math.round(r.top + r.height / 2 - h / 2));
  }
}

function markTile(el) {
  var tile = el && el.nodeType === 1 ? (closest(el, '.Tile') || (el.tagName === 'A' ? el.querySelector('.Tile') : null)) : null;
  if (lastTile && lastTile !== tile) lastTile.classList.remove('mtv-tile-focus');
  if (tile) tile.classList.add('mtv-tile-focus');
  lastTile = tile;
}

function currentFocus(root) {
  var a = document.activeElement;
  if (a && a !== document.body && a !== document.documentElement && inDocument(a) && root.contains(a)) {
    var r = a.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return a;
  }
  return null;
}

// Pick a sensible first element: the first visible candidate nearest the top of the viewport.
export function focusFirst(root) {
  var list = candidates(root);
  var best = null, bestScore = Infinity;
  for (var i = 0; i < list.length; i++) {
    var r = list[i].r;
    if (r.bottom < 0 || r.top > window.innerHeight) continue;
    var s = r.top * 3 + r.left;
    if (s < bestScore) { bestScore = s; best = list[i].el; }
  }
  if (!best && list.length) best = list[0].el;
  focusEl(best);
  return best;
}

function pick(list, cur, o, dir, excludeSel) {
  var best = null, bestScore = Infinity;
  for (var i = 0; i < list.length; i++) {
    var c = list[i];
    if (c.el === cur || cur.contains(c.el) || c.el.contains(cur)) continue;
    if (excludeSel && closest(c.el, excludeSel)) continue;
    var s = score(o, c.r, dir);
    if (s >= 0 && s < bestScore) { bestScore = s; best = c.el; }
  }
  return best;
}

// Returns true if focus moved.
export function navigate(dir) {
  var root = scopeRoot();
  var cur = currentFocus(root);
  if (!cur) return !!focusFirst(root);
  var o = cur.getBoundingClientRect();
  var list = candidates(root);
  // The Met hero is a scroll-driven stack that re-positions itself (and steals focus) while the page
  // scrolls. Treat it as one block: DOWN from anywhere in the hero jumps to the first row below it.
  var hero = closest(cur, '.Hero');
  if (hero && dir === 'down') {
    var jump = firstBelow(list, hero);
    if (jump) { focusEl(jump); return true; }
  }
  // The site header is sticky (always at the top of the viewport), so it would win every UP press.
  // Search the page content first and only fall back to the header when nothing else is above.
  var curInHeader = !!closest(cur, '#app-header');
  var best = pick(list, cur, o, dir, curInHeader ? null : '#app-header');
  if (!best && !curInHeader && dir === 'up') best = pick(list, cur, o, dir, null);
  var bestHero = best && closest(best, '.Hero');
  if (bestHero && !hero) {
    // Entering the hero from below: scroll to the top first (the hero un-stacks), then focus its first control.
    window.scrollTo(0, 0);
    setTimeout(function () { focusFirst(bestHero); }, 60);
    return true;
  }
  if (best) { focusEl(best); return true; }
  if (dir === 'up' && navHooks.upEdge && navHooks.upEdge()) return true;
  // Nothing further in that direction: scroll the page a bit so long pages stay reachable.
  if (dir === 'down' || dir === 'up') {
    window.scrollBy(0, (dir === 'down' ? 1 : -1) * Math.round(window.innerHeight * 0.4));
  }
  return false;
}

export function initFocusTracking() {
  document.addEventListener('focusin', function (e) { markTile(e.target); }, true);
}
