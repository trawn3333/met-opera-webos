// "A few general facts" for the catalog titles without a curated set: up to 2 verbatim sentences from the lead of the
// title's English Wikipedia article (premiere + origin/libretto). Text = the source sentence itself (no rewriting),
// so the verify step (evidence must appear verbatim) holds by construction. A page is used only if its lead names the
// composer (surname) from our catalog and calls the work an opera/operetta/oratorio etc.; otherwise the title is skipped.
// Polite: intro extracts only, cached in sources/, >= 3 s between Wikipedia requests.
// Usage: node facts/general.js   (then node facts/build.js)
const fs = require('fs'), path = require('path');
const UA = 'MetTV-personal-app/1.4.0 (fact sourcing; low rate)';
const SRC = path.join(__dirname, 'sources'), OUT = path.join(__dirname, 'titles');
const fold = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const slugOf = (s) => fold(s).replace(/ /g, '-').slice(0, 60);
const curated = new Set();
for (const f of fs.readdirSync(OUT)) { if (/^gen-/.test(f)) continue; const d = JSON.parse(fs.readFileSync(path.join(OUT, f), 'utf8')); d.match.forEach((m) => curated.add(fold(m))); }
const rows = fs.readFileSync(path.join(__dirname, '../catalog/operas.txt'), 'utf8').trim().split('\n').map((l) => l.split(' | '));
const SKIP = /gala|concert|celebration|christmas|hymn|recital|requiem|anniversary|highlights|tribute|farewell|evening|in concert|bernstein|centennial|opening night/i;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function intro(title) {
  const f = path.join(SRC, 'wikiintro-' + title.replace(/[^A-Za-z0-9]+/g, '_') + '.txt');
  if (fs.existsSync(f)) return fs.readFileSync(f, 'utf8');
  const u = 'https://en.wikipedia.org/w/api.php?action=query&prop=extracts|info|pageprops&inprop=url&exintro=1&explaintext=1&redirects=1&format=json&titles=' + encodeURIComponent(title);
  for (let a = 0; a < 3; a++) {
    try {
      const r = await fetch(u, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(30000) });
      if (r.status === 429) { await sleep(20000); continue; }
      const j = await r.json();
      const pg = Object.values(j.query.pages)[0];
      const txt = pg && pg.extract && !(pg.pageprops && 'disambiguation' in pg.pageprops) ? 'URL: ' + pg.fullurl + '\nTITLE: ' + pg.title + '\n\n' + pg.extract : '';
      fs.writeFileSync(f, txt);
      await sleep(3000);
      return txt;
    } catch (e) { await sleep(10000); }
  }
  return '';
}
const sentences = (t) => t.replace(/\n+/g, ' ').split(/(?<=[.!?])\s+(?=[A-Z"\u201c])/).map((s) => s.trim());
(async () => {
  let made = 0, skipped = [];
  for (const [title, composer] of rows) {
    if (!composer || composer === '-' || SKIP.test(title) || curated.has(fold(title))) continue;
    const surname = fold(composer.split(/\s*[,&+]\s*|\s+and\s+/)[0]).split(' ').pop();
    let txt = '', file = '';
    for (const cand of [title + ' (opera)', title]) {
      const t = await intro(cand);
      if (t && fold(t).indexOf(surname) >= 0 && /\b(opera|operetta|opéra|oratorio|zarzuela|singspiel|music drama|musical)\b/i.test(t.slice(0, 1500))) { txt = t; file = 'wikiintro-' + cand.replace(/[^A-Za-z0-9]+/g, '_') + '.txt'; break; }
    }
    if (!txt) { skipped.push(title); continue; }
    const body = txt.split('\n\n').slice(1).join('\n\n');
    const ss = sentences(body).filter((s) => s.length >= 50 && s.length <= 240 && !/\[|\{|displaystyle|pronounced|\(listen\)/.test(s));
    const facts = [];
    const prem = ss.find((s) => /(premiere|premièred|first performed|first performance|first staged)/i.test(s) && /1[5-9]\d\d|20\d\d/.test(s));
    if (prem) facts.push({ type: 'premiere', s: prem });
    const orig = ss.find((s) => s !== prem && /(libretto|based on|adapted from|inspired by)/i.test(s));
    if (orig) facts.push({ type: 'history', s: orig });
    if (!facts.length) { skipped.push(title + ' (no usable sentence)'); continue; }
    const slug = 'gen-' + slugOf(title);
    const doc = { title, match: [title], general: true, facts: facts.map((x, i) => ({ id: slug + '-' + (i + 1), type: x.type, sceneMatch: null, scope: 'all', text: x.s,
      attribution: 'Wikipedia, \u201c' + txt.split('\n')[1].replace(/^TITLE: /, '') + '\u201d', source: file, anchor: null, evidence: x.s })) };
    fs.writeFileSync(path.join(OUT, slug + '.json'), JSON.stringify(doc, null, 1));
    made++;
  }
  console.log('general titles', made, 'skipped', skipped.length);
  fs.writeFileSync(path.join(__dirname, 'general-skipped.txt'), skipped.join('\n') + '\n');
})();
