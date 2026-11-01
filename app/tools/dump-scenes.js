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
  await p.evaluateOnNewDocument(() => { try { localStorage.setItem('mtv.tlm.device', 'e2e-test-140'); localStorage.setItem('mtv.panelSeen', 'true'); localStorage.setItem('mtv.hintShown', '1'); if (!sessionStorage.getItem('t140')) { sessionStorage.setItem('t140', '1'); localStorage.removeItem('mtv.popFacts'); } } catch (e) { /* */ } });
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



  // Usage: node tools/dump-scenes.js slug:perfId:YYYY-MM-DD ...  -> facts/titles-snark/<slug>-<date>-scenes.json
  const jobs = process.argv.slice(2).map((a) => { const [slug, id, d] = a.split(':'); return { slug, id, d }; });
  console.log('signed', await boot());
  await sleep(2000);
  for (const j of jobs) {
    await p.evaluate((id) => window.__mtv.play(id, { title: 'x', from: 'scenes' }), j.id);
    await p.waitForFunction(() => { const e = window.__mtv.engine.engineState(); return e && (e.phase === 'playing' || /failed/.test(e.phase)); }, { timeout: 60000 }).catch(() => {});
    await sleep(3000);
    const o = await p.evaluate(() => ({ chapters: window.__mtv.engine.chapters(), dur: window.__mtv.engine.getVideoEl().duration, cur: window.__mtv.player.current ? window.__mtv.player.current() : null }));
    const scenes = o.chapters.map((c) => ({ t: Math.round(c.t), title: (c.act ? 'Act ' + c.act + ': ' : '') + c.title, appTitle: c.title, act: c.act || null, artists: c.artists || [] }));
    const out = { performance: (o.cur && (o.cur.opera || o.cur.name)) + ', Met Live in HD, ' + j.d + ' (Met Opera on Demand id ' + j.id + ')', source: 'Met Opera on Demand cue points', duration: Math.round(o.dur || 0), scenes };
    require('fs').writeFileSync('/workspace/met/facts/titles-snark/' + j.slug + '-' + j.d + '-scenes.json', JSON.stringify(out, null, 1));
    console.log(j.slug, j.d, 'scenes', scenes.length, 'dur', out.duration);
    await p.evaluate(() => { try { window.__mtv.engine.close(); } catch (e) {} });
    await sleep(1500);
  }
  console.log('blocked', blocked.length, 'errors', errors.length);
  await b.close(); process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
