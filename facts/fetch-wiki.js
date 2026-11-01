// Caches English Wikipedia plain-text extracts (with section headings) for the fact sources.
const fs = require('fs');
const PAGES = process.argv.slice(2);
const UA = 'MetTV-personal-app/1.4.0 (fact sourcing; low rate)';
(async () => {
  for (const t of PAGES) {
    const f = 'sources/wiki-' + t.replace(/[^A-Za-z0-9]+/g, '_') + '.txt';
    if (fs.existsSync(f)) continue;
    const u = 'https://en.wikipedia.org/w/api.php?action=query&prop=extracts|info&inprop=url&explaintext=1&exsectionformat=wiki&redirects=1&format=json&titles=' + encodeURIComponent(t);
    let j = null;
    for (let a = 0; a < 4 && !j; a++) {   // the API rate-limits bursts with a plain-text reply: back off and retry
      const r = await fetch(u, { headers: { 'User-Agent': UA } }); const tx = await r.text();
      try { j = JSON.parse(tx); } catch (e) { console.log('rate-limited, retry', a + 1); await new Promise((r2) => setTimeout(r2, 15000 * (a + 1))); }
    }
    if (!j) { console.log('FAILED', t); continue; }
    const pg = Object.values(j.query.pages)[0];
    if (!pg.extract) { console.log('MISSING', t); continue; }
    const canon = 'sources/wiki-' + pg.title.replace(/[^A-Za-z0-9]+/g, '_') + '.txt';
    if (canon !== f && fs.existsSync(canon)) { console.log('REDIRECT', t, '->', pg.title, '(already cached, skipped)'); continue; }
    fs.writeFileSync(f, 'URL: ' + pg.fullurl + '\nTITLE: ' + pg.title + '\n\n' + pg.extract);
    console.log(t, '->', pg.title, pg.extract.length);
    await new Promise((r) => setTimeout(r, +(process.env.WIKI_DELAY_MS || 4000)));
  }
})();
