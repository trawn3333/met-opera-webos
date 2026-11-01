// On-box test harness: loads the live Met site in headless Chrome, injects dist/webOSUserScripts/userScript.js,
// and checks styles, spatial nav, keys, panel, full-screen player and re-login backoff.
// NO real logins: /client/login is intercepted and answered locally with a fake 403.
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const SCRIPT = fs.readFileSync(path.join(__dirname, '../dist/webOSUserScripts/userScript.js'), 'utf8');
const HOME = 'https://ondemand.metopera.org/';
const PERF = 'https://ondemand.metopera.org/performance/detail/c49458c3-8205-5903-9bc7-ab37885d542c';
const results = [];
function check(name, ok, info) { results.push({ name, ok: !!ok, info }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (info !== undefined ? '  ' + JSON.stringify(info) : '')); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function sendKey(page, keyCode) {
  await page.evaluate((k) => {
    const t = document.activeElement || document.body;
    const ev = new KeyboardEvent('keydown', { bubbles: true, cancelable: true });
    Object.defineProperty(ev, 'keyCode', { get: () => k });
    Object.defineProperty(ev, 'which', { get: () => k });
    t.dispatchEvent(ev);
  }, keyCode);
  await sleep(150);
}

async function newPage(browser, { loginStatus = 403, preset = null, mockSignedIn = null, blockMain = false } = {}) {
  const blockMainFn = typeof blockMain === 'function' ? blockMain : () => blockMain;
  const ctxB = await browser.createBrowserContext(); // isolated localStorage per scenario
  const page = await ctxB.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  const errors = [];
  const loginPosts = [];
  page.on('pageerror', (e) => errors.push(String(e.message || e).slice(0, 200)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 200)); });
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    if (/middleware\.ondemand\.metopera\.org\/client\/login/.test(req.url()) && req.method() !== 'OPTIONS') {
      loginPosts.push(req.postData());
      return req.respond({ status: loginStatus, contentType: 'application/json',
        headers: { 'access-control-allow-origin': 'https://ondemand.metopera.org', 'access-control-allow-credentials': 'true' },
        body: JSON.stringify(loginStatus === 200 ? { extId: 'mock-123', firstName: 'Test' } : { status: loginStatus, error: 'fake response from test harness' }) });
    }
    if (blockMainFn() && /\/static\/js\/main\.[^/]*\.js/.test(req.url())) return req.abort();
    if (mockSignedIn && /middleware\.ondemand\.metopera\.org\/client\/user_info/.test(req.url()) && req.method() !== 'OPTIONS' && mockSignedIn()) {
      return req.respond({ status: 200, contentType: 'application/json',
        headers: { 'access-control-allow-origin': 'https://ondemand.metopera.org', 'access-control-allow-credentials': 'true' },
        body: JSON.stringify({ extId: 'mock-123', firstName: 'Test', events: [], cart: [], isVIP: false, user_type: 'subscriber', data: { user_type: 'subscriber' } }) });
    }
    req.continue();
  });
  // Stub window.close so "exit" can be observed.
  await page.evaluateOnNewDocument((preset) => {
    window.close = () => { window.__closed = true; };
    // Telemetry OFF in every scenario except the dedicated telemetry test (which uses a test-* device id).
    if (!(preset && preset['mtv.tlm.device'])) localStorage.setItem('mtv.tlm.off', '1');
    if (preset) for (const k in preset) localStorage.setItem(k, preset[k]);
  }, preset);
  return { page, errors, loginPosts };
}

// Simulate webOS WAM: user scripts are executed when the document finishes loading.
async function gotoAndInject(page, url) {
  await page.goto(url, { waitUntil: 'load', timeout: 90000 });
  await page.addScriptTag({ content: SCRIPT });
}

(async () => {
  const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });

  // ---------- Home page ----------
  {
    const { page, errors, loginPosts } = await newPage(browser);
    await gotoAndInject(page, HOME);
    await page.waitForSelector('.Tile', { timeout: 30000 }).catch(() => {});
    await sleep(2500);
    const st = await page.evaluate(() => ({
      mtv: document.documentElement.classList.contains('mtv'),
      lite: document.documentElement.classList.contains('mtv-lite'),
      footerHidden: getComputedStyle(document.querySelector('.footer') || document.body).display === 'none',
      donateHidden: !document.querySelector('.nav-utility-link-donate') || getComputedStyle(document.querySelector('.nav-utility-link-donate')).display === 'none',
      rootFont: getComputedStyle(document.documentElement).fontSize,
      transition: getComputedStyle(document.querySelector('.Tile') || document.body).transitionDuration,
      panelOpen: !!document.querySelector('.mtv-panel.mtv-open'),
      tiles: document.querySelectorAll('.Tile').length
    }));
    check('TV styles injected, speed-ups OFF by default (no mtv-lite)', st.mtv && !st.lite, st);
    check('clutter hidden (footer, donate)', st.footerHidden && st.donateHidden);
    check('site transitions untouched by default', !/^0\.01s/.test(st.transition), st.transition);
    const untouched = await page.evaluate(() => {
      const nat = (f) => /\[native code\]/.test(Function.prototype.toString.call(f));
      const d = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
      return { appendChild: nat(Node.prototype.appendChild), insertBefore: nat(Node.prototype.insertBefore), setAttribute: nat(Element.prototype.setAttribute),
        imgSrc: nat(d.set),
        // 1.2.0: fetch/XHR may carry a passive, pass-through error recorder (flagged __mtvNet) for problem reports; anything else is interception
        fetch: nat(window.fetch) || !!window.fetch.__mtvNet, xhrOpen: nat(XMLHttpRequest.prototype.open) || !!XMLHttpRequest.prototype.__mtvNet,
        xhrSend: nat(XMLHttpRequest.prototype.send) || !!XMLHttpRequest.prototype.__mtvNet, paq: typeof window._paq };
    });
    check('no request/script interception: DOM insert, img src native; fetch/XHR native or passive recorder only', untouched.appendChild && untouched.insertBefore && untouched.setAttribute && untouched.imgSrc && untouched.fetch && untouched.xhrOpen && untouched.xhrSend, untouched);
    check('first-run settings panel auto-opens when signed out with no saved account', st.panelOpen);
    check('no login request made without saved credentials', loginPosts.length === 0, loginPosts.length);

    // Panel: spatial nav stays inside it, BACK closes it.
    const inPanel = await page.evaluate(() => !!document.activeElement.closest('.mtv-panel'));
    check('focus moved into settings panel', inPanel);
    await sendKey(page, 40); await sendKey(page, 40);
    const stillInPanel = await page.evaluate(() => !!document.activeElement.closest('.mtv-panel'));
    check('arrow keys stay scoped inside panel', stillInPanel);
    await sendKey(page, 461);
    check('BACK closes the panel', !(await page.evaluate(() => !!document.querySelector('.mtv-panel.mtv-open'))));

    // Spatial navigation on the page.
    const cand = await page.evaluate(() => {
      const sel = 'a[href],button:not([disabled]),[tabindex]:not([tabindex="-1"])';
      return [...document.querySelectorAll(sel)].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 1 && r.height > 1; }).length;
    });
    check('focusable elements found', cand > 10, cand);
    const trail = [];
    await page.evaluate(() => window.__mtv.focusFirst());
    for (const k of [40, 40, 40, 39, 39, 40, 37, 38]) {
      await sendKey(page, k);
      trail.push(await page.evaluate(() => {
        const a = document.activeElement; const r = a.getBoundingClientRect();
        return { tag: a.tagName, cls: String(a.className).slice(0, 40), text: (a.textContent || '').trim().slice(0, 30), inView: r.top >= 0 && r.bottom <= innerHeight, tileMarked: !!document.querySelector('.mtv-tile-focus') };
      }));
    }
    const moved = new Set(trail.map((t) => t.tag + t.cls + t.text)).size;
    check('arrow keys move focus between distinct elements', moved >= 4, moved);
    check('focused element is scrolled into view each time', trail.every((t) => t.inView), trail.map((t) => t.inView));
    check('tile highlight applied when a tile button is focused', trail.some((t) => t.tileMarked));
    const ring = await page.evaluate(() => getComputedStyle(document.activeElement).outlineWidth);
    check('focus ring is 4px', ring === '4px', ring);
    console.log('    focus trail:', trail.map((t) => `${t.tag}:${t.text || t.cls}`).join(' -> '));

    // RED opens panel
    await sendKey(page, 403);
    check('RED (403) opens settings panel', await page.evaluate(() => !!document.querySelector('.mtv-panel.mtv-open')));
    await sendKey(page, 461);

    // BACK at home -> exit confirmation, BACK again -> exit
    await page.evaluate(() => window.scrollTo(0, 0));
    await sendKey(page, 461);
    check('BACK at home shows exit confirmation', await page.evaluate(() => !!document.querySelector('.mtv-exit.mtv-open')));
    await sendKey(page, 461);
    check('second BACK exits app (window.close called)', await page.evaluate(() => !!window.__closed));

    check('no page errors with userscript', errors.length === 0, errors.slice(0, 5));
    await page.close();
  }

  // ---------- Optional speed-ups (opt-in) ----------
  {
    const { page } = await newPage(browser, { preset: { 'mtv.panelSeen': 'true', 'mtv.hintShown': '1', 'mtv.cfgVer': '2', 'mtv.lite': 'true' } });
    await gotoAndInject(page, HOME);
    await page.waitForSelector('.Tile', { timeout: 30000 }).catch(() => {});
    await sleep(1500);
    const lt = await page.evaluate(() => ({ lite: document.documentElement.classList.contains('mtv-lite'), transition: getComputedStyle(document.querySelector('.Tile') || document.body).transitionDuration }));
    check('speed-ups opt-in: mtv-lite + 0.01s transitions when enabled', lt.lite && /^0\.01s/.test(lt.transition), lt);
    // images present before injection are already loaded (WAM injects after load); verify that new grid images get deferred
    const stats = await page.evaluate(async () => {
      const g = document.querySelector('.Grid') || document.body;
      const img = document.createElement('img');
      img.style.cssText = 'position:absolute;top:20000px';
      g.appendChild(img);
      img.src = 'https://cdn.ondemand.metopera.org/test-deferral.jpg';
      await new Promise((r) => setTimeout(r, 300));
      const s = window.__mtv.perfStats(); s.testImgDeferred = !img.getAttribute('src'); img.remove(); return s;
    });
    check('speed-ups opt-in: grid images deferred via IntersectionObserver', stats.deferred > 0 && stats.testImgDeferred, stats);
    await page.close();
  }

  // ---------- Performance page / player ----------
  {
    const { page, errors } = await newPage(browser, { preset: { 'mtv.panelSeen': 'true', 'mtv.hintShown': '1' } });
    await gotoAndInject(page, PERF);
    await page.waitForSelector('.Player video', { timeout: 30000 }).catch(() => {});
    await sleep(3000);
    check('Met player present', await page.evaluate(() => !!document.querySelector('.Player video')));
    const pf = await page.evaluate(() => { const a = document.activeElement; return { inPlayer: !!(a && a.closest && a.closest('.Player')), el: a ? a.tagName + '.' + String(a.className).slice(0, 50) + ' ' + (a.textContent || '').trim().slice(0, 30) : null }; });
    check('title page: initial focus on Play (inside the Met player), not the logo', pf.inPlayer && /play/i.test(pf.el), pf);
    await page.evaluate(() => { document.documentElement.classList.add('mtv-fs'); window.dispatchEvent(new Event('resize')); });
    await sleep(500);
    const fs1 = await page.evaluate(() => { const r = document.querySelector('.Player').getBoundingClientRect(); const v = document.querySelector('.Player .video-js').getBoundingClientRect(); return { pos: getComputedStyle(document.querySelector('.Player')).position, w: r.width, h: r.height, vw: v.width, vh: v.height }; });
    check('full-screen CSS: player fixed at 1920x1080', fs1.pos === 'fixed' && fs1.w === 1920 && fs1.h === 1080 && fs1.vh === 1080, fs1);
    await sendKey(page, 461);
    check('BACK leaves full-screen player first', !(await page.evaluate(() => document.documentElement.classList.contains('mtv-fs'))));
    // Media key: PLAY goes full-screen and asks the Met player to play (logged out => preview / paywall overlay).
    await sendKey(page, 415);
    await sleep(1500);
    const afterPlay = await page.evaluate(() => ({ fs: document.documentElement.classList.contains('mtv-fs'), paused: document.querySelector('.Player video').paused }));
    check('PLAY (415) enters full-screen and calls Met player play()', afterPlay.fs, afterPlay);
    await sendKey(page, 19);
    check('PAUSE (19) pauses', await page.evaluate(() => document.querySelector('.Player video').paused));
    await sendKey(page, 413);
    check('STOP (413) exits full-screen', !(await page.evaluate(() => document.documentElement.classList.contains('mtv-fs'))));
    const own = errors.filter((e) => !/status of 40[13]/.test(e)); // 401/403 from the Met's own entitlement checks when signed out
    check('no userscript errors on performance page', own.length === 0, errors.slice(0, 5));
    await page.close();
  }

  // ---------- Re-login backoff (fake 403 from harness; nothing sent to the Met) ----------
  {
    const preset = { 'mtv.creds': JSON.stringify({ u: 'test@example.invalid', p: '=gHe' }), 'mtv.panelSeen': 'true', 'mtv.hintShown': '1' };
    const { page, loginPosts } = await newPage(browser, { preset });
    await gotoAndInject(page, HOME);
    await sleep(4000);
    const st1 = await page.evaluate(() => JSON.parse(localStorage.getItem('mtv.relogin') || 'null'));
    check('signed out + saved creds -> exactly one login attempt', loginPosts.length === 1, loginPosts.length);
    check('403 marks credentials bad and schedules backoff', st1 && st1.bad === true && st1.next > Date.now(), st1);
    await page.evaluate(() => localStorage.removeItem('mtv.creds_dummy'));
    await page.reload({ waitUntil: 'load' });
    await page.addScriptTag({ content: SCRIPT });
    await sleep(4000);
    check('after rejection, reload does NOT retry login (no hammering)', loginPosts.length === 1, loginPosts.length);
    await page.close();
  }

  // ---------- Signed-in flow with a MOCKED successful login (nothing sent to the Met) ----------
  {
    let loggedIn = false;
    const preset = { 'mtv.creds': JSON.stringify({ u: 'test@example.invalid', p: '=gHe' }), 'mtv.panelSeen': 'true', 'mtv.hintShown': '1' };
    const ctx = await newPage(browser, { loginStatus: 200, preset, mockSignedIn: () => loggedIn });
    const { page, errors, loginPosts } = ctx;
    // login mock returns 200; afterwards user_info reports signed in
    page.on('request', (req) => { if (/client\/login/.test(req.url()) && req.method() === 'POST') loggedIn = true; });
    const navs = [];
    page.on('framenavigated', (f) => { if (f === page.mainFrame()) navs.push(f.url()); });
    // inject on every load, like webOS does
    page.on('load', () => { page.addScriptTag({ content: SCRIPT }).catch(() => {}); });
    await page.goto(HOME + 'search', { waitUntil: 'load' });
    await sleep(9000);
    const st = await page.evaluate(() => ({
      url: location.href, root: document.getElementById('root').children.length,
      text: document.body.innerText.slice(0, 80).replace(/\s+/g, ' '),
      overlays: [...document.querySelectorAll('.mtv-panel.mtv-open,.mtv-exit.mtv-open,.mtv-fail')].length,
      fs: document.documentElement.classList.contains('mtv-fs'),
      mtv: !!window.__mtv
    }));
    check('mock login: exactly one login POST', loginPosts.length === 1, loginPosts.length);
    check('mock login: reloaded exactly once, to https://ondemand.metopera.org/', navs.filter((u) => u === HOME).length === 1 && /^https:\/\/ondemand\.metopera\.org\/(search)?$/.test(st.url), navs);   // 1.3.0: the hidden Met app is moved to /search in-app (pushState, not a reload)
    check('mock login: page rendered after reload (not black), no overlay left', st.root > 0 && st.overlays === 0 && !st.fs && st.text.length > 10, st);
    check('mock login: userscript active after reload', st.mtv);
    await sleep(3000);
    check('mock login: no further navigations (no reload loop)', navs.filter((u) => !/\/search$/.test(u)).length === 1, navs);
    check('mock login: no userscript errors', errors.filter((e) => !/status of 40[13]/.test(e)).length === 0, errors.slice(0, 5));
    await page.close();
  }

  // ---------- Watchdog: Met app never starts -> restart once, then (only after 45s) a failure screen that
  //            removes itself as soon as the page renders ----------
  {
    let block = true;
    const { page } = await newPage(browser, { blockMain: () => block, preset: { 'mtv.panelSeen': 'true', 'mtv.hintShown': '1' } });
    await gotoAndInject(page, HOME);
    await sleep(20000);
    const early = await page.evaluate(() => ({ fail: !!document.querySelector('.mtv-fail'), recover: window.__mtv && window.__mtv.recover }));
    check('watchdog: crashed page restarted once (document rewrite), no failure screen before 45s', !early.fail && early.recover && early.recover.method === 'rewrite', early);
    await sleep(30000);
    const f = await page.evaluate(() => { const el = document.querySelector('.mtv-fail'); const r = el && el.getBoundingClientRect();
      return { shown: !!el && r.width > 1000, text: el ? el.innerText.slice(0, 60) : '', styles: !!document.getElementById('mtv-style'), panel: !!document.querySelector('.mtv-panel.mtv-open') }; });
    check('watchdog: still blank after 45s -> failure screen shown, our styles removed, no panel', f.shown && !f.styles && !f.panel, f);
    // The page renders late: simulate by putting content in #root.
    await page.evaluate(() => { const d = document.createElement('div'); d.style.height = '600px'; d.textContent = 'late render'; document.getElementById('root').appendChild(d); });
    await sleep(1500);
    const g = await page.evaluate(() => ({ fail: !!document.querySelector('.mtv-fail'), styles: !!document.getElementById('mtv-style'), wd: window.__mtv.recover.watchdog }));
    check('watchdog: failure screen removed automatically once the page renders; styles restored', !g.fail && g.styles && g.wd === 'recovered', g);
    await page.close();
  }

  // ---------- Telemetry: events reach the logging API (test-* device id; no credentials) ----------
  {
    const dev = 'test-headless-' + Date.now().toString(36);
    const preset = { 'mtv.panelSeen': 'true', 'mtv.hintShown': '1', 'mtv.tlm.device': dev, 'mtv.creds': JSON.stringify({ u: 'tlmtest@example.invalid', p: '=gHe' }) };
    const { page, loginPosts } = await newPage(browser, { preset });
    const bodies = [];
    page.on('request', (r) => { if (/met-tv-telemetry/.test(r.url()) && r.method() === 'POST') bodies.push(r.postData() || ''); });
    await gotoAndInject(page, HOME);
    await page.waitForSelector('.Tile', { timeout: 30000 }).catch(() => {});
    await page.addScriptTag({ content: "console.error(new Error('tlm-test-error-" + dev + "'));console.warn('tlm-test-warn');console.warn('VIDEOJS: WARN: videojs.extend is deprecated as of Video.js 7.22.0');" });
    await sleep(3000);
    // Menu usage events (1.1.0): YELLOW -> bar, open Categories, open a category
    await sendKey(page, 405);
    await page.evaluate(() => document.querySelector('.mtv-bar-item[data-act="categories"]').focus());
    await sendKey(page, 13); await sleep(800);
    await sendKey(page, 40); await sendKey(page, 13); await sleep(800);
    await sleep(3000);
    await page.evaluate(() => window.MetTelemetry.flush());
    await sleep(3000);
    const info = await page.evaluate(() => window.__mtv.telemetry());
    const all = bodies.join('\n');
    check('telemetry: batches POSTed to the logging API, queue drained', bodies.length > 0 && info.queued === 0, { posts: bodies.length, queued: info.queued, enabled: info.enabled });
    check('telemetry: no credentials or login body in payloads', !/tlmtest@example|=gHe|"password"|"username"/.test(all) && loginPosts.length === 1, { loginAttempts: loginPosts.length });
    const { execSync } = require('child_process');
    let evs = [];
    try { evs = JSON.parse(execSync("/workspace/met/telemetry/query.sh events 'since=15m&limit=200&deviceId=" + dev + "'", { encoding: 'utf8' })).events || []; } catch (e) { evs = [{ error: String(e).slice(0, 200) }]; }
    const names = evs.map((e) => e.type + ':' + String(e.message).slice(0, 60));
    const hasE = (re) => names.some((n) => re.test(n));
    check('telemetry: server has launch, page-rendered, diagnostics, login-attempt, captured error + warn',
      hasE(/^lifecycle:launch/) && hasE(/^lifecycle:page-rendered/) && hasE(/^lifecycle:diagnostics/) && hasE(/^lifecycle:login-attempt/) && hasE(/^error:.*tlm-test-error/) && hasE(/^warn:tlm-test-warn/), names);
    const diag = evs.find((e) => e.message === 'diagnostics');
    const login = evs.find((e) => e.message === 'login-attempt');
    console.log('    telemetry sample:', JSON.stringify({ diagnostics: diag && diag.data, login: login && login.data }).slice(0, 600));
    check('telemetry: menu + categories usage events stored', hasE(/^lifecycle:menu/) && hasE(/^lifecycle:categories/), names.filter((n) => /menu|categor/.test(n)));
    check('telemetry: known-harmless video.js deprecation warning not sent', !hasE(/VIDEOJS/));
    check('telemetry: stored events contain no credentials', !/tlmtest@example|=gHe|password/i.test(JSON.stringify(evs)));
    // Toggle off from the RED panel -> nothing more is sent
    await sendKey(page, 403);
    await page.evaluate(() => document.querySelector('.mtv-panel [data-act="tlm"]').click());
    const off = await page.evaluate(() => ({ label: document.querySelector('.mtv-tlm-val').textContent, ls: localStorage.getItem('mtv.tlm.off'), info: window.__mtv.telemetry() }));
    const n0 = bodies.length;
    await page.addScriptTag({ content: "console.error('after-off-should-not-send')" });
    await page.evaluate(() => window.MetTelemetry.flush());
    await sleep(2000);
    check('telemetry: RED panel toggle turns it off (persisted) and stops sending', off.label === 'off' && off.ls === '1' && !off.info.enabled && !bodies.slice(n0).some((b) => /after-off/.test(b)), off);
    await page.close();
  }

  // ---------- Safe mode + debug overlay ----------
  {
    const { page } = await newPage(browser, { preset: { 'mtv.panelSeen': 'true', 'mtv.hintShown': '1' } });
    await gotoAndInject(page, HOME);
    await page.waitForSelector('.Tile', { timeout: 30000 }).catch(() => {});
    await sendKey(page, 404);
    const log = await page.evaluate(() => { const o = document.querySelector('.mtv-log'); return o && o.style.display === 'block' ? o.innerText.slice(0, 3000) : null; });
    check('GREEN (404) opens debug log overlay with URL/login state', !!log && /signed in/i.test(log) && /ondemand\.metopera\.org/.test(log), log && log.slice(0, 120));
    const full = await page.evaluate(() => document.querySelector('.mtv-log').innerText);
    check('GREEN log shows codecs, screen/DPR, engine, render timing, error list', /H\.264/.test(full) && /MSE/.test(full) && /devicePixelRatio/.test(full) && /Chromium \d+/.test(full) && /page rendered \d/.test(full) && /Console & errors this session/.test(full), full.slice(0, 900));
    // Page console/errors capture (as if the Met site logged them)
    await page.addScriptTag({ content: "console.error(new Error('cap-err-1'));console.warn('cap-warn-1');console.log('harmless line');console.log('Player error: cap-log-1');setTimeout(function(){throw new Error('cap-throw-1')},0);Promise.reject(new Error('cap-rej-1'));for(var i=0;i<25;i++)console.warn('filler warning '+i);" });
    await sleep(800);
    const cap = await page.evaluate(() => window.__mtv.errors().map((x) => x.l + '|' + x.m + '|' + x.s));
    const has = (re) => cap.some((x) => re.test(x));
    check('captures page console.error/warn (+filtered log), uncaught errors and rejections with file:line:col',
      has(/^error\|Error: cap-err-1\|.+:\d+:\d+/) && has(/^warn\|cap-warn-1/) && has(/^log\|Player error: cap-log-1/) && !has(/harmless line/) &&
      has(/^exception\|.*cap-throw-1\|.+:\d+:\d+/) && has(/^rejection\|.*cap-rej-1/), cap.filter((x) => !/filler/.test(x)).slice(-6));
    const scrolled = await page.evaluate(() => document.querySelector('.mtv-log').scrollHeight > document.querySelector('.mtv-log').clientHeight);
    await sendKey(page, 40);
    const st2 = await page.evaluate(() => document.querySelector('.mtv-log').scrollTop);
    check('GREEN overlay scrolls with DOWN', scrolled && st2 > 0, { scrolled, st2 });
    await sleep(1000);
    await page.reload({ waitUntil: 'load' });
    await page.addScriptTag({ content: SCRIPT });
    await sleep(1500);
    await sendKey(page, 404);
    const prevTxt = await page.evaluate(() => { const o = document.querySelector('.mtv-log'); return o.innerText.slice(o.innerText.indexOf('Previous session')); });
    check('previous session log persisted in localStorage and shown after reload', /Previous session \(v/.test(prevTxt) && /cap-err-1/.test(prevTxt) && /cap-throw-1/.test(prevTxt), prevTxt.slice(0, 300));
    await sendKey(page, 404);
    await sendKey(page, 406);
    await page.waitForNavigation({ waitUntil: 'load', timeout: 15000 }).catch(() => {});
    await page.addScriptTag({ content: SCRIPT });
    await sleep(2500);
    const sm = await page.evaluate(() => ({ safe: localStorage.getItem('mtv.safe'), mtvClass: document.documentElement.classList.contains('mtv'), styles: !!document.getElementById('mtv-style'), root: document.getElementById('root').children.length }));
    check('BLUE (406) enables safe mode: no injected styles, page renders', sm.safe === 'true' && !sm.mtvClass && !sm.styles && sm.root > 0, sm);
    await page.close();
  }

  await browser.close();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  fs.writeFileSync(path.join(__dirname, '../out/test-results.json'), JSON.stringify(results, null, 2));
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
