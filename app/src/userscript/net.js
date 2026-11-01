// Small XHR helpers (callbacks only; Chromium 53 friendly). Never logs URLs with tokens.
import { MIDDLEWARE } from './util';

// Generic request. opts: {method, headers, body, json (parse), timeout, withCredentials, onprogress}
export function req(url, opts, cb) {
  opts = opts || {};
  var x = new XMLHttpRequest();
  var done = false, t0 = Date.now();
  function fin(err, status, data) { if (done) return; done = true; cb(err, data, status, Date.now() - t0, x); }
  try {
    x.open(opts.method || 'GET', url, true);
    if (opts.withCredentials) x.withCredentials = true;
    var h = opts.headers || {};
    for (var k in h) x.setRequestHeader(k, h[k]);
    x.timeout = opts.timeout || 30000;
    x.onload = function () {
      var s = x.status;
      if (s < 200 || s >= 300) return fin('HTTP ' + s, s, null);
      if (!opts.json) return fin(null, s, x.responseText);
      if (s === 204 || !x.responseText) return fin(null, s, null);
      try { fin(null, s, JSON.parse(x.responseText)); } catch (e) { fin('bad JSON', s, null); }
    };
    if (opts.onprogress) x.onprogress = function () { try { if (opts.onprogress(x) === false) { done = true; x.abort(); cb(null, null, x.status, Date.now() - t0, x, true); } } catch (e) { /* ignore */ } };
    x.onerror = function () { fin('network', 0, null); };
    x.ontimeout = function () { fin('timeout', 0, null); };
    x.send(opts.body === undefined ? null : opts.body);
  } catch (e) { fin(String(e && e.message || e), 0, null); }
  return x;
}

// The Met's middleware, called exactly like the site's own React app does.
export function mw(method, path, body, cb, extra) {
  var headers = { 'user-platform': 'Web', 'origin-hostname': window.location.hostname };
  if (body !== undefined && body !== null) headers['Content-Type'] = 'application/json';
  var o = { method: method, headers: headers, withCredentials: true, json: true, timeout: 30000,
    body: body !== undefined && body !== null ? JSON.stringify(body) : undefined };
  if (extra) for (var k in extra) o[k] = extra[k];
  return req(MIDDLEWARE + path, o, cb);
}
