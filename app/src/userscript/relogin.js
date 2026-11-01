// Silent re-login using the Met site's own login endpoint (the same request its login form sends).
// Rules: only on ondemand.metopera.org, at most one automatic attempt per MIN_GAP, exponential
// backoff on failures, stop entirely on "wrong password" until the user saves new credentials,
// and reload at most once per app session so we can never loop.
import { MIDDLEWARE, isMetOnDemand, lsGet, lsSet, lsDel, log } from './util';

var K_CREDS = 'mtv.creds';
var K_STATE = 'mtv.relogin';
var MIN_GAP = 5 * 60 * 1000;          // never auto-login more than once per 5 minutes
var BASE_BACKOFF = 10 * 60 * 1000;    // first failure: wait 10 minutes
var MAX_BACKOFF = 6 * 60 * 60 * 1000; // cap at 6 hours

var statusText = '';

// Obfuscation only (keeps the password out of plain sight in storage dumps). NOT encryption.
function enc(s) { return window.btoa(unescape(encodeURIComponent(s))).split('').reverse().join(''); }
function dec(s) { return decodeURIComponent(escape(window.atob(s.split('').reverse().join('')))); }

export function saveCreds(u, p) {
  lsSet(K_CREDS, { u: u, p: enc(p) });
  lsDel(K_STATE); // new credentials reset backoff / "bad password" state
}

export function getCreds() {
  var c = lsGet(K_CREDS, null);
  if (!c || !c.u || !c.p) return null;
  try { return { u: c.u, p: dec(c.p) }; } catch (e) { return null; }
}

export function clearCreds() { lsDel(K_CREDS); lsDel(K_STATE); }

export function getStatusText() { return statusText; }

function setStatus(t, cb) { statusText = t; log(t); if (cb) { try { cb(t); } catch (e) { log('status cb failed ' + e); } } }

function req(method, path, body, cb) {
  var x = new XMLHttpRequest();
  x.open(method, MIDDLEWARE + path, true);
  x.withCredentials = true;
  x.setRequestHeader('user-platform', 'Web');
  x.setRequestHeader('origin-hostname', window.location.hostname);
  if (body) x.setRequestHeader('Content-Type', 'application/json');
  x.timeout = 15000;
  x.onload = function () {
    var json = null;
    try { json = JSON.parse(x.responseText); } catch (e) { json = null; }
    cb(x.status, json);
  };
  x.onerror = x.ontimeout = function () { cb(0, null); };
  x.send(body ? JSON.stringify(body) : null);
}

// user_info returns the user object (with extId) when signed in; {data:{}} when signed out.
export function checkSignedIn(cb) {
  req('GET', '/user_info', null, function (status, json) {
    loginState.lastCheck = new Date().toLocaleTimeString();
    if (status !== 200 || !json) { loginState.signedIn = 'unknown (HTTP ' + status + ')'; cb(null); return; } // network/maintenance
    loginState.signedIn = json.extId ? 'yes' : 'no';
    cb(!!json.extId);
  });
}

function state() { return lsGet(K_STATE, { last: 0, fails: 0, next: 0, bad: false }); }

function recordFailure(st, status) {
  st.fails = (st.fails || 0) + 1;
  st.next = Date.now() + Math.min(MAX_BACKOFF, BASE_BACKOFF * Math.pow(2, st.fails - 1));
  if (status === 403 || status === 401) st.bad = true;
  lsSet(K_STATE, st);
}

function doLogin(creds, cb) {
  var st = state();
  st.last = Date.now();
  lsSet(K_STATE, st);
  req('POST', '/login', { username: creds.u, password: creds.p }, function (status, json) {
    if (status === 200 && !(json && json.error)) {
      lsSet(K_STATE, { last: Date.now(), fails: 0, next: 0, bad: false });
      cb(true, status);
    } else {
      recordFailure(st, status);
      cb(false, status, json);
    }
  });
}

// After a successful login, load the Met home page fresh so the React app picks up the session.
// Always the absolute https URL (never the local launcher, never a deep link) and at most once
// per 2 minutes so a misbehaving session can never cause a reload loop.
export var HOME_URL = 'https://ondemand.metopera.org/';
function reloadOnce() {
  var last = lsGet('mtv.lastReload', 0);
  if (Date.now() - last < 2 * 60 * 1000) { log('reload suppressed (recent reload)'); return false; }
  lsSet('mtv.lastReload', Date.now());
  window.location.replace(HOME_URL);
  return true;
}

export var loginState = { signedIn: 'unknown', lastCheck: null };

// force=true: user pressed "Save & sign in" (ignores backoff, still single request).
export function reloginNow(force, cb) {
  if (!isMetOnDemand()) { setStatus('Open Met Opera on Demand first.', cb); return; }
  var creds = getCreds();
  if (!creds) { setStatus('No saved account.', cb); return; }
  var st = state();
  var now = Date.now();
  if (!force) {
    if (st.bad) { setStatus('Saved password was rejected by the Met. Press RED to update it.', cb); return; }
    if (now < (st.next || 0)) { setStatus('Auto sign-in paused after an error; will retry later.', cb); return; }
    if (now - (st.last || 0) < MIN_GAP) { setStatus('Auto sign-in attempted recently; waiting.', cb); return; }
  }
  setStatus('Signing in to the Met\u2026', cb);
  doLogin(creds, function (ok, status, json) {
    // Result only (never the username/password or request body).
    try { if (window.MetTelemetry) window.MetTelemetry.lifecycle('login-attempt', { result: ok ? 'ok' : String(status || 'network'), forced: !!force }); } catch (e) { /* ignore */ }
    if (ok) {
      setStatus('Signed in. Reloading\u2026', cb);
      // The React app reads the session at start-up, so reload once to pick it up.
      setTimeout(function () { reloadOnce(); }, 600);
    } else if (status === 403 || status === 401) {
      setStatus('The Met rejected the username/password. Press RED to fix it.', cb);
    } else if (status === 429) {
      setStatus('Too many active Met sessions/devices. Will retry later.', cb);
    } else {
      setStatus('Sign-in failed (' + (status || 'network') + '). Will retry later.' + (json && json.error ? ' ' + json.error : ''), cb);
    }
  });
}

// Called once per page load. onNeedsCreds() is invoked when signed out with no saved account.
export function autoRelogin(onNeedsCreds, onStatus) {
  if (!isMetOnDemand()) return;
  checkSignedIn(function (signedIn) {
    if (signedIn === null) return;            // can't tell; do nothing
    if (signedIn) { setStatus('Signed in to the Met.'); return; }
    if (!getCreds()) { setStatus('Not signed in.'); if (onNeedsCreds) onNeedsCreds(); return; }
    reloginNow(false, onStatus);
  });
}
