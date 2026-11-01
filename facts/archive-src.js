// Turns a cached Met Opera Archives record (from the credits crawl cache, or one polite fetch) into a text source file.
const fs = require('fs'), crypto = require('crypto');
const dockeys = process.argv.slice(2);
(async () => {
  for (const k of dockeys) {
    const out = 'sources/met-archive-' + k + '.txt';
    if (fs.existsSync(out)) continue;
    const url = 'record.jsp?dockey=' + k;
    const cf = '/workspace/met/archive/cache/rec-' + crypto.createHash('sha1').update(url + '|').digest('hex') + '.html';
    let html;
    if (fs.existsSync(cf)) html = fs.readFileSync(cf, 'utf8');
    else { await new Promise((r) => setTimeout(r, 2000)); html = await (await fetch('https://archives.metopera.org/MetOperaSearch/' + url, { headers: { 'User-Agent': 'MetTV-personal-app/1.4.0 (fact sourcing; reference lookup)' } })).text(); }
    const txt = html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<br\s*\/?>|<\/p>|<\/dd>|<\/dl>/gi, '\n').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'").replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n');
    fs.writeFileSync(out, 'URL: https://archives.metopera.org/MetOperaSearch/' + url + '\n\n' + txt);
    console.log(k, txt.length);
  }
})();
