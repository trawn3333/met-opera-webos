// Composes promo frames (1920x1080) from clean app captures in /workspace/met/promo/src.
const puppeteer = require('puppeteer-core');
const fs = require('fs'), path = require('path');
const DIR = '/workspace/met/promo';
const F = [
  { out: 'promo_1_browse.png', src: '1-browse-hero0.png', k: 'Browse', h: 'The Met\u2019s archive, made for your TV', s: 'A cinematic home screen with hand-picked rows and stage artwork, built for the couch.' },
  { out: 'promo_2_hidden-gems.png', src: '2b-gems.png', k: 'Categories', h: 'Discover hidden gems', s: 'Curated categories surface superb works you may not know yet, from Jen\u016ffa to Akhnaten.' },
  { out: 'promo_3_search.png', src: '3b-search-mozart.png', k: 'Search', h: 'Find any opera in a keystroke', s: 'Instant results as you type, across titles, composers and singers, all from the remote.' },
  { out: 'promo_4_cast.png', src: '4-cast-6230.png', k: 'Cast', h: 'Know who\u2019s singing, scene by scene', s: 'Roles, singers and voice types, with the voices in the current scene highlighted live.' },
  { out: 'promo_5_scene-jump.png', src: '5-toast-5890.png', k: 'Playback', h: 'Built for the remote', s: 'Left and right jump between scenes, with the name of each number and who sings it.' }
];
const html = (f) => `<!doctype html><html><head><meta charset="utf-8"><style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:1920px;height:1080px;overflow:hidden;background:#07060a}
.bg{position:absolute;inset:-60px;background:url('${f.src}') center/cover;filter:blur(60px) brightness(.32) saturate(1.2);transform:scale(1.1)}
.glow{position:absolute;inset:0;background:radial-gradient(ellipse 70% 55% at 50% 62%,rgba(179,38,58,.20),transparent 70%),radial-gradient(ellipse 60% 40% at 50% 0%,rgba(227,182,91,.10),transparent 70%),linear-gradient(180deg,rgba(7,6,10,.55),rgba(7,6,10,.15) 40%,rgba(7,6,10,.75))}
.grain{position:absolute;inset:0;opacity:.06;background-image:radial-gradient(#fff 1px,transparent 1px);background-size:3px 3px}
.top{position:absolute;left:0;right:0;top:52px;text-align:center;color:#fff}
.brand{font:600 18px 'Inter';letter-spacing:.14em;color:#e3b65b}
.brand i{font-style:normal;color:#8d8996;letter-spacing:.2em}
h1{font:500 64px/1.08 'Playfair Display';margin-top:16px;letter-spacing:-.005em}
p.s{font:400 24px/1.4 'Inter';color:#c9c4d2;margin-top:12px}
.tv{position:absolute;left:50%;top:252px;width:1296px;margin-left:-648px}
.bezel{padding:11px;border-radius:16px;background:linear-gradient(180deg,#2a2830,#121116);box-shadow:0 0 0 1px rgba(255,255,255,.07),0 40px 90px rgba(0,0,0,.75),0 0 120px rgba(227,182,91,.07)}
.screen{width:1274px;height:716.6px;border-radius:6px;overflow:hidden;background:#000;position:relative}
.screen img{width:100%;height:100%;display:block}
.screen:after{content:'';position:absolute;inset:0;background:linear-gradient(115deg,rgba(255,255,255,.06),transparent 32%)}
.stand{width:260px;height:10px;margin:0 auto;border-radius:0 0 8px 8px;background:linear-gradient(180deg,#1c1b21,#0d0c10)}
.foot{position:absolute;left:0;right:0;bottom:22px;text-align:center;font:400 15px 'Inter';color:#77727f;letter-spacing:.02em}
.foot b{font-weight:600;color:#a8a2b2}
</style></head><body><div class="bg"></div><div class="glow"></div><div class="grain"></div>
<div class="top"><div class="brand">Met Opera for webOS <i>(unofficial)</i> &nbsp;\u00b7&nbsp; ${f.k}</div><h1>${f.h}</h1><p class="s">${f.s}</p></div>
<div class="tv"><div class="bezel"><div class="screen"><img src="${f.src}"></div></div><div class="stand"></div></div>
<div class="foot"><b>Met Opera for webOS (unofficial)</b> \u00b7 Unofficial app. Not affiliated with the Metropolitan Opera. Screens show the app on an LG TV with a Met Opera on Demand subscription.</div>
</body></html>`;
(async () => {
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--allow-file-access-from-files'], defaultViewport: { width: 1920, height: 1080 } });
  const p = await b.newPage();
  for (const f of F) {
    const file = path.join(DIR, 'src', '_' + f.out + '.html');
    fs.writeFileSync(file, html(f));
    await p.goto('file://' + file, { waitUntil: 'load' });
    await p.evaluate(() => document.fonts.ready);
    await new Promise((r) => setTimeout(r, 300));
    await p.screenshot({ path: path.join(DIR, f.out) });
    fs.unlinkSync(file);
    console.log('wrote', f.out);
  }
  await b.close();
})();
