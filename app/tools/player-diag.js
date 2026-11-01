// Diagnose the Met/Brightcove player on a detail page in a given Chromium (raw CDP).
const fs = require('fs'), path = require('path'), http = require('http'), { spawn } = require('child_process');
const WebSocket = require('ws');
const SCRIPT = fs.readFileSync(path.join(__dirname, '../dist/webOSUserScripts/userScript.js'), 'utf8');
const [CHROME, URL_ = 'https://ondemand.metopera.org/performance/detail/c49458c3-8205-5903-9bc7-ab37885d542c'] = process.argv.slice(2);
const PORT = 9800 + Math.floor(Math.random() * 100);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const getJSON = (u) => new Promise((res, rej) => http.get(u, (r) => { let d = ''; r.on('data', (c) => (d += c)); r.on('end', () => { try { res(JSON.parse(d)); } catch (e) { rej(e); } }); }).on('error', rej));
(async () => {
  const proc = spawn(CHROME, ['--headless', '--no-sandbox', '--disable-gpu', `--remote-debugging-port=${PORT}`, '--window-size=1920,1080', '--user-data-dir=/tmp/pdiag' + Date.now(), 'about:blank'], { stdio: 'ignore' });
  let t; for (let i = 0; i < 160; i++) { try { t = await getJSON(`http://127.0.0.1:${PORT}/json`); break; } catch (e) { await sleep(250); } }
  const ws = new WebSocket(t.find((x) => x.type === 'page').webSocketDebuggerUrl); await new Promise((r) => ws.on('open', r));
  let id = 0; const pending = {}; let loaded = false; const log = []; const reqs = {};
  ws.on('message', (m) => { const msg = JSON.parse(m); if (msg.id && pending[msg.id]) { pending[msg.id](msg); delete pending[msg.id]; }
    const p = msg.params || {};
    if (msg.method === 'Page.loadEventFired') loaded = true;
    if (msg.method === 'Runtime.exceptionThrown') log.push('EXC ' + (((p.exceptionDetails.exception || {}).description) || p.exceptionDetails.text).split('\n').slice(0, 3).join(' | ').slice(0, 400));
    if (msg.method === 'Runtime.consoleAPICalled') log.push('CONSOLE.' + p.type + ' ' + p.args.map((a) => a.value || a.description || '').join(' ').slice(0, 300));
    if (msg.method === 'Log.entryAdded') log.push('LOG.' + p.entry.level + ' ' + p.entry.text.slice(0, 250) + ' ' + (p.entry.url || '').slice(0, 120));
    if (msg.method === 'Network.requestWillBeSent') reqs[p.requestId] = p.request.url;
    if (msg.method === 'Network.loadingFailed' && !/metrics|analytics|google|facebook|tiktok|matomo/.test(reqs[p.requestId] || '')) log.push('NETFAIL ' + p.errorText + ' ' + (reqs[p.requestId] || '').slice(0, 150));
    if (msg.method === 'Network.responseReceived' && /brightcove|bcove|boltdns|edge\.api|players\./.test(p.response.url)) log.push('NET ' + p.response.status + ' ' + p.response.url.slice(0, 150));
  });
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async (e) => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true }); return r.result && r.result.result ? r.result.result.value : r; };
  console.log('engine', (await getJSON(`http://127.0.0.1:${PORT}/json/version`)).Browser);
  await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable'); await send('Network.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
  if (process.env.EARLY_MOCK) { const src = fs.readFileSync(process.env.EARLY_MOCK, 'utf8'); const r = await send('Page.addScriptToEvaluateOnNewDocument', { source: src }); if (r.error) await send('Page.addScriptToEvaluateOnLoad', { scriptSource: src }); }
  await send('Page.navigate', { url: URL_ });
  for (let i = 0; i < 160 && !loaded; i++) await sleep(250);
  if (!process.env.NOSCRIPT) await send('Runtime.evaluate', { expression: SCRIPT });
  await sleep(+(process.env.WAIT || 12000));
  const st = await ev(`(function(){
    function box(s){var e=document.querySelector(s);if(!e)return null;var r=e.getBoundingClientRect();return Math.round(r.width)+'x'+Math.round(r.height)+'@'+Math.round(r.top);}
    var vj=document.querySelector('.video-js');var v=document.querySelector('video');
    return {player:box('.Player'),wrapper:box('.Player-wrapper'),videojs:box('.video-js'),poster:box('.vjs-poster'),video:box('video'),
      vjsClass:vj?String(vj.className).slice(0,300):null, posterBg:(function(){var p=document.querySelector('.vjs-poster');return p?(getComputedStyle(p).backgroundImage||'').slice(0,100)+' / img:'+((p.querySelector('img')||{}).src||'')/*.slice(0,80)*/:null})(),
      videoSrc:v?(v.currentSrc||v.src||'').slice(0,100):null, readyState:v?v.readyState:null, err:v&&v.error?v.error.code+':'+v.error.message:null,
      canH264:v?v.canPlayType('video/mp4; codecs="avc1.42E01E"'):null, mse:typeof MediaSource!=='undefined', canHls:v?v.canPlayType('application/vnd.apple.mpegurl'):null,
      vjsVer:window.videojs&&window.videojs.VERSION, bc:typeof window.bc, playerHTML:(document.querySelector('.Player')||{outerHTML:''}).outerHTML.replace(/<svg[\\s\\S]*?<\\/svg>/g,'').slice(0,1400),
      vjsErr:(function(){try{var p=window.videojs&&videojs.getPlayers();var k=p&&Object.keys(p)[0];var pl=k&&p[k];return pl?{err:pl.error()&&(pl.error().code+':'+pl.error().message),tech:pl.techName_,src:pl.currentSrc()}:null}catch(e){return String(e)}})(),
      probe:(function(){var v=document.createElement('video');return {h264:v.canPlayType('video/mp4; codecs="avc1.42E01E, mp4a.40.2"'),mseH264:window.MediaSource?MediaSource.isTypeSupported('video/mp4; codecs="avc1.4d401f"'):null,hls:v.canPlayType('application/vnd.apple.mpegurl')}})(),
      tracklist:document.querySelectorAll('.TrackList li, .tracklist li, [class*=Track] li').length}})()`);
  console.log(JSON.stringify(st, null, 1));
  console.log(log.filter((l, i) => log.indexOf(l) === i).slice(0, 60).join('\n'));
  if (process.env.SHOT) { const s = await send('Page.captureScreenshot', {}); fs.writeFileSync(process.env.SHOT, Buffer.from(s.result.data, 'base64')); }
  proc.kill(); process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
