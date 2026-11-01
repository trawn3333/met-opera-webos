// Signs in to Met Opera on Demand inside a test page using the SAME request the Met's login form sends
// (POST /client/login), reading credentials from env MET_OD_EMAIL / MET_OD_PASSWORD.
// The values are passed straight into the page and are never printed, logged or written anywhere.
// Returns only an HTTP status (number).
async function metLogin(page) {
  const u = process.env.MET_OD_EMAIL, p = process.env.MET_OD_PASSWORD;
  if (!u || !p) return -1;
  return page.evaluate((a, b) => new Promise((res) => {
    const x = new XMLHttpRequest();
    x.open('POST', 'https://middleware.ondemand.metopera.org/client/login', true);
    x.withCredentials = true;
    x.setRequestHeader('user-platform', 'Web');
    x.setRequestHeader('origin-hostname', location.hostname);
    x.setRequestHeader('Content-Type', 'application/json');
    x.onload = () => res(x.status); x.onerror = () => res(0);
    x.send(JSON.stringify({ username: a, password: b }));
  }), u, p);
}
async function metSignedIn(page) {
  return page.evaluate(() => new Promise((res) => {
    const x = new XMLHttpRequest();
    x.open('GET', 'https://middleware.ondemand.metopera.org/client/user_info', true);
    x.withCredentials = true; x.setRequestHeader('user-platform', 'Web'); x.setRequestHeader('origin-hostname', location.hostname);
    x.onload = () => { let j = null; try { j = JSON.parse(x.responseText); } catch (e) { /* */ } res(!!(j && j.extId)); };
    x.onerror = () => res(false); x.send();
  }));
}
// CSS that hides personal account details (name/email) in screenshots.
const MASK_CSS = '.nav-utility-link-account, .nav-utility-item .user-name, [class*="Account"] [class*="name"], [class*="greeting"] { visibility: hidden !important; }';
// Same calls as plain function sources for raw-CDP drivers (args passed in memory only).
const metLoginSrc = {
  login: `function (a, b) { return new Promise(function (res) { var x = new XMLHttpRequest(); x.open('POST', 'https://middleware.ondemand.metopera.org/client/login', true); x.withCredentials = true;
    x.setRequestHeader('user-platform', 'Web'); x.setRequestHeader('origin-hostname', location.hostname); x.setRequestHeader('Content-Type', 'application/json');
    x.onload = function () { res(x.status); }; x.onerror = function () { res(0); }; x.send(JSON.stringify({ username: a, password: b })); }); }`,
  signedIn: `function () { return new Promise(function (res) { var x = new XMLHttpRequest(); x.open('GET', 'https://middleware.ondemand.metopera.org/client/user_info', true); x.withCredentials = true;
    x.setRequestHeader('user-platform', 'Web'); x.setRequestHeader('origin-hostname', location.hostname);
    x.onload = function () { var j = null; try { j = JSON.parse(x.responseText); } catch (e) {} res(!!(j && j.extId)); }; x.onerror = function () { res(false); }; x.send(); }); }`
};
module.exports = { metLogin, metSignedIn, MASK_CSS, metLoginSrc };
