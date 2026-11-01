// Takes TV-preview screenshots (1920x1080) with WAM-style (after-load) userscript injection, via raw CDP.
// Usage: node tools/preview-shots.js /path/to/chrome <label> [outdir]
const fs = require('fs'), path = require('path'), http = require('http'), { spawn } = require('child_process');
const WebSocket = require('ws');
const SCRIPT = fs.readFileSync(path.join(__dirname, '../dist/webOSUserScripts/userScript.js'), 'utf8');
const [CHROME, LABEL, OUT = '/workspace/met/preview'] = process.argv.slice(2);
const HOME = 'https://ondemand.metopera.org/';
const DETAIL = 'https://ondemand.metopera.org/performance/detail/c49458c3-8205-5903-9bc7-ab37885d542c';
const PORT = 9400 + Math.floor(Math.random() * 400);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const getJSON = (u) => new Promise((res, rej) => http.get(u, (r) => { let d = ''; r.on('data', (c) => (d += c)); r.on('end', () => { try { res(JSON.parse(d)); } catch (e) { rej(e); } }); }).on('error', rej));
const report = { label: LABEL, shots: [], exceptions: [], consoleErrors: [], steps: {} };

(async () => {
  const proc = spawn(CHROME, ['--headless', '--no-sandbox', '--disable-gpu', '--hide-scrollbars', `--remote-debugging-port=${PORT}`, '--window-size=1920,1080', '--user-data-dir=/tmp/preview-' + LABEL + Date.now(), 'about:blank'], { stdio: 'ignore' });
  let targets; for (let i = 0; i < 160; i++) { try { targets = await getJSON(`http://127.0.0.1:${PORT}/json`); break; } catch (e) { await sleep(250); } }
  const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((r) => ws.on('open', r));
  let id = 0; const pending = {}; let loads = 0;
  ws.on('message', (m) => { const msg = JSON.parse(m);
    if (msg.id && pending[msg.id]) { pending[msg.id](msg); delete pending[msg.id]; }
    if (msg.method === 'Page.loadEventFired') loads++;
    if (msg.method === 'Runtime.exceptionThrown') { const d = msg.params.exceptionDetails; report.exceptions.push(((d.exception || {}).description || d.text || '').split('\n').slice(0, 2).join(' | ').slice(0, 300) + (d.url ? ' @' + d.url.split('/').pop() + ':' + d.lineNumber + ':' + d.columnNumber : '')); }
    if (msg.method === 'Runtime.consoleAPICalled' && /error|warning/.test(msg.params.type)) report.consoleErrors.push(msg.params.args.map((a) => a.value || a.description || '').join(' ').slice(0, 300));
  });
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending[i] = r; ws.send(JSON.stringify({ id: i, method, params })); setTimeout(() => r({ error: 'timeout' }), 30000); });
  const ev = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true }); return r.result && r.result.result ? r.result.result.value : undefined; };
  const shot = async (name) => { await sleep(700); const s = await send('Page.captureScreenshot', {}); const f = path.join(OUT, `${LABEL}_${name}.png`); if (s.result) { fs.writeFileSync(f, Buffer.from(s.result.data, 'base64')); report.shots.push(f); console.log('shot', f); } else console.log('shot failed', name, JSON.stringify(s.error)); };
  const key = (k) => ev(`(function(){var t=document.activeElement||document.body;var e=document.createEvent('Event');e.initEvent('keydown',true,true);Object.defineProperty(e,'keyCode',{get:function(){return ${k}}});Object.defineProperty(e,'which',{get:function(){return ${k}}});t.dispatchEvent(e);})()`);
  const early = async (src) => { const r = await send('Page.addScriptToEvaluateOnNewDocument', { source: src }); if (r.error) await send('Page.addScriptToEvaluateOnLoad', { scriptSource: src }); };
  const go = async (url) => { const n = loads; await send('Page.navigate', { url }); for (let i = 0; i < 160 && loads === n; i++) await sleep(250); await sleep(300); const r = await send('Runtime.evaluate', { expression: SCRIPT }); if (r.result && r.result.exceptionDetails) report.exceptions.push('INJECT: ' + JSON.stringify(r.result.exceptionDetails).slice(0, 200)); };
  const state = () => ev(`(function(){var r=document.getElementById('root');var a=document.activeElement;return {root:r?r.children.length:-1,tiles:document.querySelectorAll('.Tile').length,tileImgs:(function(){var a=document.querySelectorAll('.Tile img'),ok=0,pend=0,vis=0,broken=0;for(var i=0;i<a.length;i++){var r=a[i].getBoundingClientRect();if(r.bottom>0&&r.top<innerHeight){vis++;if(a[i].getAttribute('data-mtv-src'))pend++;else if(a[i].complete&&a[i].naturalWidth)ok++;else broken++;}}return {inView:vis,loaded:ok,pendingDeferred:pend,notLoaded:broken}})(),focus:a?a.tagName+'.'+String(a.className).slice(0,40)+':'+(a.textContent||'').trim().slice(0,30):null,recover:window.__mtv&&window.__mtv.recover,hist:history.length,url:location.href}})()`);

  const ver = await getJSON(`http://127.0.0.1:${PORT}/json/version`); report.engine = ver.Browser;
  await send('Page.enable'); await send('Runtime.enable');
  const [VW, VH] = (process.env.VIEW || '1920x1080').split('x').map(Number);
  await send('Emulation.setDeviceMetricsOverride', { width: VW, height: VH, deviceScaleFactor: 1, mobile: false });
  if (process.env.UA) await send('Network.setUserAgentOverride', { userAgent: process.env.UA });
  if (process.env.EMU53) await early(fs.readFileSync(path.join(__dirname, 'emulate-c53.js'), 'utf8'));
  if (process.env.MOCK) await early(fs.readFileSync(path.join(__dirname, 'mock-signed-in.js'), 'utf8'));
  await early("try{localStorage.setItem('mtv.tlm.off','1');localStorage.setItem('mtv.panelSeen','true');localStorage.setItem('mtv.hintShown','1')}catch(e){}");

  // 1) home with focus ring on a tile
  await go(HOME);
  for (let i = 0; i < 40; i++) { if (await ev("document.querySelectorAll('.Tile').length")) break; await sleep(500); }
  await sleep(2500);
  await ev('window.__mtv&&window.__mtv.focusFirst()');
  for (let i = 0; i < 6; i++) { const onTile = await ev("!!(document.activeElement&&(document.activeElement.closest?document.activeElement.closest('.Tile'):null||document.activeElement.querySelector('.Tile')))"); if (onTile) break; await ev("window.__mtv.navigate('down')"); await sleep(500); }
  await ev("window.__mtv.navigate('right')"); await sleep(1200);
  report.steps.home = await state(); await shot('1-home-focus-on-tile');
  // 2) RED settings panel
  await key(403); await sleep(600); report.steps.red = await ev("!!document.querySelector('.mtv-panel.mtv-open')"); await shot('2-red-settings-panel');
  await key(461); await sleep(400);
  // 3) GREEN debug log
  await key(404); await sleep(1300); report.steps.green = await ev("(function(){var o=document.querySelector('.mtv-log');return o?o.innerText.slice(0,1500):null})()"); await shot('3-green-debug-log');
  await key(404);
  // 4) title/detail page
  await go(DETAIL);
  for (let i = 0; i < 40; i++) { if (await ev("!!document.querySelector('.Player,.PerformanceInfo')")) break; await sleep(500); }
  await sleep(6000); // the userscript itself moves focus to Play on title pages
  report.steps.detail = await state(); await shot('4-title-detail-page');
  // 5) watchdog: block the Met main bundle so the app never starts
  const b = await send('Network.enable'); const bl = process.env.MOCK ? { error: 'skipped' } : await send('Network.setBlockedURLs', { urls: ['*main.*.chunk.js'] });
  report.steps.blockSupported = !bl.error;
  if (!bl.error) { await go(HOME); await sleep(14500); report.steps.watchdog = await ev("(function(){var f=document.querySelector('.mtv-fail');return f?f.innerText.slice(0,200):null})()"); await shot('5-watchdog-did-not-start'); }
  fs.writeFileSync(path.join(OUT, `${LABEL}_report.json`), JSON.stringify(report, null, 1));
  console.log(JSON.stringify(report.steps, null, 1)); console.log('exceptions:', report.exceptions.length); report.exceptions.slice(0, 12).forEach((e) => console.log('  ', e));
  ws.close(); proc.kill(); process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
