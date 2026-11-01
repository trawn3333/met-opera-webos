// Verifies the snark sample: every bubble's evidence is verbatim in its cached source (same rules as ../verify.js),
// `plain` equals the original fact text, and prints length stats (target <= ~20 words / 2 short TV lines).
const fs = require('fs'), path = require('path');
const { verifyTitle } = require('../verify.js');
let bad = 0;
for (const slug of ['idomeneo', 'tosca']) {
  const f = path.join(__dirname, slug + '.json');
  const r = verifyTitle(f);
  const doc = JSON.parse(fs.readFileSync(f, 'utf8'));
  const orig = JSON.parse(fs.readFileSync(path.join(__dirname, '../titles', slug + '.json'), 'utf8'));
  const om = {}; orig.facts.forEach((x) => { om[x.id] = x.text; });
  const plainBad = doc.facts.filter((x) => !x.new && x.plain !== om[x.id]).map((x) => x.id);
  const words = doc.facts.map((x) => x.text.split(/\s+/).length), chars = doc.facts.map((x) => x.text.length);
  const over = doc.facts.filter((x) => x.text.split(/\s+/).length > 20).map((x) => x.id + ':' + x.text.split(/\s+/).length);
  console.log(slug.padEnd(9), 'bubbles', doc.facts.length, ' verified', r.ok.length, ' rejected', r.bad.length,
    ' new', doc.facts.filter((x) => x.new).length, ' plain-mismatch', plainBad.length,
    ' words avg', (words.reduce((a, b) => a + b, 0) / words.length).toFixed(1), 'max', Math.max(...words),
    ' chars avg', Math.round(chars.reduce((a, b) => a + b, 0) / chars.length), 'max', Math.max(...chars));
  if (over.length) console.log('   >20 words:', over.join(', '));
  r.bad.forEach((b) => console.log('   REJECT', b.id, b.why.join('; ')));
  bad += r.bad.length + plainBad.length;
}
process.exit(bad ? 1 : 0);
