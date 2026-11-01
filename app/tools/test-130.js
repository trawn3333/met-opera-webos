// 1.3.0 end-to-end on the REAL Met site, signed in (current Google Chrome, 1920x1080).
// Account safety: POST /client/event (progress sync) is answered locally (and counted); every other
// non-GET to the Met middleware is blocked, so nothing in Matt's account can change.
// Credentials: env only, in memory (mtv.creds getItem stub for the snapshot privacy check).
// Usage: node tools/test-130.js [outdir]
const puppeteer = require('puppeteer-core');
const fs = require('fs'), path = require('path');
const { metLogin, metSignedIn } = require('./met-session');
const OUT = process.argv[2] || '/workspace/met/preview';
const SCRIPT = fs.readFileSync(path.join(__dirname, '../dist/webOSUserScripts/userScript.js'), 'utf8');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
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
  const shot = async (n) => { if (!SHOTS) return; await sleep(700); const f = path.join(OUT, 'v1.3.0_' + n + '.png'); await p.screenshot({ path: f }); console.log('shot', f); };
  const key = async (k, wait = 250) => { await p.evaluate((kc) => { ['keydown', 'keyup'].forEach((ty) => { const e = document.createEvent('Event'); e.initEvent(ty, true, true); Object.defineProperty(e, 'keyCode', { get: () => kc }); (document.activeElement || document.body).dispatchEvent(e); }); }, k); await sleep(wait); };
  const st = () => p.evaluate(() => ({ mode: window.__mtv.mode(), cls: document.documentElement.className, cat: window.__mtv.categories.debugState(), search: window.__mtv.search.debugState(),
    eng: window.__mtv.engine.engineState(), active: (document.activeElement && (document.activeElement.className || document.activeElement.tagName) + '').slice(0, 60), metChrome: window.__mtv.metChrome() }));

  await p.goto('https://ondemand.metopera.org/', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await sleep(4000);
  let signed = await metSignedIn(p);
  if (!signed && U && P) { console.log('signing in (status only):', await metLogin(p)); await p.reload({ waitUntil: 'domcontentloaded' }); await sleep(4000); signed = await metSignedIn(p); }
  check('signed in to the Met', signed);
  const t0 = Date.now();
  await p.addScriptTag({ content: SCRIPT });
  await p.waitForFunction(() => document.documentElement.classList.contains('mtv-ready') && document.querySelector('.mtv-hcard'), { timeout: 20000 });
  check('browse screen up after injection', true, { ms: Date.now() - t0 });
  await sleep(5000);   // featured (Met hero + continue watching) arrives
  let s = await st();
  check('mode browse + app takeover', s.mode === 'browse' && /mtv-app/.test(s.cls), s.cls);
  check('no Met chrome visible in browse', s.metChrome === 0, s.metChrome);
  const ver = await p.evaluate(() => (document.querySelector('.mtv-bar-ver') || {}).textContent);
  check('version shown in the top bar', ver === 'v1.3.0', ver);
  const home1 = await p.evaluate(() => ({ hero: [].map.call(document.querySelectorAll('.mtv-hcard'), (x) => x.textContent), rows: [].map.call(document.querySelectorAll('.mtv-cat .mtv-crow h2'), (x) => x.firstChild.textContent) }));
  check('hero has items incl. what the Met features', home1.hero.length >= 3, home1.hero);
  check('category rows under the hero (Hidden gems among first 4)', home1.rows.length >= 8 && home1.rows.slice(0, 5).some((x) => /Hidden gems/.test(x)), home1.rows);
  const heroLab = await p.evaluate(() => document.querySelector('.mtv-hero-lab').textContent + ' | ' + document.querySelector('.mtv-hero-txt h1').textContent);
  console.log('hero now:', heroLab);
  await shot('1-browse-home-hero');
  await key(39, 300); await key(39, 300);
  await shot('1b-browse-hero-focus-moved');
  await key(40, 300); await key(40, 300); await key(39, 300);
  await shot('1c-browse-rows');
  // second visit: Home from the top bar => new shuffle
  await key(38, 200); await key(38, 200); await key(38, 200);
  await p.evaluate(() => document.querySelector('.mtv-bar-item[data-act="home"]').focus());
  await key(13, 1200);
  const home2 = await p.evaluate(() => ({ rows: [].map.call(document.querySelectorAll('.mtv-cat .mtv-crow h2'), (x) => x.firstChild.textContent) }));
  check('second visit is shuffled differently', JSON.stringify(home2.rows) !== JSON.stringify(home1.rows), home2.rows);
  await shot('2-browse-second-visit-shuffled');

  // Categories screen still reachable
  await p.evaluate(() => document.querySelector('.mtv-bar-item[data-act="categories"]').focus());
  await key(13, 800);
  s = await st();
  check('Categories screen reachable from the bar', s.cat && s.cat.kind === 'home', s.cat);
  await key(461, 500);
  s = await st();
  check('BACK from Categories returns to Browse', s.cat && s.cat.kind === 'browse', s.cat);

  // ---- search ----
  await key(405, 600);   // YELLOW
  s = await st();
  check('YELLOW opens search mode', s.mode === 'search' && /mtv-mode-search/.test(s.cls), s.mode);
  const timings = [];
  for (const ch of 'rosenk') {
    const t1 = Date.now();
    await p.keyboard.type(ch);
    await p.waitForFunction(() => { const d = window.__mtv.search.debugState(); return d.q && d.shown === d.q; }, { timeout: 2000, polling: 5 }).catch(() => {});
    timings.push(Date.now() - t1);
  }
  const sres = await p.evaluate(() => [].slice.call(document.querySelectorAll('.mtv-s-row .mtv-s-t'), 0, 3).map((x) => x.textContent));
  check('search "rosenk": Der Rosenkavalier performances on top', /Rosenkavalier/.test(sres[0] || ''), { top: sres });
  check('autocomplete updates within 100 ms of each keypress', Math.max.apply(null, timings) <= 100, { msPerKey: timings, engineMs: (await st()).search.runMs });
  await shot('3-search-autocomplete-mid-typing');
  for (let i = 0; i < 6; i++) await p.keyboard.press('Backspace');
  await p.keyboard.type('dvorak'); await sleep(250);
  const dv = await p.evaluate(() => ({ rows: [].slice.call(document.querySelectorAll('.mtv-s-row .mtv-s-t'), 0, 2).map((x) => x.textContent), chips: [].map.call(document.querySelectorAll('.mtv-s-chip b'), (x) => x.textContent) }));
  check('search "dvorak" (no diacritics) finds Rusalka / Antonín Dvořák', /Rusalka/.test(dv.rows[0] || '') && dv.chips.some((c) => /Dvo/.test(c)), dv);
  for (let i = 0; i < 6; i++) await p.keyboard.press('Backspace');
  await p.keyboard.type('davidsen'); await sleep(250);
  const da = await p.evaluate(() => [].slice.call(document.querySelectorAll('.mtv-s-row'), 0, 3).map((x) => x.textContent.slice(0, 80)));
  check('search "davidsen" finds performances with Lise Davidsen', da.length > 0 && da.some((x) => /Davidsen/.test(x)), da);
  // on-screen keyboard: CLEAR then type "tosca" with the grid
  await p.evaluate(() => window.__mtv.search.typeForTest(''));
  await sleep(200);
  await key(37, 150);   // ensure grid zone
  const kbType = async (word) => {
    for (const ch of word) {
      await p.evaluate((c) => { const b = document.querySelector('.mtv-key[data-k="' + c + '"]'); b.click(); }, ch);
      await sleep(60);
    }
  };
  await kbType('tosca');
  await sleep(250);
  const ts = await p.evaluate(() => ({ q: window.__mtv.search.debugState().q, top: (document.querySelector('.mtv-s-row .mtv-s-t') || {}).textContent }));
  check('on-screen keyboard typing works (tosca)', ts.q === 'tosca' && /Tosca/.test(ts.top || ''), ts);
  await p.evaluate(() => window.__mtv.search.typeForTest('rosenkav'));
  await sleep(300);
  // focus goes straight to performances
  for (let i = 0; i < 7; i++) await key(39, 120);
  s = await st();
  check('RIGHT from the keyboard lands on a playable performance', s.search.zone === 'list', s.search);
  await key(13, 500);   // play
  // ---- playback ----
  await p.waitForFunction(() => { const e = window.__mtv.engine.engineState(); return e && (e.phase === 'playing' || /failed/.test(e.phase)); }, { timeout: 60000 }).catch(() => {});
  await sleep(3000);
  s = await st();
  const pv = await p.evaluate(() => { const v = window.__mtv.engine.getVideoEl(); const r = v.getBoundingClientRect(); return { t: v.currentTime, paused: v.paused, vw: v.videoWidth, vh: v.videoHeight, rect: [r.left, r.top, r.width, r.height].map(Math.round), fit: window.__mtv.engine.fitInfo() }; });
  check('our player is playing (own <video>, Brightcove stream)', s.eng && s.eng.phase === 'playing' && !pv.paused && pv.t > 0.5, { eng: s.eng && { src: s.eng.src, startMs: s.eng.startMs, resumed: s.eng.resumedFrom }, pv });
  check('play mode: nothing of the Met UI visible, no bar/browse', s.mode === 'play' && s.metChrome === 0 && await p.evaluate(() => getComputedStyle(document.querySelector('.mtv-bar')).display === 'none'), { mode: s.mode, metChrome: s.metChrome });
  const exp = pv.fit.expected.split(',').map(Number);
  check('video element = exact letterbox rect for the real aspect', exp.length === 4 && exp.every((v, i) => Math.abs(v - pv.rect[i]) <= 1), { rect: pv.rect, expected: pv.fit.expected, video: pv.fit.video });
  await p.evaluate(() => window.__mtv.player.hide && window.__mtv.player.hide());
  await sleep(1500);
  await shot('4-playback-no-met-chrome');
  // controls
  await key(40, 600);
  await shot('5-controls');
  // seek preview
  await key(38, 200);   // scrub zone
  await key(39, 120); await key(39, 120); await key(39, 50);
  await p.waitForFunction(() => { const i = document.querySelector('.mtv-po-tip img'); return i && i.style.display !== 'none' && i.complete && i.naturalWidth > 0; }, { timeout: 700, polling: 20 }).catch(() => {});
  const tipSrc = await p.evaluate(() => { const i = document.querySelector('.mtv-po-tip img'); return i && i.style.display !== 'none' && i.complete ? i.src.slice(0, 70) : ''; });
  if (SHOTS) await p.screenshot({ path: path.join(OUT, 'v1.3.0_5b-controls-seek-preview.png') });
  console.log('engine thumbs:', (await st()).eng.thumbs);
  check('seek preview thumbnail shown while seeking', !!tipSrc, tipSrc);
  await sleep(900);
  const t2 = await p.evaluate(() => window.__mtv.engine.getVideoEl().currentTime);
  check('seek committed (accelerating LEFT/RIGHT)', t2 > pv.t + 25, { before: pv.t, after: t2 });
  // subtitles menu
  await key(40, 200);   // to buttons
  const goBtn = async (id) => { const idx = await p.evaluate((x) => [].findIndex.call(document.querySelectorAll('.mtv-po-btn'), (b) => /x/.test('') || b.querySelector('span').textContent === x), id); return idx; };
  const sel = async () => p.evaluate(() => [].findIndex.call(document.querySelectorAll('.mtv-po-btn'), (b) => b.classList.contains('mtv-sel')));
  const moveTo = async (label) => { const want = await goBtn(label); let cur = await sel(); while (cur !== want && cur >= 0) { await key(cur < want ? 39 : 37, 80); cur = await sel(); } };
  await moveTo('Subtitles'); await key(13, 500);
  const ccMenu = await p.evaluate(() => [].map.call(document.querySelectorAll('.mtv-po-mi'), (x) => x.textContent));
  check('subtitles menu lists Met tracks with readable names', ccMenu.length >= 3 && ccMenu.some((x) => /English/.test(x)), ccMenu);
  await shot('5c-controls-subtitles-menu');
  await key(461, 300);
  await moveTo('Scenes'); await key(13, 400);
  const scenes = await p.evaluate(() => document.querySelectorAll('.mtv-po-mi').length);
  check('scenes menu from the Met cue points', scenes >= 5, scenes);
  await key(461, 300);
  await moveTo('Picture & stream'); await key(13, 400);
  const pic = await p.evaluate(() => ({ title: (document.querySelector('.mtv-po-menu h3') || {}).textContent, items: [].map.call(document.querySelectorAll('.mtv-po-mi b'), (x) => x.textContent) }));
  check('picture & stream menu', pic.items.length >= 5, pic);
  await key(461, 300);
  await sleep(4000);
  const cap = await p.evaluate(() => (document.querySelector('.mtv-pl-cap') || {}).textContent || '');
  const capInfo = await p.evaluate(() => window.__mtv.engine.textTracks().map((t) => t.language + ':' + t.mode + ':' + (t.cues ? t.cues.length : '-')).join(' '));
  check('English subtitles on by default, cues loaded', /en:showing:\d+/.test(capInfo), { tracks: capInfo, now: cap.slice(0, 80) });
  // BACK: hide controls, then leave the player -> back to search with focus on the result
  await leavePlay();
  s = await st();
  check('BACK leaves the player and returns to search (focus on results)', s.mode === 'search' && s.search.zone === 'list' && !s.eng, { mode: s.mode, zone: s.search.zone });
  check('video element removed (decoder released)', await p.evaluate(() => !document.querySelector('video.mtv-pl-video')));
  check('progress synced to the Met like its own player (intercepted locally)', events.filter((e) => /video-position/.test(e)).length >= 1, events);
  await key(461, 500);
  s = await st();
  check('BACK from search returns to Browse', s.mode === 'browse', s.mode);
  // title page -> perf -> play -> BACK returns to the title view
  await p.evaluate(() => window.__mtv.categories.openView({ kind: 'title', name: 'Tosca' }));
  await sleep(2500);
  s = await st();
  check('title view lists performances', s.cat && s.cat.kind === 'title' && s.cat.rows > 0, s.cat);
  await shot('6-title-view');
  await key(13, 500);
  await p.waitForFunction(() => { const e = window.__mtv.engine.engineState(); return e && (e.phase === 'playing' || /failed/.test(e.phase)); }, { timeout: 60000 }).catch(() => {});
  s = await st();
  check('OK on a performance card plays directly', s.eng && s.eng.phase === 'playing', s.eng && { phase: s.eng.phase, src: s.eng.src, startMs: s.eng.startMs });
  await leavePlay();
  s = await st();
  check('BACK returns to the title view', s.mode === 'browse' && s.cat.kind === 'title' && /mtv-card|mtv-perf/.test(s.active), { mode: s.mode, cat: s.cat, active: s.active });
  // privacy: snapshot never contains credentials
  let snap = await p.evaluate(() => window.__mtv.snapshot('test-130'));
  if (typeof snap !== 'string') snap = JSON.stringify(snap);
  const leak = [U, P, P && enc(P), U && encodeURIComponent(U)].filter(Boolean).some((x) => snap.indexOf(x) >= 0);
  check('problem-report snapshot contains no credentials', !leak, { bytes: snap.length });
  check('no account-changing requests (all non-GET except progress sync blocked)', blocked.length === 0, blocked);
  check('no page errors', errors.length === 0, errors.slice(0, 5));
  const fails = results.filter((r) => !r.ok);
  console.log('\n' + (results.length - fails.length) + '/' + results.length + ' passed');
  await b.close();
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
