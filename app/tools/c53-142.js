// 1.4.2 per-title bubbles on REAL old Chrome (53 = webOS 4 Blink), real Met site, signed in:
// every bubble at their scenes, kicker labels, smaller attribution line, 60 s spacing, clear of the subtitles.
// Account safety: as c53-133 (progress sync OFF, never opens settings or favourites).
// Usage: CHROME=<path> node tools/c53-142.js <slug> <metOdId> <title> [outdir]
const fs = require('fs'), path = require('path');
const { launch, sleep } = require('./cdp');
const { metLoginSrc } = require('./met-session');
const SCRIPT = fs.readFileSync(path.join(__dirname, '../dist/webOSUserScripts/userScript.js'), 'utf8');
const CHROME = process.env.CHROME || '/tmp/oldchrome/stable/c53/opt/google/chrome/chrome';
const [SLUG, PID, TITLE] = process.argv.slice(2); const OUT = process.argv[5] || '/tmp/c53-142'; const TAG = 'c53';
if (!TITLE) { console.error('usage'); process.exit(2); }
const UA = 'Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/53.0.2785.34 Safari/537.36 WebAppManager';
const results = [];
const check = (n, ok, info) => { results.push(!!ok); console.log((ok ? 'PASS ' : 'FAIL ') + n + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 400) : '')); };
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const c = await launch({ chrome: CHROME, xvfb: !process.env.HEADLESS, dpr: +(process.env.DPR || 1), ua: UA, profile: process.env.PROFILE || '/tmp/c53-met-profile' });
  console.log('engine', c.ver);
  await c.early("try{localStorage.setItem('mtv.tlm.device','e2e-" + TAG + "-142');localStorage.setItem('mtv.panelSeen','true');localStorage.setItem('mtv.hintShown','1');localStorage.setItem('mtv.sync','false');localStorage.removeItem('mtv.popFacts');localStorage.removeItem('mtv.facts.otello')}catch(e){}");
  await c.go('https://ondemand.metopera.org/');
  await sleep(4000);
  let signed = await c.call(metLoginSrc.signedIn);
  if (!signed && process.env.MET_OD_EMAIL) { console.log('login status', await c.call(metLoginSrc.login, [process.env.MET_OD_EMAIL, process.env.MET_OD_PASSWORD])); signed = await c.call(metLoginSrc.signedIn); }
  check('signed in', signed);
  await c.ev(SCRIPT + ';1');
  let up = false;
  for (let i = 0; i < 80 && !up; i++) { up = await c.ev("!!(document.documentElement.classList.contains('mtv-ready')&&document.querySelector('.mtv-hcard'))"); if (!up) await sleep(250); }
  check('browse up after injection', up);
  await sleep(3000);

  const SRC = JSON.parse(fs.readFileSync(path.join(__dirname, '../../facts/titles/' + SLUG + '.json'), 'utf8'));
  const byId = {}; SRC.facts.forEach((f) => { byId[f.id] = f; });
  await c.ev('__mtv.play(' + JSON.stringify(PID) + ',{title:' + JSON.stringify(TITLE) + ",from:'test'});1");
  let e = null;
  for (let i = 0; i < 120; i++) { e = JSON.parse(await c.ev('JSON.stringify(__mtv.engine.engineState())')); if (e && (e.phase === 'playing' || /fail/.test(e.phase))) break; await sleep(500); }
  await sleep(3000);
  check(TITLE + ' playing on this engine', e && e.phase === 'playing', e && e.phase);
  const subs = await c.ev("(function(){var t=__mtv.engine.textTracks();var en=t.filter(function(x){return x.language==='en'})[0]||t[0];if(en)__mtv.engine.setTextTrack(en,true);return en?en.language+'/'+en.kind:''})()");
  check('English subtitles on', !!subs, subs);
  const sched = JSON.parse(await c.ev("JSON.stringify(__mtv.facts.plannedSchedule().map(function(x){return {at:x.at,id:x.f[0],scene:x.scene}}))"));
  const chs = JSON.parse(await c.ev("JSON.stringify(__mtv.engine.chapters().map(function(c){return {t:c.t,title:c.title,act:c.act}}))"));
  check(SRC.facts.length + ' bubbles planned (1.4.2 set)', sched.length === SRC.facts.length && sched.every((x) => byId[x.id]), { n: sched.length });
  const pin = sched.filter((x) => { const f = byId[x.id], ch = chs[x.scene]; return !ch || !(new RegExp(f.sceneMatch, 'i').test(ch.title) || new RegExp(f.sceneMatch, 'i').test('Act ' + ch.act + ': ' + ch.title)) || Math.abs(x.at - (ch.t + f.offset)) > 0.5; });
  check('each pinned to its scene marker + offset', pin.length === 0, pin);
  const gaps = sched.slice(1).map((x, i) => x.at - sched[i].at);
  check('no two closer than 60 s', gaps.every((g) => g >= 60), { minGap: Math.round(Math.min.apply(null, gaps)) });
  const PS = "(function(){var el=document.querySelector('.mtv-pop');if(!el)return 'null';var r=el.getBoundingClientRect();var sm=el.querySelector('small'),pp=el.querySelector('p'),em=el.querySelector('em');var cap=document.querySelector('.mtv-pl-cap');var cs=cap&&cap.textContent.replace(/\\s/g,'')?(cap.firstElementChild||cap).getBoundingClientRect():null;return JSON.stringify({label:sm.textContent,text:pp.textContent,by:em.textContent,emPx:parseFloat(getComputedStyle(em).fontSize),pPx:parseFloat(getComputedStyle(pp).fontSize),emH:em.getBoundingClientRect().height,r:[r.left,r.top,r.right,r.bottom].map(Math.round),cap:cs?[cs.left,cs.top,cs.right,cs.bottom].map(Math.round):null,t:__mtv.engine.getVideoEl().currentTime,focus:el.contains(document.activeElement),anim:getComputedStyle(el).webkitAnimationName||getComputedStyle(el).animationName})})()";
  const H = await c.ev('innerHeight');
  let bad = [], ov = 0, cues = 0;
  for (const x of sched) {
    await c.ev('__mtv.facts.dismiss(true);__mtv.player.hide();__mtv.engine.getVideoEl().currentTime=' + (x.at - 1.5) + ';1');
    let st = null;
    for (let i = 0; i < 25 && !st; i++) { await sleep(400); st = JSON.parse(await c.ev(PS)); }
    const f = byId[x.id];
    const ok = st && st.text === f.text && st.label === (f.kicker || '') && st.emH > 0 && st.emPx < st.pPx && (!f.attribution || st.by.indexOf(f.attribution) === 0) && !st.focus && st.r[3] < H * 0.55 && /mtvPopIn/.test(st.anim);
    let o = false;
    if (st && st.cap) { cues++; o = !(st.cap[1] >= st.r[3] || st.cap[3] <= st.r[1] || st.cap[0] >= st.r[2] || st.cap[2] <= st.r[0]); }
    if (o) ov++;
    if (!ok) bad.push({ id: x.id, st });
    console.log((ok && !o ? '  ok ' : '  XX ') + x.id.padEnd(14) + ' @' + Math.round(x.at) + ' shown@' + (st && Math.round(st.t)) + ' [' + (st && st.label) + '] pop=' + JSON.stringify(st && st.r) + ' cue=' + JSON.stringify(st && st.cap));
    if (st && x === sched[2]) { await sleep(800); await c.shot(OUT + '/' + x.id + '-c53.png'); }
  }
  check('every bubble appears at its scene with kicker + text + smaller attribution line (Chrome 53)', bad.length === 0, bad.slice(0, 3));
  check('no overlap with subtitles (cue visible on ' + cues + ' of ' + sched.length + ')', ov === 0 && cues > 0, { ov, cues });
  check('no exceptions', c.exceptions.length === 0, c.exceptions.slice(0, 6));
  console.log('\n' + results.filter(Boolean).length + '/' + results.length + ' passed');
  c.close(); process.exit(results.every(Boolean) ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(2); });
