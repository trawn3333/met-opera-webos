// 1.4.0 pop-up facts on the REAL Met site, signed in (current Google Chrome, 1920x1080), with Idomeneo (2017 HD).
// Account safety as in test-133: POST /client/event answered locally; every other non-GET to the Met middleware blocked.
// Credentials: env only (MET_OD_EMAIL / MET_OD_PASSWORD), never printed or stored.
// Usage: node tools/test-140.js [outdir]
const puppeteer = require('puppeteer-core');
const fs = require('fs'), path = require('path');
const { metLogin, metSignedIn } = require('./met-session');
const OUT = process.argv[2] || '/workspace/met/preview';
const SCRIPT = fs.readFileSync(path.join(__dirname, '../dist/webOSUserScripts/userScript.js'), 'utf8');
const { env } = require('../../scripts/env.js').loadEnv('build', { log: { warn() {}, error: console.error } });
const WORKER = env.MTV_WORKER_URL.replace(/\/+$/, '');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const VER = require('../package.json').version;
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

  check('signed in to the Met', await boot());
  await sleep(3000);
  // ---- data ----
  const idx = await p.evaluate(() => ({ slug: window.__mtv.facts.slugFor('Idomeneo'), fig: window.__mtv.facts.slugFor('Le Nozze di Figaro'), boh: window.__mtv.facts.slugFor('La Bohème'), none: window.__mtv.facts.slugFor("Wagner's Dream") }));
  check('title matching (Idomeneo, Figaro, Bohème; none for Wagner’s Dream (documentary))', idx.slug === 'idomeneo' && idx.fig === 'figaro' && idx.boh === 'boheme' && idx.none === null, idx);
  const lazy = await p.evaluate(() => new Promise((res) => { localStorage.removeItem('mtv.facts.turandot'); window.__mtv.facts.loadFacts('Turandot', (d) => res(d ? { slug: d.slug, n: d.facts.length, url: d.facts[0][6] } : null)); }));
  check('non-bundled title (Turandot) fetched lazily from the Worker /v1/facts/', !!lazy && lazy.n >= 10 && factGets.some((x) => /turandot\.json/.test(x)), { lazy, factGets });
  const cached = await p.evaluate(() => !!localStorage.getItem('mtv.facts.turandot'));
  check('... and cached in localStorage', cached);
  // ---- playback ----
  await playIdo();
  const eng = await p.evaluate(() => window.__mtv.engine.engineState());
  check('Idomeneo plays in our player', eng && eng.phase === 'playing', eng && eng.phase);
  await sleep(2500);
  const sess = await p.evaluate(() => window.__mtv.player.factsState());
  const sched = await p.evaluate(() => window.__mtv.facts.plannedSchedule().map((x) => ({ at: Math.round(x.at), id: x.f[0], scene: x.scene, re: x.f[2], scope: x.f[3] })));
  const chs = await p.evaluate(() => window.__mtv.engine.chapters().map((c) => ({ t: Math.round(c.t), title: c.title, act: c.act })));
  check('pop-up facts on by default; Idomeneo facts planned (bundled)', sess.on && sess.session && sess.session.slug === 'idomeneo' && sched.length >= 15, { on: sess.on, planned: sched.length });
  const tied = sched.filter((x) => x.scene !== undefined);
  const tiedOk = tied.every((x) => { const c = chs[x.scene]; const re = new RegExp(x.re, 'i'); return re.test(c.title) || re.test('Act ' + c.act + ': ' + c.title); });
  check('scene-tied facts land inside the Met scene whose title matches their sceneMatch', tied.length >= 5 && tiedOk, tied.slice(0, 6).map((x) => [x.at, x.id, chs[x.scene].title]));
  const prodScoped = sched.filter((x) => /production:1982-10-14/.test(x.scope || ''));
  check('production-scoped facts (Ponnelle 1982 production) included for the 2017 performance', prodScoped.length >= 1, prodScoped.map((x) => x.id));
  const gaps = sched.slice(1).map((x, i) => x.at - sched[i].at);
  check('pop-ups spread out (no two within 60 s)', gaps.every((g) => g >= 60), { minGap: Math.min.apply(null, gaps) });
  // jump just before a scene-tied fact, controls hidden; turn on subtitles if any
  const target = tied.find((x) => /Overture|Padre|Non ho colpa|Idol mio|Zeffiretti|Fuor del mar/i.test(chs[x.scene].title)) || tied[0];
  await p.evaluate((t) => { window.__mtv.player.hide(); window.__mtv.engine.getVideoEl().currentTime = t - 3; }, target.at);
  let pop = null;
  for (let i = 0; i < 12 && !pop; i++) { await sleep(700); pop = await popState(); }
  check('a speech-bubble pop-up appears at its scene (type label, text, attribution)', !!pop && pop.text && pop.label && pop.by, pop);
  await sleep(900);
  if (SHOTS && pop) { await p.screenshot({ path: path.join(OUT, 'v' + VER + '_popup-fact.png') }); console.log('shot popup-fact'); }
  check('pop-up never takes focus and ignores the pointer', pop && !pop.focusInside && pop.pe === 'none', pop && { focusInside: pop.focusInside, pe: pop.pe });
  const sub = await p.evaluate(() => { const c = document.querySelector('.mtv-pl-cap'); const s = c && (c.firstElementChild || c); if (!s) return null; const r = s.getBoundingClientRect(); return { top: Math.round(r.top), text: s.textContent.slice(0, 60) }; });
  check('pop-up sits in the top part of the screen, clear of the subtitles', pop && pop.rect.bottom < 1080 * 0.55 && (!sub || !sub.text || sub.top > pop.rect.bottom), { pop: pop && pop.rect, sub });
  const bounce = await p.evaluate(() => { const el = document.querySelector('.mtv-pop'); return el ? getComputedStyle(el).animationName : ''; });
  check('bounce-in animation', /mtvPopIn/.test(bounce), bounce);
  await sleep(11000);
  check('auto-dismissed after ~10 s', !(await popState()));
  // another type for a second preview: show the next due fact by jumping
  const t2 = sched.find((x) => x.at > target.at + 120 && /^idomeneo-/.test(x.id) && x.scene === undefined) || sched[sched.length - 2];
  await p.evaluate((t) => { window.__mtv.engine.getVideoEl().currentTime = t - 2; }, t2.at);
  let pop2 = null;
  for (let i = 0; i < 10 && !pop2; i++) { await sleep(700); pop2 = await popState(); }
  check('general (non-scene) fact pops at its planned time', !!pop2, pop2 && { label: pop2.label, text: pop2.text.slice(0, 80) });
  if (SHOTS && pop2) { await sleep(900); await p.screenshot({ path: path.join(OUT, 'v' + VER + '_popup-fact-2.png') }); console.log('shot popup-fact-2'); }
  // ---- toggle in the controls ----
  await key(40, 500);
  check('controls have a "Pop-up facts: on" button', await moveTo('Pop-up facts'), await p.evaluate(() => (document.querySelector('.mtv-po-btn.mtv-sel span') || {}).textContent));
  await key(13, 600);
  const lab = await p.evaluate(() => (document.querySelector('.mtv-po-btn.mtv-sel span') || {}).textContent);
  const stored = await p.evaluate(() => localStorage.getItem('mtv.popFacts'));
  check('OK turns pop-up facts off (label + remembered)', /off$/.test(lab) && stored === 'false' && !(await popState()), { lab, stored });
  if (SHOTS) { await sleep(500); await p.screenshot({ path: path.join(OUT, 'v' + VER + '_popup-fact-toggle.png') }); console.log('shot popup-fact-toggle'); }
  await key(461, 400);
  const t3 = sched.find((x) => x.at > t2.at + 60) || sched[sched.length - 1];
  await p.evaluate((t) => { window.__mtv.engine.getVideoEl().currentTime = t - 2; }, t3.at);
  await sleep(6000);
  check('OFF: no pop-up when one is due', !(await popState()));
  // persists across a restart
  await p.evaluate(() => window.__mtv.player.exitPlayer ? 0 : 0);
  await boot();
  await sleep(2000);
  check('OFF remembered after restart', (await p.evaluate(() => window.__mtv.player.factsState().on)) === false);
  await playIdo();
  console.log('after restart', JSON.stringify(await p.evaluate(() => ({ mode: window.__mtv.mode(), eng: (window.__mtv.engine.engineState() || {}).phase, shown: window.__mtv.player.isShown(), act: String(document.activeElement && document.activeElement.className) }))));
  await p.evaluate(() => window.__mtv.player.hide()); await sleep(600);
  await key(40, 700);
  await moveTo('Pop-up facts');
  const lab2 = await p.evaluate(() => (document.querySelector('.mtv-po-btn.mtv-sel span') || {}).textContent);
  check('controls show "Pop-up facts: off" after restart', /off$/.test(lab2), lab2);
  await key(13, 500);
  check('turned back on', (await p.evaluate(() => window.__mtv.player.factsState().on)) === true);
  await key(461, 300);
  check('no page errors', errors.length === 0, errors.slice(0, 5));
  check('no account-changing requests attempted', blocked.length === 0, blocked);
  await b.close();
  const f = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - f}/${results.length} passed`);
  process.exit(f ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
