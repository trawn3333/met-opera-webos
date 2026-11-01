// On-screen settings: Met credentials for auto re-login, text size, optional speed-ups (off by default).
// Opened with the RED remote button (or automatically on first run when signed out).
import { tlm, tlmEnabled, tlmSetEnabled } from './tlm';
import { lsGet, lsSet } from './util';
import { focusFirst } from './spatialNav';
import { saveCreds, getCreds, clearCreds, reloginNow, getStatusText } from './relogin';
import { applyTextSize } from './tvStyle';
import { reportProblem } from './report';

var panel = null;
var lastFocus = null;

function build() {
  panel = document.createElement('div');
  panel.className = 'mtv-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.innerHTML =
    '<div class="mtv-panel-box">' +
    '<h2>Met Opera TV settings</h2>' +
    '<p class="mtv-small">Your Met account is saved on this TV only, so the app can sign you back in when the Met session expires. ' +
    'It is stored in the TV browser storage (obfuscated, <b>not encrypted</b>).</p>' +
    '<label>Met username / email<input type="email" name="mtv-user" autocomplete="username" spellcheck="false"></label>' +
    '<label>Met password<input type="password" name="mtv-pass" autocomplete="current-password"></label>' +
    '<div class="mtv-row">' +
    '<button type="button" data-act="save">Save &amp; sign in</button>' +
    '<button type="button" data-act="clear">Forget account</button>' +
    '</div>' +
    '<div class="mtv-row">' +
    '<button type="button" data-act="text">Text size: <span class="mtv-text-val"></span></button>' +
    '<button type="button" data-act="perf">Speed-ups: <span class="mtv-perf-val"></span></button>' +
    '<button type="button" data-act="tlm">Send diagnostics: <span class="mtv-tlm-val"></span></button>' +
    '</div>' +
    '<p class="mtv-status" aria-live="polite"></p>' +
    '<div class="mtv-row"><button type="button" data-act="close">Close</button><button type="button" data-act="report">Report a problem</button></div>' +
    '<p class="mtv-small">RED settings &middot; GREEN debug log (hold 1&nbsp;s: report a problem) &middot; YELLOW menu &middot; BACK back / hide player controls &middot; in the player: OK play/pause, \u25C0\u25B6 seek</p>' +
    '</div>';
  document.body.appendChild(panel);
  panel.addEventListener('click', onClick);
  panel.addEventListener('keydown', function (e) {
    // Enter inside the password field submits.
    if (e.keyCode === 13 && e.target && e.target.name === 'mtv-pass') { e.preventDefault(); save(); }
  });
}

function refresh() {
  var c = getCreds();
  var u = panel.querySelector('input[name="mtv-user"]');
  if (c && !u.value) u.value = c.u;
  panel.querySelector('.mtv-text-val').textContent = lsGet('mtv.textSize', 115) + '%';
  panel.querySelector('.mtv-perf-val').textContent = lsGet('mtv.lite', false) ? 'on' : 'off';
  panel.querySelector('.mtv-tlm-val').textContent = tlmEnabled() ? 'on' : 'off';
  setStatus(getStatusText());
}

export function setStatus(text) {
  if (panel) panel.querySelector('.mtv-status').textContent = text || '';
}

function save() {
  var u = panel.querySelector('input[name="mtv-user"]').value.replace(/^\s+|\s+$/g, '');
  var p = panel.querySelector('input[name="mtv-pass"]').value;
  if (!u || !p) { setStatus('Enter both username and password.'); return; }
  saveCreds(u, p);
  panel.querySelector('input[name="mtv-pass"]').value = '';
  setStatus('Signing in\u2026');
  reloginNow(true, function (msg) { setStatus(msg); });
}

function onClick(e) {
  var btn = e.target;
  while (btn && btn !== panel && !btn.getAttribute('data-act')) btn = btn.parentElement;
  if (!btn || btn === panel) return;
  var act = btn.getAttribute('data-act');
  if (act === 'save') save();
  else if (act === 'clear') { clearCreds(); panel.querySelector('input[name="mtv-user"]').value = ''; setStatus('Saved account removed from this TV.'); }
  else if (act === 'close') close();
  else if (act === 'report') { close(); setTimeout(function () { reportProblem('settings'); }, 100); }
  else if (act === 'text') {
    var sizes = [100, 115, 130];
    var cur = lsGet('mtv.textSize', 115);
    var next = sizes[(sizes.indexOf(cur) + 1) % sizes.length];
    lsSet('mtv.textSize', next);
    applyTextSize(next);
    refresh();
  } else if (act === 'tlm') {
    var on = !tlmEnabled();
    if (!on) tlm('telemetry-off', {});
    tlmSetEnabled(on);
    if (on) tlm('telemetry-on', {});
    refresh();
    setStatus(on ? 'Diagnostics (errors, app events, no account data) will be sent to help fix problems.' : 'Diagnostics sending is off.');
  } else if (act === 'perf') {
    lsSet('mtv.lite', !lsGet('mtv.lite', false));
    refresh();
    setStatus('Speed-ups (lazy tile images, shorter transitions) apply after the app restarts.');
  }
}

export function isOpen() {
  return !!panel && panel.classList.contains('mtv-open');
}

export function open() {
  if (!panel || !document.documentElement.contains(panel)) build();
  lastFocus = document.activeElement;
  refresh();
  panel.classList.add('mtv-open');
  focusFirst(panel);
}

export function close() {
  if (!panel) return;
  panel.classList.remove('mtv-open');
  lsSet('mtv.panelSeen', true);
  if (lastFocus && lastFocus.focus) { try { lastFocus.focus(); } catch (e) { /* ignore */ } }
}

export function toggle() { if (isOpen()) close(); else open(); }

