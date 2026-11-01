// 1.3.2 end-to-end (1.3.0 suite + scene jumps, coarse scrub, remembered controls button, Cast) on the REAL Met site, signed in (current Google Chrome, 1920x1080).
// Account safety: POST /client/event (progress sync) is answered locally (and counted); every other
// non-GET to the Met middleware is blocked, so nothing in Matt's account can change.
// Credentials: env only, in memory (mtv.creds getItem stub for the snapshot privacy check).
// Usage: node tools/test-130.js [outdir]
const puppeteer = require('puppeteer-core');
const fs = require('fs'), path = require('path');
const { metLogin, metSignedIn } = require('./met-session');
const OUT = '/workspace/met/promo/raw';
const SCRIPT = fs.readFileSync(path.join(__dirname, '../dist/webOSUserScripts/userScript.js'), 'utf8');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const VER = require('../package.json').version;
const results = [];
const check = (n, ok, info) => { results.push({ n, ok: !!ok }); console.log((ok ? 'PASS ' : 'FAIL ') + n + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 500) : '')); };
const enc = (s) => Buffer.from(unescape(encodeURIComponent(s)), 'binary').toString('base64').split('').reverse().join('');
const SHOTS = process.env.SHOTS !== '0';

(async () => {
  const U = process.env.MET_OD_EMAIL, P = process.env.MET_OD_PASSWORD;
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', userDataDir: '/tmp/met-profile-current',
    args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--hide-scrollbars'], defaultViewport: { width: 1920, height: 1080 } });
  const p = await b.newPage();
  const blocked = [], events = [], errors = [];
  p.on('pageerror', (e) => errors.push(String(e.message || e).slice(0, 200)));
  await p.setRequestInterception(true);
  p.on('request', (r) => {
    const u = r.url(), m = r.method();
    if (/middleware\.ondemand\.metopera\.org/.test(u) && m !== 'GET' && m !== 'OPTIONS') {
      const H = { 'Access-Control-Allow-Origin': 'https://ondemand.metopera.org', 'Access-Control-Allow-Credentials': 'true' };
      if (/\/client\/event/.test(u)) { try { events.push(JSON.parse(r.postData()).eventType); } catch (e) { events.push('?'); } return r.respond({ status: 200, contentType: 'application/json', headers: H, body: '{}' }); }
      if (/\/client\/login$/.test(u) && r.headers()['x-mtv-test'] === '1') return r.continue();
      blocked.push(m + ' ' + u.split('?')[0].replace(/.*\/client/, '/client'));
      return r.respond({ status: 403, contentType: 'application/json', headers: H, body: '{"blocked":"test"}' });
    }
    r.continue();
  });
  await p.evaluateOnNewDocument((u, pw) => {
    const orig = Storage.prototype.getItem;
    const val = u && pw ? JSON.stringify({ u: u, p: pw }) : null;
    Storage.prototype.getItem = function (k) { return k === 'mtv.creds' && this === window.localStorage ? val : orig.call(this, k); };
    try { localStorage.setItem('mtv.tlm.device', 'e2e-test-130'); localStorage.setItem('mtv.panelSeen', 'true'); localStorage.setItem('mtv.hintShown', '1'); localStorage.removeItem('mtv.autoReports'); } catch (e) { /* */ }
  }, U, P ? enc(P) : null);
  const leavePlay = async () => { for (let i = 0; i < 4; i++) { await key(461, 700); if (await p.evaluate(() => window.__mtv.mode()) !== 'play') return i + 1; } return -1; };
  const shot = async (n) => { if (!SHOTS) return; await sleep(700); const f = path.join(OUT, 'v' + VER + '_' + n + '.png'); await p.screenshot({ path: f }); console.log('shot', f); };
  const key = async (k, wait = 250) => { await p.evaluate((kc) => { ['keydown', 'keyup'].forEach((ty) => { const e = document.createEvent('Event'); e.initEvent(ty, true, true); Object.defineProperty(e, 'keyCode', { get: () => kc }); (document.activeElement || document.body).dispatchEvent(e); }); }, k); await sleep(wait); };
  const st = () => p.evaluate(() => ({ mode: window.__mtv.mode(), cls: document.documentElement.className, cat: window.__mtv.categories.debugState(), search: window.__mtv.search.debugState(),
    eng: window.__mtv.engine.engineState(), active: (document.activeElement && (document.activeElement.className || document.activeElement.tagName) + '').slice(0, 60), metChrome: window.__mtv.metChrome() }));

  const sel = async () => p.evaluate(() => [].findIndex.call(document.querySelectorAll('.mtv-po-btn'), (b) => b.classList.contains('mtv-sel')));
  const goBtn = async (x) => p.evaluate((l) => [].findIndex.call(document.querySelectorAll('.mtv-po-btn'), (b) => b.querySelector('span').textContent === l), x);
  const moveTo = async (label) => { const want = await goBtn(label); let cur = await sel(); while (cur !== want && cur >= 0) { await key(cur < want ? 39 : 37, 80); cur = await sel(); } };

  await p.goto('https://ondemand.metopera.org/', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await sleep(4000);
  let signed = await metSignedIn(p);
  if (!signed && U && P) { console.log('signing in (status only):', await metLogin(p)); await p.reload({ waitUntil: 'domcontentloaded' }); await sleep(4000); signed = await metSignedIn(p); }
  console.log('signed', signed);
  await p.addScriptTag({ content: SCRIPT });
  await p.waitForFunction(() => document.documentElement.classList.contains('mtv-ready') && document.querySelector('.mtv-hcard'), { timeout: 20000 });
  await sleep(6000);
  // personal history: drop "Continue watching" / "Because you watched" rows and any continue-watching hero cards from the capture
  const scrub = () => p.evaluate(() => {
    [].forEach.call(document.querySelectorAll('.mtv-cat .mtv-crow'), (r) => { const h = r.querySelector('h2'); if (h && /Continue watching|Because you watched/i.test(h.textContent)) r.remove(); });
    const t = document.querySelector('.mtv-toast'); if (t) t.style.display = 'none';
  });
  const snap = async (n) => { await sleep(900); await p.screenshot({ path: path.join(OUT, n + '.png') }); console.log('shot', n); };
  const info = () => p.evaluate(() => ({ hero: (document.querySelector('.mtv-hero-lab') || {}).textContent + ' | ' + (document.querySelector('.mtv-hero-txt h1') || {}).textContent, rows: [].map.call(document.querySelectorAll('.mtv-cat .mtv-crow h2'), (x) => x.textContent).slice(0, 6) }));
  const loadAll = () => p.evaluate(() => { [].forEach.call(document.querySelectorAll('.mtv-cat img[data-src]'), (i) => { if (!i.getAttribute('src')) i.setAttribute('src', i.getAttribute('data-src')); }); });
  await p.evaluate(() => window.__mtv.categories.focusCurrent());
  await sleep(1000);
  for (let i = 0; i < 8; i++) await key(37, 150);
  for (const idx of [0, 2, 3, 6]) {
    for (let i = 0; i < 8; i++) await key(37, 100);
    for (let i = 0; i < idx; i++) await key(39, 200);
    await sleep(1500);
    const lab = await p.evaluate(() => (document.querySelector('.mtv-hero-lab') || {}).textContent);
    console.log('hero', idx, lab);
    if (/continue|because/i.test(lab)) continue;
    await scrub(); await loadAll(); await sleep(2500);
    await snap('1-browse-hero' + idx);
  }
  // scene-jump toasts on brighter scenes
  await p.evaluate(() => window.__mtv.play('19a5ae2a-7d68-5175-bc14-3a295ab3f618', { title: 'Idomeneo', from: 'promo' }));
  await p.waitForFunction(() => { const e = window.__mtv.engine.engineState(); return e && e.phase === 'playing'; }, { timeout: 60000 });
  for (const t of [1700, 6190, 5890, 9630, 3440]) {
    await p.evaluate((tt) => { window.__mtv.player.hide(); window.__mtv.engine.getVideoEl().currentTime = tt; }, t);
    await sleep(4000);
    await key(39, 300);
    await p.waitForFunction(() => window.__mtv.engine.getVideoEl().readyState >= 3, { timeout: 30000 }).catch(() => {});
    await sleep(1200);
    await p.screenshot({ path: path.join(OUT, '5-toast-' + t + '.png') }); console.log('shot toast', t);
    await sleep(3500);
  }
  await leavePlay();
  console.log('blocked', blocked.length, 'errors', errors.length);
  await b.close();
})().catch((e) => { console.error(e); process.exit(2); });
