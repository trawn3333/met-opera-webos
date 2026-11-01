// 1.3.0 on REAL old Chrome (53 = webOS 4 Blink, or 59) against the real Met site, signed in.
// Account safety: no request interception on these engines, so progress sync is switched OFF
// (mtv.sync=false) and the test never opens settings or touches favourites.
// Usage: CHROME=<path> node tools/c53-130.js <outdir> [tag]
const fs = require('fs'), path = require('path');
const { launch, sleep } = require('./cdp');
const { metLoginSrc } = require('./met-session');
const SCRIPT = fs.readFileSync(path.join(__dirname, '../dist/webOSUserScripts/userScript.js'), 'utf8');
const CHROME = process.env.CHROME || '/tmp/oldchrome/stable/c53/opt/google/chrome/chrome';
const OUT = process.argv[2] || '/tmp/c53-130'; const TAG = process.argv[3] || 'c53';
const UA = 'Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/53.0.2785.34 Safari/537.36 WebAppManager';
const results = [];
const check = (n, ok, info) => { results.push(!!ok); console.log((ok ? 'PASS ' : 'FAIL ') + n + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 400) : '')); };
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const c = await launch({ chrome: CHROME, xvfb: !process.env.HEADLESS, dpr: +(process.env.DPR || 1), ua: UA, profile: process.env.PROFILE || '/tmp/c53-met-profile' });
  console.log('engine', c.ver);
  await c.early("try{localStorage.setItem('mtv.tlm.device','e2e-" + TAG + "-130');localStorage.setItem('mtv.panelSeen','true');localStorage.setItem('mtv.hintShown','1');localStorage.setItem('mtv.sync','false')}catch(e){}");
  await c.go('https://ondemand.metopera.org/');
  await sleep(4000);
  let signed = await c.call(metLoginSrc.signedIn);
  if (!signed && process.env.MET_OD_EMAIL) { console.log('login status', await c.call(metLoginSrc.login, [process.env.MET_OD_EMAIL, process.env.MET_OD_PASSWORD])); signed = await c.call(metLoginSrc.signedIn); }
  check('signed in', signed);
  const t0 = Date.now();
  await c.ev(SCRIPT + ';1');
  let up = false;
  for (let i = 0; i < 80 && !up; i++) { up = await c.ev("!!(document.documentElement.classList.contains('mtv-ready')&&document.querySelector('.mtv-hcard'))"); if (!up) await sleep(250); }
  check('browse up after injection', up, { ms: Date.now() - t0 });
  await sleep(7000);
  const S = async () => JSON.parse(await c.ev(`JSON.stringify({mode:__mtv.mode(),cls:document.documentElement.className,metChrome:__mtv.metChrome(),cat:__mtv.categories.debugState(),search:__mtv.search.debugState(),eng:__mtv.engine.engineState(),
    hero:[].map.call(document.querySelectorAll('.mtv-hcard'),function(x){return x.textContent}),heroLab:(document.querySelector('.mtv-hero-lab')||{}).textContent,
    rows:[].map.call(document.querySelectorAll('.mtv-cat .mtv-crow h2'),function(x){return x.firstChild.textContent}),ver:(document.querySelector('.mtv-bar-ver')||{}).textContent,
    active:document.activeElement?String(document.activeElement.className).slice(0,50):''})`));
  let s = await S();
  check('browse mode, app takeover, version', s.mode === 'browse' && /mtv-app/.test(s.cls) && s.ver === 'v1.3.0', { cls: s.cls, ver: s.ver });
  check('hero incl. Met featured (progressive XHR)', s.hero.length >= 3 && /Featured by the Met/i.test(s.heroLab || ''), { hero: s.hero, lab: s.heroLab });
  check('rows with Hidden gems', s.rows.some((r) => /Hidden gems/.test(r)), s.rows);
  check('no Met chrome visible', s.metChrome === 0, s.metChrome);
  await c.shot(OUT + '/1-browse.png');
  await c.key(405, 600);
  s = await S();
  check('YELLOW -> search', s.mode === 'search', s.mode);
  await c.type('dvorak'); await sleep(300);
  s = await S();
  check('search dvorak (typed)', s.search.q === 'dvorak' && s.search.shown === 'dvorak' && s.search.results > 0, s.search);
  await c.ev("__mtv.search.typeForTest('rosenkav')"); await sleep(300);
  await c.shot(OUT + '/2-search.png');
  for (let i = 0; i < 7; i++) await c.key(39, 120);
  s = await S();
  check('focus to results', s.search.zone === 'list', s.search);
  await c.key(13, 500);
  let e = null;
  for (let i = 0; i < 120; i++) { e = (await S()).eng; if (e && (e.phase === 'playing' || /fail/.test(e.phase))) break; await sleep(500); }
  await sleep(3000);
  s = await S();
  const v = JSON.parse(await c.ev("(function(){var v=__mtv.engine.getVideoEl();if(!v)return JSON.stringify({none:1,err:__mtv.engine.errorShown(),h264:document.createElement('video').canPlayType('video/mp4; codecs=avc1.42E01E'),txt:(document.querySelector('.mtv-pl-err')||{}).textContent});var r=v.getBoundingClientRect();return JSON.stringify({t:v.currentTime,paused:v.paused,w:v.videoWidth,h:v.videoHeight,rect:[r.left,r.top,r.width,r.height].map(Math.round)})})()"));
  check('own player playing on this engine', s.eng && s.eng.phase === 'playing' && !v.paused && v.t > 0.5, { src: s.eng && s.eng.src, sources: s.eng && s.eng.sources, startMs: s.eng && s.eng.startMs, errors: s.eng && s.eng.errors, v });
  check('play mode, no Met chrome', s.mode === 'play' && s.metChrome === 0, { mode: s.mode, metChrome: s.metChrome });
  const exp = s.eng ? s.eng.fit.expected.split(',').map(Number) : [];
  check('video rect = letterbox', exp.length === 4 && exp.every((x, i) => Math.abs(x - v.rect[i]) <= 1), { rect: v.rect, fit: s.eng && s.eng.fit });
  await c.ev('__mtv.player.hide&&__mtv.player.hide()'); await sleep(800);
  await c.shot(OUT + '/3-playback.png');
  await c.key(40, 700);
  await c.shot(OUT + '/4-controls.png');
  check('controls visible on DOWN', await c.ev("(function(){var p=document.querySelector('.mtv-po');return !!p&&getComputedStyle(p).display!=='none'&&+getComputedStyle(p).opacity>0.5})()"));
  const caps = await c.ev("__mtv.engine.textTracks().map(function(t){return t.language+':'+t.mode+':'+(t.cues?t.cues.length:'-')}).join(' ')");
  check('subtitles loaded (en default)', /en:showing:\d+/.test(caps), caps);
  let n = 0; for (; n < 4; n++) { await c.key(461, 700); if ((await S()).mode !== 'play') break; }
  s = await S();
  check('BACK returns to search results', s.mode === 'search' && s.search.zone === 'list', { mode: s.mode, presses: n + 1, zone: s.search.zone });
  await c.key(461, 600);
  s = await S();
  check('BACK -> browse', s.mode === 'browse', s.mode);
  check('no exceptions', c.exceptions.length === 0, c.exceptions.slice(0, 6));
  console.log('\n' + results.filter(Boolean).length + '/' + results.length + ' passed');
  c.close(); process.exit(results.every(Boolean) ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(2); });
