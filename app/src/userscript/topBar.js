// Persistent TV top bar: always visible (except in the full-screen player), the page is pushed down
// below it. Reachable with UP from the top of any page (and YELLOW from anywhere).
// Items navigate inside the Met's own single-page app (no reloads) or open our Categories screen.
import { KEY } from './keys';
import { closest, lsGet } from './util';
import { tlm } from './tlm';
import { dbg } from './debugLog';
import { toast } from './toast';

var bar = null;
var lastPageFocus = null;
var lastItem = 0;
var actions = {};          // act -> function, set by index.js
export var BAR_H = 64;

var ITEMS = [
  ['home', 'Home'],
  ['categories', 'Categories'],
  ['archive', 'Archive A\u2013Z'],
  ['search', 'Search'],
  ['continue', 'Continue watching'],
  ['favorites', 'My favorites'],
  ['settings', 'Settings']
];

export function setActions(a) { actions = a; }

export function initBar() {
  if (bar && document.documentElement.contains(bar)) return;
  bar = document.createElement('nav');
  bar.className = 'mtv-bar';
  bar.setAttribute('aria-label', 'Met Opera TV menu');
  var html = '<span class="mtv-bar-brand">Met Opera <em>on Demand</em></span>';
  for (var i = 0; i < ITEMS.length; i++) {
    html += '<button type="button" class="mtv-bar-item" data-act="' + ITEMS[i][0] + '" data-i="' + i + '">' + ITEMS[i][1] + '</button>';
  }
  html += '<span class="mtv-bar-hint">\u25B2 menu</span>';
  bar.innerHTML = html;
  document.body.appendChild(bar);
  document.documentElement.classList.add('mtv-has-bar');
  bar.addEventListener('click', function (e) {
    var b = closest(e.target, '.mtv-bar-item');
    if (b) run(b.getAttribute('data-act'));
  });
  bar.addEventListener('focusin', function (e) { if (e.target.classList) e.target.classList.add('mtv-f'); });
  bar.addEventListener('focusout', function (e) { if (e.target.classList) e.target.classList.remove('mtv-f'); });
  // Track where the user was on the page so DOWN from the bar can go back there.
  document.addEventListener('focusin', function (e) {
    if (bar && !bar.contains(e.target)) lastPageFocus = e.target;
  }, true);
  highlightRoute();
}

export function removeBar() {
  if (bar && bar.parentNode) bar.parentNode.removeChild(bar);
  bar = null;
  document.documentElement.classList.remove('mtv-has-bar');
}

export function inBar(el) { return !!bar && !!el && bar.contains(el); }
export function hasBar() { return !!bar && document.documentElement.contains(bar); }

export function focusBar() {
  if (!hasBar()) return false;
  var items = bar.querySelectorAll('.mtv-bar-item');
  var b = items[lastItem] || items[0];
  b.focus();
  return true;
}

export function highlightRoute(act) {
  if (!bar) return;
  var p = window.location.pathname;
  var cur = act || (p === '/search' ? 'search' : (p === '/' || p.indexOf('/screen/') === 0) ? 'home' : '');
  var items = bar.querySelectorAll('.mtv-bar-item');
  for (var i = 0; i < items.length; i++) items[i].classList.toggle('mtv-cur', items[i].getAttribute('data-act') === cur);
}

function run(act) {
  tlm('menu', { item: act, from: routeKind() });
  dbg('info', 'menu: ' + act);
  var items = bar.querySelectorAll('.mtv-bar-item');
  for (var i = 0; i < items.length; i++) if (items[i].getAttribute('data-act') === act) lastItem = i;
  var fn = actions[act];
  if (fn) fn();
}

function routeKind() {
  var p = window.location.pathname;
  if (p === '/' || p.indexOf('/screen/') === 0) return 'home';
  if (p.indexOf('/performance/') === 0) return 'title';
  if (p.indexOf('/search') === 0) return 'search';
  return p.split('/')[1] || 'other';
}

// Keys while focus is in the bar. Returns true if handled.
export function handleKey(k) {
  var a = document.activeElement;
  if (!inBar(a)) return false;
  var items = bar.querySelectorAll('.mtv-bar-item');
  var i = +a.getAttribute('data-i');
  if (k === KEY.LEFT) { if (i > 0) { items[i - 1].focus(); lastItem = i - 1; } return true; }
  if (k === KEY.RIGHT) { if (i < items.length - 1) { items[i + 1].focus(); lastItem = i + 1; } return true; }
  if (k === KEY.UP) return true;
  if (k === KEY.DOWN) { if (actions.leaveDown) actions.leaveDown(lastPageFocus); return true; }
  if (k === KEY.ENTER) { run(a.getAttribute('data-act')); return true; }
  return false;
}

export function notice(text) { toast(text, 3500); }
export function barEnabled() { return lsGet('mtv.bar', true); }
