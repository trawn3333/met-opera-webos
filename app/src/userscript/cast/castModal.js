// 1.3.2: full-screen Cast sheet for the title page (one performance). Same item builder as the player's
// Cast panel (no scene info here: the title page has no position). Keys: UP/DOWN scroll, OK/BACK close.
import { castItems, fromCompact } from './cast';
import { KEY } from '../keys';

var el = null, listEl = null, open = false, sel = 0, items = [], prevFocus = null;
function esc(s) { return String(s === undefined || s === null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

export function isOpen() { return open; }
export function openCast(opera, perf, heading) {
  if (!el) {
    el = document.createElement('div');
    el.className = 'mtv-castsheet';
    document.body.appendChild(el);
  }
  var cast = fromCompact(opera, perf.roles || [], perf.cond);
  items = castItems(cast, null);
  sel = 0;
  var h = '<div class="mtv-castsheet-box"><div class="mtv-castsheet-k">Cast &amp; roles</div><h2>' + esc(opera) + '</h2><div class="mtv-castsheet-s">' + esc(heading || '') + '</div>';
  if (!cast.roles.length) h += '<p class="mtv-castsheet-none">The Met lists no roles for this performance' + (perf.cast ? ' (singers: ' + esc(perf.cast) + ')' : '') + '.</p>';
  h += '<div class="mtv-castsheet-list">';
  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    h += (it.head ? '<h4>' + esc(it.head) + '</h4>' : '') + '<div class="mtv-castsheet-i" data-i="' + i + '"><b>' + esc(it.label) +
      (it.trouser ? ' <i class="mtv-trouser">trouser role</i>' : '') + '</b>' + (it.sub ? '<span>' + esc(it.sub) + '</span>' : '') + (it.note ? '<em>' + esc(it.note) + '</em>' : '') + '</div>';
  }
  h += '</div><div class="mtv-castsheet-f">Roles and singers from the Met\u2019s performance data \u00b7 voice types and trouser-role notes from a curated list \u00b7 \u25B2\u25BC scroll \u00b7 OK / BACK close</div></div>';
  el.innerHTML = h;
  listEl = el.querySelector('.mtv-castsheet-list');
  el.className = 'mtv-castsheet mtv-open';
  open = true;
  prevFocus = document.activeElement;
  paint();
}
function paint() {
  var rows = el.querySelectorAll('.mtv-castsheet-i');
  for (var i = 0; i < rows.length; i++) rows[i].classList.toggle('mtv-sel', i === sel);
  var cur = rows[sel];
  if (cur && listEl) listEl.scrollTop = Math.max(0, cur.offsetTop - listEl.clientHeight / 2);
}
export function close() {
  if (!open) return;
  open = false;
  el.className = 'mtv-castsheet';
  el.innerHTML = '';
  if (prevFocus && prevFocus.focus) try { prevFocus.focus(); } catch (e) { /* ignore */ }
}
export function handleKey(k) {
  if (!open) return false;
  if (k === KEY.DOWN) { sel = Math.min(items.length - 1, sel + 1); paint(); }
  else if (k === KEY.UP) { sel = Math.max(0, sel - 1); paint(); }
  else if (k === KEY.ENTER || k === KEY.BACK || k === KEY.ESC || k === KEY.BACKSPACE) close();
  return true;
}
export function debugState() { return open ? { items: items.map(function (x) { return [x.label, x.sub || '', x.trouser ? 1 : 0]; }) } : null; }
