import css from './tv.css';
import liteCss from './lite.css';
import navCss from './nav.css';
import { addStyle } from './util';

var textStyle = null;
var injected = [];

export function applyTextSize(pct) {
  if (!textStyle) { textStyle = addStyle('', 'mtv-text-size'); injected.push(textStyle); }
  // rem-based Met styles scale with the root font size. 100 = site default.
  textStyle.textContent = pct && pct !== 100 ? 'html.mtv:not(.mtv-fs){font-size:' + pct + '% !important}' : '';
}

function supports(prop, val) {
  try { return !!(window.CSS && window.CSS.supports && window.CSS.supports(prop, val)); } catch (e) { return false; }
}

export function injectStyles(lite) {
  document.documentElement.classList.add('mtv');
  injected.push(addStyle(css, 'mtv-style'));
  injected.push(addStyle(navCss, 'mtv-nav-style'));
  if (lite) {
    document.documentElement.classList.add('mtv-lite');
    var extra = '';
    // Layout containment only where the engine supports it (Chromium 52+), feature-detected.
    if (supports('contain', 'layout style')) extra += 'html.mtv-lite .Tile{contain:layout style}';
    injected.push(addStyle(liteCss + extra, 'mtv-lite-style'));
  }
}

// Used by safe mode / watchdog: strip everything we added visually.
export function removeStyles() {
  injected.forEach(function (s) { if (s && s.parentNode) s.parentNode.removeChild(s); });
  injected = [];
  textStyle = null;
  var h = document.documentElement;
  ['mtv', 'mtv-lite', 'mtv-fs'].forEach(function (c) { h.classList.remove(c); });
  ['mtv-has-bar', 'mtv-cat-open'].forEach(function (c) { h.classList.remove(c); });
  var ov = document.querySelectorAll('.mtv-panel, .mtv-exit, .mtv-toast, .mtv-bar, .mtv-cat');
  for (var i = 0; i < ov.length; i++) ov[i].parentNode.removeChild(ov[i]);
}
