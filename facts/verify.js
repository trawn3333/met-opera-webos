// Every fact must carry `evidence`: a verbatim excerpt that is checked against the cached source text
// (sources/<file>). Facts whose evidence is not found, or that lack a sourceUrl, are rejected.
const fs = require('fs'), path = require('path');
const norm = (s) => String(s).normalize('NFC').replace(/[\u2018\u2019\u02bc]/g, "'").replace(/[\u201c\u201d]/g, '"').replace(/[\u2013\u2014]/g, '-').replace(/\s+/g, ' ').trim().toLowerCase();
const srcCache = {};
function src(file) { if (!srcCache[file]) srcCache[file] = norm(fs.readFileSync(path.join(__dirname, 'sources', file), 'utf8')); return srcCache[file]; }
function urlOf(file) { return (/^URL: (\S+)/.exec(fs.readFileSync(path.join(__dirname, 'sources', file), 'utf8')) || [])[1]; }
const TYPES = ['composer', 'artist', 'premiere', 'critic', 'history', 'staging', 'blooper', 'music'];
function verifyTitle(file) {
  const t = JSON.parse(fs.readFileSync(file, 'utf8'));
  const ok = [], bad = [];
  const ids = new Set();
  for (const f of t.facts) {
    const why = [];
    if (!f.id || ids.has(f.id)) why.push('id'); ids.add(f.id);
    if (TYPES.indexOf(f.type) < 0) why.push('type');
    if (!f.text || f.text.length > 260) why.push('text length');
    if (!f.source || !fs.existsSync(path.join(__dirname, 'sources', f.source))) why.push('source file');
    else {
      const u = urlOf(f.source); if (!u) why.push('sourceUrl'); else f.sourceUrl = u + (f.anchor ? '#' + f.anchor : '');
      const ev = [].concat(f.evidence || []);
      if (!ev.length) why.push('no evidence');
      for (const e of ev) if (src(f.source).indexOf(norm(e)) < 0) why.push('evidence not in source: "' + e.slice(0, 60) + '"');
    }
    if (f.sceneMatch) try { new RegExp(f.sceneMatch, 'i'); } catch (e) { why.push('regex'); }
    (why.length ? bad : ok).push(why.length ? { id: f.id, why } : f);
  }
  return { title: t.title, match: t.match, ok, bad };
}
module.exports = { verifyTitle };
if (require.main === module) {
  let n = 0, nb = 0;
  for (const f of fs.readdirSync(path.join(__dirname, 'titles')).filter((x) => /\.json$/.test(x))) {
    const r = verifyTitle(path.join(__dirname, 'titles', f));
    n += r.ok.length; nb += r.bad.length;
    console.log(r.title.padEnd(28), 'ok', String(r.ok.length).padStart(3), ' rejected', r.bad.length);
    for (const b of r.bad) console.log('   REJECT', b.id, b.why.join('; '));
  }
  console.log('total ok', n, 'rejected', nb);
}
