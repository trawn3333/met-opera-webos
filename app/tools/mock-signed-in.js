// Early-injected test shim: pretends the Met middleware says "signed in" (no real login, nothing sent).
(function () {
  var USER = { extId: 'mock-0001', firstName: 'Matt', lastName: 'Preview', email: 'preview@example.invalid', data: { user_type: 'subscriber' }, subscriptions: [{ status: 'active' }], favorites: [] };
  var hit = function (u) { u = String(u); return /middleware\.ondemand\.metopera\.org\/client\/(user_info|authorization)/.test(u); };
  var body = function (u) { return /authorization/.test(String(u)) ? { authorized: true } : USER; };
  var of = window.fetch;
  window.fetch = function (input, init) {
    var u = typeof input === 'string' ? input : input && input.url;
    if (hit(u)) return Promise.resolve(new Response(JSON.stringify(body(u)), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    return of.apply(this, arguments);
  };
  var XO = XMLHttpRequest.prototype.open, XS = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (m, u) { this.__mockUrl = hit(u) ? u : null; return XO.apply(this, arguments); };
  XMLHttpRequest.prototype.send = function () {
    if (!this.__mockUrl) return XS.apply(this, arguments);
    var x = this, txt = JSON.stringify(body(this.__mockUrl));
    Object.defineProperty(x, 'readyState', { get: function () { return 4; } });
    Object.defineProperty(x, 'status', { get: function () { return 200; } });
    Object.defineProperty(x, 'responseText', { get: function () { return txt; } });
    Object.defineProperty(x, 'response', { get: function () { return txt; } });
    setTimeout(function () { if (x.onreadystatechange) x.onreadystatechange(); if (x.onload) x.onload(); }, 30);
  };
})();
