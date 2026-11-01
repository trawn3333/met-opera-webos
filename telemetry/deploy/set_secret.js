// Generates set_secret_code.js (mode 600, git-ignored; delete after use): Cloudflare-API code that sets ONE Worker
// secret (default INGEST_KEY from MTV_TELEMETRY_INGEST_KEY) without redeploying. Run via the Cloudflare MCP execute
// tool with "$file:" so the value never appears in a transcript. Usage: node set_secret.js [INGEST_KEY|READ_TOKEN]
const fs = require('fs'), path = require('path');
const which = process.argv[2] || 'INGEST_KEY';
const from = { INGEST_KEY: 'MTV_TELEMETRY_INGEST_KEY', READ_TOKEN: 'MTV_TELEMETRY_READ_TOKEN' }[which];
if (!from) { console.error('usage: node set_secret.js [INGEST_KEY|READ_TOKEN]'); process.exit(1); }
const { env } = require('../../scripts/env.js').loadEnv('ops', { require: ['CF_WORKER_NAME', from], quietOps: true });
const code = `async () => {
  const name = ${JSON.stringify(env.CF_WORKER_NAME)};
  const r = await cloudflare.request({ method: 'PUT', path: \`/accounts/\${accountId}/workers/scripts/\${name}/secrets\`, body: { name: ${JSON.stringify(which)}, text: ${JSON.stringify(env[from])}, type: 'secret_text' } });
  const list = await cloudflare.request({ method: 'GET', path: \`/accounts/\${accountId}/workers/scripts/\${name}/secrets\` });
  return { ok: r.success, errors: r.errors, secretNames: (list.result || []).map(s => s.name) };
}`;
const out = path.join(__dirname, 'set_secret_code.js');
fs.writeFileSync(out, code, { mode: 0o600 });
console.log('wrote', out, '(' + which + ')');
