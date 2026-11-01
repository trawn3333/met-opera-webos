// Small helpers. Keep everything ES5-safe at runtime (Chromium 53 on webOS 4.x).
export var HOST = 'ondemand.metopera.org';
export var MIDDLEWARE = 'https://middleware.ondemand.metopera.org/client';

export function isLocalPage() {
  return window.location.protocol === 'file:';
}

export function isMetOnDemand() {
  return window.location.hostname === HOST;
}

export function inDocument(el) {
  return !!el && document.documentElement.contains(el);
}

export function closest(el, sel) {
  while (el && el.nodeType === 1) {
    if (matches(el, sel)) return el;
    el = el.parentElement;
  }
  return null;
}

export function matches(el, sel) {
  var fn = el.matches || el.webkitMatchesSelector;
  return fn ? fn.call(el, sel) : false;
}

export function lsGet(key, fallback) {
  try {
    var v = window.localStorage.getItem(key);
    return v === null ? fallback : JSON.parse(v);
  } catch (e) {
    return fallback;
  }
}

export function lsSet(key, value) {
  try { window.localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* storage full / disabled */ }
}

export function lsDel(key) {
  try { window.localStorage.removeItem(key); } catch (e) { /* ignore */ }
}

export function onReady(fn) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fn);
  } else {
    fn();
  }
}

export function addStyle(css, id) {
  var s = document.createElement('style');
  if (id) s.id = id;
  s.appendChild(document.createTextNode(css));
  (document.head || document.documentElement).appendChild(s);
  return s;
}

export function exitApp() {
  try {
    if (window.webOS && typeof window.webOS.platformBack === 'function') { window.webOS.platformBack(); return; }
    if (window.PalmSystem && typeof window.PalmSystem.platformBack === 'function') { window.PalmSystem.platformBack(); return; }
  } catch (e) { /* fall through */ }
  window.close();
}

import { dbg } from './debugLog';
export function log() {
  dbg('info', Array.prototype.slice.call(arguments).join(' '));
}
