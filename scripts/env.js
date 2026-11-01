// Loads and validates the repo-root .env (KEY=VALUE lines, # comments). No dependencies.
// Used by app/build.js, the Worker deploy scripts, the thumbnail/facts upload tools and (via env.sh) query.sh.
// Never prints values: messages name the variable and how to fix it.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const ENV_FILE = process.env.MTV_ENV_FILE || path.join(ROOT, '.env');
const PLACEHOLDER = /CHANGE_ME|^<.*>$|^xxx+$|^todo$|example\.com|your[-_]/i;

// need: 'required' fails the build; 'optional' warns; group lets a feature turn off as a whole.
const SPEC = {
  MTV_WORKER_URL: { need: 'required', kind: 'https', help: 'the https URL of your deployed Cloudflare Worker (serves thumbnails, pop-up facts and, if enabled, telemetry), e.g. https://<worker>.<subdomain>.workers.dev' },
  MTV_TELEMETRY_INGEST_KEY: { need: 'optional', kind: 'key', min: 24, group: 'telemetry', help: 'the Worker secret INGEST_KEY (24+ chars). Leave empty to build WITHOUT telemetry and problem reports' },
  MTV_TELEMETRY_READ_TOKEN: { need: 'ops', kind: 'key', min: 32, help: 'the Worker secret READ_TOKEN (32+ chars), used only by telemetry/query.sh and test_e2e.sh; never compiled into the app' },
  CF_ACCOUNT_ID: { need: 'ops', kind: 'hex32', help: 'your Cloudflare account id (32 hex chars, dashboard sidebar); used only by deploy scripts' },
  CF_WORKER_NAME: { need: 'ops', kind: 'name', help: 'Worker script name, e.g. met-tv-telemetry' },
  CF_D1_DATABASE_NAME: { need: 'ops', kind: 'name', help: 'D1 database name, e.g. met-tv-telemetry' },
  CF_D1_DATABASE_ID: { need: 'ops', kind: 'uuid', help: 'D1 database id (UUID), shown by `wrangler d1 list` or the dashboard' }
};

function parse(text) {
  const out = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line[0] === '#') continue;
    const i = line.indexOf('=');
    if (i < 1) continue;
    let v = line.slice(i + 1).trim();
    if (/^(['"]).*\1$/.test(v)) v = v.slice(1, -1);
    out[line.slice(0, i).trim()] = v;
  }
  return out;
}
function check(name, v) {
  const s = SPEC[name];
  if (v === undefined || v === '') return 'is not set';
  if (PLACEHOLDER.test(v)) return 'still has a placeholder value';
  if (s.kind === 'https' && !/^https:\/\/[a-z0-9.-]+(:\d+)?(\/[^\s]*)?$/i.test(v)) return 'must be an https:// URL';
  if (s.kind === 'key' && (v.length < s.min || /\s/.test(v))) return 'is too short or malformed (needs ' + s.min + '+ characters, no spaces)';
  if (s.kind === 'hex32' && !/^[0-9a-f]{32}$/i.test(v)) return 'must be 32 hex characters';
  if (s.kind === 'uuid' && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)) return 'must be a UUID';
  if (s.kind === 'name' && !/^[a-z0-9][a-z0-9-]{0,62}$/.test(v)) return 'must be a lowercase name (letters, digits, dashes)';
  return null;
}
// scope: 'build' (app), 'ops' (deploy/query tools; ops vars become required).
function loadEnv(scope, opts) {
  opts = opts || {};
  const log = opts.log || console;
  const errors = [], warnings = [];
  let fileVars = {};
  if (fs.existsSync(ENV_FILE)) fileVars = parse(fs.readFileSync(ENV_FILE, 'utf8'));
  else (scope === 'build' ? errors : errors).push('.env not found at ' + ENV_FILE + ' \u2014 copy .env.example to .env and fill it in.');
  const env = {};
  for (const k of Object.keys(SPEC)) env[k] = process.env[k] !== undefined && process.env[k] !== '' ? process.env[k] : fileVars[k];
  const features = { telemetry: true };
  for (const [k, s] of Object.entries(SPEC)) {
    const p = check(k, env[k]);
    if (!p) continue;
    const msg = k + ' ' + p + '. Fix: set it in .env to ' + s.help + '.';
    if (s.need === 'required' || (s.need === 'ops' && (opts.require || []).indexOf(k) >= 0)) errors.push(msg);
    else if (s.need === 'optional') {
      if (s.group === 'telemetry') { features.telemetry = false; warnings.push(k + ' ' + p + ': TELEMETRY AND PROBLEM REPORTS ARE DISABLED in this build (compiled to no-ops). To enable: set it in .env to ' + s.help + '.'); }
      else warnings.push(msg);
    } else if (scope === 'ops' && !(opts.quietOps)) warnings.push(msg);
    if (p) env[k] = s.group === 'telemetry' ? '' : env[k];
  }
  for (const w of warnings) log.warn('WARNING: ' + w);
  for (const e of errors) log.error('ERROR: ' + e);
  if (errors.length && !opts.noExit) { log.error('Build/config stopped: ' + errors.length + ' error(s) in ' + path.basename(ENV_FILE) + '. See .env.example.'); process.exit(2); }
  return { env, features, errors, warnings };
}
module.exports = { loadEnv, parse, check, SPEC, ENV_FILE, ROOT };
if (require.main === module) {  // `node scripts/env.js [ops]` = validate only; `--sh KEY...` prints shell-safe exports for query.sh
  const i = process.argv.indexOf('--sh');
  if (i >= 0) {
    const keys = process.argv.slice(i + 1);
    const r = loadEnv('ops', { require: keys, quietOps: true, log: { warn: (m) => console.error(m), error: (m) => console.error(m) } });
    for (const k of keys) process.stdout.write(k + "='" + String(r.env[k]).replace(/'/g, "'\\''") + "'\n");
  } else { const r = loadEnv(process.argv[2] || 'build', { noExit: true, quietOps: process.argv[2] !== 'ops' }); console.log(r.errors.length ? 'INVALID' : 'OK', '(telemetry ' + (r.features.telemetry ? 'enabled' : 'disabled') + ')'); process.exit(r.errors.length ? 2 : 0); }
}
