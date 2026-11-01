// 1.4.2 per-title pop-up bubbles on the REAL Met site, signed in (current Google Chrome, 1920x1080), any title built by mk_title.py.
// Checks every planned bubble: its scene, kicker label, attribution line (smaller), spacing, and no overlap with the subtitles.
// Account safety as in test-133: POST /client/event answered locally; every other non-GET to the Met middleware blocked.
// Credentials: env only (MET_OD_EMAIL / MET_OD_PASSWORD), never printed or stored.
// Usage: node tools/test-142.js <slug> <metOdId> <title> <scenes.json basename>
const puppeteer = require('puppeteer-core');
const fs = require('fs'), path = require('path');
const { metLogin, metSignedIn } = require('./met-session');
const [SLUG, PID, TITLE, SCENES] = process.argv.slice(2);
if (!SCENES) { console.error('usage: test-142.js slug id title scenes.json'); process.exit(2); }
const SCRIPT = fs.readFileSync(path.join(__dirname, '../dist/webOSUserScripts/userScript.js'), 'utf8');
const { env } = require('../../scripts/env.js').loadEnv('build', { log: { warn() {}, error: console.error } });
const WORKER = env.MTV_WORKER_URL.replace(/\/+$/, '');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const VER = require('../package.json').version;
const results = [];
const check = (n, ok, info) => { results.push({ n, ok: !!ok }); console.log((ok ? 'PASS ' : 'FAIL ') + n + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 400) : '')); };
const SHOTS = process.env.SHOTS !== '0';

(async () => {
  const U = process.env.MET_OD_EMAIL, P = process.env.MET_OD_PASSWORD;
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', userDataDir: '/tmp/met-profile-current',
    args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--hide-scrollbars'], defaultViewport: { width: 1920, height: 1080 } });
  const p = await b.newPage();
  const blocked = [], errors = [], factGets = [];
  p.on('pageerror', (e) => errors.push(String(e.message || e).slice(0, 200)));
  await p.setRequestInterception(true);
  p.on('request', (r) => {
    const u = r.url(), m = r.method();
    if (u.startsWith(WORKER + '/v1/facts/')) factGets.push(m + ' ' + u.slice(WORKER.length));
    if (/middleware\.ondemand\.metopera\.org/.test(u) && m !== 'GET' && m !== 'OPTIONS') {
      const H = { 'Access-Control-Allow-Origin': 'https://ondemand.metopera.org', 'Access-Control-Allow-Credentials': 'true' };
      if (/\/client\/event/.test(u)) return r.respond({ status: 200, contentType: 'application/json', headers: H, body: '{}' });
      if (/\/client\/login$/.test(u) && r.headers()['x-mtv-test'] === '1') return r.continue();
      blocked.push(m + ' ' + u.split('?')[0].replace(/.*\/client/, '/client'));
      return r.respond({ status: 403, contentType: 'application/json', headers: H, body: '{"blocked":"test"}' });
    }
    r.continue();
  });
  await p.evaluateOnNewDocument(() => { try { localStorage.setItem('mtv.tlm.device', 'e2e-test-142'); localStorage.setItem('mtv.panelSeen', 'true'); localStorage.setItem('mtv.hintShown', '1'); if (!sessionStorage.getItem('t142')) { sessionStorage.setItem('t142', '1'); localStorage.removeItem('mtv.popFacts'); } } catch (e) { /* */ } });
  const key = async (k, wait = 250) => { await p.evaluate((kc) => { ['keydown', 'keyup'].forEach((ty) => { const e = document.createEvent('Event'); e.initEvent(ty, true, true); Object.defineProperty(e, 'keyCode', { get: () => kc }); (document.activeElement || document.body).dispatchEvent(e); }); }, k); await sleep(wait); };
  const boot = async () => {
    await p.goto('https://ondemand.metopera.org/', { waitUntil: 'domcontentloaded', timeout: 90000 });
    await sleep(4000);
    let signed = await metSignedIn(p);
    if (!signed && U && P) { console.log('signing in (status only):', await metLogin(p)); await p.reload({ waitUntil: 'domcontentloaded' }); await sleep(4000); signed = await metSignedIn(p); }
    await p.addScriptTag({ content: SCRIPT });
    await p.waitForFunction(() => document.documentElement.classList.contains('mtv-ready') && document.querySelector('.mtv-hcard'), { timeout: 30000 });
    return signed;
  };
  const playIdo = async () => {
    await p.evaluate((id, t) => window.__mtv.play(id, { title: t, from: 'test' }), PID, TITLE);
    await p.waitForFunction(() => { const e = window.__mtv.engine.engineState(); return e && (e.phase === 'playing' || /failed/.test(e.phase)); }, { timeout: 60000 }).catch(() => {});
    await sleep(3000);
  };
  const popState = () => p.evaluate(() => {
    const el = document.querySelector('.mtv-pop');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { cls: el.className, label: (el.querySelector('small') || {}).textContent, text: (el.querySelector('p') || {}).textContent, by: (el.querySelector('em') || {}).textContent,
      rect: { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right) }, focusInside: el.contains(document.activeElement), pe: getComputedStyle(el).pointerEvents };
  });
  const moveTo = async (label) => { for (let i = 0; i < 14; i++) { const s = await p.evaluate(() => (document.querySelector('.mtv-po-btn.mtv-sel span') || {}).textContent || ''); if (s.indexOf(label) === 0) return true; await key(39, 120); } return false; };


  const SRC = JSON.parse(fs.readFileSync(path.join(__dirname, '../../facts/titles/' + SLUG + '.json'), 'utf8'));
  const SCN = JSON.parse(fs.readFileSync(path.join(__dirname, '../../facts/titles-snark/' + SCENES), 'utf8')).scenes;
  const byId = {}; SRC.facts.forEach((f) => { byId[f.id] = f; });
  check('signed in to the Met', await boot());
  await sleep(2000);
  await p.evaluate(() => window.__mtv.facts.setPopFacts(true));
  await playIdo();
  check(TITLE + ' plays in our player', await p.evaluate(() => (window.__mtv.engine.engineState() || {}).phase === 'playing'));
  await sleep(2500);
  // subtitles ON (English) so overlap can be checked
  const subs = await p.evaluate(() => { const t = window.__mtv.engine.textTracks(); const en = t.filter((x) => x.language === 'en')[0] || t[0]; if (en) window.__mtv.engine.setTextTrack(en, true); return en ? en.language + '/' + en.kind : null; });
  check('English subtitles on for the overlap check', !!subs, subs);
  const chs = await p.evaluate(() => window.__mtv.engine.chapters().map((c) => ({ t: c.t, title: c.title, act: c.act })));
  const sched = await p.evaluate(() => window.__mtv.facts.plannedSchedule().map((x) => ({ at: x.at, id: x.f[0], scene: x.scene, re: x.f[2], kicker: x.f[7], by: x.f[5] })));
  check(SRC.facts.length + ' ' + TITLE + ' bubbles planned, exactly the 1.4.2 set', sched.length === SRC.facts.length && sched.every((x) => byId[x.id]), { planned: sched.length, ids: sched.map((x) => x.id) });
  const sceneOk = sched.map((x) => { const f = byId[x.id]; const c = chs[x.scene]; const want = SCN.filter((s) => new RegExp(f.sceneMatch, 'i').test(s.title))[0]; const re = new RegExp(f.sceneMatch, 'i');
    return { id: x.id, ok: !!c && !!want && (re.test(c.title) || re.test('Act ' + c.act + ': ' + c.title)) && Math.abs(c.t - want.t) < 2 && Math.abs(x.at - (c.t + f.offset)) < 0.5, at: Math.round(x.at), scene: c && c.title }; });
  check('each bubble pinned to its scene marker at its offset', sceneOk.every((x) => x.ok), sceneOk.filter((x) => !x.ok));
  const gaps = sched.slice(1).map((x, i) => x.at - sched[i].at);
  check('no two bubbles closer than 60 s', gaps.every((g) => g >= 60), { minGap: Math.round(Math.min.apply(null, gaps)) });
  // scoping: the same scene titles under a different recording id drop every perf-scoped bubble; a bare chapter list floats nothing
  const scope = await p.evaluate((n) => { const F = window.__mtv.facts, d = F.plannedSchedule(); const doc = { facts: d.map((x) => x.f), gap: 60 };
    const chs = window.__mtv.engine.chapters(), dur = window.__mtv.engine.getVideoEl().duration;
    const other = F.plan(doc, chs, dur, '', 'abcdef00-0000-0000-0000-000000000000');
    return { perfScoped: d.filter((x) => /^perf:/.test(x.f[3])).length, other: other.length, otherPerf: other.filter((x) => /^perf:/.test(x.f[3])).length, none: F.plan(doc, [{ t: 0, title: 'Act 1' }], 4000, '', 'abcdef00').length, total: d.length }; });
  check('other recordings: perf-scoped bubbles dropped, none floating', scope.otherPerf === 0 && scope.perfScoped > 0 && scope.none === 0, scope);
  // ---- every bubble live ----
  const rows = [];
  let overlaps = 0, cueSeen = 0;
  for (const x of sched) {
    await p.evaluate((t) => { window.__mtv.facts.dismiss(true); window.__mtv.player.hide(); window.__mtv.engine.getVideoEl().currentTime = t; }, x.at - 1.5);
    let st = null;
    for (let i = 0; i < 20; i++) {
      await sleep(400);
      st = await p.evaluate(() => { const el = document.querySelector('.mtv-pop'); if (!el) return null; const r = el.getBoundingClientRect();
        const sm = el.querySelector('small'), pp = el.querySelector('p'), em = el.querySelector('em');
        const cap = document.querySelector('.mtv-pl-cap'); const cs = cap && cap.textContent.trim() ? (cap.firstElementChild || cap).getBoundingClientRect() : null;
        return { label: sm.textContent, text: pp.textContent, by: em.textContent, emPx: parseFloat(getComputedStyle(em).fontSize), pPx: parseFloat(getComputedStyle(pp).fontSize), emH: em.getBoundingClientRect().height,
          rect: [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)], cap: cs ? [Math.round(cs.left), Math.round(cs.top), Math.round(cs.right), Math.round(cs.bottom)] : null,
          t: window.__mtv.engine.getVideoEl().currentTime, ctl: window.__mtv.player.isShown(), focus: el.contains(document.activeElement) }; });
      if (st) break;
    }
    const f = byId[x.id];
    const ok = !!st && st.text === f.text && st.label === (f.kicker || '') && st.emH > 0 && st.emPx < st.pPx && (!f.attribution || st.by.indexOf(f.attribution) === 0) && !st.focus && st.rect[3] < 1080 * 0.55;
    // the bubble must not overlap the subtitle box, now or at any cue: check the live cue and the caption area's top edge
    let ov = false;
    if (st && st.cap) { cueSeen++; ov = !(st.cap[1] >= st.rect[3] || st.cap[3] <= st.rect[1] || st.cap[0] >= st.rect[2] || st.cap[2] <= st.rect[0]); }
    if (ov) overlaps++;
    rows.push({ id: x.id, ok, ov, at: Math.round(x.at), shownAt: st && Math.round(st.t), label: st && st.label, by: st && st.by, rect: st && st.rect, cap: st && st.cap, em: st && st.emPx, p: st && st.pPx });
    console.log((ok && !ov ? '  ok ' : '  XX ') + x.id.padEnd(14) + ' @' + Math.round(x.at) + ' shown@' + (st && Math.round(st.t)) + ' [' + (st && st.label) + '] by="' + (st && st.by) + '" pop=' + JSON.stringify(st && st.rect) + ' cue=' + JSON.stringify(st && st.cap));
  }
  check('every bubble appears on its scene with its kicker label and text', rows.every((r) => r.ok), rows.filter((r) => !r.ok));
  check('attribution lines render as a smaller second line', rows.every((r) => r.em && r.p && r.em < r.p), { em: rows[0].em, p: rows[0].p });
  check('bubbles never overlap the subtitles (cue visible on ' + cueSeen + ' of ' + rows.length + ')', overlaps === 0 && cueSeen > 0, { overlaps, cueSeen });
  const capArea = await p.evaluate(() => { const c = document.querySelector('.mtv-pl-cap'); const r = c.getBoundingClientRect(); return [Math.round(r.top), Math.round(r.bottom)]; });
  const maxBottom = Math.max.apply(null, rows.map((r) => r.rect ? r.rect[3] : 0));
  check('lowest bubble edge is above the subtitle area', maxBottom < capArea[0] || maxBottom < 1080 * 0.55, { maxBottom, capArea });
  check('no page errors', errors.length === 0, errors.slice(0, 5));
  check('no account-changing requests attempted', blocked.length === 0, blocked);
  await b.close();
  const nf = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - nf}/${results.length} passed`);
  process.exit(nf ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
