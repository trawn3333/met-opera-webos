// Runs the live Met site + userscript in an OLD Chromium (e.g. 68 = webOS 5.x engine) via raw CDP,
// to catch syntax/API incompatibilities. Usage: node tools/old-engine-test.js /path/to/chrome
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');
const WebSocket = require('ws');
const SCRIPT = fs.readFileSync(path.join(__dirname, '../dist/webOSUserScripts/userScript.js'), 'utf8');
const CHROME = process.argv[2];
const URL_ = process.argv[3] || 'https://ondemand.metopera.org/';
const PORT = 9333;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const getJSON = (u) => new Promise((res, rej) => http.get(u, (r) => { let d = ''; r.on('data', (c) => (d += c)); r.on('end', () => { try { res(JSON.parse(d)); } catch (e) { rej(e); } }); }).on('error', rej));

(async () => {
  // Chromium < 59 has no --headless: set XVFB=1 to run it inside xvfb-run instead.
  const chromeArgs = ['--no-sandbox', '--disable-gpu', `--remote-debugging-port=${PORT}`, '--window-size=1920,1080', '--user-data-dir=/tmp/old-engine-profile-' + Date.now(), 'about:blank'];
  const proc = process.env.XVFB
    ? spawn('xvfb-run', ['-a', '-s', '-screen 0 1920x1080x24', CHROME].concat(chromeArgs), { stdio: 'ignore', env: process.env, detached: true })
    : spawn(CHROME, ['--headless'].concat(chromeArgs), { stdio: 'ignore' });
  let targets;
  for (let i = 0; i < 160; i++) { try { targets = await getJSON(`http://127.0.0.1:${PORT}/json`); break; } catch (e) { await sleep(250); } }
  const page = targets.find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => ws.on('open', r));
  let id = 0; const pending = {}; const exceptions = []; const events = []; const consoleErrors = [];
  ws.on('message', (m) => {
    const msg = JSON.parse(m);
    if (msg.id && pending[msg.id]) { pending[msg.id](msg); delete pending[msg.id]; }
    if (msg.method === 'Runtime.consoleAPICalled' && (msg.params.type === 'error' || msg.params.type === 'warning')) consoleErrors.push(msg.params.args.map((a) => a.value || a.description || '').join(' ').slice(0, 400));
    if (msg.method === 'Runtime.exceptionThrown') exceptions.push((msg.params.exceptionDetails.exception || {}).description || msg.params.exceptionDetails.text);
    if (msg.method) events.push(msg.method);
  });
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
  const evaluate = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true }); return r.result && r.result.result ? r.result.result.value : r; };

  const ver = await getJSON(`http://127.0.0.1:${PORT}/json/version`);
  console.log('engine:', ver.Browser, '|', ver['User-Agent']);
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
  const addEarly = async (src) => {
    const r = await send('Page.addScriptToEvaluateOnNewDocument', { source: src });
    if (r.error) await send('Page.addScriptToEvaluateOnLoad', { scriptSource: src }); // Chromium < 63
  };
  if (!process.env.NOSCRIPT) await addEarly("localStorage.setItem('mtv.panelSeen','true');localStorage.setItem('mtv.hintShown','1');" +
    (process.env.TLMDEV ? "localStorage.setItem('mtv.tlm.device'," + JSON.stringify(process.env.TLMDEV) + ");" : "localStorage.setItem('mtv.tlm.off','1');"));
  if (process.env.EARLY) await addEarly(SCRIPT);
  await send('Page.navigate', { url: URL_ });
  for (let i = 0; i < 120 && !events.includes('Page.loadEventFired'); i++) await sleep(250);
  console.log('load event:', events.includes('Page.loadEventFired'));
  if (process.env.DELAY_MS) { await sleep(+process.env.DELAY_MS); console.log('root children before injection:', await evaluate("document.getElementById('root').children.length")); }
  const siteExceptions = exceptions.length;
  // WAM-style injection after load
  const inj = (process.env.EARLY || process.env.NOSCRIPT) ? { result: {} } : await send('Runtime.evaluate', { expression: SCRIPT });
  console.log('inject exception:', inj.result && inj.result.exceptionDetails ? JSON.stringify(inj.result.exceptionDetails).slice(0, 300) : 'none');
  for (let i = 0; i < 60; i++) { if (await evaluate("document.querySelectorAll('.Tile').length")) break; await sleep(500); }
  await sleep(3000);
  const res = await evaluate(`(function(){
    var out = {};
    out.tiles = document.querySelectorAll('.Tile').length;
    out.mtv = document.documentElement.className;
    out.footerHidden = document.querySelector('.footer') ? getComputedStyle(document.querySelector('.footer')).display : 'n/a';
    out.deferredInView = Array.prototype.filter.call(document.querySelectorAll('img[data-mtv-src]'), function(i){var r=i.getBoundingClientRect();return r.bottom>0&&r.top<innerHeight&&r.width>0;}).length;
    out.deferredTotal = document.querySelectorAll('img[data-mtv-src]').length;
    out.heroImgLoaded = (function(){var i=document.querySelector('.Slide-overlay-image img');return i?{src:(i.getAttribute('src')||'').slice(-20),w:i.naturalWidth,pending:i.getAttribute('data-mtv-src')}:null;})();
    out.stats = window.__mtv ? window.__mtv.perfStats() : 'no __mtv';
    out.ring = getComputedStyle(document.activeElement).outlineWidth;
    out.imgsWithSrc = Array.prototype.filter.call(document.images, function(i){return i.complete && i.naturalWidth>0;}).length;
    return out;
  })()`);
  console.log(JSON.stringify(res, null, 1));
  console.log('page state:', JSON.stringify(await evaluate("(function(){var r=document.getElementById('root');return {rootChildren:r?r.children.length:-1, bodyText:(document.body.innerText||'').slice(0,120), bodyBg:getComputedStyle(document.body).backgroundColor, htmlBg:getComputedStyle(document.documentElement).backgroundColor}})()")));
  if (process.env.NOSCRIPT || !(await evaluate('!!window.__mtv'))) { console.log('exceptions:', exceptions.length, '| console errors:', consoleErrors.length); consoleErrors.slice(0, 6).forEach((e) => console.log('  console:', e)); exceptions.slice(0, 8).forEach((e) => console.log('  exception:', String(e).slice(0, 300))); if (process.env.SHOT) { const sh = await send('Page.captureScreenshot', {}); if (sh.result) fs.writeFileSync(process.env.SHOT, Buffer.from(sh.result.data, 'base64')); } try { process.kill(-proc.pid); } catch (e) { proc.kill(); } process.exit(0); }
  // Key-driven navigation with real delays (focus/scroll settle between presses).
  await evaluate('window.__mtv.focusFirst()');
  const trail = [];
  for (const d of ['down', 'down', 'down', 'right', 'down', 'up', 'up']) {
    await evaluate(`window.__mtv.navigate('${d}')`); await sleep(400);
    trail.push(d + '->' + await evaluate("(function(){var a=document.activeElement;return a.tagName+':'+(a.textContent||a.className||'').trim().slice(0,22)})()"));
  }
  console.log('nav trail:', trail.join(' | '));
  console.log('recover state:', JSON.stringify(await evaluate('window.__mtv && window.__mtv.recover')));
  await sleep(1500);
  console.log('after nav stats:', JSON.stringify(await evaluate('window.__mtv.perfStats()')));
  {
    const counts = {};
    for (const [label, expr] of [['window', 'window'], ['document', 'document']]) {
      const o = await send('Runtime.evaluate', { expression: expr });
      const l = await send('DOMDebugger.getEventListeners', { objectId: o.result.result.objectId });
      const ls = (l.result && l.result.listeners) || [];
      ls.forEach((x) => { const k = label + ':' + x.type; counts[k] = (counts[k] || 0) + 1; });
    }
    console.log('listeners:', JSON.stringify(counts));
    const before = exceptions.length;
    await evaluate("(function(){for(var i=0;i<5;i++){window.scrollTo(0,400*i);window.dispatchEvent(new Event('scroll'));window.dispatchEvent(new Event('resize'));}})()");
    await sleep(1500);
    console.log('exceptions from 5 scroll/resize events:', exceptions.length - before);
  }
  if (process.env.TLMDEV) {
    await evaluate("console.error(new Error('old-engine-tlm-check'));setTimeout(function(){throw new Error('old-engine-uncaught')},0);1");
    await sleep(3000);
    await evaluate('window.MetTelemetry && window.MetTelemetry.flush()');
    await sleep(3000);
    console.log('telemetry info:', JSON.stringify(await evaluate('window.__mtv.telemetry()')));
  }
  console.log('site exceptions before injection:', siteExceptions, '| exceptions after injection:', exceptions.length - siteExceptions);
  exceptions.slice(0, 5).forEach((e) => console.log('  exception:', String(e).slice(0, 200)));
  if (process.env.SHOT) { const sh = await send('Page.captureScreenshot', {}); if (sh.result) fs.writeFileSync(process.env.SHOT, Buffer.from(sh.result.data, 'base64')); }
  ws.close(); try { process.kill(-proc.pid); } catch (e) { proc.kill(); }
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
