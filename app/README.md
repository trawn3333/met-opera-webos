# Met Opera for LG webOS (personal use)

A thin LG webOS TV app that opens the **official** Met Opera on Demand website
(`https://ondemand.metopera.org`) full-screen and makes it usable with the TV remote.
It is an unofficial personal-use wrapper (sideloaded via Developer Mode), not affiliated with the Met or LG, and is not meant for the LG Content Store.
It never fetches or plays streams itself; all playback goes through the Met's own player and your own Met subscription.

## How it works

* `index.html`: tiny local launcher that `location.replace()`s to the Met site. This is LG's "hosted web app" pattern, so cookies work like a normal site.
* `webOSUserScripts/userScript.js`: webOS injects this file into every page the app shows. This is the same mechanism
  [webosbrew/youtube-webos](https://github.com/webosbrew/youtube-webos) uses. It is bundled and transpiled to **ES5** so it runs on webOS 4.x (Chromium 53) and up.

### Features (userscript)

| Feature | What it does |
|---|---|
| TV styling | Root text size 115% (100/115/130 in settings), 4 px gold focus ring, whole-tile highlight, hides footer/social/donate/calendar/main-site menu and "learn more"/gift links, no scrollbars. |
| Spatial navigation | Arrow keys move focus to the nearest element in that direction. It is scoped to open dialogs (our settings panel, the Met login dialog, the full-screen player), treats the scroll-stacked hero as one block, and de-prioritises the sticky header. The Magic Remote pointer still works. |
| OK | Native buttons/links click as usual; non-native focusables (`role=button`, `tabindex`) get `.click()`. In the full-screen player with nothing focused, OK = play/pause. |
| BACK (461) | Closes the settings panel or Met login dialog, then leaves the full-screen player (and pauses), then goes back in history. On the home screen it shows an "Exit Met Opera?" prompt; a second BACK exits. While typing, BACK dismisses the field first. |
| Media keys | Play 415, Pause 19, Stop 413 (leaves the player), FF 417 (+30 s), RW 412 (−10 s). They work whether or not the player controls are showing, and they drive the Met's video.js player API. |
| Full-screen player (1.2.0) | When playback starts, the `<video>` element itself is pinned to `position:fixed` at 0,0, sized `innerWidth × innerHeight` px (1920×1080). This follows LG's guidance for the webOS hardware video plane, which ignores `object-fit`. Inline `!important` styles override the Met/video.js fluid layout and are re-checked every second. The site chrome, the Met's control bar and the track-list sidebar are hidden. There are three **picture modes** on the Picture button: *Standard* (default), *Native full screen* (adds the Fullscreen API), and *Exact fit* (the element is the exact letterboxed rectangle, e.g. 1440×1080 at x=240 for 4:3 telecasts). |
| Player controls (1.2.0) | Our own large overlay drives the Met's player. **Hidden:** OK = play/pause, LEFT/RIGHT = seek (hold to speed up: 10 s → 30 s → 60 s → 3 min steps, applied 0.6 s after you let go), UP/DOWN or any other key = show controls. **Shown:** a scrub bar with elapsed/remaining time and scene/act ticks, plus buttons for Title, Prev scene, −10 s, Play/Pause, +30 s, Next scene, Scenes (list grouped by act from the Met's cue points), Subtitles, Audio, Picture and Report problem. UP/DOWN move between the scrub bar and the buttons, LEFT/RIGHT seek or move, OK activates. The controls hide after 4 s. BACK closes a popup, then the controls, then leaves the player (paused). The top bar never takes focus in the player. Subtitles are shown at 46 px and move up while the controls are open. A local resume point is saved per title, and you're offered it only if the Met didn't resume by itself. |
| Report a problem (1.2.0) | **Hold GREEN for about 1 s** (a short press still opens the debug log). You can also press OK while the GREEN log is open, or use **Report problem** in the player controls or the RED settings. This sends a sanitized snapshot to the telemetry worker and shows "✓ Report #N sent" or the error. Automatic reports are sent when playback fails: a `<video>` error or Brightcove error, playback stalled for more than 20 s, or no video on a watch page after 30 s. See *What changed in 1.2.0*. |
| Auto re-login | RED (403) opens a settings panel. It also opens on first run when you are signed out. Enter your Met username/password once and it is stored in the TV's localStorage for the Met site, obfuscated but **not encrypted**. On each launch the script asks the Met's `GET /client/user_info` endpoint whether you are signed in. If not, it sends the same `POST /client/login` request the Met's own login form uses, then reloads once. Guard rails: at most 1 automatic attempt per 5 minutes, exponential backoff (10 min → 6 h) on errors, a 429 ("too many sessions") is backed off, a rejected password stops all retries until you save new credentials, and at most one reload per 2 minutes. |
| Top menu bar (1.1.0) | Always visible at the top except in the full-screen player. The Met page is pushed down below it and is never covered. Items: **Home**, **Categories**, **Archive A–Z** (scrolls to the Met's own *Video and Audio Catalog Filter*), **Search** (Met search, input focused), **Continue watching** / **My favorites** (scrolls to those Met home rows; shows a message when they are empty or you are signed out), **Settings** (RED panel). Reach it with UP from the top of any page, or press YELLOW from anywhere. LEFT/RIGHT move along it, OK opens, DOWN or BACK returns to where you were. |
| Categories screen (1.1.0) | Our own full-screen browser for the Met archive. Rows: Hidden gems, By composer (plus all composers A–Z), By language, By era & style, By mood, Format (Live in HD / classic telecasts / radio broadcasts), By decade of performance, Starter operas, Under 2½ hours, Wagner's Ring in order, Shakespeare at the opera, World premieres at the Met, Epic evenings, Newest performances, Galas & concerts, Singer playlists, Films, All titles A–Z, and Aria Code. Pick a title to see its performances (date, HD/telecast/audio, conductor, cast, length, CC/AD). OK on a performance opens **the Met's own title page** inside the app, so playback always uses their player. BACK goes back one level. |
| Speed-ups (OFF by default since 1.0.2) | Opt-in from the RED panel: shortens CSS transitions, removes tile shadows, and loads catalog tile artwork only when it is within 800 px of the screen. Nothing is ever blocked: since 1.0.2 the app does not block, rewrite or intercept any request or script, including Brightcove, analytics and other third-party scripts. |

## Build

Requirements: Node 18+ and Python 3 with Pillow (only for regenerating icons).

Configuration comes from the repo-root `.env` (copy `.env.example`); see **Configuration** and **Telemetry & privacy** in the [root README](../README.md). No URLs, ids or keys live in source.

```sh
npm install
npm install -g @webos-tools/cli   # provides ares-package / ares-install / ...
npm run build                     # -> dist/ (ES5-verified userScript.js)
npm run package                   # -> out/com.peasanttech.metopera_<version>_all.ipk
npm test                          # headless-Chrome checks against the live site (no real logins)
python3 tools/make-icons.py       # regenerate icon.png (80), largeIcon.png (130), splash.png (1920x1080)
```

Other tools:

* `tools/perf-compare.js`: before/after load and scroll measurements (4× CPU throttle).
* `tools/old-engine-test.js <chrome>`: runs the site + userscript in an old Chromium (e.g. 68) via raw CDP.
* `tools/analyze.js`: network/DOM inventory of a page.

## Install on the TV (Developer Mode)

**On the TV**
1. Open the **LG Content Store**, search for **Developer Mode**, and install it.
2. Open **Developer Mode** and sign in with your LG Developer (webostv.developer.lge.com) account.
3. Turn **Dev Mode Status** ON. The TV reboots.
4. Open Developer Mode again and turn **Key Server** ON. Note the TV's **IP address** and the **passphrase** shown in the app.

**On the laptop (same network)**
```sh
npm install -g @webos-tools/cli

# register the TV (SSH port 9922, user "prisoner")
ares-setup-device -a tv -i "host=<TV_IP>" -i "port=9922" -i "username=prisoner"
# fetch the SSH key; enter the passphrase shown in the Developer Mode app (case-sensitive)
ares-novacom --device tv --getkey

ares-install --device tv com.peasanttech.metopera_1.2.0_all.ipk
ares-launch  --device tv com.peasanttech.metopera
```
The app then appears in the TV launcher as **Met Opera**.

Useful extras:

* Debug: `ares-inspect --device tv --app com.peasanttech.metopera --open`
* Uninstall: `ares-install --device tv --remove com.peasanttech.metopera`

**Keeping Developer Mode alive**

* The Developer Mode app shows the remaining session time. Current firmware allows up to 1000 h; older firmware used 50 h.
* Press **EXTEND** in the Developer Mode app before it runs out. LG says there is no limit on extensions.
* You can also extend from the laptop: `ares-launch --device tv com.palmdts.devmode -p extend=true`.
* If the session expires, or the TV reboots 10 times with no network, Developer Mode turns off and **sideloaded apps are removed**. Re-enable Developer Mode and reinstall.
* One developer account can keep Developer Mode on only **one TV at a time**.

## First run

1. Launch **Met Opera**. On first launch while signed out, the settings panel opens.
2. Enter your Met username and password with the on-screen keyboard, then choose **Save & sign in**. The page reloads signed in.
3. Later, if the Met session expires (the observed cookie lifetime is about 24 h), the app signs back in by itself on launch.
4. Tip: keep the TV's **QuickStart+** ON. With it off, webOS can drop recently written cookies at power-off.

## What changed in 1.3.3

- **Production credits** in the Cast panel (player) and the title-page Cast sheet: Production / director, set, costume and lighting designers, choreographer and the production's Met premiere, **as listed in the Met Opera Archives** (archives.metopera.org). Nothing is invented: when the archive lists no credit (e.g. Ponnelle's Idomeneo lists only "Production" and lighting), it is left out; unmatched performances show no Production section.
- Data: `tools/archive-crawl.js` matches every on-demand performance to the archive by date + title (polite: one request every 1.6 s or more, every response cached on disk), then links it to the latest *New Production* of that title on or before the performance date and reads that premiere's credits. Productions that premiered before Sept 1966 are only linked within 10 seasons (older archive records rarely mark new productions). `tools/build-credits.js` writes the bundled `src/userscript/cast/creditsData.js` (about 65 KB, 303 productions).
- Match rate: 869 of 1007 catalog performances matched to an archive performance; 758 (75%) carry credits. Galas, concerts, documentaries and some double bills don't match.
- Configuration moved to `.env`, build-time validation, and the **Send diagnostics & usage data** switch with one-off consent for manual reports (see the root README).

## What changed in 1.2.0

- **Video fit.** On Matt's OLED55B8 (webOS 4, Chromium 53), telemetry shows a 1920×1080 layout at devicePixelRatio 2 on a 3840×2160 panel. In 1.1.0 the `<video>` was absolutely positioned inside the Met's `video-js` box, which sits inside a fixed `.Player`. LG documents that the video plane ignores `object-fit`. It also says the video element itself should be fixed at 0,0 with the app's px size and no transform, border or opacity. 1.2.0 does exactly that (see the feature table) and adds the Picture modes as fallbacks. A `video-fit` telemetry event records the video size against the element, viewport, DPR, screen and video-plane size (`deviceInfo.screenWidth/Height`) for each title, so we can see what the TV does.
- **Remote-first player controls** with scenes from the Met's Brightcove cue points (title, act, start/end), subtitles and audio tracks through the video.js track API, and readable language names (the Met labels tracks "en", "en-cc", "se"…).
- **New look.** Near-black backgrounds with a crimson-tinted radial glow, gold (#e3b65b) focus and accents, crimson act and HD markers, and a system sans-serif font (LG Smart UI/Roboto/Helvetica). Cards and chips are 14 px rounded with soft shadows. Focus is scale 1.06 with a gold ring and glow, using 150 ms transform/box-shadow transitions on the focused element only. The top bar is translucent, with a pill-shaped focus and a crimson underline for the current page. Settings, the exit prompt and toasts are restyled to match. Icons are inline SVG, because webOS fonts lack the media-control glyphs.
- **Problem reports** (`src/userscript/report.js`). Each snapshot contains:
  - the DOM (`outerHTML`);
  - URL, title, viewport, screen and DPR, the fullscreen element and the active element;
  - every `<video>`/`<audio>`: src kind (blob/MSE or host+path, never the query), readyState, networkState, error, videoWidth/Height, the element rect and object-fit, currentTime/duration, buffered/seekable ranges, paused/ended, text, audio and video tracks, and decoded/dropped frames;
  - each video.js/Brightcove player: tech, sources, error, dimensions, classes, tracks, mediainfo (id, name, cue-point count, renditions) and VHS bandwidth and rendition stats;
  - the last 200 console lines (every level, the Met's and ours) and the last 100 failed requests (XHR/fetch observed passively, plus failed resources);
  - the error list, the userscript log, and app state (full screen, picture mode, fit, overlays, safe mode, signed-in yes/no, recovery state).

  **Sanitizing** happens before anything leaves the TV:
  - Removed: inline `<script>` bodies, `<style>` bodies, every `value=` on input/option/select/button, textarea text and `data-token/auth/session/user/email` attributes.
  - Masked: e-mail addresses, JWTs, `Bearer` tokens, password/token/secret/cookie `key=value` pairs, and URL query parameters whose names look like token, sig, signature, policy, key, auth, hdnts, session, code, ticket, pass or user.
  - Removed: the saved Met account (`mtv.creds` username and password, plain, encoded, URL-, JSON- and HTML-escaped). A final scan of the serialized payload refuses to send if any of these strings survive.
  - Never read: cookies and localStorage.

  The worker applies the same filters again as a second safety net. The payload is gzip-compressed on the TV with fflate, which works on Chromium 53 where CompressionStream doesn't exist. It is capped at 500 KB compressed: the DOM is truncated first, then halved until it fits. Since 1.3.3, when diagnostics are switched off, a manual report asks for explicit consent first (repeat the action within 15 s to send that one report). Automatic reports only go out when diagnostics are on, and are limited to 1 per failure kind per title per 30 min, 3 per hour and 8 per day (`mtv.autoReports`). The worker also limits each device to 12 reports per hour.
- **Worker + D1.** `POST /v1/reports` (X-Met-Key; body is gzip or JSON, at most 1.5 MB on the wire and 6 MB decompressed) stores rows in the D1 table `reports`, gzip-compressed in a BLOB, with summary columns. It also writes a `problem-report` lifecycle event into the normal event stream. `GET /v1/reports` and `GET /v1/reports/<id>` (Bearer) list reports and fetch one; add `?raw=gz` to download it compressed. Reports are kept 30 days. Use `query.sh reports`, `query.sh report <id>` and `query.sh report-dom <id>`.
- **Telemetry events.** New events: `video-fit`, `player-overlay` (first open, with fit info), `player-controls` (counts of opens, seeks, seconds seeked and buttons used; sent when you leave the player and every 5 min), `track-change` (subtitles/audio language), `picture-mode`, `resume`, `playback-failure` (always sent; a snapshot follows if the rate limit allows), `report-problem` and `report-blocked`.

## What changed in 1.1.0

- **Top menu bar** and **Categories screen** (see the feature table above). Both are remote-only, use plain DOM with no frameworks, and are tested on Chromium 59/68 (webOS 4/5 proxies) and current Chrome.
- **Catalog data.** The app reads the same public endpoints the Met's React app uses: `GET /client/filter` for every title with video/audio counts, `?media_type=hd|sd|audio` for per-format title lists, and `GET /client/filter/<title>` for every performance of one title. A small snapshot built from those endpoints (`src/userscript/cat/seed.json`, about 40 KB, made by `tools/build-catalog-seed.py`) ships in the userscript, so the screen opens instantly. Title lists refresh in the background when they are more than 12 h old. Performance lists are fetched when you open a title and cached for 3 days, up to 40 titles. **Refresh catalog** (last row) forces an update. Only catalog metadata is read. Streams are never touched.
- **Curated classifications** are in `src/userscript/cat/catalogData.js`: composer, sung language (as performed in the Met catalog), era/style, premiere year, mood (subjective), plus the Hidden gems, Starter, Shakespeare, Ring and Met world-premiere lists.
- **Telemetry.** New `menu`, `categories`, `catalog-refresh` and `playback` events carry no personal data, only item names, title names, format and decade. The harmless video.js deprecation warning is no longer sent. The device line now reads "2018 model (ships with webOS 4.0), platform build 05.50.70" instead of mislabelling the platform build as the webOS version.

## What changed in 1.0.2

- **No blocking at all.** Analytics and other script blocking is gone, and so are the hooks on DOM insertion, image `src` and requests. With default settings, the Met site runs as it would in a browser, with TV styling, remote navigation, polyfills and re-login added. To confirm, the tests check that `appendChild`, `setAttribute`, the image `src` setter, `fetch` and XHR are still the browser's own functions.
- **Speed-ups are opt-in** (RED → "Speed-ups"). Any lite-mode setting saved by 1.0.0 or 1.0.1 is reset once.
- **Watchdog.** It keeps checking for as long as the page is open. The "did not start" screen appears only if nothing has rendered **45 s** after load, and it removes itself the moment the page renders, so it never covers a working page.
- **Restart after a crash.** If the Met app crashed before the userscript arrived, the page is restarted once:
  1. Every timer and animation loop of the crashed copy is stopped.
  2. The same page HTML is fetched again.
  3. The document is rewritten with `document.open/write/close`, which also drops every event listener the crashed copy had on window and document.
  4. This userscript, including its polyfills, is inlined at the top of `<head>`, so it runs **before** the Met's scripts.

  The URL and history are unchanged. If the page can't be fetched, the restart falls back to re-running the Met bundles in place.
- **Image repair for old engines.** Some tile artwork is referenced as `http://www.metopera.org/...`, which now returns HTTP 500. Chrome 86+ upgrades these requests to https automatically, but webOS 4/5 don't. When such an image *fails*, it is retried once over https. This happens only after the failure; no request is intercepted.
- **GREEN debug overlay.** Scroll it with UP/DOWN. It shows:
  - the webOS/Chromium version (from `webOSSystem`/`PalmSystem` device info and the UA) and the screen size and `devicePixelRatio`;
  - video support: `canPlayType` for H.264/HLS/DASH, and `MediaSource.isTypeSupported` for H.264, AAC, HEVC and VP9;
  - timing for load, userscript start and the moment the page rendered.
- **Console capture.** The script hooks **all page console output**, from the Met site, Brightcove and the userscript itself:
  - `console.error` and `console.warn`;
  - `console.log` and `console.info` lines that look like problems;
  - uncaught errors, with file:line:col and stack;
  - unhandled promise rejections;
  - failed scripts and media.

  The last 50 entries are kept, newest first. They are saved to localStorage (`mtv.log.current`) and shown as **"Previous session"** after a reload or crash. One limit: webOS injects the userscript only after page load, so errors from before that point can't be captured, unless the crash-restart above happens. In that case everything after the restart is captured from the start.
- **Title pages** start with focus on the Met player's **Play** button.
- **Telemetry** (on by default; turn it off with RED → "Send diagnostics"). The app uses `src/userscript/telemetry.js`, copied from `/workspace/met/telemetry/client/`, and sends events to the `met-tv-telemetry` Worker:
  - every captured error, warning and problem console line. Each distinct message is sent at most 3 times per page load, and e-mail addresses are masked.
  - lifecycle events: `launch`, `page-rendered` (with timing), `crash-restart` (rewriting, then restarted copy running, or gave up), `watchdog-shown`, `watchdog-cleared`, `login-attempt` (the result code only), `safe-mode`, and `telemetry-on`/`telemetry-off`;
  - one `diagnostics` event per page load, with engine, device, screen, codecs, polyfills and mode.

  Credentials, `mtv.creds`, cookies and the login request body are never sent. The device id is random (`mtv.tlm.device`). Read the data with `/workspace/met/telemetry/query.sh`.

## Troubleshooting (1.0.1+)

**Black screen on older TVs (webOS 4.x, Chromium 53).** The Met site calls `window.scrollTo({...})`
and `new ResizeObserver(...)` when the home page hero mounts. Chromium older than 61/64 throws on
these, React unmounts everything and the transparent page shows as black. Version 1.0.1 fixes it like this:

- **Polyfills.** These fill in features from newer Chrome versions: scrollTo/scroll/scrollBy with an options object, Element.scrollTo,
  ResizeObserver, Object.values/entries, Array.flat/flatMap, padStart, Promise.finally, append/prepend,
  closest, NodeList.forEach and others. Each one is feature-detected, so newer TVs aren't affected.
- **Recovery.** webOS injects the userscript only after the page has loaded. If the Met app has already crashed
  by then, the script restarts it once, using the polyfills.
- **Watchdog.** (1.0.1; see 1.0.2 above.) If the page is still blank after about 12 s, the script removes all of its own styling and
  shows "The Met Opera page did not start". OK reloads the page, GREEN opens the log, BLUE turns on safe mode and BACK exits.
- **Post-login reload.** After a login, the app always reloads `https://ondemand.metopera.org/`, at most once every 2 minutes.
- **Safer lite mode** (now opt-in "Speed-ups"). Transitions are shortened rather than removed. Animations are left alone, and `contain` is only
  used where it is supported. Image deferral only applies to grid tiles.
- **try/catch.** Every feature is wrapped in its own try/catch, so one failure doesn't stop the others.

**Debug keys**

| Key | Action |
|---|---|
| GREEN (hold 1 s) | Send a problem report (see 1.2.0). |
| GREEN | On-screen debug log, scrollable with UP/DOWN. OK while it is open sends a problem report. It shows: <br>• URL, webOS/Chromium version, screen size/DPR and video codec support <br>• timing, whether the Met app rendered or was restarted, and the watchdog state <br>• signed-in state, re-login status and polyfills used <br>• the last 50 console messages and errors from the page, with source file:line:col and stack <br>• the previous session's log |
| BLUE | Toggle **safe mode**: no TV styling and no speed-ups. Polyfills and crash recovery stay on. The page reloads |
| RED | Settings: account, text size and the opt-in speed-ups |

The script also logs everything to the console with the prefix `[met-tv]`. To read it from a computer, run
`ares-inspect --device tv --app com.peasanttech.metopera --open`.

## Known limitations

* Not tested on a real TV yet, so these are unverified:
  * userscript injection on webOS 4.x
  * the exact BACK/exit behaviour
  * how the on-screen keyboard looks
  * remote media key delivery
  * playback smoothness
* 1.2.0 video fit: the LG-recommended geometry is verified in Chromium 59/68 and current Chrome, but whether it cures the zoom/crop on Matt's B8 can only be confirmed on the TV. If it doesn't, try the **Picture** button. The `video-fit` telemetry event will show what the TV reports either way.
* Chromium 53 (webOS 4.x) was only checked statically: the output is ES5 and uses no post-Chrome-53 APIs. It runs cleanly in Chromium 68 and current Chrome.
* The script depends on the Met site's current DOM and class names (`.Tile`, `.Hero`, `.Player`, `.Login`…). A site redesign can break navigation or styling until it is updated.
* Pages on www.metopera.org (account, purchase, FAQ) open inside the app without TV styling. BACK returns.
* Re-login only runs at launch/reload, not in the middle of a long session.
* Credentials are only obfuscated in localStorage, which the Met's own page scripts can also read (same origin).
* Hero images on cdn.ondemand.metopera.org are up to about 1.1 MB, 2048 px JPEGs. There is no smaller size on the CDN, so on-screen hero art still costs a big decode.
