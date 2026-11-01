// Verifies idomeneo-candidates.json: every evidence string is verbatim in its cached source (../sources),
// every scene is a real Met scene-marker title of the 2017-03-25 HD (idomeneo-2017-scenes.json), texts are <= 20 words.
const fs = require('fs'), path = require('path');
const norm = (s) => String(s).normalize('NFC').replace(/[\u2018\u2019\u02bc]/g, "'").replace(/[\u201c\u201d]/g, '"').replace(/[\u2013\u2014]/g, '-').replace(/\s+/g, ' ').trim().toLowerCase();
const doc = JSON.parse(fs.readFileSync(path.join(__dirname, 'idomeneo-candidates.json'), 'utf8'));
const scenes = JSON.parse(fs.readFileSync(path.join(__dirname, 'idomeneo-2017-scenes.json'), 'utf8')).scenes.map((s) => s.title);
let bad = 0;
for (const c of doc.candidates) {
  const why = [];
  const words = c.text.split(/\s+/).length;
  if (words > 20) why.push(words + ' words');
  if (c.scene !== 'general' && scenes.indexOf(c.scene) < 0) why.push('scene not in Met markers');
  for (const s of c.sources) {
    const txt = norm(fs.readFileSync(path.join(__dirname, '../sources', s.file), 'utf8'));
    const head = /^URL: (\S+)/.exec(fs.readFileSync(path.join(__dirname, '../sources', s.file), 'utf8'))[1];
    if (s.url.split('#')[0] !== head) why.push('url mismatch ' + s.file);
    for (const e of s.evidence) if (txt.indexOf(norm(e)) < 0) why.push('evidence missing in ' + s.file + ': ' + e.slice(0, 50));
  }
  if (why.length) bad++;
  console.log(String(c.n).padStart(2), (why.length ? 'FAIL ' + why.join('; ') : 'ok  ') , words + 'w', c.text.length + 'c');
}
console.log(doc.candidates.length, 'candidates,', bad, 'failing');
process.exit(bad ? 1 : 0);
