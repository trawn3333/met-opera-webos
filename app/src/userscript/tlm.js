// Telemetry glue: forwards captured errors/console + lifecycle events to the Met TV logging API
// (telemetry.js, see /workspace/met/telemetry/client/INTEGRATION.md). On by default; RED panel toggle.
// PRIVACY: never pass credentials, mtv.creds, cookies, login request bodies or localStorage dumps here.
import T from './telemetry';

var W = window;
var ready = false;
var seen = {};         // per-page-session dedupe of repeated identical errors/warnings
var MAX_SAME = 3;

function clean(s) {
  // Extra safety net on top of telemetry.js's own scrubbing: hide e-mail addresses (Met usernames).
  return String(s === undefined ? '' : s).replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '<email>');
}

export function tlmInit(version) {
  if (ready) return;
  try {
    T.init({ appVersion: version, captureErrors: false, flushMs: 30000 });
    ready = true;
  } catch (e) { /* telemetry must never break the app */ }
}

export function tlmEnabled() { try { return !!T.info().enabled; } catch (e) { return false; } }
export function tlmSetEnabled(on) { try { T.setEnabled(!!on); } catch (e) { /* ignore */ } }
export function tlmInfo() { try { return T.info(); } catch (e) { return {}; } }
export function tlmFlush() { try { if (ready) T.flush(); } catch (e) { /* ignore */ } }

// level: exception | rejection | error | resource | warn | log
export function tlmCaptured(level, msg, src, stack) {
  if (!ready) return;
  // Known-harmless third-party noise (seen on the TV: Brightcove's video.js deprecation notice).
  if (level === 'warn' && /^VIDEOJS: WARN: .*deprecated/i.test(String(msg))) return;
  try {
    var key = level + '|' + String(msg).slice(0, 160);
    seen[key] = (seen[key] || 0) + 1;
    if (seen[key] > MAX_SAME) return;
    var type = level === 'warn' ? 'warn' : level === 'log' ? 'console' : 'error';
    var m = /^(.*):(\d+):(\d+)$/.exec(src || '');
    T.track(type, clean(msg), {
      source: m ? m[1] : clean(src), line: m ? +m[2] : undefined, col: m ? +m[3] : undefined,
      stack: stack ? clean(stack) : undefined, url: W.location.pathname,
      data: { level: level, repeat: seen[key] }
    });
  } catch (e) { /* ignore */ }
}

export function tlm(name, data) {
  if (!ready) return;
  try { T.lifecycle(name, data || {}); } catch (e) { /* ignore */ }
}
