const http=require('http'),{spawn}=require('child_process'),WebSocket=require('ws');
const CHROME=process.argv[2];const PORT=9900+Math.floor(Math.random()*90);const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const getJSON=u=>new Promise((res,rej)=>http.get(u,r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{try{res(JSON.parse(d))}catch(e){rej(e)}})}).on('error',rej));
(async()=>{const p=spawn(CHROME,['--headless','--no-sandbox','--disable-gpu',`--remote-debugging-port=${PORT}`,'--user-data-dir=/tmp/do'+Date.now(),'about:blank'],{stdio:'ignore'});
let t;for(let i=0;i<160;i++){try{t=await getJSON(`http://127.0.0.1:${PORT}/json`);break}catch(e){await sleep(250)}}
const ws=new WebSocket(t.find(x=>x.type==='page').webSocketDebuggerUrl);await new Promise(r=>ws.on('open',r));let id=0;const pend={};
ws.on('message',m=>{m=JSON.parse(m);if(m.id&&pend[m.id]){pend[m.id](m);delete pend[m.id]}});
const send=(method,params={})=>new Promise(r=>{const i=++id;pend[i]=r;ws.send(JSON.stringify({id:i,method,params}))});
const ev=async e=>{const r=await send('Runtime.evaluate',{expression:e,returnByValue:true});return r.result.result.value};
await send('Page.enable');await send('Page.navigate',{url:'https://example.com/'});await sleep(3000);
console.log((await getJSON(`http://127.0.0.1:${PORT}/json/version`)).Browser);
await ev(`window.cnt={scroll:0,click:0,tick:0,raf:0};window.addEventListener('scroll',function(){cnt.scroll++});document.addEventListener('click',function(){cnt.click++});setInterval(function(){cnt.tick++},50);(function f(){cnt.raf++;requestAnimationFrame(f)})();window.foo=42;1`);
await sleep(300);
console.log(await ev(`(function(){var hi=setTimeout(function(){},0);for(var i=1;i<=hi;i++){clearTimeout(i);clearInterval(i);}var hr=requestAnimationFrame(function(){});for(var j=1;j<=hr;j++)cancelAnimationFrame(j);var before=JSON.stringify(cnt);document.open();document.write('<html><head><script>window.early=typeof window.foo<\\/script></head><body><p id=x>new</p></body></html>');document.close();window.dispatchEvent(new Event('scroll'));document.dispatchEvent(new Event('click'));return before+' foo='+window.foo+' early='+window.early})()`));
await sleep(500);
console.log(await ev(`JSON.stringify(cnt)+' body='+document.body.innerHTML+' url='+location.href`));
p.kill();process.exit(0)})();
