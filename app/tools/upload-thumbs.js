// Uploads thumbs/out/*.jpg listed in thumbs/manifest.json to the telemetry Worker (PUT /v1/thumbs/<slug>.jpg).
// The Worker URL and bearer token are read from the repo-root .env and never printed.
const fs = require('fs'), path = require('path');
const { env } = require('../../scripts/env.js').loadEnv('ops', { require: ['MTV_WORKER_URL', 'MTV_TELEMETRY_READ_TOKEN'], quietOps: true });
const BASE = env.MTV_WORKER_URL.replace(/\/+$/, '');
const sec = { READ_TOKEN: env.MTV_TELEMETRY_READ_TOKEN };
const m = JSON.parse(fs.readFileSync('/workspace/met/thumbs/manifest.json', 'utf8'));
(async () => {
  let ok = 0, fail = 0;
  for (const [n, v] of Object.entries(m)) {
    if (!v.file) continue;
    if (process.env.ONLY && !new RegExp(process.env.ONLY).test(v.file)) continue;   // e.g. ONLY='-ai\.jpg$'
    const body = fs.readFileSync(path.join('/workspace/met/thumbs/out', v.file));
    const r = await fetch(BASE + '/v1/thumbs/' + v.file, { method: 'PUT', headers: { Authorization: 'Bearer ' + sec.READ_TOKEN, 'Content-Type': 'image/jpeg' }, body });
    if (r.ok) ok++; else { fail++; console.log('FAIL', v.file, r.status, (await r.text()).slice(0, 100)); }
  }
  console.log('uploaded', ok, 'failed', fail);
  const g = await fetch(BASE + '/v1/thumbs/' + Object.values(m).find((v) => v.file && (!process.env.ONLY || new RegExp(process.env.ONLY).test(v.file))).file);
  console.log('public GET', g.status, g.headers.get('content-type'), (await g.arrayBuffer()).byteLength, 'bytes');
  const l = await (await fetch(BASE + '/v1/thumbs', { headers: { Authorization: 'Bearer ' + sec.READ_TOKEN } })).json();
  console.log('stored', l.count);
})();
