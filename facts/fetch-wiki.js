// Caches English Wikipedia plain-text extracts (with section headings) for the fact sources.
const fs = require('fs');
const PAGES = process.argv.slice(2);
const UA = 'MetTV-personal-app/1.4.0 (fact sourcing; low rate)';
(async () => {
  for (const t of PAGES) {
    const f = 'sources/wiki-' + t.replace(/[^A-Za-z0-9]+/g, '_') + '.txt';
    if (fs.existsSync(f)) continue;
    const u = 'https://en.wikipedia.org/w/api.php?action=query&prop=extracts|info&inprop=url&explaintext=1&exsectionformat=wiki&redirects=1&format=json&titles=' + encodeURIComponent(t);
    const j = await (await fetch(u, { headers: { 'User-Agent': UA } })).json();
    const pg = Object.values(j.query.pages)[0];
    if (!pg.extract) { console.log('MISSING', t); continue; }
    fs.writeFileSync(f, 'URL: ' + pg.fullurl + '\nTITLE: ' + pg.title + '\n\n' + pg.extract);
    console.log(t, '->', pg.title, pg.extract.length);
    await new Promise((r) => setTimeout(r, 4000));
  }
})();
