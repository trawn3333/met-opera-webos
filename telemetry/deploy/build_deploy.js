// Generates deploy_with_secrets.js (mode 600, git-ignored; delete after use) for the Cloudflare MCP execute tool
// (or any runner exposing cloudflare.request + accountId). Run: node build_deploy.js [--no-secrets]
// All ids and secrets come from the repo-root .env (CF_WORKER_NAME, CF_D1_DATABASE_ID, MTV_TELEMETRY_INGEST_KEY,
// MTV_TELEMETRY_READ_TOKEN); nothing is printed.
const fs = require('fs'), path = require('path');
const noSecretsArg = process.argv.includes('--no-secrets');
const { env } = require('../../scripts/env.js').loadEnv('ops', { require: ['CF_WORKER_NAME', 'CF_D1_DATABASE_ID'].concat(noSecretsArg ? [] : ['MTV_TELEMETRY_INGEST_KEY', 'MTV_TELEMETRY_READ_TOKEN']), quietOps: true });
const sec = { INGEST_KEY: env.MTV_TELEMETRY_INGEST_KEY, READ_TOKEN: env.MTV_TELEMETRY_READ_TOKEN };
const src = fs.readFileSync(path.join(__dirname, '../worker/worker.js'), 'utf8');
const noSecrets = process.argv.includes('--no-secrets');
const bindings = [{ type: 'd1', name: 'DB', id: env.CF_D1_DATABASE_ID }];
if (!noSecrets) bindings.push({ type: 'secret_text', name: 'INGEST_KEY', text: sec.INGEST_KEY }, { type: 'secret_text', name: 'READ_TOKEN', text: sec.READ_TOKEN });
const metadata = { main_module: 'worker.js', compatibility_date: '2026-10-01', bindings, keep_bindings: noSecrets ? ['secret_text'] : undefined, observability: { enabled: true } };
const code = `async () => {
  const name = ${JSON.stringify(env.CF_WORKER_NAME)};
  const form = new FormData();
  form.append('metadata', new Blob([${JSON.stringify(JSON.stringify(metadata))}], { type: 'application/json' }));
  form.append('worker.js', new Blob([${JSON.stringify(src)}], { type: 'application/javascript+module' }), 'worker.js');
  const up = await cloudflare.request({ method: 'PUT', path: \`/accounts/\${accountId}/workers/scripts/\${name}\`, body: form });
  const sub = await cloudflare.request({ method: 'POST', path: \`/accounts/\${accountId}/workers/scripts/\${name}/subdomain\`, body: { enabled: true, previews_enabled: false } });
  const cron = await cloudflare.request({ method: 'PUT', path: \`/accounts/\${accountId}/workers/scripts/\${name}/schedules\`, body: [{ cron: '17 9 * * *' }] });
  const secrets = await cloudflare.request({ method: 'GET', path: \`/accounts/\${accountId}/workers/scripts/\${name}/secrets\` });
  return { uploaded: up.success, etag: up.result && up.result.etag, workersDev: sub.result, cron: cron.result, secretNames: (secrets.result || []).map(s => s.name) };
}`;
const out = path.join(__dirname, noSecrets ? 'deploy_code_only.js' : 'deploy_with_secrets.js');
fs.writeFileSync(out, code, { mode: 0o600 });
console.log('wrote', out, code.length, 'bytes');
