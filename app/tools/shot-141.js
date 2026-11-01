// 1.4.0 pop-up facts on the REAL Met site, signed in (current Google Chrome, 1920x1080), with Idomeneo (2017 HD).
// Account safety as in test-133: POST /client/event answered locally; every other non-GET to the Met middleware blocked.
// Credentials: env only (MET_OD_EMAIL / MET_OD_PASSWORD), never printed or stored.
// Usage: node tools/test-140.js [outdir]
const puppeteer = require('puppeteer-core');
const fs = require('fs'), path = require('path');
const { metLogin, metSignedIn } = require('/workspace/met/app/tools/met-session');
const OUT = process.argv[2] || '/workspace/met/preview';
const SCRIPT = fs.readFileSync(path.join('/workspace/met/app', 'dist/webOSUserScripts/userScript.js'), 'utf8');
const { env } = require('/workspace/met/scripts/env.js').loadEnv('build', { log: { warn() {}, error: console.error } });
const WORKER = env.MTV_WORKER_URL.replace(/\/+$/, '');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const VER = require('/workspace/met/app/package.json').version;
const results = [];
const check = (n, ok, info) => { results.push({ n, ok: !!ok }); console.log((ok ? 'PASS ' : 'FAIL ') + n + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 400) : '')); };
const SHOTS = process.env.SHOTS !== '0';
const IDO = '19a5ae2a-7d68-5175-bc14-3a295ab3f618';

(async () => {
  const U = process.env.MET_OD_EMAIL, P = process.env.MET_OD_PASSWORD;
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', userDataDir: '/tmp/met-profile-current',
    args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--hide-scrollbars'], defaultViewport: { width: 1920, height: 1080 } });
  const p = await b.newPage();
  const blocked = [], errors = [], factGets = [];
  p.on('pageerror', (e) => errors.push(String(e.message || e).slice(0, 200)));
  await p.setRequestInterception(true);
  p.on('request', (r) => {
    const u = r.url(), m = r.method();
    if (u.startsWith(WORKER + '/v1/facts/')) factGets.push(m + ' ' + u.slice(WORKER.length));
    if (/middleware\.ondemand\.metopera\.org/.test(u) && m !== 'GET' && m !== 'OPTIONS') {
      const H = { 'Access-Control-Allow-Origin': 'https://ondemand.metopera.org', 'Access-Control-Allow-Credentials': 'true' };
      if (/\/client\/event/.test(u)) return r.respond({ status: 200, contentType: 'application/json', headers: H, body: '{}' });
      if (/\/client\/login$/.test(u) && r.headers()['x-mtv-test'] === '1') return r.continue();
      blocked.push(m + ' ' + u.split('?')[0].replace(/.*\/client/, '/client'));
      return r.respond({ status: 403, contentType: 'application/json', headers: H, body: '{"blocked":"test"}' });
    }
    r.continue();
  });
  await p.evaluateOnNewDocument(() => { try { localStorage.setItem('mtv.tlm.device', 'e2e-test-140'); localStorage.setItem('mtv.panelSeen', 'true'); localStorage.setItem('mtv.hintShown', '1'); localStorage.setItem('mtv.subs', JSON.stringify('off')); localStorage.setItem('mtv.popFacts', 'false'); if (!sessionStorage.getItem('t140')) { sessionStorage.setItem('t140', '1'); localStorage.removeItem('mtv.popFacts'); } } catch (e) { /* */ } });
  const key = async (k, wait = 250) => { await p.evaluate((kc) => { ['keydown', 'keyup'].forEach((ty) => { const e = document.createEvent('Event'); e.initEvent(ty, true, true); Object.defineProperty(e, 'keyCode', { get: () => kc }); (document.activeElement || document.body).dispatchEvent(e); }); }, k); await sleep(wait); };
  const boot = async () => {
    await p.goto('https://ondemand.metopera.org/', { waitUntil: 'domcontentloaded', timeout: 90000 });
    await sleep(4000);
    let signed = await metSignedIn(p);
    if (!signed && U && P) { console.log('signing in (status only):', await metLogin(p)); await p.reload({ waitUntil: 'domcontentloaded' }); await sleep(4000); signed = await metSignedIn(p); }
    await p.addScriptTag({ content: SCRIPT });
    await p.waitForFunction(() => document.documentElement.classList.contains('mtv-ready') && document.querySelector('.mtv-hcard'), { timeout: 30000 });
    return signed;
  };
  const playIdo = async () => {
    await p.evaluate((id) => window.__mtv.play(id, { title: 'Idomeneo', from: 'test' }), IDO);
    await p.waitForFunction(() => { const e = window.__mtv.engine.engineState(); return e && (e.phase === 'playing' || /failed/.test(e.phase)); }, { timeout: 60000 }).catch(() => {});
    await sleep(3000);
  };
  const popState = () => p.evaluate(() => {
    const el = document.querySelector('.mtv-pop');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { cls: el.className, label: (el.querySelector('small') || {}).textContent, text: (el.querySelector('p') || {}).textContent, by: (el.querySelector('em') || {}).textContent,
      rect: { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right) }, focusInside: el.contains(document.activeElement), pe: getComputedStyle(el).pointerEvents };
  });
  const moveTo = async (label) => { for (let i = 0; i < 14; i++) { const s = await p.evaluate(() => (document.querySelector('.mtv-po-btn.mtv-sel span') || {}).textContent || ''); if (s.indexOf(label) === 0) return true; await key(39, 120); } return false; };



  const C = JSON.parse(fs.readFileSync('/workspace/met/facts/titles-snark/idomeneo-candidates.json', 'utf8')).candidates;
  const row = (n, ty) => { const c = C[n - 1]; return [ 'cand-' + n, ty, null, 'all', c.text, c.attribution || '', c.sourceUrl, c.kicker ]; };
  console.log('signed', await boot());
  await sleep(2000);
  await playIdo();
  const shots = [ { n: 23, ty: 'r', scene: "D'Oreste, d'Ajace", off: 40, file: 'v1.4.1_popup-live-1.png' }, { n: 22, ty: 'm', scene: 'Ha vinto Amore', off: 25, file: 'v1.4.1_popup-live-2.png' } ];
  for (const s of shots) {
    const t = await p.evaluate((sc) => { const c = window.__mtv.engine.chapters(); for (let i = 0; i < c.length; i++) if (c[i].title === sc) return c[i].t; return -1; }, s.scene);
    if (t < 0) { console.log('scene not found', s.scene); continue; }
    await p.evaluate((tt) => { window.__mtv.player.hide(); window.__mtv.engine.getVideoEl().currentTime = tt; }, t + s.off);
    for (let i = 0; i < 40; i++) { const r = await p.evaluate(() => { const v = window.__mtv.engine.getVideoEl(); return v.readyState >= 3 && !v.paused && !v.seeking; }); if (r) break; await sleep(250); }
    await sleep(3500);
    await p.evaluate((f) => { window.__mtv.player.hide(); window.__mtv.facts.pop(f, document.querySelector('.mtv-pl') || undefined); }, row(s.n, s.ty));
    await sleep(1600);
    const st = await p.evaluate(() => ({ subs: window.__mtv.engine.textTracks().map((x) => x.language + ':' + x.mode).join(' '), ctl: window.__mtv.player.isShown(), pop: !!document.querySelector('.mtv-pop'),
      cap: ((document.querySelector('.mtv-pl-cap') || {}).textContent || '').trim(), t: window.__mtv.engine.getVideoEl().currentTime, toast: !!(document.querySelector('.mtv-toast') && document.querySelector('.mtv-toast').style.display !== 'none') }));
    console.log(s.file, JSON.stringify(st));
    await p.screenshot({ path: '/workspace/met/preview/' + s.file });
    await p.evaluate(() => window.__mtv.facts.dismiss(true));
  }
  await p.evaluate(() => { localStorage.removeItem('mtv.subs'); localStorage.removeItem('mtv.popFacts'); });
  console.log('blocked', blocked.length, 'errors', errors.length);
  await b.close(); process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
