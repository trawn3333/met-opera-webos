// 1.3.3: production credits (production / designers / lighting / choreography + the production's Met premiere),
// precomputed from the Met Opera Archives (archives.metopera.org) by tools/archive-crawl.js + tools/build-credits.js.
// Only what the archive lists; nothing when a performance could not be matched.
import { PRODS, PERF } from './creditsData';

var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function dateStr(d) { var p = String(d || '').split('-'); return p.length === 3 ? MON[+p[1] - 1] + ' ' + (+p[2]) + ', ' + p[0] : ''; }

// {premiere:'YYYY-MM-DD', premiereText, credits:[[role,name]], cid} or null
export function productionFor(perfId) {
  if (!perfId) return null;
  var i = PERF[String(perfId).replace(/-/g, '').slice(0, 10)];
  if (i === undefined) return null;
  var p = PRODS[i];
  return p ? { premiere: p[0], premiereText: dateStr(p[0]), credits: p[1], cid: p[2] } : null;
}
// Menu/sheet items for a production (empty array when none).
export function productionItems(prod) {
  if (!prod || !prod.credits || !prod.credits.length) return [];
  var items = [];
  for (var i = 0; i < prod.credits.length; i++) items.push({ head: i ? '' : 'Production', label: prod.credits[i][0], sub: prod.credits[i][1], prod: true });
  var hasCostume = false;
  for (var j = 0; j < prod.credits.length; j++) if (/costume|^designer$/i.test(prod.credits[j][0])) hasCostume = true;
  items.push({ label: 'Production premiere at the Met', sub: prod.premiereText, prod: true,
    note: 'As listed in the Met Opera Archives' + (hasCostume ? '' : ' (no separate set or costume designer listed for this production)') + '.' });
  return items;
}
export function productionLine(prod) {
  if (!prod || !prod.credits || !prod.credits.length) return '';
  return prod.credits.map(function (c) { return c[0] + ': ' + c[1]; }).join(' \u00b7 ');
}
