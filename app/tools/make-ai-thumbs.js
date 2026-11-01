// 1.3.1: approved AI stage artwork (thumbs/ai/<slug>.jpg, made with the GenerateImage tool, no text, no real people)
// for the operas that only had a designed typographic poster. Adds our title/composer overlay so they match the
// app's cards, renders 960x540 JPEG within the per-image budget, and updates manifest.json
// (how:'ai', code 'T<slug>-ai' -> a NEW url, so TVs never show a cached old poster).
const fs = require('fs'), path = require('path');
const puppeteer = require('puppeteer-core');
const { html, meta, slug, OUT, T } = require('./make-thumbs');
const BUDGET = 72 * 1024;   // = the existing photo-card budget (1.3.0 composed cards max 73 KB)
(async () => {
  const man = JSON.parse(fs.readFileSync(path.join(T, 'manifest.json'), 'utf8'));
  const jobs = [];
  for (const [n, v] of Object.entries(man)) {
    const s = slug(n);
    const art = path.join(T, 'ai', s + '.jpg');
    if (!fs.existsSync(art)) continue;
    if (v.kind !== 'opera') continue;
    jobs.push({ n, s, art });
  }
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--font-render-hinting=none'] });
  const p = await b.newPage();
  await p.setViewport({ width: 960, height: 540, deviceScaleFactor: 1 });
  let total = 0; const out = [];
  for (const j of jobs) {
    const data = 'data:image/jpeg;base64,' + fs.readFileSync(j.art).toString('base64');
    await p.setContent(html(meta(j.n), null, data), { waitUntil: 'load' });
    await p.evaluate(() => document.fonts.ready);
    const file = j.s + '-ai.jpg';
    let q = 82, buf;
    do { buf = await p.screenshot({ type: 'jpeg', quality: q }); q -= 6; } while (buf.length > BUDGET && q > 50);
    fs.writeFileSync(path.join(OUT, file), buf);
    total += buf.length;
    const prev = man[j.n];
    man[j.n] = { how: 'ai', code: 'T' + j.s + '-ai', file, era: prev.era, mood: prev.mood, kind: prev.kind, fallback: prev.how === 'designed' ? prev.file : prev.fallback };
    out.push(j.n + ' ' + Math.round(buf.length / 1024) + 'KB q' + (q + 6));
  }
  await b.close();
  fs.writeFileSync(path.join(T, 'manifest.json'), JSON.stringify(man, null, 1));
  console.log(out.join('\n'));
  const c = {}; Object.values(man).forEach((v) => { c[v.how] = (c[v.how] || 0) + 1; });
  console.log('ai rendered', jobs.length, 'total', Math.round(total / 1024), 'KB; manifest', c);
})().catch((e) => { console.error(e); process.exit(1); });
