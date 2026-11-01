const puppeteer = require('puppeteer-core');
(async () => {
  const b = await puppeteer.launch({executablePath:'/usr/bin/google-chrome', headless:'new', args:['--no-sandbox','--window-size=1920,1080']});
  const p = await b.newPage(); await p.setViewport({width:1920,height:1080});
  const reqs=[]; const cdp=await p.target().createCDPSession(); await cdp.send('Network.enable');
  const m=new Map();
  cdp.on('Network.responseReceived',e=>m.set(e.requestId,{url:e.response.url,type:e.type,status:e.response.status}));
  cdp.on('Network.loadingFinished',e=>{const r=m.get(e.requestId); if(r){r.bytes=e.encodedDataLength; reqs.push(r);}});
  const t0=Date.now();
  await p.goto(process.argv[2]||'https://ondemand.metopera.org/',{waitUntil:'networkidle2',timeout:90000});
  const tLoad=Date.now()-t0;
  await new Promise(r=>setTimeout(r,3000));
  const byHost={}; let tot=0;
  for(const r of reqs){const h=new URL(r.url).host; byHost[h]=byHost[h]||{n:0,b:0}; byHost[h].n++; byHost[h].b+=r.bytes; tot+=r.bytes;}
  const byType={}; for(const r of reqs){byType[r.type]=byType[r.type]||{n:0,b:0}; byType[r.type].n++; byType[r.type].b+=r.bytes;}
  console.log('loadMs',tLoad,'requests',reqs.length,'KB',Math.round(tot/1024));
  console.log(JSON.stringify(byHost,null,0)); console.log(JSON.stringify(byType));
  console.log('top', reqs.sort((a,b)=>b.bytes-a.bytes).slice(0,15).map(r=>Math.round(r.bytes/1024)+'KB '+r.type+' '+r.url.slice(0,140)).join('\n'));
  const info = await p.evaluate(()=>{
    const q=s=>document.querySelectorAll(s).length;
    const imgs=[...document.images].map(i=>({s:i.currentSrc.slice(0,120),nw:i.naturalWidth,w:i.clientWidth,lazy:i.loading}));
    const cls=new Set(); document.querySelectorAll('[class]').forEach(e=>String(e.className).split(/\s+/).forEach(c=>cls.add(c)));
    return {title:document.title, nodes:q('*'), imgs:imgs.length, bigImgs:imgs.filter(i=>i.nw>1.5*i.w&&i.w>0).length, imgSample:imgs.slice(0,8),
      focusable:q('a[href],button,input,select,textarea,[tabindex]'), anim:document.getAnimations?document.getAnimations().length:-1,
      classes:[...cls].filter(c=>/slick|swiper|carousel|slide|footer|header|nav|hero|tile|row|modal|login|social|shop|cookie|banner|onetrust/i.test(c)).slice(0,120),
      scripts:[...document.scripts].map(s=>s.src||('inline:'+s.textContent.slice(0,80)))};
  });
  console.log(JSON.stringify(info,null,1));
  if(process.argv[3]) await p.screenshot({path:process.argv[3]});
  await b.close();
})().catch(e=>{console.error(e);process.exit(1)});
