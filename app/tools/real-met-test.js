// v1.2.0 on the REAL Met site, signed in (current Chrome; Chromium builds can't decode the Met's H.264).
// - Account safety: progress beacons (POST /client/event) are answered locally; every other non-GET
//   to the Met middleware is blocked, so nothing in Matt's account can change (no favorites etc.).
// - Credentials: MET_OD_EMAIL / MET_OD_PASSWORD are only used in memory: localStorage.getItem('mtv.creds')
//   is stubbed to return them (encoded like the app does) so the problem-report privacy check is
//   tested against the real values without ever writing them to the profile, files or output.
// Usage: node tools/real-met-test.js [outdir]
const puppeteer = require('puppeteer-core');
const fs = require('fs'), path = require('path'), zlib = require('zlib'), { execFileSync } = require('child_process');
const { metLogin, metSignedIn, MASK_CSS } = require('./met-session');
const OUT = process.argv[2] || '/workspace/met/preview';
const SCRIPT = fs.readFileSync(path.join(__dirname, '../dist/webOSUserScripts/userScript.js'), 'utf8');
const WATCH = 'https://ondemand.metopera.org/performance/detail/c49458c3-8205-5903-9bc7-ab37885d542c';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const report = { checks: {}, failures: [], shots: [] };
const check = (n, ok, info) => { report.checks[n] = { ok: !!ok, info }; if (!ok) report.failures.push(n); console.log((ok ? 'PASS ' : 'FAIL ') + n + (info !== undefined ? ' ' + JSON.stringify(info).slice(0, 400) : '')); };
const enc = (s) => Buffer.from(unescape(encodeURIComponent(s)), 'binary').toString('base64').split('').reverse().join('');

(async () => {
  const U = process.env.MET_OD_EMAIL, P = process.env.MET_OD_PASSWORD;
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', userDataDir: '/tmp/met-profile-current', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--hide-scrollbars'], defaultViewport: { width: 1920, height: 1080 } });
  const p = await b.newPage();
  const blocked = [];
  await p.setRequestInterception(true);
  p.on('request', (r) => {
    const u = r.url(), m = r.method();
    if (/middleware\.ondemand\.metopera\.org/.test(u) && m !== 'GET' && m !== 'OPTIONS') {
      if (/\/client\/event/.test(u)) return r.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': 'https://ondemand.metopera.org', 'Access-Control-Allow-Credentials': 'true' }, body: '{}' });
      if (/\/client\/login$/.test(u) && r.headers()['x-mtv-test'] === '1') return r.continue();
      blocked.push(m + ' ' + u.split('?')[0].replace(/.*\/client/, '/client'));
      return r.respond({ status: 403, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': 'https://ondemand.metopera.org', 'Access-Control-Allow-Credentials': 'true' }, body: '{"blocked":"test"}' });
    }
    r.continue();
  });
  // In-memory credentials for the privacy test (never persisted): stub getItem for mtv.creds only.
  await p.evaluateOnNewDocument((u, pw) => {
    const orig = Storage.prototype.getItem;
    const val = u && pw ? JSON.stringify({ u: u, p: pw }) : null;
    Storage.prototype.getItem = function (k) { return k === 'mtv.creds' && this === window.localStorage ? val : orig.call(this, k); };
    try { localStorage.setItem('mtv.tlm.device', 'e2e-test-real-met'); localStorage.setItem('mtv.panelSeen', 'true'); localStorage.setItem('mtv.hintShown', '1'); localStorage.removeItem('mtv.autoReports'); } catch (e) { /* */ }
  }, U, P ? enc(P) : null);
  const shot = async (n) => { await sleep(800); const f = path.join(OUT, 'v1.2.0_real-met_' + n + '.png'); await p.screenshot({ path: f }); report.shots.push(f); console.log('shot', f); };
  const key = async (k, wait = 300) => { await p.evaluate((kc, type) => { ['keydown', 'keyup'].forEach((ty) => { const e = document.createEvent('Event'); e.initEvent(ty, true, true); Object.defineProperty(e, 'keyCode', { get: () => kc }); (document.activeElement || document.body).dispatchEvent(e); }); }, k); await sleep(wait); };
  const inject = async () => { await p.addScriptTag({ content: SCRIPT }); await p.addStyleTag({ content: MASK_CSS }); await sleep(2500); };

  // ---- home (signed in): Continue watching / My favorites via the top bar ----
  await p.goto('https://ondemand.metopera.org/', { waitUntil: 'networkidle2', timeout: 90000 });
  let signed = await metSignedIn(p);
  if (!signed && U && P) { console.log('signing in (status only):', await metLogin(p)); await p.reload({ waitUntil: 'networkidle2' }); signed = await metSignedIn(p); }
  check('signed in to Met (session)', signed);
  await inject();
  await p.evaluate(() => window.__mtv.focusFirst());
  await sleep(800);
  await shot('1-home-restyled-focus');
  await p.evaluate(() => document.querySelector('.mtv-bar-item[data-act="continue"]').focus());
  await shot('2-top-bar-continue-watching-focused');
  await key(13, 4000);
  const cw = await p.evaluate(() => { const a = document.activeElement; const g = a && a.closest && a.closest('.Grid'); const h = g && g.querySelector('.Grid-header, h2'); return { row: h ? h.textContent.trim().slice(0, 40) : null, tile: a && a.className && String(a.className).slice(0, 40) }; });
  check('Continue watching: first tile of the row focused from the bar', cw.row && /Continue Watching/i.test(cw.row) && /Tile|Link|a/i.test(cw.tile || ''), cw);
  await shot('3-continue-watching-row');
  await p.evaluate(() => document.querySelector('.mtv-bar-item[data-act="favorites"]').focus());
  await key(13, 4000);
  const fv = await p.evaluate(() => { const a = document.activeElement; const g = a && a.closest && a.closest('.Grid'); const h = g && g.querySelector('.Grid-header, h2'); const hasRow = [].some.call(document.querySelectorAll('.Grid-header'), (x) => /My Favorites/i.test(x.textContent)); return { row: h ? h.textContent.trim().slice(0, 40) : null, hasRow, toast: (document.querySelector('.mtv-toast') || {}).textContent }; });
  check('My favorites: row focused, or a clear toast when the account has none', fv.hasRow ? /Favorites/i.test(fv.row || '') : /No favorites/.test(fv.toast || ''), fv);
  await shot('4-my-favorites-row');

  // ---- categories restyle ----
  await p.evaluate(() => document.querySelector('.mtv-bar-item[data-act="categories"]').focus());
  await key(13, 2500);
  await key(40, 400); await key(39, 400);
  await shot('5-categories-restyled');
  await key(461, 600);

  // ---- real watch page ----
  await p.goto(WATCH, { waitUntil: 'networkidle2', timeout: 90000 });
  await inject();
  await key(415, 6000); // PLAY media key
  let st = await p.evaluate(() => { const v = document.querySelector('.Player video'); const r = v.getBoundingClientRect(); return { fs: document.documentElement.classList.contains('mtv-fs'), paused: v.paused, t: Math.round(v.currentTime), rect: [r.left, r.top, r.width, r.height].map(Math.round), vw: v.videoWidth, vh: v.videoHeight, fit: window.__mtv.player && null }; });
  check('real player: PLAY key starts playback in full screen', st.fs && !st.paused, st);
  check('real player: <video> pinned to 0,0 1920x1080', st.rect.join() === '0,0,1920,1080', st.rect);
  await p.evaluate(() => { const v = document.querySelector('.Player video'); v.muted = true; });
  await shot('6-real-video-fit');
  await key(40, 800);
  const ov = await p.evaluate(() => ({ shown: !!document.querySelector('.mtv-po.mtv-show'), title: (document.querySelector('.mtv-po-title') || {}).textContent, sub: (document.querySelector('.mtv-po-sub') || {}).textContent, ch: (document.querySelector('.mtv-po-ch') || {}).textContent }));
  check('real player: controls overlay shows title + scene', ov.shown && ov.title && /Scene \d+ of \d+/.test(ov.ch), ov);
  await shot('7-real-player-controls');
  // scenes
  for (let i = 0; i < 3; i++) await key(39, 80);
  await key(13, 800);
  const menu = await p.evaluate(() => { const m = document.querySelector('.mtv-po-menu'); return m && m.style.display === 'block' ? { title: m.querySelector('h3').textContent, n: m.querySelectorAll('.mtv-po-mi').length, acts: [].map.call(m.querySelectorAll('h4'), (h) => h.textContent) } : null; });
  check('real player: Scenes menu lists the Met cue points with acts', menu && menu.title === 'Scenes' && menu.n > 5 && menu.acts.length >= 2, menu);
  await shot('8-real-scenes-menu');
  const t0 = await p.evaluate(() => document.querySelector('.Player video').currentTime);
  for (let i = 0; i < 4; i++) await key(40, 80);
  await key(13, 3000);
  const t1 = await p.evaluate(() => document.querySelector('.Player video').currentTime);
  check('real player: jump to a scene seeks the Brightcove player', Math.abs(t1 - t0) > 60, { from: Math.round(t0), to: Math.round(t1) });
  // seek with RIGHT
  await key(461, 300); await sleep(4500);
  const s0 = await p.evaluate(() => document.querySelector('.Player video').currentTime);
  await key(39, 2500);
  const s1 = await p.evaluate(() => document.querySelector('.Player video').currentTime);
  check('real player: RIGHT seeks +10 s', s1 - s0 > 8 && s1 - s0 < 16, { from: Math.round(s0), to: Math.round(s1) });
  // subtitles / audio
  await key(40, 200); for (let i = 0; i < 10; i++) await key(37, 50); for (let i = 0; i < 7; i++) await key(39, 50);
  await key(13, 800);
  const cc = await p.evaluate(() => { const m = document.querySelector('.mtv-po-menu'); const tt = window.videojs.getPlayer('player').textTracks(); const l = []; for (let i = 0; i < tt.length; i++) l.push(tt[i].kind + ':' + (tt[i].language || tt[i].label) + ':' + tt[i].mode); return { menu: m && m.style.display === 'block' ? [].map.call(m.querySelectorAll('.mtv-po-mi b'), (x) => x.textContent) : null, tracks: l, toast: (document.querySelector('.mtv-toast') || {}).textContent }; });
  report.realTracks = cc;
  console.log('INFO subtitles', JSON.stringify(cc).slice(0, 300));
  if (cc.menu) {
    await shot('9-real-subtitles-menu');
    await key(40, 100); await key(13, 1500);
    const on = await p.evaluate(() => { const tt = window.videojs.getPlayer('player').textTracks(); for (let i = 0; i < tt.length; i++) if (tt[i].mode === 'showing') return tt[i].language || tt[i].label; return null; });
    check('real player: subtitle track switched on via overlay', !!on, on);
    await sleep(2500);
    await shot('10-real-subtitles-on');
  }
  const fit = await p.evaluate(() => { const v = document.querySelector('.Player video'); return { video: v.videoWidth + 'x' + v.videoHeight, styleFixed: v.style.position, vjsClass: document.querySelector('.Player video-js').className.slice(0, 120) }; });
  report.fit = fit;

  // ---- problem report privacy against the REAL account values ----
  const snap = await p.evaluate(() => { const r = window.__mtv.snapshot('test'); return { json: r.json, leaked: r.leaked }; });
  const hits = [];
  const needles = { email: U, emailLower: U && U.toLowerCase(), password: P, encodedPassword: P && enc(P), emailUrlEnc: U && encodeURIComponent(U) };
  for (const k in needles) if (needles[k] && snap.json.indexOf(needles[k]) >= 0) hits.push(k);
  const userPart = U && U.split('@')[0];
  if (userPart && userPart.length >= 5 && snap.json.indexOf(userPart + '@') >= 0) hits.push('email-local-part');
  check('real page snapshot contains none of Matt\'s credentials (email/password, plain/encoded)', hits.length === 0 && snap.leaked === 0, { hits, sizeKB: Math.round(snap.json.length / 1024) });
  const parsed = JSON.parse(snap.json);
  check('real page snapshot: video + Brightcove player state present', parsed.media.length >= 1 && parsed.media[0].videoWidth > 0 && parsed.players.length >= 1 && parsed.players[0].mediainfo && parsed.players[0].mediainfo.cuePoints > 0,
    { media: parsed.media.length, video: parsed.media[0] && parsed.media[0].videoWidth + 'x' + parsed.media[0].videoHeight, src: parsed.media[0] && parsed.media[0].currentSrc, players: parsed.players.length, vhs: parsed.players[0] && parsed.players[0].vhs, dom: parsed.dom.length, console: parsed.console.length, net: parsed.network.length });
  // A real send end-to-end: worker stores it, query.sh reads it back.
  const sent = await p.evaluate(() => new Promise((res) => window.__mtv.sendReport('e2e-test', { test: true }, (ok, msg) => res({ ok, msg }))));
  check('real report POST accepted by the worker', sent.ok, sent);
  const rid = (/#(\d+)/.exec(sent.msg || '') || [])[1];
  if (rid) {
    const f = '/tmp/real-report-' + rid + '.json';
    execFileSync('/workspace/met/telemetry/query.sh', ['report', rid, f]);
    const stored = fs.readFileSync(f, 'utf8');
    const sh = [];
    for (const k in needles) if (needles[k] && stored.indexOf(needles[k]) >= 0) sh.push(k);
    const sp = JSON.parse(stored);
    check('stored report (fetched via query.sh) has no credentials and is complete', sh.length === 0 && sp.snapshot && sp.snapshot.dom.length > 10000 && sp.kind === 'e2e-test', { hits: sh, kind: sp.kind, domKB: Math.round(sp.snapshot.dom.length / 1024), id: rid });
    fs.unlinkSync(f);
    report.reportId = rid;
  }
  // leave: BACK hides the controls if shown, then BACK leaves the player
  if (await p.evaluate(() => !!document.querySelector('.mtv-po.mtv-show'))) await key(461, 400);
  await key(461, 1000);
  const after = await p.evaluate(() => ({ fs: document.documentElement.classList.contains('mtv-fs'), paused: document.querySelector('.Player video').paused }));
  check('BACK twice leaves the real player paused', !after.fs && after.paused, after);
  check('no account-changing requests were attempted (blocked list)', blocked.length === 0, blocked);
  fs.writeFileSync(path.join(OUT, 'v1.2.0_real-met-report.json'), JSON.stringify(report, null, 1));
  console.log('RESULT real-met', report.failures.length ? 'FAILURES: ' + report.failures.join(', ') : 'ALL PASS');
  await b.close();
})().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
