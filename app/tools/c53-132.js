// 1.3.2 on REAL old Chrome (53 = webOS 4 Blink, or 59) against the real Met site, signed in.
// Account safety: no request interception on these engines, so progress sync is switched OFF
// (mtv.sync=false) and the test never opens settings or touches favourites.
// Usage: CHROME=<path> node tools/c53-130.js <outdir> [tag]
const fs = require('fs'), path = require('path');
const { launch, sleep } = require('./cdp');
const { metLoginSrc } = require('./met-session');
const SCRIPT = fs.readFileSync(path.join(__dirname, '../dist/webOSUserScripts/userScript.js'), 'utf8');
const CHROME = process.env.CHROME || '/tmp/oldchrome/stable/c53/opt/google/chrome/chrome';
const OUT = process.argv[2] || '/tmp/c53-132'; const TAG = process.argv[3] || 'c53';
const UA = 'Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/53.0.2785.34 Safari/537.36 WebAppManager';
const VER = require('../package.json').version;
const results = [];
const check = (n, ok, info) => { results.push(!!ok); console.log((ok ? 'PASS ' : 'FAIL ') + n + (info !== undefined ? '  ' + JSON.stringify(info).slice(0, 400) : '')); };
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const c = await launch({ chrome: CHROME, xvfb: !process.env.HEADLESS, dpr: +(process.env.DPR || 1), ua: UA, profile: process.env.PROFILE || '/tmp/c53-met-profile' });
  console.log('engine', c.ver);
  await c.early("try{localStorage.setItem('mtv.tlm.device','e2e-" + TAG + "-132');localStorage.setItem('mtv.panelSeen','true');localStorage.setItem('mtv.hintShown','1');localStorage.setItem('mtv.sync','false')}catch(e){}");
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
  check('browse mode, app takeover, version', s.mode === 'browse' && /mtv-app/.test(s.cls) && s.ver === 'v' + VER, { cls: s.cls, ver: s.ver });
  check('hero incl. Met featured (progressive XHR)', s.hero.length >= 3 && /Featured by the Met/i.test(s.heroLab || ''), { hero: s.hero, lab: s.heroLab });
  check('rows with Hidden gems', s.rows.some((r) => /Hidden gems/.test(r)), s.rows);
  check('no Met chrome visible', s.metChrome === 0, s.metChrome);
  await c.shot(OUT + '/1-browse.png');
  // 1.3.1 AI artwork on the old engine: find a browse row with AI art, focus it, check the images decoded
  let found = null;
  for (let v = 0; v < 12 && !found; v++) {
    found = JSON.parse(await c.ev("JSON.stringify((__mtv.categories.genThumbRows('-ai')||[]).filter(function(x){return x[0]>=1&&x[0]<=6})[0]||null)"));
    if (!found) { await c.ev("document.querySelector('.mtv-bar-item[data-act=\"home\"]').focus()"); await c.key(13, 900); }
  }
  check('browse has AI artwork rows', !!found, found);
  if (found) {
    await c.ev('__mtv.categories.focusCurrent()');
    for (let i = 0; i < found[0]; i++) await c.key(40, 250);
    for (let i = 0; i < Math.max(0, found[1][0] - 1); i++) await c.key(39, 200);
    await sleep(2500);
    const imgs = JSON.parse(await c.ev("JSON.stringify([].map.call(document.querySelectorAll('.mtv-cat .mtv-crow')[" + found[0] + "].querySelectorAll('img'),function(i){return {ai:/-ai\\.jpg/.test(i.src),ok:i.complete&&i.naturalWidth===960}}).filter(function(x){return x.ai}))"));
    check('AI artwork cards decode on this engine', imgs.length > 0 && imgs.every((x) => x.ok), imgs);
    await c.shot(OUT + '/1b-browse-ai-art.png');
    await c.ev("document.querySelector('.mtv-bar-item[data-act=\"home\"]').focus()"); await c.key(13, 900);
  }
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
  // ---- 1.3.2 on this engine: Idomeneo scene jumps, Cast panel, remembered button, title-page Cast ----
  await c.ev("__mtv.play('19a5ae2a-7d68-5175-bc14-3a295ab3f618',{title:'Idomeneo',from:'test'});1");
  for (let i = 0; i < 120; i++) { e = (await S()).eng; if (e && (e.phase === 'playing' || /fail/.test(e.phase))) break; await sleep(500); }
  await sleep(2500);
  check('Idomeneo playing on this engine', e && e.phase === 'playing', e && { phase: e.phase, src: e.src });
  const P = async () => JSON.parse(await c.ev("(function(){var v=__mtv.engine.getVideoEl(),c=__mtv.engine.chapters(),ci=-1;for(var i=0;i<c.length;i++)if(c[i].t<=v.currentTime+0.5)ci=i;var t=document.querySelector('.mtv-toast');return JSON.stringify({t:v.currentTime,ci:ci,n:c.length,start:ci>=0?c[ci].t:0,title:ci>=0?c[ci].title:'',toast:t&&t.style.display!=='none'?t.textContent:'',shown:__mtv.player.isShown(),sel:(document.querySelector('.mtv-po-btn.mtv-sel span')||{}).textContent||''})})()"));
  await c.ev("(function(){var c=__mtv.engine.chapters();__mtv.engine.getVideoEl().currentTime=c[6].t+20;__mtv.player.hide();return 1})()");
  await sleep(3000);
  const a0 = await P();
  await c.key(39, 600);
  const a1 = await P();
  check('hidden RIGHT -> next scene + toast', a1.ci === a0.ci + 1 && Math.abs(a1.t - a1.start) < 3 && a1.toast.indexOf(a1.title) >= 0 && !a1.shown, { from: a0.ci, to: a1.ci, toast: a1.toast });
  await c.shot(OUT + '/5-scene-jump-toast.png');
  await c.key(417, 600);
  const a2 = await P();
  check('FF -> next scene', a2.ci === a1.ci + 1, { ci: a2.ci });
  await c.key(37, 600);
  const a3 = await P();
  check('hidden LEFT right after a jump -> previous scene', a3.ci === a1.ci, { ci: a3.ci });
  await c.ev("localStorage.setItem('mtv.ctlLast',JSON.stringify('cast'));1");
  await c.key(40, 700);
  const a4 = await P();
  check('DOWN opens controls on the remembered button (Cast)', a4.shown && a4.sel === 'Cast', a4.sel);
  await c.key(13, 800);
  const cp = JSON.parse(await c.ev("JSON.stringify([].map.call(document.querySelectorAll('.mtv-po-mi'),function(x){return [x.querySelector('b').textContent,(x.querySelector('span')||{}).textContent||'',x.classList.contains('mtv-on')]}))"));
  check('Cast panel renders (Idamante / Alice Coote / mezzo-soprano / trouser role)', cp.some((x) => /^Idamante/.test(x[0]) && /trouser role/.test(x[0]) && /Alice Coote . mezzo-soprano/.test(x[1])) && cp.some((x) => x[2]), cp);
  await c.shot(OUT + '/6-cast-panel.png');
  await c.key(461, 500); await c.key(461, 500);
  n = 0; for (; n < 4; n++) { await c.key(461, 700); if ((await S()).mode !== 'play') break; }
  await c.ev("__mtv.categories.openView({kind:'title',name:'Idomeneo'});1");
  await sleep(4000);
  const row = await c.ev("[].map.call(document.querySelectorAll('.mtv-cat .mtv-crow h2'),function(x){return x.textContent}).join('|')");
  check('title page has Cast & roles row', /Cast & roles/.test(row), row.slice(0, 200));
  check('no exceptions', c.exceptions.length === 0, c.exceptions.slice(0, 6));
  console.log('\n' + results.filter(Boolean).length + '/' + results.length + ' passed');
  c.close(); process.exit(results.every(Boolean) ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(2); });
