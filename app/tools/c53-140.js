// 1.4.0 pop-up facts on REAL old Chrome (53 = webOS 4 Blink) against the real Met site, signed in, with Idomeneo.
// Account safety: as c53-133 (progress sync OFF, never opens settings or favourites).
// Usage: CHROME=<path> node tools/c53-140.js <outdir> [tag]
const fs = require('fs'), path = require('path');
const { launch, sleep } = require('./cdp');
const { metLoginSrc } = require('./met-session');
const SCRIPT = fs.readFileSync(path.join(__dirname, '../dist/webOSUserScripts/userScript.js'), 'utf8');
const CHROME = process.env.CHROME || '/tmp/oldchrome/stable/c53/opt/google/chrome/chrome';
const OUT = process.argv[2] || '/tmp/c53-140'; const TAG = process.argv[3] || 'c53';
const UA = 'Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/53.0.2785.34 Safari/537.36 WebAppManager';
const results = [];
const check = (n, ok, info) => { results.push(!!ok); console.log((ok ? 'PASS ' : 'FAIL ') + n + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 400) : '')); };
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const c = await launch({ chrome: CHROME, xvfb: !process.env.HEADLESS, dpr: +(process.env.DPR || 1), ua: UA, profile: process.env.PROFILE || '/tmp/c53-met-profile' });
  console.log('engine', c.ver);
  await c.early("try{localStorage.setItem('mtv.tlm.device','e2e-" + TAG + "-140');localStorage.setItem('mtv.panelSeen','true');localStorage.setItem('mtv.hintShown','1');localStorage.setItem('mtv.sync','false');localStorage.removeItem('mtv.popFacts');localStorage.removeItem('mtv.facts.otello')}catch(e){}");
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
  // lazy fetch from the Worker on this engine (XHR + CORS), then localStorage cache
  await c.ev("window.__t140=null;__mtv.facts.loadFacts('Otello',function(d){window.__t140=d?{slug:d.slug,n:d.facts.length}:'none'});1");
  let lz = null; for (let i = 0; i < 30 && !lz; i++) { await sleep(300); lz = JSON.parse(await c.ev('JSON.stringify(window.__t140)')); }
  check('non-bundled title (Otello) fetched from the Worker on Chrome 53', lz && lz.slug === 'otello' && lz.n >= 10, lz);
  check('... and cached in localStorage', await c.ev("!!localStorage.getItem('mtv.facts.otello')"));
  await c.ev("__mtv.play('19a5ae2a-7d68-5175-bc14-3a295ab3f618',{title:'Idomeneo',from:'test'});1");
  let e = null;
  for (let i = 0; i < 120; i++) { e = JSON.parse(await c.ev('JSON.stringify(__mtv.engine.engineState())')); if (e && (e.phase === 'playing' || /fail/.test(e.phase))) break; await sleep(500); }
  await sleep(3000);
  check('Idomeneo playing on this engine', e && e.phase === 'playing', e && e.phase);
  const st = JSON.parse(await c.ev('JSON.stringify(__mtv.player.factsState())'));
  const sched = JSON.parse(await c.ev("JSON.stringify(__mtv.facts.plannedSchedule().map(function(x){return {at:Math.round(x.at),id:x.f[0],scene:x.scene,scope:x.f[3]}}))"));
  check('pop-up facts on by default; Idomeneo schedule planned', st.on && st.session && st.session.slug === 'idomeneo' && sched.length >= 15, { on: st.on, n: sched.length });
  check('Ponnelle-production facts included for the 2017 performance', sched.some((x) => /production:1982-10-14/.test(x.scope || '')));
  const tied = sched.filter((x) => x.scene !== undefined && x.scene !== null);
  const target = tied[1] || tied[0];
  await c.ev('__mtv.player.hide();__mtv.engine.getVideoEl().currentTime=' + (target.at - 3) + ';1');
  const PS = "(function(){var el=document.querySelector('.mtv-pop');if(!el)return 'null';var r=el.getBoundingClientRect();var cs=getComputedStyle(el);return JSON.stringify({label:(el.querySelector('small')||{}).textContent,text:(el.querySelector('p')||{}).textContent,by:(el.querySelector('em')||{}).textContent,top:Math.round(r.top),bottom:Math.round(r.bottom),w:Math.round(r.width),anim:cs.animationName||cs.webkitAnimationName,pe:cs.pointerEvents,focus:el.contains(document.activeElement),radius:getComputedStyle(el.querySelector('.mtv-pop-bub')||el).borderTopLeftRadius})})()";
  let pop = null;
  for (let i = 0; i < 14 && !pop; i++) { await sleep(700); pop = JSON.parse(await c.ev(PS)); }
  check('speech-bubble pop-up appears at its scene on Chrome 53', pop && pop.text && pop.label && pop.by && pop.w > 200, pop);
  check('rounded bubble + bounce animation render on this engine', pop && /mtvPopIn/.test(pop.anim) && parseFloat(pop.radius) > 10, pop && { anim: pop.anim, radius: pop.radius });
  check('no focus taken, pointer ignored, top part of the screen', pop && !pop.focus && pop.pe === 'none' && pop.bottom < (await c.ev('innerHeight')) * 0.55, pop && { focus: pop.focus, pe: pop.pe, bottom: pop.bottom });
  await sleep(900);
  await c.shot(OUT + '/popup-fact-c53.png');
  await sleep(11000);
  check('auto-dismissed after ~10 s', JSON.parse(await c.ev(PS)) === null);
  // toggle via controls
  await c.key(40, 700);
  let lab = '';
  for (let i = 0; i < 14; i++) { lab = await c.ev("(document.querySelector('.mtv-po-btn.mtv-sel span')||{}).textContent||''"); if (lab.indexOf('Pop-up facts') === 0) break; await c.key(39, 150); }
  check('controls have "Pop-up facts: on"', /^Pop-up facts.*on$/.test(lab), lab);
  await c.key(13, 700);
  lab = await c.ev("(document.querySelector('.mtv-po-btn.mtv-sel span')||{}).textContent||''");
  check('OK turns it off and remembers it', /off$/.test(lab) && (await c.ev("localStorage.getItem('mtv.popFacts')")) === 'false', lab);
  await c.shot(OUT + '/popup-toggle-c53.png');
  await c.key(461, 500);
  const nxt = sched.find((x) => x.at > target.at + 60);
  await c.ev('__mtv.engine.getVideoEl().currentTime=' + (nxt.at - 2) + ';1');
  await sleep(5000);
  check('OFF: nothing pops when a fact is due', JSON.parse(await c.ev(PS)) === null);
  await c.key(40, 700);
  for (let i = 0; i < 14; i++) { lab = await c.ev("(document.querySelector('.mtv-po-btn.mtv-sel span')||{}).textContent||''"); if (lab.indexOf('Pop-up facts') === 0) break; await c.key(39, 150); }
  await c.key(13, 500);
  check('turned back on', await c.ev('__mtv.player.factsState().on'));
  await c.key(461, 400);
  check('no exceptions', c.exceptions.length === 0, c.exceptions.slice(0, 6));
  console.log('\n' + results.filter(Boolean).length + '/' + results.length + ' passed');
  c.close(); process.exit(results.every(Boolean) ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(2); });
