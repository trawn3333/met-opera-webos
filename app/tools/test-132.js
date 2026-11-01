// 1.3.2 end-to-end (1.3.0 suite + scene jumps, coarse scrub, remembered controls button, Cast) on the REAL Met site, signed in (current Google Chrome, 1920x1080).
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
  check('version shown in the top bar', ver === 'v' + VER, ver);
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

  // ---- 1.3.1: AI stage artwork thumbnails (served by the Worker/D1 thumbnail routes) ----
  const AI = Object.values(JSON.parse(fs.readFileSync('/workspace/met/thumbs/manifest.json', 'utf8'))).filter((v) => v.how === 'ai').map((v) => 'https://YOUR-WORKER.YOUR-SUBDOMAIN.workers.dev/v1/thumbs/' + v.file);
  if (AI.length) {
    const loaded = await p.evaluate((urls) => Promise.all(urls.map((u) => new Promise((res) => { const i = new Image(); i.onload = () => res(i.naturalWidth + 'x' + i.naturalHeight); i.onerror = () => res('ERR'); i.src = u; }))), AI);
    check('all AI artwork thumbnails load from the Worker (960x540)', loaded.every((x) => x === '960x540'), { n: AI.length, bad: AI.filter((u, i) => loaded[i] !== '960x540').slice(0, 5) });
    let found = null;
    for (let v = 0; v < 12 && !found; v++) {
      const rowsAi = await p.evaluate(() => window.__mtv.categories.genThumbRows('-ai'));
      found = rowsAi.find((x) => x[0] >= 1 && x[0] <= 6);
      if (!found) { await p.evaluate(() => document.querySelector('.mtv-bar-item[data-act="home"]').focus()); await key(13, 900); }
    }
    check('browse rows show AI artwork cards', !!found, found);
    if (found) {
      await p.evaluate(() => window.__mtv.categories.focusCurrent());
      for (let i = 0; i < found[0]; i++) await key(40, 250);
      for (let i = 0; i < Math.max(0, found[1][0] - 1); i++) await key(39, 200);
      await sleep(1500);
      const imgs = await p.evaluate((r) => [].map.call(document.querySelectorAll('.mtv-cat .mtv-crow')[r].querySelectorAll('img'), (i) => ({ ai: /-ai\.jpg/.test(i.src), ok: i.complete && i.naturalWidth > 0 })).filter((x) => x.ai), found[0]);
      check('AI artwork cards render in the focused browse row', imgs.length > 0 && imgs.every((x) => x.ok), imgs);
      if (SHOTS) { await sleep(500); await p.screenshot({ path: path.join(OUT, 'v' + VER + '_browse-with-ai-art.png') }); console.log('shot browse-with-ai-art'); }
      await p.evaluate(() => document.querySelector('.mtv-bar-item[data-act="home"]').focus()); await key(13, 900);
    }
  }
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
  await key(39, 50);
  await p.waitForFunction(() => { const i = document.querySelector('.mtv-po-tip img'); return i && i.style.display !== 'none' && i.complete && i.naturalWidth > 0; }, { timeout: 700, polling: 20 }).catch(() => {});
  const tipTxt = await p.evaluate(() => document.querySelector('.mtv-po-tip').textContent);
  console.log('scrub tip:', tipTxt);
  const tipSrc = await p.evaluate(() => { const i = document.querySelector('.mtv-po-tip img'); return i && i.style.display !== 'none' && i.complete ? i.src.slice(0, 70) : ''; });
  if (SHOTS) await p.screenshot({ path: path.join(OUT, 'v' + VER + '_5b-controls-seek-preview.png') });
  console.log('engine thumbs:', (await st()).eng.thumbs);
  check('seek preview thumbnail shown while seeking', !!tipSrc, tipSrc);
  await sleep(900);
  const t2 = await p.evaluate(() => window.__mtv.engine.getVideoEl().currentTime);
  check('scrub bar moves in large steps only (one RIGHT >= 2 min)', t2 > pv.t + 115, { before: pv.t, after: t2 });
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
  // ================= 1.3.2: Idomeneo (2017 HD) =================
  const IDO = '19a5ae2a-7d68-5175-bc14-3a295ab3f618';
  const playIdo = async () => {
    await p.evaluate((id) => window.__mtv.play(id, { title: 'Idomeneo', from: 'test' }), IDO);
    await p.waitForFunction(() => { const e = window.__mtv.engine.engineState(); return e && (e.phase === 'playing' || /failed/.test(e.phase)); }, { timeout: 60000 }).catch(() => {});
    await sleep(2500);
  };
  const pstate = () => p.evaluate(() => {
    const v = window.__mtv.engine.getVideoEl(), chs = window.__mtv.engine.chapters();
    let ci = -1; for (let i = 0; i < chs.length; i++) if (chs[i].t <= v.currentTime + 0.5) ci = i;
    const t = document.querySelector('.mtv-toast');
    return { t: v.currentTime, ci, n: chs.length, ch: ci >= 0 ? chs[ci] : null, toast: t && t.style.display !== 'none' ? t.textContent : '',
      shown: window.__mtv.player.isShown(), sel: (document.querySelector('.mtv-po-btn.mtv-sel span') || {}).textContent || '' };
  });
  await playIdo();
  s = await st();
  check('Idomeneo plays in our player', s.eng && s.eng.phase === 'playing', s.eng && { phase: s.eng.phase, src: s.eng.src, resumed: s.eng.resumedFrom });
  const chInfo = await p.evaluate(() => { const c = window.__mtv.engine.chapters(); return { n: c.length, withArtists: c.filter((x) => x.artists && x.artists.length).length, sample: c.slice(0, 3) }; });
  check('scene markers parsed with per-scene artists', chInfo.n >= 20 && chInfo.withArtists >= chInfo.n - 3, chInfo);
  const btnLabels = await p.evaluate(() => [].map.call(document.querySelectorAll('.mtv-po-btn span'), (x) => x.textContent));
  const btnLabels2 = btnLabels.length ? btnLabels : await (async () => { await key(40, 400); await key(461, 300); return p.evaluate(() => [].map.call(document.querySelectorAll('.mtv-po-btn span'), (x) => x.textContent)); })();
  check('no short-skip buttons (no -10 s / +30 s); Cast button present', !btnLabels2.some((x) => /10 s|30 s/.test(x)) && btnLabels2.indexOf('Cast') >= 0, btnLabels2);
  // put the playhead mid-scene in Act I, controls hidden
  await p.evaluate(() => { const c = window.__mtv.engine.chapters(); const v = window.__mtv.engine.getVideoEl(); v.currentTime = c[6].t + 20; window.__mtv.player.hide(); });
  await sleep(2500);
  let a = await pstate();
  await key(39, 400);
  let b1 = await pstate();
  check('hidden RIGHT jumps to the next scene start (toast with its name)', b1.ci === a.ci + 1 && Math.abs(b1.t - b1.ch.t) < 3 && b1.toast.indexOf(b1.ch.title) >= 0 && !b1.shown, { from: a.ci, to: b1.ci, t: b1.t, toast: b1.toast });
  await sleep(300);
  if (SHOTS) { await p.screenshot({ path: path.join(OUT, 'v' + VER + '_scene-jump-toast.png') }); console.log('shot scene-jump-toast'); }
  await key(39, 400);
  const b2 = await pstate();
  check('hidden RIGHT again -> next scene', b2.ci === b1.ci + 1, { ci: b2.ci, toast: b2.toast });
  await sleep(6500);   // > 5 s into the scene: LEFT restarts it, a second LEFT goes back one more
  await key(37, 400);
  const c1 = await pstate();
  check('hidden LEFT (>5 s into a scene) restarts the scene', c1.ci === b2.ci && Math.abs(c1.t - c1.ch.t) < 3, { ci: c1.ci, t: c1.t, start: c1.ch && c1.ch.t });
  await key(37, 400);
  const c2 = await pstate();
  check('hidden LEFT again -> previous scene', c2.ci === b2.ci - 1, { ci: c2.ci, toast: c2.toast });
  await key(417, 400);
  const d1 = await pstate();
  check('FF media key -> next scene', d1.ci === c2.ci + 1 && !d1.shown, { ci: d1.ci, toast: d1.toast });
  await key(412, 400);
  const d2 = await pstate();
  check('REW media key -> previous / scene start (no 10 s skip)', d2.ci <= d1.ci && Math.abs(d2.t - d2.ch.t) < 3, { ci: d2.ci, t: d2.t });
  // coarse scrub only
  const step = await p.evaluate(() => window.__mtv.player.seekStepSize());
  check('scrub step is coarse (5% of running time, >= 2 min)', step >= 120, { stepSec: Math.round(step), durationSec: Math.round(await p.evaluate(() => window.__mtv.engine.getVideoEl().duration)) });
  // remembered controls button: open Cast from the controls
  await key(40, 500);
  const st0 = await pstate();
  console.log('controls opened on:', st0.sel);
  await moveTo('Cast');
  await key(13, 600);
  const panel = await p.evaluate(() => ({ title: (document.querySelector('.mtv-po-menu h3') || {}).textContent, items: [].map.call(document.querySelectorAll('.mtv-po-mi'), (x) => ({ t: x.querySelector('b').textContent, s: (x.querySelector('span') || {}).textContent || '', on: x.classList.contains('mtv-on'), note: (x.querySelector('em') || {}).textContent || '' })) }));
  const ida = panel.items.find((x) => /^Idamante/.test(x.t));
  check('Cast panel: Idamante \u2014 Alice Coote \u00b7 mezzo-soprano, flagged trouser role with note', !!ida && /Alice Coote/.test(ida.s) && /mezzo-soprano/.test(ida.s) && /trouser role/i.test(ida.t) && /castrato/.test(ida.note), ida);
  check('Cast panel lists all 4 Met roles + conductor', ['Ilia', 'Elettra', 'Idamante', 'Idomeneo'].every((r) => panel.items.some((x) => x.t.indexOf(r) === 0)) && panel.items.some((x) => /Conductor/.test(x.t) && /Levine/.test(x.s)), panel.items.map((x) => x.t + ' | ' + x.s));
  check('no other role flagged as trouser role (Ilia, Elettra, Idomeneo)', panel.items.filter((x) => /trouser role/i.test(x.t)).length === 1, panel.items.filter((x) => /trouser/i.test(x.t)).map((x) => x.t));
  // scene highlight == cue point artists
  const expS = await p.evaluate(() => { const c = window.__mtv.engine.chapters(), v = window.__mtv.engine.getVideoEl(); let ci = -1; for (let i = 0; i < c.length; i++) if (c[i].t <= v.currentTime + 0.5) ci = i; return { title: c[ci].title, artists: c[ci].artists }; });
  const onNames = panel.items.filter((x) => x.on).map((x) => x.t + ' ' + x.s);
  const allMatched = expS.artists.filter((a) => !/orchestra|chorus/i.test(a) && a !== 'James Levine').every((a) => onNames.some((x) => x.indexOf(a) >= 0));
  check('Cast panel highlights exactly who the Met lists for the current scene', allMatched && panel.title.indexOf(expS.title) >= 0, { scene: expS, highlighted: onNames, title: panel.title });
  // a scene with Idamante (Alice Coote) for the preview
  await p.evaluate(() => { const c = window.__mtv.engine.chapters(); const i = c.findIndex((x) => x.artists && x.artists.indexOf('Alice Coote') >= 0 && x.artists.length >= 2) ; const j = i >= 0 ? i : c.findIndex((x) => x.artists && x.artists.indexOf('Alice Coote') >= 0); window.__mtv.engine.getVideoEl().currentTime = c[j].t + 8; });
  await sleep(3500);   // live refresh while open (1 s tick)
  const panel2 = await p.evaluate(() => ({ title: (document.querySelector('.mtv-po-menu h3') || {}).textContent, on: [].map.call(document.querySelectorAll('.mtv-po-mi.mtv-on b'), (x) => x.textContent) }));
  check('Cast panel follows the scene live (Idamante highlighted in an Alice Coote scene)', panel2.on.some((x) => /Idamante/.test(x)), panel2);
  await key(40, 150); await key(40, 150);
  if (SHOTS) { await sleep(600); await p.screenshot({ path: path.join(OUT, 'v' + VER + '_cast-panel.png') }); console.log('shot cast-panel'); }
  await key(461, 300);   // close the panel
  await key(461, 400);   // hide controls
  const hid = await pstate();
  check('BACK closes Cast, BACK hides the controls (still playing)', !hid.shown && (await st()).mode === 'play', hid);
  await key(40, 500);
  const rem = await pstate();
  check('DOWN reopens the controls on the last used button (Cast)', rem.shown && rem.sel === 'Cast', rem.sel);
  if (SHOTS) { await sleep(400); await p.screenshot({ path: path.join(OUT, 'v' + VER + '_controls-remembered-focus.png') }); console.log('shot controls-remembered-focus'); }
  const stored = await p.evaluate(() => localStorage.getItem('mtv.ctlLast'));
  check('last controls button persisted in localStorage', /cast/.test(stored || ''), stored);
  await moveTo('Scenes');
  await key(461, 300);
  await key(38, 500);
  const rem2 = await pstate();
  check('remembered button follows simple LEFT/RIGHT moves (Scenes)', rem2.sel === 'Scenes', rem2.sel);
  await key(461, 300);
  await leavePlay();
  // title page Cast
  await p.evaluate(() => window.__mtv.categories.openView({ kind: 'title', name: 'Idomeneo' }));
  await sleep(3000);
  const castRow = await p.evaluate(() => [].findIndex.call(document.querySelectorAll('.mtv-cat .mtv-crow'), (r) => /Cast & roles/.test((r.querySelector('h2') || {}).textContent || '')));
  check('title page has a "Cast & roles" row', castRow >= 0, castRow);
  if (castRow >= 0) {
    await p.evaluate(() => window.__mtv.categories.focusCurrent());
    for (let i = 0; i < 8; i++) { const r = (await st()).cat.r; if (r >= castRow) break; await key(40, 250); }
    // 2017 performance is the first chip (newest first is 2022; find the 2017 one)
    const chips = await p.evaluate((r) => [].map.call(document.querySelectorAll('.mtv-cat .mtv-crow')[r].querySelectorAll('.mtv-chip b'), (x) => x.textContent), castRow);
    const want = chips.findIndex((x) => /2017/.test(x));
    for (let i = 0; i < want; i++) await key(39, 200);
    await shot('title-cast-row');
    await key(13, 600);
    const sheet = await p.evaluate(() => window.__mtv.castSheet.debugState());
    const sida = sheet && sheet.items.find((x) => x[0] === 'Idamante');
    check('title-page Cast sheet: Idamante \u2014 Alice Coote \u00b7 mezzo-soprano (trouser role)', !!sida && /Alice Coote \u00b7 mezzo-soprano/.test(sida[1]) && sida[2] === 1, sheet);
    await shot('title-cast-sheet');
    await key(461, 500);
    s = await st();
    check('BACK closes the Cast sheet and stays on the title page', !(await p.evaluate(() => window.__mtv.castSheet.isOpen())) && s.mode === 'browse' && s.cat.kind === 'title', s.cat);
  }
  // persistence across a reload (a new session)
  await p.reload({ waitUntil: 'domcontentloaded' });
  await sleep(4000);
  await p.addScriptTag({ content: SCRIPT });
  await p.waitForFunction(() => document.documentElement.classList.contains('mtv-ready'), { timeout: 20000 });
  await sleep(2000);
  await playIdo();
  await p.evaluate(() => window.__mtv.player.hide());
  await sleep(500);
  await key(40, 500);
  const rem3 = await pstate();
  check('after a reload, DOWN opens the controls on the remembered button', rem3.sel === 'Scenes', rem3.sel);
  await key(461, 300);
  await leavePlay();
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
