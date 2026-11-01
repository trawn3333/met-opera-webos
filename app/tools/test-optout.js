// Telemetry opt-out + build-config test on the real Met site (current Chrome, NOT signed in: no account involved).
// Every request to the Worker's /v1/events and /v1/reports is answered locally and counted (nothing reaches the server).
// Usage: node tools/test-optout.js
const puppeteer = require('puppeteer-core');
const fs = require('fs'), path = require('path');
const SCRIPT = fs.readFileSync(path.join(__dirname, '../dist/webOSUserScripts/userScript.js'), 'utf8');
const { env } = require('../../scripts/env.js').loadEnv('build', { log: { warn() {}, error: console.error } });
const WORKER = env.MTV_WORKER_URL.replace(/\/+$/, '');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (n, ok, info) => { results.push({ n, ok: !!ok }); console.log((ok ? 'PASS ' : 'FAIL ') + n + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 300) : '')); };

(async () => {
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'], defaultViewport: { width: 1920, height: 1080 } });
  const p = await b.newPage();
  const sent = { events: 0, reports: 0, keyOk: true };
  await p.setRequestInterception(true);
  p.on('request', (r) => {
    const u = r.url();
    if (u.startsWith(WORKER + '/v1/events') || u.startsWith(WORKER + '/v1/reports')) {
      if (r.method() === 'OPTIONS') return r.respond({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'POST' } });
      const k = r.headers()['x-met-key'] || (/[?&]k=([^&]+)/.exec(u) || [])[1];
      if (decodeURIComponent(k || '') !== env.MTV_TELEMETRY_INGEST_KEY) sent.keyOk = false;
      if (/\/v1\/events/.test(u)) sent.events++; else sent.reports++;
      return r.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: '{"ok":true,"id":1}' });
    }
    r.continue();
  });
  await p.evaluateOnNewDocument(() => { try { localStorage.setItem('mtv.tlm.device', 'e2e-test-optout'); localStorage.setItem('mtv.panelSeen', 'true'); localStorage.setItem('mtv.hintShown', '1'); } catch (e) { /* */ } });
  const key = async (k, wait = 300) => { await p.evaluate((kc) => { ['keydown', 'keyup'].forEach((ty) => { const e = document.createEvent('Event'); e.initEvent(ty, true, true); Object.defineProperty(e, 'keyCode', { get: () => kc }); (document.activeElement || document.body).dispatchEvent(e); }); }, k); await sleep(wait); };
  const boot = async () => {
    await p.goto('https://ondemand.metopera.org/', { waitUntil: 'domcontentloaded', timeout: 90000 });
    await sleep(3000);
    await p.addScriptTag({ content: SCRIPT });
    await p.waitForFunction(() => document.documentElement.classList.contains('mtv-ready'), { timeout: 20000 });
  };
  const btnText = () => p.evaluate(() => { const x = document.querySelector('.mtv-panel [data-act="tlm"]'); return x ? x.textContent : null; });
  const toastText = () => p.evaluate(() => Array.prototype.map.call(document.querySelectorAll('.mtv-toast'), (t) => t.textContent).join(' | '));

  await p.goto('https://ondemand.metopera.org/', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await p.evaluate(() => localStorage.removeItem('mtv.tlm.off'));
  await boot();
  await sleep(6000);
  const info0 = await p.evaluate(() => window.MetTelemetry.info());
  check('build includes telemetry; endpoint from .env', info0.built && info0.endpoint === WORKER + '/v1/events', { built: info0.built });
  check('diagnostics ON by default: events sent with the .env ingest key', sent.events > 0 && sent.keyOk, sent);

  await key(403, 800);   // RED settings
  check('Settings shows "Send diagnostics & usage data: on"', /Send diagnostics & usage data: on/.test(await btnText() || ''), await btnText());
  await p.click('.mtv-panel [data-act="tlm"]'); await sleep(400);
  check('switch turns off and is remembered (mtv.tlm.off)', /: off$/.test(await btnText() || '') && await p.evaluate(() => localStorage.getItem('mtv.tlm.off') === '1'), await btnText());
  sent.events = 0; sent.reports = 0;
  await p.evaluate(() => { window.MetTelemetry.lifecycle('should-not-send'); window.MetTelemetry.usage('nope', {}); window.MetTelemetry.flush(); });
  await p.evaluate(() => { try { window.__mtv.autoReportTest && window.__mtv.autoReportTest(); } catch (e) { /* */ } });
  await sleep(4000);
  check('OFF: no events, nothing queued', sent.events === 0 && (await p.evaluate(() => window.MetTelemetry.info().queued)) === 0, sent);

  // manual report via Settings button: first press = consent prompt only, second press = this one report
  await p.evaluate(() => document.querySelector('.mtv-panel [data-act="report"]').click()); await sleep(1500);
  const t1 = await toastText();
  check('OFF: manual report asks for consent first, sends nothing', sent.reports === 0 && /Diagnostics & usage data are off/.test(t1), t1.slice(0, 160));
  await p.evaluate(() => document.querySelector('.mtv-panel [data-act="report"]').click());
  for (let i = 0; i < 30 && !sent.reports; i++) await sleep(1000);
  check('OFF: repeating within 15 s sends exactly this one report', sent.reports === 1, { sent, toast: await toastText(), panel: await p.evaluate(() => !!document.querySelector('.mtv-panel.mtv-open, .mtv-panel[open]')) });
  check('...and diagnostics stay off', (await p.evaluate(() => window.MetTelemetry.info().enabled)) === false && sent.events === 0, sent);
  // hold-GREEN path: one call prompts, nothing sent
  sent.reports = 0; await sleep(16000);
  await p.evaluate(() => window.__mtv.report('hold-green')); await sleep(2000);
  check('OFF: hold-GREEN shows the consent prompt and sends nothing', sent.reports === 0 && /hold GREEN again/.test(await toastText()), await toastText());

  // persists across restart
  sent.events = 0;
  await boot(); await sleep(7000);
  check('OFF persists after restart: nothing sent', sent.events === 0 && (await p.evaluate(() => window.MetTelemetry.info().enabled)) === false, sent);
  await key(403, 800);
  check('Settings shows off after restart', /: off$/.test(await btnText() || ''), await btnText());
  await p.click('.mtv-panel [data-act="tlm"]'); await sleep(4000);
  await p.evaluate(() => window.MetTelemetry.flush()); await sleep(2000);
  check('switch back ON: events flow again', sent.events > 0 && /: on$/.test(await btnText() || ''), sent);
  await p.evaluate(() => localStorage.removeItem('mtv.tlm.off'));
  await b.close();
  const f = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - f}/${results.length} passed`);
  process.exit(f ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
