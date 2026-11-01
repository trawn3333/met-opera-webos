// Repro on REAL Google Chrome 53 (same Blink as webOS 4, with H.264) against the real Met site, signed in.
// Account safety: only GET requests + the login POST + progress beacons are allowed (others blocked via Fetch/Network interception where supported).
const fs = require('fs'), path = require('path');
const { launch, sleep } = require('./cdp');
const SCRIPT = fs.readFileSync(path.join(__dirname, '../dist/webOSUserScripts/userScript.js'), 'utf8');
const CHROME = process.env.CHROME || '/tmp/oldchrome/stable/c53/opt/google/chrome/chrome';
const URL = process.argv[2] || 'https://ondemand.metopera.org/performance/detail/b438b886-e3d0-57a4-a3ee-18489ec01a48';
const OUT = process.argv[3] || '/tmp/repro/c53';
const UA = 'Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/53.0.2785.34 Safari/537.36 WebAppManager';
const { metLoginSrc } = require('./met-session');
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const c = await launch({ chrome: CHROME, xvfb: !/headless|chromium|156|google-chrome$/.test(CHROME) && !process.env.HEADLESS, dpr: +(process.env.DPR || 2), ua: UA, profile: '/tmp/c53-met-profile' });
  console.log('engine', c.ver);
  // block account-changing requests (old engines: Network.setRequestInterceptionEnabled may not exist -> rely on app not doing writes)
  await c.early("try{localStorage.setItem('mtv.tlm.device','e2e-repro-c53');localStorage.setItem('mtv.panelSeen','true');localStorage.setItem('mtv.hintShown','1')}catch(e){}");
  await c.go('https://ondemand.metopera.org/');
  await sleep(4000);
  let signed = await c.call(metLoginSrc.signedIn);
  if (!signed && process.env.MET_OD_EMAIL) { console.log('login status', await c.call(metLoginSrc.login, [process.env.MET_OD_EMAIL, process.env.MET_OD_PASSWORD])); signed = await c.call(metLoginSrc.signedIn); }
  console.log('signed', signed);
  await c.go(URL);
  await sleep(1500);
  if (!process.env.NOINJECT) console.log('inject', await c.ev(SCRIPT + ';1'));
  await sleep(5000);
  const st = async (tag) => {
    const s = await c.ev(`(function(){
      var a=document.activeElement, v=document.querySelector('video');
      var vis=[];[].forEach.call(document.querySelectorAll('body *'),function(el){ if(el.closest&&el.closest('.mtv-po,.mtv-bar,.mtv-toast'))return; var r=el.getBoundingClientRect(),cs=getComputedStyle(el); if(r.width>200&&r.height>30&&r.bottom>0&&r.top<1080&&cs.visibility!=='hidden'&&cs.display!=='none'&&+cs.opacity>0.05&&(cs.position==='fixed'||cs.position==='absolute')) vis.push(el.tagName+'.'+String(el.className).slice(0,50)+' z'+cs.zIndex+' '+[r.left,r.top,r.width,r.height].map(Math.round)); });
      var vr=v&&v.getBoundingClientRect();
      return JSON.stringify({url:location.pathname, cls:document.documentElement.className, scrollY:window.pageYOffset, active:a?a.tagName+'.'+String(a.className).slice(0,60)+' "'+(a.textContent||'').trim().slice(0,30)+'"':null,
        video:v?{paused:v.paused,t:Math.round(v.currentTime),rs:v.readyState,ns:v.networkState,err:v.error&&v.error.code,w:v.videoWidth,h:v.videoHeight,rect:[vr.left,vr.top,vr.width,vr.height].map(Math.round)}:null,
        po: (function(){var p=document.querySelector('.mtv-po');if(!p)return null;var r=p.getBoundingClientRect(),cs=getComputedStyle(p);return {disp:cs.display,vis:cs.visibility,op:cs.opacity,rect:[r.left,r.top,r.width,r.height].map(Math.round)}})(),
        overlays:vis.slice(0,30), log:(window.__mtvConBuf||[]).slice(-14).map(function(x){return (typeof x==='string'?x:JSON.stringify(x)).slice(0,200)})});
    })()`);
    console.log('==', tag, s);
    await c.shot(OUT + '/' + tag + '.png');
  };
  await st('1-title');
  await c.key(13, 7000); await st('2-after-ok');
  await c.key(13, 2500); await st('3-after-ok2');
  await c.key(40, 1500); await st('4-down');
  console.log('exceptions', JSON.stringify(c.exceptions.slice(0, 10)));
  console.log('console', JSON.stringify(c.consoleMsgs.filter((m) => /error|warn/.test(m)).slice(0, 15)));
  c.close(); process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
