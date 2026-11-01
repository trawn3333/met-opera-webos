# Telemetry client – integration note for the app (v1.0.2+)

File: `telemetry/client/telemetry.js` (ES5, no fetch/Promise, ~9 KB; identical to `app/src/userscript/telemetry.js`).
No endpoint or key is stored in source. They come from the repo-root `.env` at build time
(`MTV_WORKER_URL`, `MTV_TELEMETRY_INGEST_KEY`, injected by `app/build.js` through esbuild `define`) or from
`init({ endpoint, ingestKey })`. Without them the client is a no-op (nothing queued or sent).
The ingest key is low-security by design (it ships inside the app); it only deters noise.

## Wire-up (userscript, esbuild bundle)
1. Copy `telemetry.js` to `src/userscript/telemetry.js`.
2. Early in `src/userscript/index.js`:
   ```js
   var T = require('./telemetry');           // or: import './telemetry'; var T = window.MetTelemetry;
   T.init({ appVersion: VERSION, captureErrors: false, flushMs: 30000 });
   T.lifecycle('launch', { safeMode: !!localStorage.getItem('mtv.safe') });
   ```
   Keep `captureErrors: false` if debugLog.js already hooks window.onerror / console; instead forward from
   `recordError(level, msg, src, stack)` in debugLog.js:
   ```js
   if (window.MetTelemetry) window.MetTelemetry.track(level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'console', msg, { source: src, stack: stack });
   ```
   (Use `captureErrors: true` only if nothing else captures errors.)
3. Usage/lifecycle ideas: `T.usage('play', {id: ...})`, `T.lifecycle('relogin', {result: 'ok'|'403'|'429'})`,
   `T.lifecycle('reload', {reason})`, `T.lifecycle('visibility', {state})`.
4. Optional kill switch in the settings panel: `T.setEnabled(false)` (persists in `mtv.tlm.off`).

## Rules (privacy)
* NEVER pass the Met username/password, `mtv.creds`, cookies, or localStorage dumps to telemetry. Don't log
  the `/client/login` request body. Both the client and the Worker scrub keys named
  password/pass/pwd/token/secret/cookie/creds/p and redact `{"u":…,"p":…}` payloads and `password=…`
  patterns, but that is a safety net, not permission.
* Device id is random (`mtv.tlm.device`), not the TV's serial/MAC.

## Behaviour
* Events queue in memory + `localStorage['mtv.tlm.queue']` (max 300, oldest dropped), so unsent events
  survive reloads/crashes and go out on next launch.
* Flush every `flushMs` (default 30 s), 3 s after init, sooner when errors pile up. Batches ≤100 events
  and ≤60 KB (server cap: 64 KB / 100 events).
* On `pagehide` / `beforeunload` / `visibilitychange:hidden`: `navigator.sendBeacon` with a text/plain
  body and the key in `?k=` (beacons can't send headers); if unavailable the queue simply persists.
* 429 → waits Retry-After; network/5xx/401 → exponential backoff 15 s … 10 min; 400/413 → batch dropped.
* Server rate limit: 30 requests and 600 events per device per minute.
* CORS: works from https://ondemand.metopera.org and file:// (Origin: null). Verified in Chrome (XHR with
  preflight + sendBeacon from a file:// page).
