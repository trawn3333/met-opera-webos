// Minimal raw-CDP driver that works with very old Chrome/Chromium (53+) and current Chrome.
// launch({chrome, headless, xvfb, args, dpr, ua}) -> { send, ev, key, shot, early, go, close, events, exceptions, ver }
const fs = require('fs'), http = require('http'), { spawn } = require('child_process');
const WebSocket = require('ws');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const getJSON = (u) => new Promise((res, rej) => http.get(u, (r) => { let d = ''; r.on('data', (c) => (d += c)); r.on('end', () => { try { res(JSON.parse(d)); } catch (e) { rej(e); } }); }).on('error', rej));
const KEYS = { 13: 'Enter', 37: 'ArrowLeft', 38: 'ArrowUp', 39: 'ArrowRight', 40: 'ArrowDown', 8: 'Backspace', 27: 'Escape' };

async function launch(o) {
  const port = 9500 + Math.floor(Math.random() * 400);
  const args = ['--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--autoplay-policy=no-user-gesture-required', '--no-first-run', '--disable-background-networking',
    `--remote-debugging-port=${port}`, '--window-size=1920,1080', '--user-data-dir=' + (o.profile || '/tmp/cdp-prof-' + Date.now())].concat(o.args || []).concat(['about:blank']);
  const env = Object.assign({}, process.env, { LD_LIBRARY_PATH: '/tmp/oldchrome/gconf/usr/lib/x86_64-linux-gnu' });
  delete env.MET_OD_EMAIL; delete env.MET_OD_PASSWORD; // the browser process never needs them
  const proc = o.xvfb
    ? spawn('xvfb-run', ['-a', '-s', '-screen 0 1920x1080x24', o.chrome].concat(args), { stdio: 'ignore', env, detached: true })
    : spawn(o.chrome, ['--headless'].concat(args), { stdio: 'ignore', env, detached: true });
  let targets;
  for (let i = 0; i < 200; i++) { try { targets = await getJSON(`http://127.0.0.1:${port}/json`); if (targets.find((t) => t.type === 'page')) break; } catch (e) { /* */ } await sleep(250); }
  const page = targets.find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl, { perMessageDeflate: false });
  await new Promise((r) => ws.on('open', r));
  let id = 0; const pending = {}; const events = []; const exceptions = []; const consoleMsgs = []; let loads = 0;
  const listeners = [];
  ws.on('message', (m) => {
    const msg = JSON.parse(m);
    if (msg.id && pending[msg.id]) { pending[msg.id](msg); delete pending[msg.id]; }
    if (msg.method === 'Page.loadEventFired') loads++;
    if (msg.method === 'Runtime.exceptionThrown') { const d = msg.params.exceptionDetails; exceptions.push(((d.exception || {}).description || d.text || '').split('\n').slice(0, 3).join(' | ').slice(0, 400) + (d.url ? ' @' + d.url.split('/').pop() + ':' + d.lineNumber : '')); }
    if (msg.method === 'Runtime.consoleAPICalled') consoleMsgs.push(msg.params.type + ' ' + msg.params.args.map((a) => a.value !== undefined ? a.value : a.description || '').join(' ').slice(0, 300));
    if (msg.method) { events.push(msg.method); listeners.forEach((f) => f(msg)); }
  });
  const send = (method, params = {}, to = 30000) => new Promise((r) => { const i = ++id; pending[i] = r; ws.send(JSON.stringify({ id: i, method, params })); setTimeout(() => { if (pending[i]) { delete pending[i]; r({ error: 'timeout' }); } }, to); });
  const ev = async (expr, awaitPromise) => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: !!awaitPromise }); if (r.result && r.result.exceptionDetails) return 'EXC ' + JSON.stringify(r.result.exceptionDetails).slice(0, 300); return r.result && r.result.result ? r.result.result.value : undefined; };
  // Evaluate a function with JSON args (args travel over the local websocket only; never logged).
  // Old engines (<54) have no awaitPromise: park the result in a global and poll.
  const call = async (fnSrc, argsArr) => {
    const k = '__cdpR' + (++id);
    await ev('(function(){var r=(' + fnSrc + ').apply(null,' + JSON.stringify(argsArr || []) + ');window.' + k + '={};if(r&&typeof r.then==="function")r.then(function(v){window.' + k + '={done:1,v:v}},function(e){window.' + k + '={done:1,err:String(e)}});else window.' + k + '={done:1,v:r};})()');
    for (let i = 0; i < 240; i++) { const r = await ev('window.' + k); if (r && r.done) { await ev('delete window.' + k); return r.v; } await sleep(250); }
    return undefined;
  };
  const ver = await getJSON(`http://127.0.0.1:${port}/json/version`);
  await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
  if (o.certs) { // self-signed mock certs
    const r = await send('Security.setIgnoreCertificateErrors', { ignore: true });
    if (r.error) { await send('Security.enable'); await send('Security.setOverrideCertificateErrors', { override: true }); listeners.push((msg) => { if (msg.method === 'Security.certificateError') send('Security.handleCertificateError', { eventId: msg.params.eventId, action: 'continue' }); }); }
  }
  await send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: o.dpr || 1, mobile: false, screenWidth: 1920, screenHeight: 1080 });
  if (o.ua) await send('Network.setUserAgentOverride', { userAgent: o.ua });
  const early = async (src) => { const r = await send('Page.addScriptToEvaluateOnNewDocument', { source: src }); if (r.error) await send('Page.addScriptToEvaluateOnLoad', { scriptSource: src }); };
  const go = async (url, waitMs) => { const n = loads; await send('Page.navigate', { url }); for (let i = 0; i < (waitMs || 60000) / 250 && loads === n; i++) await sleep(250); await sleep(300); return loads > n; };
  // Trusted key press (clicks native buttons like a real remote). Non-standard codes (461, 403...) via keyCode only.
  const key = async (code, wait) => {
    const k = KEYS[code] || '';
    const base = { windowsVirtualKeyCode: code, nativeVirtualKeyCode: code, key: k, code: k };
    await send('Input.dispatchKeyEvent', Object.assign({ type: 'rawKeyDown' }, base));
    if (code === 13) await send('Input.dispatchKeyEvent', Object.assign({ type: 'char', text: '\r' }, base));
    await send('Input.dispatchKeyEvent', Object.assign({ type: 'keyUp' }, base));
    await sleep(wait === undefined ? 350 : wait);
  };
  const type = async (text) => { for (const ch of text) { await send('Input.dispatchKeyEvent', { type: 'keyDown', text: ch, key: ch, unmodifiedText: ch }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: ch }); await sleep(60); } };
  const shot = async (file) => { const s = await send('Page.captureScreenshot', {}, 60000); if (s.result) fs.writeFileSync(file, Buffer.from(s.result.data, 'base64')); return !!s.result; };
  const close = () => { try { ws.close(); } catch (e) { /* */ } try { process.kill(-proc.pid, 'SIGKILL'); } catch (e) { try { proc.kill('SIGKILL'); } catch (e2) { /* */ } } };
  return { send, ev, call, key, type, shot, early, go, close, events, exceptions, consoleMsgs, ver: ver.Browser, sleep };
}
module.exports = { launch, sleep };
