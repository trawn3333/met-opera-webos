// Builds proper thumbnails for catalog titles whose Met artwork is missing, a generic typographic
// "record label" card, square-only, or low-res. Handling order per title:
//   1. real Met imagery from other API fields (performance slide / mobileTile images)        -> 'slide'
//   2. real Met imagery from another catalog title of the same work (alias)                  -> 'alias'
//   3. a square real Met photo composed into a 16:9 card (blurred backdrop + photo + type)    -> 'composed'
//   4. a designed typographic poster keyed to era (palette) and mood (motif)                  -> 'designed'
// Output: /workspace/met/thumbs/out/<slug>.jpg (960x540) + manifest.json + contact sheets.
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const esbuild = require('esbuild');
const puppeteer = require('puppeteer-core');
const T = '/workspace/met/thumbs';
const OUT = path.join(T, 'out');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const tmp = '/tmp/catdata.cjs';
esbuild.buildSync({ entryPoints: [path.join(__dirname, '../src/userscript/cat/catalogData.js')], bundle: true, format: 'cjs', platform: 'node', outfile: tmp, logLevel: 'silent' });
const CD = require(tmp);
const titleImgs = JSON.parse(fs.readFileSync(path.join(T, 'title_imgs.json'), 'utf8'));
const step1 = JSON.parse(fs.readFileSync(path.join(T, 'step1.json'), 'utf8'));
const idx = JSON.parse(fs.readFileSync(path.join(T, 'img_index.json'), 'utf8'));
const RAW = '/workspace/met/catalog/raw';

const ALIAS = {
  'The Barber of Seville': 'Il Barbiere di Siviglia',
  'Cavalleria Rusticana': 'Cavalleria Rusticana & Pagliacci',
  'Pagliacci': 'Cavalleria Rusticana & Pagliacci',
  'H\u00e4nsel und Gretel': 'Hansel and Gretel',
  'Messa da Requiem': "Verdi's Requiem",
  'Black Voices Rise, Volume II': 'Black Voices Rise: African American Artists at the Met, 1955-1985',
  'American Opera at the Met, Volume II': 'American Opera at the Met'
};
const slug = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const md5file = (u) => path.join(T, 'src', crypto.createHash('md5').update(u).digest('hex') + '.jpg');
function code(u) {
  let m = /cf-images\.us-east-1\.prod\.boltdns\.net\/v1\/static\/76009399001\/([0-9a-f-]+)\/([0-9a-f-]+)\//.exec(u);
  if (m) return 'B' + m[1] + '/' + m[2];
  m = /metopera\.org\/ondemand\/imagelinks\/(.+)$/.exec(u);
  if (m) return 'M' + m[1];
  return u;
}
function perfsOf(name) { try { return JSON.parse(fs.readFileSync(path.join(RAW, encodeURIComponent(name).replace(/'/g, '%27').replace(/[!()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase()) + '.json'), 'utf8')); } catch (e) { return []; } }
function meta(name) {
  const cur = CD.info(name), kind = CD.kindOf(name);
  const ps = perfsOf(name);
  const dates = ps.map((p) => (p.performanceDate || '').slice(0, 4)).filter(Boolean).sort();
  const audioOnly = ps.length && ps.every((p) => p.mediaType !== 'VIDEO');
  let comp = '';
  if (cur) comp = cur.composers.map(CD.composerName).join(' & ');
  else { for (const p of ps) for (const c of p.cast || []) if (c.role === 'COMPOSER' && c.person && !comp) comp = c.person.name; }
  const yr = cur && cur.year ? String(cur.year) : (dates.length ? (dates[0] === dates[dates.length - 1] ? dates[0] : dates[0] + '\u2013' + dates[dates.length - 1]) : '');
  return { name, kind, cur, comp, year: yr, era: cur ? cur.eras[0] : '', mood: cur ? cur.moods[0] : '', audioOnly, nPerf: ps.length,
    label: kind === 'opera' ? (audioOnly ? 'Opera \u00b7 Radio broadcast' : 'Opera') : kind === 'playlist' ? 'Singer playlist' : kind === 'film' ? 'Film' : kind === 'podcast' ? 'Podcast' : 'Gala \u00b7 Concert' };
}

const PAL = {
  baroque: ['#1f4441', '#0a1716', '#d9b86c'], classical: ['#283b63', '#0c1222', '#e3c27a'], belcanto: ['#62192f', '#1b0710', '#efc27c'],
  romantic: ['#541326', '#14060b', '#e8b65c'], wagner: ['#172b52', '#05080f', '#c9b27a'], verismo: ['#701d14', '#1c0705', '#f0b45a'],
  c20: ['#22343c', '#0a1013', '#d7b46e'], contemp: ['#30254a', '#0d0a14', '#e6b85e'], operetta: ['#6a4220', '#1d1108', '#f3cf86'],
  playlist: ['#14473a', '#06130f', '#e7c37a'], concert: ['#2c2416', '#0b0906', '#e3b65b'], film: ['#2a2a30', '#0b0b0e', '#e3b65b'], podcast: ['#5a1e3c', '#16070f', '#f0c070']
};
function motif(mood, accent) {
  const a = accent;
  const rnd = (seed) => { let x = seed; return () => (x = (x * 9301 + 49297) % 233280) / 233280; };
  const r = rnd(mood.length * 97 + 13);
  if (mood === 'comic') { let s = ''; for (let i = 0; i < 26; i++) { const x = 520 + r() * 420, y = 20 + r() * 500, z = 6 + r() * 16; s += `<rect x="${x}" y="${y}" width="${z}" height="${z}" transform="rotate(45 ${x} ${y})" fill="${a}" opacity="${0.15 + r() * 0.35}"/>`; } return s; }
  if (mood === 'epic') { let s = ''; for (let i = 0; i < 28; i++) { const ang = (-80 + i * 6) * Math.PI / 180; s += `<line x1="960" y1="560" x2="${960 + Math.cos(ang + Math.PI) * 900}" y2="${560 + Math.sin(ang + Math.PI) * 900}" stroke="${a}" stroke-width="2" opacity="0.18"/>`; } return s + `<circle cx="960" cy="560" r="150" fill="none" stroke="${a}" stroke-width="2" opacity="0.35"/>`; }
  if (mood === 'romance') return `<circle cx="700" cy="270" r="170" fill="none" stroke="${a}" stroke-width="3" opacity="0.4"/><circle cx="820" cy="270" r="170" fill="none" stroke="${a}" stroke-width="3" opacity="0.4"/><circle cx="760" cy="270" r="60" fill="${a}" opacity="0.08"/>`;
  if (mood === 'dark') { let s = `<circle cx="800" cy="170" r="90" fill="${a}" opacity="0.35"/><circle cx="835" cy="150" r="88" fill="#000" opacity="0.85"/>`; for (let i = 0; i < 7; i++) s += `<path d="M480 ${330 + i * 30} q 120 -26 240 0 t 240 0" fill="none" stroke="${a}" stroke-width="2" opacity="${0.08 + i * 0.03}"/>`; return s; }
  if (mood === 'mythic') { let s = '', pts = []; for (let i = 0; i < 14; i++) { const p = [560 + r() * 360, 60 + r() * 420]; pts.push(p); s += `<circle cx="${p[0]}" cy="${p[1]}" r="${2 + r() * 4}" fill="${a}" opacity="0.8"/>`; } for (let i = 0; i < pts.length - 1; i += 1) if (r() > 0.35) s += `<line x1="${pts[i][0]}" y1="${pts[i][1]}" x2="${pts[i + 1][0]}" y2="${pts[i + 1][1]}" stroke="${a}" stroke-width="1.5" opacity="0.3"/>`; return s; }
  if (mood === 'tragic') { let s = ''; for (let i = 0; i < 9; i++) { const x = 600 + i * 40; s += `<path d="M${x} -10 C ${x + 30} 180, ${x - 30} 360, ${x + 10} 560" fill="none" stroke="${a}" stroke-width="${i % 3 ? 2 : 4}" opacity="${0.12 + (i % 3) * 0.06}"/>`; } return s; }
  if (mood === 'vinyl') { let s = ''; for (let i = 0; i < 12; i++) s += `<circle cx="790" cy="270" r="${60 + i * 16}" fill="none" stroke="${a}" stroke-width="${i % 4 ? 1 : 2}" opacity="${0.12 + (i % 4 === 0 ? 0.15 : 0)}"/>`; return s + `<circle cx="790" cy="270" r="44" fill="${a}" opacity="0.5"/><circle cx="790" cy="270" r="6" fill="#000"/>`; }
  // deco (concerts, films, default)
  let s = ''; for (let i = 0; i < 6; i++) s += `<path d="M ${560 + i * 30} 560 A ${400 - i * 30} ${400 - i * 30} 0 0 1 ${960} ${160 + i * 30}" fill="none" stroke="${a}" stroke-width="2" opacity="${0.12 + i * 0.05}"/>`; return s;
}
function titleSize(name) { const n = name.length; return n <= 10 ? 92 : n <= 16 ? 80 : n <= 24 ? 66 : n <= 34 ? 56 : n <= 48 ? 46 : 40; }
function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function html(m, photo) {
  const key = m.kind === 'opera' ? (m.era || 'romantic') : m.kind;
  const [c1, c2, acc] = PAL[key] || PAL.concert;
  const mood = m.kind === 'playlist' ? 'vinyl' : m.kind === 'opera' ? (m.mood || 'tragic') : 'deco';
  const fs = titleSize(m.name);
  const bg = photo
    ? `<div style="position:absolute;inset:-40px;background:url(${photo}) center/cover;filter:blur(28px) brightness(.45) saturate(1.1)"></div>
       <div style="position:absolute;inset:0;background:linear-gradient(90deg,rgba(0,0,0,.82) 0%,rgba(0,0,0,.55) 48%,rgba(0,0,0,.1) 100%)"></div>
       <img src="${photo}" style="position:absolute;right:56px;top:50px;width:440px;height:440px;object-fit:cover;border-radius:10px;box-shadow:0 20px 60px rgba(0,0,0,.7),0 0 0 1px rgba(255,255,255,.08)">`
    : `<div style="position:absolute;inset:0;background:radial-gradient(ellipse at 15% 10%, ${c1} 0%, ${c2} 70%)"></div>
       <svg width="960" height="540" style="position:absolute;left:0;top:0">${motif(mood, acc)}</svg>
       <div style="position:absolute;inset:0;background:linear-gradient(90deg,rgba(0,0,0,.35),rgba(0,0,0,0) 60%)"></div>`;
  const textW = photo ? 400 : 560;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    html,body{margin:0;width:960px;height:540px;overflow:hidden;background:#000}
    .t{position:absolute;left:64px;top:0;bottom:0;width:${textW}px;display:flex;flex-direction:column;justify-content:center}
    .lab{font:600 19px Montserrat;letter-spacing:.28em;text-transform:uppercase;color:${acc};margin-bottom:22px}
    .name{font:400 ${photo ? Math.min(fs, 60) : fs}px/1.04 'Playfair Display';color:#fff;letter-spacing:-.005em;text-wrap:balance}
    .rule{width:72px;height:2px;background:${acc};margin:26px 0 18px}
    .comp{font:500 24px Montserrat;letter-spacing:.16em;text-transform:uppercase;color:#efe9e1}
    .yr{font:italic 400 28px 'Cormorant Garamond';color:${acc};margin-top:8px}
    .brand{position:absolute;right:30px;bottom:22px;font:600 13px Montserrat;letter-spacing:.3em;color:rgba(255,255,255,.38)}
  </style></head><body>${bg}
  <div class="t"><div class="lab">${esc(m.label)}</div><div class="name">${esc(m.name)}</div><div class="rule"></div>
  ${m.comp ? `<div class="comp">${esc(m.comp)}</div>` : ''}${m.year ? `<div class="yr">${esc(m.year)}</div>` : ''}</div>
  ${photo ? '' : '<div class="brand">MET OPERA ON DEMAND</div>'}</body></html>`;
}

function cardTop(f) {
  const r = require('child_process').execFileSync('python3', ['-c', "import sys\nfrom PIL import Image,ImageStat\nim=Image.open(sys.argv[1]).convert('RGB');w,h=im.size\nprint(min(ImageStat.Stat(im.crop((int(w*.05),int(h*.03),int(w*.95),int(h*.22)))).mean))", f]).toString();
  return +r > 225;
}
(async () => {
  const need = Object.keys(titleImgs).filter((n) => ['card', 'square'].includes(titleImgs[n].cls)).sort();
  const manifest = {};
  const jobs = [];
  for (const n of need) {
    if (step1[n]) { manifest[n] = { how: 'slide', code: code(step1[n].url), note: 'performance slide image' }; continue; }
    const a = ALIAS[n];
    if (a && titleImgs[a] && /^wide/.test(titleImgs[a].cls)) { manifest[n] = { how: 'alias', code: code(titleImgs[a].best.url), note: 'image from "' + a + '"' }; continue; }
    const m = meta(n);
    const best = titleImgs[n].best;
    let photo = null;
    if (titleImgs[n].cls === 'square' && best) {
      const f = md5file(best.url);
      // Square Met "programme card" art (white masthead band) is not a photo: design a poster instead.
      if (fs.existsSync(f) && !cardTop(f)) photo = 'data:image/jpeg;base64,' + fs.readFileSync(f).toString('base64');
    }
    const s = slug(n);
    manifest[n] = { how: photo ? 'composed' : 'designed', code: 'T' + s, file: s + '.jpg', era: m.era, mood: m.mood, kind: m.kind };
    jobs.push({ n, s, m, photo });
  }
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--font-render-hinting=none'] });
  const p = await b.newPage();
  await p.setViewport({ width: 960, height: 540, deviceScaleFactor: 1 });
  for (const j of jobs) {
    await p.setContent(html(j.m, j.photo), { waitUntil: 'load' });
    await p.evaluate(() => document.fonts.ready);
    await p.screenshot({ path: path.join(OUT, j.s + '.jpg'), type: 'jpeg', quality: 84 });
  }
  await b.close();
  fs.writeFileSync(path.join(T, 'manifest.json'), JSON.stringify(manifest, null, 1));
  const c = {}; Object.values(manifest).forEach((v) => { c[v.how] = (c[v.how] || 0) + 1; });
  console.log('titles needing thumbnails:', need.length, c);
  let bytes = 0; for (const j of jobs) bytes += fs.statSync(path.join(OUT, j.s + '.jpg')).size;
  console.log('rendered', jobs.length, 'files,', Math.round(bytes / 1024), 'KB total');
})().catch((e) => { console.error(e); process.exit(1); });
