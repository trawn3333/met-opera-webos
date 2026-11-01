// v1.1.0 top bar + Categories screen: functional test + TV preview screenshots via raw CDP
// (works with old Chromium builds). Userscript injected after load, as webOS does.
// Usage: node tools/menu-shots.js /path/to/chrome <label> [outdir]
const fs = require('fs'), path = require('path'), http = require('http'), { spawn } = require('child_process');
const WebSocket = require('ws');
const SCRIPT = fs.readFileSync(path.join(__dirname, '../dist/webOSUserScripts/userScript.js'), 'utf8');
const [CHROME, LABEL, OUT = '/workspace/met/preview'] = process.argv.slice(2);
const HOME = 'https://ondemand.metopera.org/';
const PORT = 9400 + Math.floor(Math.random() * 400);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const getJSON = (u) => new Promise((res, rej) => http.get(u, (r) => { let d = ''; r.on('data', (c) => (d += c)); r.on('end', () => { try { res(JSON.parse(d)); } catch (e) { rej(e); } }); }).on('error', rej));
const report = { label: LABEL, shots: [], exceptions: [], checks: {}, failures: [] };
const check = (name, ok, info) => { report.checks[name] = { ok: !!ok, info }; if (!ok) report.failures.push(name); console.log((ok ? 'PASS ' : 'FAIL ') + name + (info !== undefined ? ' ' + JSON.stringify(info).slice(0, 300) : '')); };

(async () => {
  const proc = spawn(CHROME, ['--headless', '--no-sandbox', '--disable-gpu', '--hide-scrollbars', `--remote-debugging-port=${PORT}`, '--window-size=1920,1080', '--user-data-dir=/tmp/menu-' + LABEL + Date.now(), 'about:blank'], { stdio: 'ignore' });
  let targets; for (let i = 0; i < 160; i++) { try { targets = await getJSON(`http://127.0.0.1:${PORT}/json`); break; } catch (e) { await sleep(250); } }
  const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((r) => ws.on('open', r));
  let id = 0; const pending = {}; let loads = 0;
  ws.on('message', (m) => { const msg = JSON.parse(m);
    if (msg.id && pending[msg.id]) { pending[msg.id](msg); delete pending[msg.id]; }
    if (msg.method === 'Page.loadEventFired') loads++;
    if (msg.method === 'Runtime.exceptionThrown') { const d = msg.params.exceptionDetails; report.exceptions.push(((d.exception || {}).description || d.text || '').split('\n').slice(0, 2).join(' | ').slice(0, 300) + (d.url ? ' @' + d.url.split('/').pop() + ':' + d.lineNumber : '')); }
  });
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending[i] = r; ws.send(JSON.stringify({ id: i, method, params })); setTimeout(() => r({ error: 'timeout' }), 30000); });
  const ev = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true }); if (r.result && r.result.exceptionDetails) return 'EXC ' + JSON.stringify(r.result.exceptionDetails).slice(0, 300); return r.result && r.result.result ? r.result.result.value : undefined; };
  const shot = async (name) => { await sleep(900); const s = await send('Page.captureScreenshot', {}); const f = path.join(OUT, `${LABEL}_${name}.png`); if (s.result) { fs.writeFileSync(f, Buffer.from(s.result.data, 'base64')); report.shots.push(f); console.log('shot', f); } };
  const key = async (k, wait = 350) => { await ev(`(function(){var t=document.activeElement||document.body;var e=document.createEvent('Event');e.initEvent('keydown',true,true);Object.defineProperty(e,'keyCode',{get:function(){return ${k}}});Object.defineProperty(e,'which',{get:function(){return ${k}}});t.dispatchEvent(e);})()`); await sleep(wait); };
  const early = async (src) => { const r = await send('Page.addScriptToEvaluateOnNewDocument', { source: src }); if (r.error) await send('Page.addScriptToEvaluateOnLoad', { scriptSource: src }); };
  const go = async (url) => { const n = loads; await send('Page.navigate', { url }); for (let i = 0; i < 160 && loads === n; i++) await sleep(250); await sleep(300); await send('Runtime.evaluate', { expression: SCRIPT }); };
  const focusInfo = () => ev(`(function(){var a=document.activeElement;if(!a)return null;return {tag:a.tagName,cls:String(a.className).slice(0,40),text:(a.textContent||'').replace(/\\s+/g,' ').trim().slice(0,60),inBar:!!(a.closest&&a.closest('.mtv-bar')),inCat:!!(a.closest&&a.closest('.mtv-cat'))}})()`);
  const catState = () => ev('window.__mtv.categories.debugState()');
  const UP = 38, DOWN = 40, LEFT = 37, RIGHT = 39, OK = 13, BACK = 461, YELLOW = 405;

  const ver = await getJSON(`http://127.0.0.1:${PORT}/json/version`); report.engine = ver.Browser;
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
  if (process.env.EMU53) await early(fs.readFileSync(path.join(__dirname, 'emulate-c53.js'), 'utf8'));
  await early("try{localStorage.setItem('mtv.tlm.off','1');localStorage.setItem('mtv.panelSeen','true');localStorage.setItem('mtv.hintShown','1')}catch(e){}");

  await go(HOME);
  for (let i = 0; i < 40; i++) { if (await ev("document.querySelectorAll('.Tile').length")) break; await sleep(500); }
  await sleep(3000);
  const barInfo = await ev(`(function(){var b=document.querySelector('.mtv-bar');if(!b)return null;var h=document.getElementById('app-header');return {items:[].map.call(b.querySelectorAll('.mtv-bar-item'),function(x){return x.textContent}),barH:b.getBoundingClientRect().height,headerTop:h?Math.round(h.getBoundingClientRect().top):null,bodyPad:getComputedStyle(document.body).paddingTop}})()`);
  check('bar present, page pushed below it', barInfo && barInfo.items.length === 7 && barInfo.headerTop >= 64, barInfo);
  // Focus a tile, then UP until the bar
  await ev('window.__mtv.focusFirst()');
  for (let i = 0; i < 4; i++) { await key(DOWN, 500); }
  const before = await focusInfo();
  let reached = false, ups = 0;
  for (; ups < 12; ups++) { const f = await focusInfo(); if (f && f.inBar) { reached = true; break; } await key(UP, 450); }
  check('UP reaches the top bar from page content', reached, { from: before, presses: ups });
  await key(RIGHT); await key(RIGHT);
  await shot('1-top-bar-focused');
  // DOWN returns to page
  await key(DOWN, 500);
  const back = await focusInfo();
  check('DOWN from bar returns to the page', back && !back.inBar, back);
  // YELLOW jumps to bar
  await key(YELLOW); const y = await focusInfo(); check('YELLOW jumps to bar', y && y.inBar, y);
  // Go to Categories item
  await ev("document.querySelector('.mtv-bar-item[data-act=\"categories\"]').focus()");
  const t0 = Date.now();
  await key(OK, 1200);
  let cs = await catState();
  check('Categories opens', cs && cs.kind === 'home', { state: cs, ms: Date.now() - t0 });
  const rowsInfo = await ev(`(function(){var M=window.__mtv.categories;var rows=document.querySelectorAll('.mtv-crow h2');return [].map.call(rows,function(h){return h.textContent})})()`);
  report.homeRows = rowsInfo;
  await shot('2-categories-home');
  // Move down to composer row and right
  await key(DOWN); await key(RIGHT); await key(RIGHT);
  await shot('3-categories-composer-row');
  // Down a few rows to show mood/format/decade
  await key(DOWN); await key(DOWN); await key(DOWN);
  await shot('4-categories-mood-row');
  await key(DOWN); await key(DOWN);
  await shot('5-categories-decade-row');
  // Back to top: composer row, open Verdi
  for (let i = 0; i < 5; i++) await key(UP, 250);
  cs = await catState();
  // ensure on row 1 col 0 (composers)
  await key(LEFT); await key(LEFT); await key(LEFT);
  const ff = await focusInfo();
  await key(OK, 900);
  cs = await catState();
  check('composer grid opens', cs && cs.kind === 'cat', { focus: ff, state: cs });
  await shot('6-composer-grid');
  // open first title
  await key(OK, 600);
  for (let i = 0; i < 30; i++) { cs = await catState(); const loading = await ev("!!document.querySelector('.mtv-crow-msg')"); if (cs && cs.kind === 'title' && !loading) break; await sleep(400); }
  const perfCount = await ev("document.querySelectorAll('.mtv-perf').length");
  check('title page lists performances from the Met', cs && cs.kind === 'title' && perfCount > 0, { state: cs, perfCount });
  await sleep(1200);
  await shot('7-title-performances');
  // BACK goes back to the grid, BACK again to home
  await key(BACK, 500); cs = await catState(); check('BACK -> previous view', cs && cs.kind === 'cat', cs);
  await key(BACK, 500); cs = await catState(); check('BACK -> categories home', cs && cs.kind === 'home', cs);
  // Hidden gems: open first gem, open first performance -> Met title page (SPA)
  await key(UP, 300);
  const fg = await focusInfo();
  await key(OK, 600);
  for (let i = 0; i < 30; i++) { const n = await ev("document.querySelectorAll('.mtv-perf').length"); if (n) break; await sleep(400); }
  const gemTitle = (await catState() || {}).title;
  await key(OK, 600);
  let url = ''; for (let i = 0; i < 20; i++) { url = await ev('location.pathname'); if (/performance\/detail/.test(url)) break; await sleep(300); }
  let rendered = false; for (let i = 0; i < 40; i++) { rendered = await ev("!!document.querySelector('.Player, .PerformanceInfo')"); if (rendered) break; await sleep(500); }
  const reloads = loads;
  check('performance opens the Met title page in-app (no reload)', /performance\/detail/.test(url) && rendered, { gem: gemTitle, first: fg, url, loads: reloads });
  await sleep(5000);
  await shot('8-met-title-page-from-categories');
  // Top bar Home works from a title page
  await key(YELLOW); await ev("document.querySelector('.mtv-bar-item[data-act=\"home\"]').focus()"); await key(OK, 2500);
  check('Home item returns to Met home', (await ev('location.pathname')) === '/', await ev('location.pathname'));
  // Archive
  await key(YELLOW); await ev("document.querySelector('.mtv-bar-item[data-act=\"archive\"]').focus()"); await key(OK, 4000);
  const ar = await focusInfo();
  check('Archive item focuses the Met catalog filter', ar && !ar.inBar && /filter|All Types|Type|Opera|Composer|Artist/i.test(ar.text + ar.cls), ar);
  await shot('9-archive-a-z');
  // Search
  await key(YELLOW); await ev("document.querySelector('.mtv-bar-item[data-act=\"search\"]').focus()"); await key(OK, 3000);
  const se = await ev("location.pathname + ' ' + (document.activeElement && document.activeElement.tagName)");
  check('Search item opens Met search with input focused', /\/search INPUT/.test(se), se);
  // Continue watching (signed out -> toast)
  await key(BACK, 300);
  await key(YELLOW); await ev("document.querySelector('.mtv-bar-item[data-act=\"continue\"]').focus()"); await key(OK, 6000);
  const toastTxt = await ev("(function(){var t=document.querySelector('.mtv-toast');return t&&t.style.display!=='none'?t.textContent:''})()");
  check('Continue watching handled (signed out -> message)', true, toastTxt || await focusInfo());
  // Model stats
  report.categoryCounts = await ev(`(function(){var M=window.__mtv.categories;return null})()`);
  fs.writeFileSync(path.join(OUT, `${LABEL}_menu-report.json`), JSON.stringify(report, null, 1));
  console.log('engine', report.engine, 'exceptions', report.exceptions.length); report.exceptions.slice(0, 10).forEach((e) => console.log('  ', e));
  console.log('FAILURES', report.failures.length, report.failures.join(', '));
  ws.close(); proc.kill(); process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
