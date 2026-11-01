const puppeteer = require('/workspace/met/app/node_modules/puppeteer-core');
// Endpoint + ingest key come from the repo-root .env (passed in the URL hash, never stored in source).
const { env } = require('../../../scripts/env.js').loadEnv('ops', { require: ['MTV_WORKER_URL', 'MTV_TELEMETRY_INGEST_KEY'], quietOps: true });
(async () => {
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--allow-file-access-from-files'] });
  const p = await b.newPage();
  const posts = [];
  p.on('response', r => { if (r.url().includes('/v1/events')) posts.push(r.request().method() + ' ' + r.status()); });
  await p.goto('file://' + __dirname + '/page.html#endpoint=' + encodeURIComponent(env.MTV_WORKER_URL.replace(/\/+$/, '') + '/v1/events') + '&k=' + encodeURIComponent(env.MTV_TELEMETRY_INGEST_KEY));
  await new Promise(r => setTimeout(r, 6000));
  const info = await p.evaluate(() => MetTelemetry.info());
  // queue an event then navigate away -> beacon on pagehide
  await p.evaluate(() => MetTelemetry.lifecycle('beacon-test'));
  await p.goto('about:blank');
  await new Promise(r => setTimeout(r, 2000));
  console.log(JSON.stringify({ posts, deviceId: info.deviceId, sessionId: info.sessionId, queuedAfterFlush: info.queued }));
  await b.close();
})();
