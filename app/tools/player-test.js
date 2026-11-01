// v1.2.0 player test on a local mock of a Met watch page (video.js-like API, cue points, subtitles,
// 2 audio tracks) served as https://ondemand.metopera.org via --host-resolver-rules. Raw CDP, so it
// runs on old Chromium (59/68) and current Chrome. Checks video fit, the remote overlay (show/hide,
// seek + hold acceleration, scenes, subtitles, audio, picture modes, BACK), top-bar focus safety,
// problem-report snapshots (sanitizing) and automatic playback-failure reports. Screenshots v1.2.0_*.
// Usage: node tools/player-test.js /path/to/chrome <label> [outdir]
const fs = require('fs'), path = require('path'), http = require('http'), zlib = require('zlib'), { spawn } = require('child_process');
const WebSocket = require('ws');
const SCRIPT = fs.readFileSync(path.join(__dirname, '../dist/webOSUserScripts/userScript.js'), 'utf8');
const [CHROME, LABEL, OUT = '/workspace/met/preview'] = process.argv.slice(2);
const PORT = 9300 + Math.floor(Math.random() * 90), MPORT = 8500 + Math.floor(Math.random() * 400);
const BASE = 'https://ondemand.metopera.org/performance/detail/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const getJSON = (u) => new Promise((res, rej) => http.get(u, (r) => { let d = ''; r.on('data', (c) => (d += c)); r.on('end', () => { try { res(JSON.parse(d)); } catch (e) { rej(e); } }); }).on('error', rej));
const report = { label: LABEL, shots: [], exceptions: [], checks: {}, failures: [] };
const check = (name, ok, info) => { report.checks[name] = { ok: !!ok, info }; if (!ok) report.failures.push(name); console.log((ok ? 'PASS ' : 'FAIL ') + name + (info !== undefined ? ' ' + JSON.stringify(info).slice(0, 400) : '')); };
const MOCK_U = 'mock.user@example.com', MOCK_P = 'hunter2-mock';
const enc = (s) => Buffer.from(unescape(encodeURIComponent(s)), 'binary').toString('base64').split('').reverse().join('');

(async () => {
  const srv = spawn('node', [path.join(__dirname, 'mock/server.js'), String(MPORT)], { stdio: 'ignore' });
  await sleep(600);
  const proc = spawn(CHROME, ['--headless', '--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--autoplay-policy=no-user-gesture-required', '--ignore-certificate-errors',
    `--proxy-server=127.0.0.1:${MPORT + 1}`, `--remote-debugging-port=${PORT}`, '--window-size=1920,1080', '--user-data-dir=/tmp/ptest-' + LABEL + Date.now(), 'about:blank'], { stdio: 'ignore' });
  let targets; for (let i = 0; i < 160; i++) { try { targets = await getJSON(`http://127.0.0.1:${PORT}/json`); break; } catch (e) { await sleep(250); } }
  const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((r) => ws.on('open', r));
  let id = 0; const pending = {}; let loads = 0;
  ws.on('message', (m) => { const msg = JSON.parse(m);
    if (msg.id && pending[msg.id]) { pending[msg.id](msg); delete pending[msg.id]; }
    if (msg.method === 'Page.loadEventFired') loads++;
    if (msg.method === 'Security.certificateError') send('Security.handleCertificateError', { eventId: msg.params.eventId, action: 'continue' });
    if (msg.method === 'Runtime.exceptionThrown') { const d = msg.params.exceptionDetails; report.exceptions.push(((d.exception || {}).description || d.text || '').split('\n').slice(0, 2).join(' | ').slice(0, 300)); }
  });
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending[i] = r; ws.send(JSON.stringify({ id: i, method, params })); setTimeout(() => r({ error: 'timeout' }), 60000); });
  const ev = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: false }); if (r.result && r.result.exceptionDetails) return 'EXC ' + JSON.stringify(r.result.exceptionDetails).slice(0, 300); return r.result && r.result.result ? r.result.result.value : undefined; };
  const shot = async (name) => { await sleep(700); const s = await send('Page.captureScreenshot', {}); const f = path.join(OUT, `v1.2.0_${LABEL}_${name}.png`); if (s.result) { fs.writeFileSync(f, Buffer.from(s.result.data, 'base64')); report.shots.push(f); console.log('shot', f); } };
  const keyEv = (type, k) => ev(`(function(){var t=document.activeElement||document.body;var e=document.createEvent('Event');e.initEvent('${type}',true,true);Object.defineProperty(e,'keyCode',{get:function(){return ${k}}});Object.defineProperty(e,'which',{get:function(){return ${k}}});t.dispatchEvent(e);})()`);
  const key = async (k, wait = 300) => { await keyEv('keydown', k); await keyEv('keyup', k); await sleep(wait); };
  const early = async (src) => { const r = await send('Page.addScriptToEvaluateOnNewDocument', { source: src }); if (r.error) await send('Page.addScriptToEvaluateOnLoad', { scriptSource: src }); };
  const go = async (url) => { const n = loads; await send('Page.navigate', { url }); for (let i = 0; i < 160 && loads === n; i++) await sleep(250); await sleep(300); await send('Runtime.evaluate', { expression: SCRIPT }); await sleep(1500); };
  const UP = 38, DOWN = 40, LEFT = 37, RIGHT = 39, OK = 13, BACK = 461, GREEN = 404, YELLOW = 405, PLAYK = 415, FF = 417;
  const vstate = () => ev(`(function(){var v=document.querySelector('.Player video');if(!v)return null;var r=v.getBoundingClientRect();return {t:Math.round(v.currentTime),paused:v.paused,rect:[r.left,r.top,r.width,r.height].map(Math.round),vw:v.videoWidth,vh:v.videoHeight,fs:document.documentElement.classList.contains('mtv-fs'),
     shown:!!document.querySelector('.mtv-po.mtv-show'),menu:(function(){var m=document.querySelector('.mtv-po-menu');return m&&m.style.display==='block'?m.querySelector('h3').textContent:null})(),
     sel:(function(){var s=document.querySelector('.mtv-po .mtv-sel');return s?(s.className+' '+(s.textContent||'')).slice(0,60):null})(),
     tracklistVisible:(function(){var t=document.getElementById('bcc-tracklist-panel');return !!t&&getComputedStyle(t).display!=='none'})(),
     activeInBar:!!(document.activeElement&&document.activeElement.closest&&document.activeElement.closest('.mtv-bar'))}})()`);

  const ver = await getJSON(`http://127.0.0.1:${PORT}/json/version`); report.engine = ver.Browser;
  console.log('engine', ver.Browser);
  await send('Security.enable');
  const ign = await send('Security.setIgnoreCertificateErrors', { ignore: true });
  if (ign.error) await send('Security.setOverrideCertificateErrors', { override: true }); // old engines (mock uses a self-signed cert)
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
  if (process.env.EMU53) await early(fs.readFileSync(path.join(__dirname, 'emulate-c53.js'), 'utf8'));
  await early(`try{localStorage.setItem('mtv.tlm.device','e2e-test-player-${LABEL}'.replace(/[^A-Za-z0-9._:-]/g,'-').slice(0,60));localStorage.setItem('mtv.panelSeen','true');localStorage.setItem('mtv.hintShown','1');
    localStorage.setItem('mtv.creds', JSON.stringify({u:'${MOCK_U}',p:'${enc(MOCK_P)}'}));if(!sessionStorage.getItem('mtvTestInit')){sessionStorage.setItem('mtvTestInit','1');localStorage.removeItem('mtv.autoReports');localStorage.removeItem('mtv.picMode');localStorage.removeItem('mtv.resume')}}catch(e){}`);

  // ---- title page ----
  await go(BASE + 'mock');
  await sleep(1500);
  await shot('1-title-page');
  // Start playback the way Matt does: OK on the focused Play button.
  const foc = await ev("document.activeElement && document.activeElement.className");
  check('initial focus on Play', /vjs-big-play-button/.test(foc || ''), foc);
  await key(403, 700); await shot('1b-settings-panel'); await key(BACK, 500);
  await ev("document.querySelector('.vjs-big-play-button').focus()");
  await ev('document.activeElement.click()'); await sleep(3500); // OK on a native <button> = click on the TV
  let s = await vstate();
  check('playback starts and goes full screen', s && s.fs && !s.paused && s.t >= 1, s);
  check('video pinned to the 1920x1080 viewport (LG fixed 0,0 recommendation)', s && s.rect.join() === '0,0,1920,1080', s && s.rect);
  check('Met tracklist sidebar + controls hidden in full screen', s && !s.tracklistVisible, s);
  check('overlay hidden while just watching', s && !s.shown, s);
  await shot('2-video-fit-fullscreen');

  // ---- overlay show / buttons ----
  await key(DOWN, 600);
  s = await vstate();
  check('DOWN shows controls with Play/Pause selected', s.shown && /Pause|Play/.test(s.sel || ''), s.sel);
  await shot('3-player-controls');
  for (let i = 0; i < 6; i++) await key(UP, 200);
  s = await vstate();
  check('top bar never steals focus in the player (UP x6)', !s.activeInBar && s.fs, s);
  await sleep(4600);
  s = await vstate();
  check('controls auto-hide after ~4 s', !s.shown, s.shown);

  // ---- OK toggles play/pause when hidden ----
  await key(OK, 500); s = await vstate(); const pausedAfterOk = s.paused;
  await shot('4-paused-badge');
  await key(OK, 500); s = await vstate();
  check('OK toggles pause/play with controls hidden', pausedAfterOk === true && s.paused === false && !s.shown, { pausedAfterOk, nowPaused: s.paused });

  // ---- seek: single + hold acceleration ----
  let t0 = (await vstate()).t;
  await key(RIGHT, 1200);
  s = await vstate();
  check('RIGHT (hidden) seeks +10 s and shows the scrub bar', s.t - t0 >= 9 && s.t - t0 <= 13 && s.shown && /scrub/.test(s.sel || ''), { from: t0, to: s.t });
  t0 = s.t;
  for (let i = 0; i < 20; i++) { await keyEv('keydown', RIGHT); await sleep(90); }
  await shot('5-seek-hold-preview');
  await keyEv('keyup', RIGHT); await sleep(1200);
  s = await vstate();
  check('holding RIGHT accelerates (20 repeats > 300 s)', s.t - t0 > 300, { from: t0, to: s.t, jumped: s.t - t0 });
  t0 = s.t; await key(LEFT, 1200); s = await vstate();
  check('LEFT on scrub bar seeks back 10 s', t0 - s.t >= 8 && t0 - s.t <= 12, { from: t0, to: s.t });

  // ---- scenes menu ----
  await key(DOWN, 200);   // to buttons
  // go to "Scenes" (index 6) from wherever: LEFT x10 then RIGHT x6
  for (let i = 0; i < 10; i++) await key(LEFT, 60);
  for (let i = 0; i < 6; i++) await key(RIGHT, 60);
  await key(OK, 400);
  s = await vstate();
  check('Scenes list opens', s.menu === 'Scenes', s.menu);
  await shot('6-scenes-menu');
  // choose the 5th scene ("O sink hernieder", 1500 s)
  for (let i = 0; i < 8; i++) await key(UP, 50);
  for (let i = 0; i < 4; i++) await key(DOWN, 50);
  await key(OK, 1200);
  s = await vstate();
  check('jump to scene (Act II "O sink hernieder" @1500 s)', Math.abs(s.t - 1500) <= 3, s.t);
  // next/prev scene buttons: index 5 = next, 1 = prev
  await key(DOWN, 100); for (let i = 0; i < 10; i++) await key(LEFT, 50); for (let i = 0; i < 5; i++) await key(RIGHT, 50);
  await key(OK, 1000); s = await vstate();
  check('Next scene button', Math.abs(s.t - 1800) <= 3, s.t);
  for (let i = 0; i < 4; i++) await key(LEFT, 50);
  await key(OK, 1000); s = await vstate();
  check('Prev scene button (within 5 s of scene start -> previous scene)', Math.abs(s.t - 1500) <= 3, s.t);

  // ---- subtitles ----
  for (let i = 0; i < 6; i++) await key(RIGHT, 50);   // index 7 = CC
  await key(OK, 400);
  s = await vstate(); check('Subtitles menu opens', s.menu === 'Subtitles', s.menu);
  await key(DOWN, 100);
  await shot('7-subtitles-menu');
  await key(OK, 800);
  const tt = await ev("(function(){var v=document.querySelector('.Player video');return [].map.call(v.textTracks,function(t){return t.language+':'+t.mode})})()");
  check('subtitle track English showing', tt && tt.indexOf('en:showing') >= 0, tt);
  await sleep(600);
  // ---- audio ----
  await key(RIGHT, 50); await key(OK, 400);
  s = await vstate(); check('Audio menu opens', s.menu === 'Audio', s.menu);
  await key(DOWN, 100); await key(OK, 500);
  const au = await ev("window.videojs.getPlayer().audioTracks().map(function(t){return t.id+':'+t.enabled})");
  check('audio track switched to description', au && au.join() === 'en:false,ad:true', au);
  await shot('8-subtitles-on-controls');

  // ---- BACK: hide, then leave the player ----
  await key(BACK, 400); s = await vstate();
  check('BACK hides controls first (still full screen, playing)', !s.shown && s.fs && !s.paused, s);
  await key(BACK, 800); s = await vstate();
  check('second BACK leaves the player (paused, page view)', !s.fs && s.paused, s);
  const vr = await ev("(function(){var v=document.querySelector('.Player video');return v.getAttribute('style')})()");
  check('inline fit styles removed after leaving', !vr, vr);

  // ---- media keys from page ----
  await key(PLAYK, 1500); s = await vstate();
  check('PLAY media key resumes in full screen', s.fs && !s.paused, s);
  t0 = s.t; await key(FF, 1000); s = await vstate();
  check('FF media key +30 s', s.t - t0 >= 28 && s.t - t0 <= 33, { from: t0, to: s.t });

  // ---- report snapshot (sanitizing) ----
  const snap = await ev("(function(){var r=window.__mtv.snapshot('test');return {len:r.json.length,leaked:r.leaked,json:r.json}})()");
  const J = snap.json || '';
  const forbidden = { mockEmail: MOCK_U, mockPassword: MOCK_P, encodedPassword: enc(MOCK_P), jwt: 'eyJhbGciOiJIUzI1NiJ9', urlToken: 'SECRETTOKEN123' };
  const leaks = Object.keys(forbidden).filter((k) => J.indexOf(forbidden[k]) >= 0);
  if (process.env.MET_OD_EMAIL && J.indexOf(process.env.MET_OD_EMAIL) >= 0) leaks.push('MET_OD_EMAIL');
  if (process.env.MET_OD_PASSWORD && J.indexOf(process.env.MET_OD_PASSWORD) >= 0) leaks.push('MET_OD_PASSWORD');
  let parsed = null; try { parsed = JSON.parse(J); } catch (e) { /* */ }
  check('snapshot is valid JSON', !!parsed, snap.len);
  check('snapshot contains no account data / emails / JWTs / URL tokens', leaks.length === 0 && snap.leaked === 0, { leaks, len: snap.len });
  check('snapshot has DOM, video state, players, console, viewport', parsed && parsed.dom.length > 1000 && parsed.media.length === 1 && parsed.media[0].videoWidth === 1280 &&
    parsed.media[0].textTracks.length === 2 && parsed.players.length === 1 && parsed.players[0].mediainfo.cuePoints === 7 && parsed.console.length > 0 && parsed.viewport.innerWidth === 1920,
    parsed && { dom: parsed.dom.length, media: parsed.media[0] && { w: parsed.media[0].videoWidth, rs: parsed.media[0].readyState, buffered: parsed.media[0].buffered }, players: parsed.players.length, console: parsed.console.length, net: parsed.network.length });
  check('input values + inline script bodies stripped', parsed && !/value="[^"]+"/.test(parsed.dom.replace(/value=""/g, '')) && /chars removed/.test(parsed.dom), null);

  // ---- hold GREEN = report (captured, not sent) ----
  await ev("window.__cap=[];window.MetTelemetry.__post=window.MetTelemetry.__post||window.MetTelemetry.postReport;window.MetTelemetry.postReport=function(b,gz,cb){window.__cap.push({gz:gz,len:b.length,body:gz?Array.prototype.slice.call(b):b});setTimeout(function(){cb(true,200,'{\"ok\":true,\"id\":0}')},50)}");
  await keyEv('keydown', GREEN); for (let i = 0; i < 8; i++) { await sleep(150); await keyEv('keydown', GREEN); } await keyEv('keyup', GREEN);
  await sleep(2500);
  const cap = await ev("(function(){return window.__cap.map(function(c){return {gz:c.gz,len:c.len,body:c.body}})})()");
  const toast = await ev("(function(){var t=document.querySelector('.mtv-toast');return t?t.textContent:''})()");
  const logOpen = await ev("(function(){var o=document.querySelector('.mtv-log');return !!o&&o.style.display==='block'})()");
  let rep = null;
  if (cap && cap[0]) { try { const buf = Buffer.from(cap[0].body); rep = JSON.parse(cap[0].gz ? zlib.gunzipSync(buf).toString('utf8') : cap[0].body); } catch (e) { rep = { err: e.message }; } }
  check('hold GREEN sends one gzip report and shows a toast; debug log not left open', cap && cap.length === 1 && cap[0].gz && rep && rep.kind === 'manual' && /sent/.test(toast) && !logOpen,
    { n: cap && cap.length, gzKB: cap && cap[0] && Math.round(cap[0].len / 1024), rawKB: rep && rep.snapshot && Math.round(JSON.stringify(rep).length / 1024), toast, logOpen });
  await shot('9-report-sent-toast');
  // short GREEN press = log only
  await key(GREEN, 1300);
  const cap2 = await ev('window.__cap.length'); const logOpen2 = await ev("(function(){var o=document.querySelector('.mtv-log');return !!o&&o.style.display==='block'})()");
  check('short GREEN press opens the debug log only (no report)', cap2 === 1 && logOpen2, { cap2, logOpen2 });
  await key(GREEN, 300);

  // ---- picture mode "Exact fit" with a 4:3 video ----
  await go(BASE + 'mock43');
  await ev("localStorage.setItem('mtv.picMode', JSON.stringify('fit'))");
  await key(PLAYK, 3000);
  s = await vstate();
  check('4:3 video, Exact fit: element is the letterboxed 1440x1080 rect', s && s.fs && s.rect.join() === '240,0,1440,1080', s && s.rect);
  await key(DOWN, 500);
  await shot('10-4x3-exact-fit-controls');
  await ev("localStorage.setItem('mtv.picMode', JSON.stringify('std'))");

  // ---- local resume prompt (only when the Met did not resume by itself) ----
  await ev("localStorage.setItem('mtv.resume', JSON.stringify({'/performance/detail/mock': {t: 600, d: 2400, at: Date.now()}}))");
  await go(BASE + 'mock');
  await key(PLAYK, 3000);
  s = await vstate();
  check('resume prompt offered for a locally remembered position', s.menu === 'Continue where you left off?', s.menu);
  await shot('11-resume-prompt');
  await key(OK, 1500); s = await vstate();
  check('OK resumes at the remembered position', Math.abs(s.t - 600) <= 3, s.t);

  // ---- automatic report: media error ----
  await ev("localStorage.removeItem('mtv.autoReports')");
  const capHook = "window.__cap=[];window.MetTelemetry.postReport=function(b,gz,cb){var j=null;window.__cap.push({gz:gz,len:b.length});setTimeout(function(){cb(true,200,'{\"ok\":true,\"id\":0}')},50)};window.MetTelemetry.setEnabled(true);";
  await go(BASE + 'broken');
  await ev(capHook);
  await ev("document.querySelector('.Player video').load()");
  await sleep(3000);
  let kinds = await ev("(function(){return window.__mtv.errors().filter(function(e){return /auto report|playback problem/.test(e.m)}).length + '|' + (window.__cap||[]).length})()");
  const autoLog = await ev("(function(){return (window.__mtvLogBuf||[]).filter(function(l){return /playback problem|auto report/.test(l)}).slice(-4)})()");
  check('media error -> automatic report', /media-error/.test(JSON.stringify(autoLog)) && +String(kinds).split('|')[1] >= 1, { autoLog, kinds });
  // same failure again (fresh page) is rate-limited
  await go(BASE + 'broken'); await ev(capHook);
  await ev("document.querySelector('.Player video').load()");
  await sleep(3000);
  const autoLog2 = await ev("(function(){return (window.__mtvLogBuf||[]).filter(function(l){return /suppressed/.test(l)}).length})()");
  check('repeat failure is rate-limited', autoLog2 >= 1, autoLog2 >= 1 ? autoLog2 : await ev("(window.__mtvLogBuf||[]).slice(-8)"));
  // ---- stalled > 20 s ----
  if (!process.env.QUICK) {
    await go(BASE + 'mock');
    await ev(capHook);
    await key(PLAYK, 3000);
    await ev("(function(){var v=document.querySelector('.Player video');var t=v.currentTime;Object.defineProperty(v,'currentTime',{configurable:true,get:function(){return t},set:function(x){}})})()");
    await sleep(25000);
    const st = await ev("(function(){return (window.__mtvLogBuf||[]).filter(function(l){return /playback problem \\(stalled/.test(l)}).length + '|' + window.__cap.length})()");
    check('stalled > 20 s while playing -> automatic report', /^1\|/.test(String(st)) && +String(st).split('|')[1] >= 1, st);
    // ---- no video after 30 s ----
    await go(BASE + 'novideo');
    await ev(capHook);
    await sleep(33000);
    const nv = await ev("(function(){return (window.__mtvLogBuf||[]).filter(function(l){return /no-video/.test(l)}).length + '|' + window.__cap.length})()");
    check('no video on a watch page after 30 s -> automatic report', +String(nv).split('|')[0] >= 1 && +String(nv).split('|')[1] >= 1, nv);
  }

  report.exceptions = report.exceptions.filter((x) => !/example\.invalid/.test(x));
  check('no uncaught exceptions from the userscript', !report.exceptions.some((x) => /mtv|userScript|__mtvMain/.test(x)), report.exceptions.slice(0, 5));
  fs.writeFileSync(path.join(OUT, `v1.2.0_${LABEL}_player-report.json`), JSON.stringify(report, null, 1));
  console.log('RESULT', LABEL, report.failures.length ? 'FAILURES: ' + report.failures.join(', ') : 'ALL PASS');
  ws.close(); proc.kill('SIGKILL'); srv.kill('SIGKILL'); process.exit(0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
