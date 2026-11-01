# Met Opera for webOS (unofficial)

A personal-use LG webOS TV app (`com.peasanttech.metopera`) that wraps Met Opera on Demand for the remote:
own player with scene jumps, browse/search, cast & production credits, and pop-up facts.
Unofficial app. Not affiliated with the Metropolitan Opera. You need your own Met Opera on Demand subscription.

* `app/` - the webOS app (ES5 userscript for webOS 4 / Chromium 53). Build, install and feature notes: [app/README.md](app/README.md)
* `telemetry/` - the Cloudflare Worker (free tier) that serves thumbnails and pop-up facts and receives optional diagnostics
* `facts/` - pop-up facts source of truth (JSON, every fact sourced) and its deploy script
* `scripts/env.js` - loads and validates `.env`

## Configuration (`.env`)

Nothing deployment-specific or secret is in the repository. Copy `.env.example` to `.env` at the repo root and fill it in:

| Variable | Needed by | Required? |
|---|---|---|
| `MTV_WORKER_URL` | app build, tools | **required** - https URL of your Worker |
| `MTV_TELEMETRY_INGEST_KEY` | app build | optional - Worker secret `INGEST_KEY` (24+ chars); empty = telemetry compiled out |
| `MTV_TELEMETRY_READ_TOKEN` | `telemetry/query.sh`, `test_e2e.sh`, `app/tools/upload-thumbs.js`, deploy | ops only, never compiled in |
| `CF_ACCOUNT_ID` | deploy tooling | ops only |
| `CF_WORKER_NAME`, `CF_D1_DATABASE_NAME`, `CF_D1_DATABASE_ID` | `telemetry/deploy/*.js` | ops only |

`npm run build` (in `app/`) validates `.env` first (`node scripts/env.js` checks it on its own):

* **ERROR, build stops** - `.env` missing, or `MTV_WORKER_URL` empty, a `CHANGE_ME` placeholder, or not an `https://` URL.
* **WARNING, build continues** - `MTV_TELEMETRY_INGEST_KEY` empty, a placeholder or shorter than 24 characters:
  telemetry and problem reports are compiled into no-ops and the Settings switch shows "not in this build".
* Ops tools (`query.sh`, deploy scripts, uploads) fail with an ERROR naming any variable they need that is missing or malformed.

Messages name the variable and how to fix it; values are never printed. `.env`, `.env.*` (except `.env.example`),
`.dev.vars`, `telemetry/.secrets`, generated deploy files, cookie jars and raw research dumps are git-ignored.

## Pop-up facts

Since 1.4.0 the player can show small speech-bubble facts during playback, timed to the Met's scene markers. They are on
by default; turn them off with **Pop-up facts** in the playback controls (remembered). They never take focus and sit
above the subtitles. Every fact is sourced and verified against its source text; see [`facts/README.md`](facts/README.md)
for the data, the build/deploy scripts and how they're served (D1 behind the existing Worker, free tier).

## Telemetry & privacy

If the build includes telemetry, the app sends anonymous diagnostics to your own Worker: app errors, warnings and
usage events (screens, playback start/stop, buttons used) with a random device id - never the Met account, e-mail,
password, cookies or localStorage. Problem reports (a sanitized page/player snapshot) are sent when you hold GREEN
or press "Report a problem", and automatically on playback failures (rate-limited).

**Opt-out:** RED -> Settings -> **Send diagnostics & usage data: on/off** (default on, remembered on the TV).
When off, nothing is sent at all: no events and no automatic reports, and queued events are discarded.
A manual report while it's off shows "Diagnostics & usage data are off" and sends only if you repeat the action
within 15 s (explicit consent for that one report; diagnostics stay off).
Builds without `MTV_TELEMETRY_INGEST_KEY` contain no working telemetry at all.

Rotating the ingest key (see `telemetry/README.md`) makes older builds stop reporting (the Worker answers 401).
