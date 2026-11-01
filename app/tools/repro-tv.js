// Repro Matt's 1.2.0 path on the real Met site with a webOS UA (signed in; account-changing requests blocked).
const puppeteer = require('puppeteer-core');
const fs = require('fs'), path = require('path');
const { metLogin, metSignedIn, MASK_CSS } = require('./met-session');
const SCRIPT = fs.readFileSync(path.join(__dirname, '../dist/webOSUserScripts/userScript.js'), 'utf8');
const URL = process.argv[2] || 'https://ondemand.metopera.org/performance/detail/b438b886-e3d0-57a4-a3ee-18489ec01a48';
const OUT = process.argv[3] || '/tmp/repro';
const UA = 'Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/53.0.2785.34 Safari/537.36 WebAppManager';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', userDataDir: '/tmp/met-profile-current', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--hide-scrollbars'], defaultViewport: { width: 1920, height: 1080 } });
  const p = await b.newPage();
  if (!process.env.DESKTOP_UA) await p.setUserAgent(UA);
  await p.setRequestInterception(true);
  p.on('request', (r) => {
    const u = r.url(), m = r.method();
    if (/middleware\.ondemand\.metopera\.org/.test(u) && m !== 'GET' && m !== 'OPTIONS') {
      if (/\/client\/event/.test(u)) return r.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': 'https://ondemand.metopera.org', 'Access-Control-Allow-Credentials': 'true' }, body: '{}' });
      if (/\/client\/login$/.test(u)) return r.continue();
      return r.respond({ status: 403, headers: { 'Access-Control-Allow-Origin': 'https://ondemand.metopera.org', 'Access-Control-Allow-Credentials': 'true' }, body: '{}' });
    }
    r.continue();
  });
  p.on('pageerror', (e) => console.log('PAGEERR', String(e.message).slice(0, 200)));
  await p.evaluateOnNewDocument(() => { try { localStorage.setItem('mtv.tlm.device', 'e2e-repro'); localStorage.setItem('mtv.panelSeen', 'true'); localStorage.setItem('mtv.hintShown', '1'); } catch (e) {} });
  await p.goto('https://ondemand.metopera.org/', { waitUntil: 'networkidle2', timeout: 90000 });
  if (!(await metSignedIn(p))) { console.log('login', await metLogin(p)); }
  console.log('signed', await metSignedIn(p));
  await p.goto(URL, { waitUntil: 'networkidle2', timeout: 90000 });
  if (!process.env.NOINJECT) await p.addScriptTag({ content: SCRIPT });
  await p.addStyleTag({ content: MASK_CSS });
  await sleep(4000);
  const st = async (tag) => {
    const s = await p.evaluate(() => {
      const a = document.activeElement; const v = document.querySelector('video');
      const vis = []; document.querySelectorAll('body *').forEach((el) => { if (el.closest('.mtv-po,.mtv-bar,.mtv-toast')) return; const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); if (r.width > 300 && r.height > 40 && cs.visibility !== 'hidden' && cs.display !== 'none' && +cs.opacity > 0.05 && (cs.position === 'fixed' || cs.position === 'absolute') && +cs.zIndex > 0) vis.push(el.tagName + '.' + String(el.className).slice(0, 50) + ' z' + cs.zIndex + ' ' + [r.left, r.top, r.width, r.height].map(Math.round)); });
      return { url: location.pathname, fs: document.documentElement.classList.contains('mtv-fs'), active: a ? a.tagName + '.' + String(a.className).slice(0, 60) + ' "' + (a.textContent || '').trim().slice(0, 30) + '"' : null,
        video: v ? { paused: v.paused, t: Math.round(v.currentTime), rs: v.readyState, w: v.videoWidth, h: v.videoHeight, rect: [v.getBoundingClientRect().left, v.getBoundingClientRect().top, v.getBoundingClientRect().width, v.getBoundingClientRect().height].map(Math.round) } : null,
        overlays: vis.slice(0, 25), log: (window.__mtvConBuf || []).slice(-12).map((x) => (typeof x === 'string' ? x : JSON.stringify(x)).slice(0, 160)) };
    });
    console.log('==', tag, JSON.stringify(s, null, 1));
    await p.screenshot({ path: OUT + '/' + tag + '.png' });
  };
  await st('1-title');
  await p.keyboard.press('Enter'); await sleep(6000);
  await st('2-after-ok');
  await p.keyboard.press('Enter'); await sleep(2500);
  await st('3-after-ok2');
  await p.keyboard.press('ArrowDown'); await sleep(1200);
  await st('4-down');
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
