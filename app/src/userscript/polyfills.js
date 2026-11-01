// Polyfills for old webOS engines (webOS 4.x = Chromium 53, 5.x = Chromium 68).
// The Met site itself calls window.scrollTo({top:0}) and new ResizeObserver() while mounting its
// home page hero. On Chromium < 61 / < 64 those throw, React unmounts the whole app and the TV shows
// an empty (black) page. Everything here is feature-detected and only fills what is missing.
import { dbg } from './debugLog';

// Kept on window so the list survives an in-place page restart (polyfills stay installed).
var filled = window.__mtvFilled || (window.__mtvFilled = []);
function note(n) { if (filled.indexOf(n) < 0) filled.push(n); }
export function getFilled() { return filled; }

function def(obj, name, fn) {
  if (!obj || !fn || obj[name]) return;
  try {
    Object.defineProperty(obj, name, { value: fn, configurable: true, writable: true, enumerable: false });
    note(name);
  } catch (e) { /* ignore */ }
}

function scrollOptionsSupported() {
  return 'scrollBehavior' in document.documentElement.style; // shipped together with ScrollToOptions (Chrome 61)
}

function patchScroll() {
  if (scrollOptionsSupported()) return;
  function wrap(target, name, isBy) {
    var orig = target[name];
    if (typeof orig !== 'function') return;
    if (orig.__mtv) { note(name + '(options)'); return; } // already wrapped (page was restarted in place)
    var w = target[name] = function (a, b) {
      if (a !== null && typeof a === 'object') {
        var self = this === window || !this ? window : this;
        var isWin = self === window;
        var curX = isWin ? window.pageXOffset : self.scrollLeft;
        var curY = isWin ? window.pageYOffset : self.scrollTop;
        var x = typeof a.left === 'number' ? a.left : (isBy ? 0 : curX);
        var y = typeof a.top === 'number' ? a.top : (isBy ? 0 : curY);
        if (isNaN(x)) x = isBy ? 0 : curX;
        if (isNaN(y)) y = isBy ? 0 : curY;
        return orig.call(self, x, y);
      }
      if (arguments.length < 2) return orig.call(this, a || 0, 0);
      return orig.call(this, a, b);
    };
    w.__mtv = true;
    note(name + '(options)');
  }
  wrap(window, 'scrollTo', false);
  wrap(window, 'scroll', false);
  wrap(window, 'scrollBy', true);
  // Element.scrollTo/scrollBy only exist from Chrome 61.
  def(Element.prototype, 'scrollTo', function (a, b) {
    if (a !== null && typeof a === 'object') {
      if (typeof a.left === 'number') this.scrollLeft = a.left;
      if (typeof a.top === 'number') this.scrollTop = a.top;
    } else { this.scrollLeft = a || 0; this.scrollTop = b || 0; }
  });
  def(Element.prototype, 'scrollBy', function (a, b) {
    if (a !== null && typeof a === 'object') {
      this.scrollLeft += a.left || 0; this.scrollTop += a.top || 0;
    } else { this.scrollLeft += a || 0; this.scrollTop += b || 0; }
  });
  var siv = Element.prototype.scrollIntoView;
  if (typeof siv === 'function') {
    if (!siv.__mtv) {
      Element.prototype.scrollIntoView = function (arg) {
        if (arg !== null && typeof arg === 'object') return siv.call(this, arg.block !== 'end');
        return siv.apply(this, arguments);
      };
      Element.prototype.scrollIntoView.__mtv = true;
    }
    note('scrollIntoView(options)');
  }
}

function polyResizeObserver() {
  // Re-define ours after an in-place restart (its timer was cleared with the old page's timers).
  if (typeof window.ResizeObserver === 'function' && !window.ResizeObserver.__mtvPoly) return;
  // Minimal: polls observed elements' sizes (only while something is observed) and on window resize.
  var observers = [];
  var timer = null;
  function check() {
    for (var i = 0; i < observers.length; i++) observers[i]._check();
  }
  function ensureTimer() {
    if (!timer) {
      timer = setInterval(check, 500);
      window.addEventListener('resize', check);
    }
  }
  function RO(cb) { this._cb = cb; this._targets = []; }
  RO.prototype.observe = function (el) {
    for (var i = 0; i < this._targets.length; i++) if (this._targets[i].el === el) return;
    this._targets.push({ el: el, w: -1, h: -1 });
    if (observers.indexOf(this) < 0) observers.push(this);
    ensureTimer();
    var self = this;
    setTimeout(function () { self._check(); }, 0); // spec: initial notification
  };
  RO.prototype.unobserve = function (el) {
    this._targets = this._targets.filter(function (t) { return t.el !== el; });
  };
  RO.prototype.disconnect = function () {
    this._targets = [];
    var i = observers.indexOf(this);
    if (i >= 0) observers.splice(i, 1);
  };
  RO.prototype._check = function () {
    var entries = [];
    for (var i = 0; i < this._targets.length; i++) {
      var t = this._targets[i];
      var w = t.el.offsetWidth, h = t.el.offsetHeight;
      if (w !== t.w || h !== t.h) {
        t.w = w; t.h = h;
        entries.push({ target: t.el, contentRect: { x: 0, y: 0, top: 0, left: 0, width: w, height: h, right: w, bottom: h } });
      }
    }
    if (entries.length) {
      try { this._cb.call(this, entries, this); } catch (e) { dbg('error', 'ResizeObserver callback: ' + e); }
    }
  };
  RO.__mtvPoly = true;
  window.ResizeObserver = RO;
  note('ResizeObserver');
}

function polyBuiltins() {
  def(Object, 'values', function (o) { return Object.keys(o).map(function (k) { return o[k]; }); });
  def(Object, 'entries', function (o) { return Object.keys(o).map(function (k) { return [k, o[k]]; }); });
  def(Object, 'fromEntries', function (it) {
    var o = {};
    Array.prototype.forEach.call(Array.from(it), function (p) { o[p[0]] = p[1]; });
    return o;
  });
  def(Object, 'getOwnPropertyDescriptors', function (o) {
    var r = {};
    Object.getOwnPropertyNames(o).forEach(function (k) { r[k] = Object.getOwnPropertyDescriptor(o, k); });
    return r;
  });
  def(Array.prototype, 'flat', function (depth) {
    var d = depth === undefined ? 1 : Number(depth) || 0;
    var out = [];
    (function flat(arr, lvl) {
      for (var i = 0; i < arr.length; i++) {
        if (Array.isArray(arr[i]) && lvl > 0) flat(arr[i], lvl - 1); else out.push(arr[i]);
      }
    })(this, d);
    return out;
  });
  def(Array.prototype, 'flatMap', function (fn, thisArg) {
    return Array.prototype.flat.call(Array.prototype.map.call(this, fn, thisArg), 1);
  });
  def(String.prototype, 'padStart', function (len, pad) {
    var s = String(this); pad = pad === undefined ? ' ' : String(pad);
    if (s.length >= len || !pad) return s;
    var fill = ''; while (fill.length < len - s.length) fill += pad;
    return fill.slice(0, len - s.length) + s;
  });
  def(String.prototype, 'padEnd', function (len, pad) {
    var s = String(this); pad = pad === undefined ? ' ' : String(pad);
    if (s.length >= len || !pad) return s;
    var fill = ''; while (fill.length < len - s.length) fill += pad;
    return s + fill.slice(0, len - s.length);
  });
  if (window.Promise) {
    def(Promise.prototype, 'finally', function (fn) {
      var P = this.constructor || Promise;
      return this.then(
        function (v) { return P.resolve(fn()).then(function () { return v; }); },
        function (e) { return P.resolve(fn()).then(function () { throw e; }); }
      );
    });
  }
  function nodes(args) {
    var frag = document.createDocumentFragment();
    for (var i = 0; i < args.length; i++) {
      var a = args[i];
      frag.appendChild(a instanceof Node ? a : document.createTextNode(String(a)));
    }
    return frag;
  }
  [Element.prototype, Document.prototype, DocumentFragment.prototype].forEach(function (p) {
    def(p, 'append', function () { this.appendChild(nodes(arguments)); });
    def(p, 'prepend', function () { this.insertBefore(nodes(arguments), this.firstChild); });
  });
  [Element.prototype, CharacterData.prototype].forEach(function (p) {
    def(p, 'remove', function () { if (this.parentNode) this.parentNode.removeChild(this); });
    def(p, 'before', function () { if (this.parentNode) this.parentNode.insertBefore(nodes(arguments), this); });
    def(p, 'after', function () { if (this.parentNode) this.parentNode.insertBefore(nodes(arguments), this.nextSibling); });
    def(p, 'replaceWith', function () { if (this.parentNode) this.parentNode.replaceChild(nodes(arguments), this); });
  });
  if (window.NodeList) def(NodeList.prototype, 'forEach', Array.prototype.forEach);
  def(Element.prototype, 'matches', Element.prototype.webkitMatchesSelector);
  def(Element.prototype, 'closest', function (sel) {
    var el = this;
    while (el && el.nodeType === 1) { if (el.matches(sel)) return el; el = el.parentElement; }
    return null;
  });
  def(Element.prototype, 'toggleAttribute', function (n, force) {
    var has = this.hasAttribute(n);
    var want = force === undefined ? !has : !!force;
    if (want) this.setAttribute(n, ''); else this.removeAttribute(n);
    return want;
  });
  if (typeof window.globalThis === 'undefined') { try { window.globalThis = window; note('globalThis'); } catch (e) { /* ignore */ } }
}

export function installPolyfills() {
  var parts = [polyBuiltins, patchScroll, polyResizeObserver];
  for (var i = 0; i < parts.length; i++) {
    try { parts[i](); } catch (e) { dbg('error', 'polyfill failed: ' + e); }
  }
  if (filled.length) dbg('info', 'polyfilled: ' + filled.join(', '));
}
