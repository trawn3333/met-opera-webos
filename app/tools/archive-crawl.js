// Production credits from the Met Opera Archives (archives.metopera.org, "MetOpera Database").
// Polite: sequential, >= 1.6 s between network requests, every response cached on disk (re-runs hit the cache),
// honest User-Agent. robots.txt: "Allow: /" for *, Content-Signal use=reference (this is a reference lookup).
// Step A: each on-demand performance -> archive record by title + exact date.
// Step B: each archive title -> its "New Production" premieres; a performance belongs to the latest new production
//         premiered on or before its date; that premiere record carries the production credits.
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const BASE = 'https://archives.metopera.org/MetOperaSearch/';
const CACHE = '/workspace/met/archive/cache';
const UA = 'MetTV-personal-app/1.3.3 (personal TV app; one-off reference lookup of production credits; ~1 request per 2 s)';
const GAP = 1600;
let last = 0, netCount = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function get(kind, url, body) {
  const key = crypto.createHash('sha1').update(url + '|' + (body || '')).digest('hex');
  const f = path.join(CACHE, kind + '-' + key + '.html');
  if (fs.existsSync(f)) return fs.readFileSync(f, 'utf8');
  for (let attempt = 0; attempt < 4; attempt++) {
    const wait = last + GAP - Date.now(); if (wait > 0) await sleep(wait);
    last = Date.now(); netCount++;
    try {
      const r = await fetch(BASE + url, { method: body ? 'POST' : 'GET', headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' }, body: body || undefined, signal: AbortSignal.timeout(45000) });
      const t = await r.text();
      if (r.status === 200 && /Metropolitan Opera Archives/.test(t)) { fs.writeFileSync(f, t); return t; }
      console.log('  http', r.status, 'backing off'); await sleep(15000 * (attempt + 1));
    } catch (e) { console.log('  net error', e.message); await sleep(15000 * (attempt + 1)); }
  }
  throw new Error('failed ' + url);
}
const ent = (s) => s.replace(/&amp;/g, '&').replace(/&apos;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
function hits(html) {
  const out = [];
  const re = /\[(Met [^\]]+)\] CID : (\d+)<br>([\s\S]*?)<\/div>/g; let m;
  while ((m = re.exec(html))) {
    const blk = m[3];
    const notes = ent((blk.split('<b>')[0] || ''));
    const titles = []; const ra = /dockey=(\d+)">([^<]*)/g; let a, dockey = null;
    while ((a = ra.exec(blk))) { if (!dockey) dockey = a[1]; titles.push(ent(a[2]).replace(/\s*\(\d+\)\s*$/, '')); }
    const tail = ent(blk.slice(blk.lastIndexOf('</b>') + 4));
    const dm = /([A-Z][a-z]+), ([A-Z][a-z]+) (\d+), (\d{4})/.exec(tail);
    const venue = tail.split(';')[0].trim();
    out.push({ type: m[1], cid: m[2], notes, dockey, titles, venue, date: dm ? new Date(dm[2] + ' ' + dm[3] + ', ' + dm[4] + ' UTC').toISOString().slice(0, 10) : '' });
  }
  return out;
}
const PROD_ROLE = /production|design|choreograph|director|movement|projection|video|puppet|scenery|costume|lighting|sets?$/i;
function credits(html) {
  const out = []; const re = /<dt><span>([^<]*)<\/span><\/dt>\s*<dd>([\s\S]*?)<\/dd>/g; let m;
  while ((m = re.exec(html))) {
    const role = ent(m[1]); if (!PROD_ROLE.test(role) || /^(Conductor|Music Director)$/i.test(role)) continue;
    const names = []; const ra = /<a[^>]*>([^<]*)<\/a>/g; let a; while ((a = ra.exec(m[2]))) names.push(ent(a[1]));
    if (!names.length) { const n = ent(m[2]); if (n) names.push(n); }
    out.push([role, names.join(', ')]);
  }
  return out;
}
const fold = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();
const STOP = new Set(['the', 'a', 'an', 'la', 'le', 'il', 'l', 'die', 'der', 'das', 'les', 'lo', 'i', 'gli', 'de', 'di', 'of', 'and', 'et', 'und']);
const words = (s) => fold(s).split(' ').filter((w) => w && !STOP.has(w));
// on-demand title -> archive title (English vs original names, spellings)
const ALIAS = { 'hansel and gretel': ['hansel and gretel', 'hansel und gretel'], 'the magic flute': ['the magic flute', 'die zauberflote'], 'cinderella': ['cendrillon', 'cinderella', 'la cenerentola'],
  'the barber of seville': ['the barber of seville', 'il barbiere di siviglia'], 'the merry widow': ['the merry widow', 'die lustige witwe'], 'the tales of hoffmann': ['les contes d hoffmann'] };
function titleMatch(od, arch) {
  const a = fold(od), b = fold(arch);
  if (a === b) return true;
  if ((ALIAS[a] || []).indexOf(b) >= 0) return true;
  const wa = words(od), wb = words(arch);
  if (!wa.length || !wb.length) return false;
  const common = wa.filter((w) => wb.indexOf(w) >= 0).length;
  return common / Math.max(wa.length, wb.length) >= 0.6;
}
module.exports = { hits, credits, titleMatch, fold };

async function main() {
  const RAW = '/workspace/met/catalog/raw';
  const perfs = []; const seen = new Set();
  for (const f of fs.readdirSync(RAW)) for (const p of JSON.parse(fs.readFileSync(path.join(RAW, f), 'utf8'))) {
    if (seen.has(p.id)) continue; seen.add(p.id);
    perfs.push({ id: p.id, name: p.name, opera: p.opera || p.name, d: String(p.performanceDate || '').slice(0, 10), media: p.mediaType, res: p.resolutionType, roles: (p.cast || []).filter((c) => c.role === 'ARTIST' && c.roleName).length });
  }
  perfs.sort((a, b) => a.d < b.d ? -1 : 1);
  const LIMIT = +(process.env.LIMIT || 1e9), ONLY = process.env.ONLY ? new RegExp(process.env.ONLY, 'i') : null;
  const res = []; let i = 0;
  for (const p of perfs) {
    if (ONLY && !ONLY.test(p.opera)) continue;
    if (i++ >= LIMIT) break;
    if (!p.d) { res.push({ ...p, status: 'no-date' }); continue; }
    const ymd = p.d.replace(/-/g, '');
    let h = hits(await get('date', 'search.jsp', 'name=&sort=PDATE&titles=&terms=&important_note=&date_start=' + ymd + '&date_end=' + ymd));
    const mp = h.filter((x) => /Met Performance|Met Tour/.test(x.type));
    let hit = mp.find((x) => x.titles.some((t) => titleMatch(p.opera, t))) || mp.find((x) => x.titles.some((t) => titleMatch(p.name, t)));
    const r = { ...p, day: h.map((x) => x.type + ': ' + x.titles.join(' / ') + ' @ ' + x.venue) };
    if (!hit) { r.status = h.length ? 'no-title-match' : 'no-archive-event'; res.push(r); if (i % 25 === 0) console.log(i, 'net', netCount); continue; }
    r.status = 'matched'; r.dockey = hit.dockey; r.cid = hit.cid; r.archTitle = hit.titles.find((t) => titleMatch(p.opera, t) || titleMatch(p.name, t)); r.venue = hit.venue; r.type = hit.type;
    res.push(r);
    if (i % 25 === 0) console.log(i, 'net', netCount);
  }
  // Step B: productions per archive title
  const titles = [...new Set(res.filter((r) => r.status === 'matched').map((r) => r.archTitle))];
  const prods = {};
  for (const t of titles) {
    const h = hits(await get('np', 'search.jsp', 'name=&sort=PDATE&titles=' + encodeURIComponent(t) + '&terms=&important_note=' + encodeURIComponent('new production') + '&date_start=&date_end='));
    prods[t] = h.filter((x) => x.type === 'Met Performance' && /New Production/i.test(x.notes) && x.titles.some((y) => fold(y) === fold(t))).map((x) => ({ date: x.date, dockey: x.dockey, cid: x.cid, notes: x.notes, venue: x.venue }));
  }
  for (const r of res) {
    if (r.status !== 'matched') continue;
    const list = (prods[r.archTitle] || []).filter((x) => x.date && x.date <= r.d).sort((a, b) => a.date < b.date ? 1 : -1);
    if (!list.length) { r.prodStatus = 'no-new-production-on-record'; continue; }
    const np = list[0];
    const rec = await get('rec', 'record.jsp?dockey=' + np.dockey);
    r.prod = { premiere: np.date, dockey: np.dockey, cid: np.cid, credits: credits(rec) };
    r.prodStatus = r.prod.credits.length ? 'credits' : 'premiere-without-credits';
  }
  fs.writeFileSync('/workspace/met/archive/matches.json', JSON.stringify({ at: new Date().toISOString(), net: netCount, res, prods }, null, 1));
  console.log('done; network requests', netCount);
}
if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
