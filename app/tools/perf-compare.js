// Before/after load measurement on the live site (headless Chrome, 4x CPU throttle to approximate an old TV SoC).
// Modes: baseline (no userscript) | wam (inject at window load, like webOS WebAppManager) | early (document-start).
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');
const SCRIPT = fs.readFileSync(path.join(__dirname, '../dist/webOSUserScripts/userScript.js'), 'utf8');
const URL_ = process.env.URL || 'https://ondemand.metopera.org/';
const RUNS = +(process.env.RUNS || 3);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function run(browser, mode) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  const cdp = await page.target().createCDPSession();
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  await cdp.send('Performance.enable');
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await page.evaluateOnNewDocument(() => { localStorage.setItem('mtv.panelSeen', 'true'); localStorage.setItem('mtv.hintShown', '1'); });
  if (mode === 'early') await page.evaluateOnNewDocument(SCRIPT);
  const reqs = new Map();
  let phase = 'load';
  cdp.on('Network.responseReceived', (e) => reqs.set(e.requestId, { url: e.response.url, type: e.type, phase }));
  cdp.on('Network.loadingFinished', (e) => { const r = reqs.get(e.requestId); if (r) r.bytes = e.encodedDataLength; });
  const t0 = Date.now();
  await page.goto(URL_, { waitUntil: 'load', timeout: 120000 });
  if (mode === 'wam') await page.addScriptTag({ content: SCRIPT });
  await page.waitForSelector('.Tile', { timeout: 60000 });
  const tTiles = Date.now() - t0;
  await sleep(8000);
  const m1 = metrics(await cdp.send('Performance.getMetrics'));
  // Scroll workload: walk down the catalog like a user would.
  phase = 'scroll';
  for (let i = 0; i < 15; i++) { await page.evaluate(() => window.scrollBy(0, 500)); await sleep(150); }
  await sleep(2000);
  const m2 = metrics(await cdp.send('Performance.getMetrics'));
  const all = [...reqs.values()].filter((r) => r.bytes !== undefined);
  const sum = (arr) => Math.round(arr.reduce((a, r) => a + r.bytes, 0) / 1024);
  const load = all.filter((r) => r.phase === 'load');
  const out = {
    mode,
    tilesMs: tTiles,
    loadRequests: load.length,
    loadKB: sum(load),
    loadImageKB: sum(load.filter((r) => r.type === 'Image')),
    analyticsReqs: all.filter((r) => /matomo|tiktok|googletagmanager|facebook\.net/.test(r.url)).length,
    scrollKB: sum(all.filter((r) => r.phase === 'scroll')),
    loadTaskMs: Math.round(m1.TaskDuration * 1000),
    loadLayoutMs: Math.round(m1.LayoutDuration * 1000),
    loadStyleMs: Math.round(m1.RecalcStyleDuration * 1000),
    scrollTaskMs: Math.round((m2.TaskDuration - m1.TaskDuration) * 1000),
    scrollLayouts: m2.LayoutCount - m1.LayoutCount,
    scrollStyleMs: Math.round((m2.RecalcStyleDuration - m1.RecalcStyleDuration) * 1000)
  };
  await ctx.close();
  return out;
}
function metrics(r) { const o = {}; r.metrics.forEach((m) => { o[m.name] = m.value; }); return o; }

(async () => {
  const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
  const modes = (process.env.MODES || 'baseline,wam,early').split(',');
  const rows = [];
  for (let i = 0; i < RUNS; i++) for (const m of modes) { const r = await run(browser, m); rows.push(r); console.log(JSON.stringify(r)); }
  await browser.close();
  const keys = Object.keys(rows[0]).filter((k) => k !== 'mode');
  console.log('\nmedian per mode:');
  for (const m of modes) {
    const rs = rows.filter((r) => r.mode === m);
    const med = {};
    keys.forEach((k) => { const v = rs.map((r) => r[k]).sort((a, b) => a - b); med[k] = v[Math.floor(v.length / 2)]; });
    console.log(m.padEnd(9), JSON.stringify(med));
  }
  fs.writeFileSync(path.join(__dirname, '../out/perf-results.json'), JSON.stringify(rows, null, 2));
})().catch((e) => { console.error(e); process.exit(1); });
