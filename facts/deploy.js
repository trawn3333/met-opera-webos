// Uploads facts/dist/*.json (run `node facts/build.js` first) to the Worker: PUT <MTV_WORKER_URL>/v1/facts/<slug>.json
// with the READ_TOKEN bearer. Both values come from the repo-root .env and are never printed.
// Usage: node facts/deploy.js [slug ...]
const fs = require('fs'), path = require('path');
const { env } = require('../scripts/env.js').loadEnv('ops', { require: ['MTV_WORKER_URL', 'MTV_TELEMETRY_READ_TOKEN'], quietOps: true });
const BASE = env.MTV_WORKER_URL.replace(/\/+$/, '');
const dist = path.join(__dirname, 'dist');
(async () => {
  const only = process.argv.slice(2);
  const files = fs.readdirSync(dist).filter((f) => /\.json$/.test(f) && (!only.length || only.indexOf(f.replace(/\.json$/, '')) >= 0));
  let ok = 0, fail = 0, bytes = 0;
  for (const f of files) {
    const body = fs.readFileSync(path.join(dist, f), 'utf8');
    const r = await fetch(BASE + '/v1/facts/' + f, { method: 'PUT', headers: { Authorization: 'Bearer ' + env.MTV_TELEMETRY_READ_TOKEN, 'Content-Type': 'application/json' }, body });
    if (r.ok) { ok++; bytes += body.length; } else { fail++; console.log('FAIL', f, r.status, (await r.text()).slice(0, 120)); }
  }
  console.log('uploaded', ok, 'failed', fail, 'bytes', bytes);
  const g = await fetch(BASE + '/v1/facts/idomeneo.json');
  const j = await g.json().catch(() => null);
  console.log('public GET idomeneo', g.status, j && j.facts ? j.facts.length + ' facts' : '');
  process.exit(fail ? 1 : 0);
})();
