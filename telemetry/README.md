# met-tv-telemetry

Logging/analytics API for the Met Opera webOS app (com.peasanttech.metopera).

* URL: https://YOUR-WORKER.YOUR-SUBDOMAIN.workers.dev
* Cloudflare account: <account e-mail> (<CF_ACCOUNT_ID>), free tier
* Worker `met-tv-telemetry` (module, compat date 2026-10-01), workers.dev subdomain `peasanttech`
* D1 `met-tv-telemetry` (<CF_D1_DATABASE_ID>, ENAM), binding `DB`; schema in worker/schema.sql
* Secrets: `INGEST_KEY` (X-Met-Key header or ?k=), `READ_TOKEN` (Authorization: Bearer). Values in `.secrets` (600).
* Cron `17 9 * * *` (UTC, daily) deletes events older than 30 days and stale rate-limit rows.

## Endpoints
| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | /v1/events | X-Met-Key (or ?k=) | `{deviceId, appVersion, sessionId, ua?, engine?, events:[{ts,type,message,source,line,col,stack,url,data}]}`; ≤64 KB, ≤100 events; types error/warn/console/lifecycle/usage (others rejected, counted); 30 req + 600 events /device/min |
| GET | /v1/events | Bearer | `since` (ms, s, ISO or `15m`/`6h`/`7d`; default 24h), `until`, `type` (comma list), `deviceId`, `sessionId`, `appVersion`, `q` (substring in message/stack), `limit` (≤500, default 100), `order=asc` |
| GET | /v1/summary | Bearer | `since` (default 7d): counts by type (+ last 24h), latest 20 errors, sessions, app versions, engine versions, devices, all-time totals |
| POST | /v1/cleanup | Bearer | run retention cleanup now |
| GET | /v1/health | none | |
| POST | /v1/reports | X-Met-Key (or ?k=) | Problem report (DOM/player snapshot) from the app: gzip (`Content-Type: application/gzip`) or JSON body `{deviceId, sessionId, appVersion, ua, kind, url, summary, snapshot}`; ≤1.5 MB on the wire, ≤6 MB decompressed; 12/device/hour. Re-sanitized (e-mails, JWTs, bearer/password/token pairs, `value=` attributes), stored gzip-compressed in D1 `reports.payload`, plus a `problem-report` lifecycle event |
| GET | /v1/reports | Bearer | list: `since` (default 7d), `deviceId`, `limit` (≤200) → id, time, device, version, engine, kind, url, summary, sizes |
| GET | /v1/reports/<id> | Bearer | full report JSON (decompressed); `?raw=gz` downloads the stored gzip |

Engine version is taken from the request's `ua`/User-Agent (e.g. "webOS Chrome 79").

## Files
* worker/worker.js, worker/schema.sql – source
* deploy/build_deploy.js – generates the Cloudflare-API deploy code (with secrets, mode 600; delete after use);
  `--no-secrets` keeps existing secrets (keep_bindings). Deployed via the Cloudflare MCP `execute` tool with `$file:`.
* test_e2e.sh – end-to-end curl tests (inserts rows with deviceId e2e-test-*); query.sh – read helper:
  `./query.sh reports ['since=7d&limit=20']`, `./query.sh report <id> [out.json]` (saved under reports/), `./query.sh report-dom <id> [out.html]` (sanitized DOM as HTML)
* Retention: the daily cron also deletes reports older than 30 days.
* client/telemetry.js + client/INTEGRATION.md – drop-in app client
