// 1.3.2 "Who's singing": cast + roles from the Met's own performance data, made scene-aware with the
// Met's cue points (each scene marker carries "artists=..." = who sings in that number).
// Nothing is invented: roles come only from cast[].roleName; a singer named in a scene but not in the
// cast list is shown by name with "role not listed by the Met".
// Voice types are NOT in the Met's data: they come from the small curated table below (shown only when known).
// Trouser roles: curated list of well-known roles; flagged only when the singer's (curated) voice is a
// female voice, or - for roles virtually always sung by women - when the singer is not known to be male.

// Curated voice types (lower-case folded name -> voice). Singers of the curated trouser roles in the
// Met archive + the Idomeneo casts + a few principals. Extend only with well-documented facts.
var VOICE = {
  'alice coote': 'mezzo-soprano', 'anne sofie von otter': 'mezzo-soprano', 'frederica von stade': 'mezzo-soprano', 'kate lindsey': 'mezzo-soprano',
  'magdalena kozena': 'mezzo-soprano', 'susanne mentzer': 'mezzo-soprano', 'tatiana troyanos': 'mezzo-soprano', 'joyce didonato': 'mezzo-soprano',
  'isabel leonard': 'mezzo-soprano', 'emily d angelo': 'mezzo-soprano', 'christa ludwig': 'mezzo-soprano', 'elina garanca': 'mezzo-soprano',
  'lisa della casa': 'soprano', 'rise stevens': 'mezzo-soprano', 'samantha hankey': 'mezzo-soprano', 'susan graham': 'mezzo-soprano',
  'jennifer larmore': 'mezzo-soprano', 'janai brugger': 'soprano', 'jennifer johnson cano': 'mezzo-soprano', 'angelika kirchschlager': 'mezzo-soprano',
  'tara erraught': 'mezzo-soprano', 'dawn upshaw': 'soprano', 'ann murray': 'mezzo-soprano', 'sarah connolly': 'mezzo-soprano',
  'karine deshayes': 'mezzo-soprano', 'jane bunnell': 'mezzo-soprano', 'marianne crebassa': 'mezzo-soprano', 'mildred miller': 'mezzo-soprano',
  'sasha cooke': 'mezzo-soprano', 'serena malfi': 'mezzo-soprano', 'teresa stratas': 'soprano', 'jamie barton': 'mezzo-soprano',
  'kerstin thorborg': 'contralto', 'stephanie blythe': 'mezzo-soprano', 'elizabeth deshong': 'mezzo-soprano', 'marilyn horne': 'mezzo-soprano',
  'harolyn blackwell': 'soprano', 'judith blegen': 'soprano', 'kathleen kim': 'soprano', 'laurel hurley': 'soprano', 'liv redpath': 'soprano',
  'mattiwilda dobbs': 'soprano', 'roberta peters': 'soprano', 'youngok shin': 'soprano',
  'anthony roth costanzo': 'countertenor', 'david daniels': 'countertenor', 'iestyn davies': 'countertenor', 'andreas scholl': 'countertenor',
  'brian asawa': 'countertenor', 'christophe dumaux': 'countertenor', 'lawrence zazzo': 'countertenor',
  'lawrence brownlee': 'tenor', 'neil shicoff': 'tenor',
  // Idomeneo (all Met casts)
  'nadine sierra': 'soprano', 'elza van den heever': 'soprano', 'matthew polenzani': 'tenor', 'alan opie': 'baritone', 'eric owens': 'bass-baritone',
  'noah baetge': 'tenor', 'hildegard behrens': 'soprano', 'luciano pavarotti': 'tenor', 'ileana cotrubas': 'soprano', 'federica lombardi': 'soprano',
  'michael spyres': 'tenor', 'ying fang': 'soprano', 'alexandra deshorties': 'soprano', 'kobie van rensburg': 'tenor', 'dorothea roschmann': 'soprano',
  'placido domingo': 'tenor', 'carol vaness': 'soprano', 'ben heppner': 'tenor', 'david rendall': 'tenor', 'benita valente': 'soprano'
};
var FEMALE = { soprano: 1, 'mezzo-soprano': 1, contralto: 1 };

// Curated trouser roles: "opera|role" (folded) -> [always (1) or only-when-sung-by-a-woman (0), note]
var TROUSER = {
  'idomeneo|idamante': [0, 'Prince Idamante is a young man. Mozart wrote the part for a castrato; today it is usually sung by a mezzo-soprano (his 1786 revision gave it to a tenor).'],
  'le nozze di figaro|cherubino': [1, 'Cherubino is a teenage page boy, written for a woman\u2019s voice.'],
  'der rosenkavalier|octavian': [1, 'Octavian is a 17-year-old count, written by Strauss for a mezzo-soprano.'],
  'la clemenza di tito|sesto': [0, 'Sesto is a young Roman nobleman, written for a castrato and now usually sung by a mezzo-soprano.'],
  'la clemenza di tito|annio': [1, 'Annio is a young Roman patrician, written for a woman\u2019s voice.'],
  'ariadne auf naxos|composer': [1, 'The Composer is a young man, written by Strauss for a mezzo-soprano.'],
  'ariadne auf naxos|the composer': [1, 'The Composer is a young man, written by Strauss for a mezzo-soprano.'],
  'die fledermaus|prince orlofsky': [0, 'Prince Orlofsky is written for a mezzo-soprano (sometimes sung by a countertenor).'],
  'giulio cesare|giulio cesare': [0, 'Caesar was written for a castrato; today a countertenor or a mezzo-soprano sings it.'],
  'giulio cesare|sesto': [0, 'Sesto, Pompey\u2019s son, was written for a soprano; today a mezzo-soprano or countertenor sings it.'],
  'giulio cesare|tolomeo': [0, 'Tolomeo was written for a castrato; today usually a countertenor.'],
  'hansel and gretel|hansel': [1, 'Hansel is a boy, written by Humperdinck for a mezzo-soprano.'],
  'hansel and gretel|hansel ': [1, 'Hansel is a boy, written by Humperdinck for a mezzo-soprano.'],
  'hansel und gretel|hansel': [1, 'Hansel is a boy, written by Humperdinck for a mezzo-soprano.'],
  'le comte ory|isolier': [1, 'Isolier is the Count\u2019s young page, written for a mezzo-soprano.'],
  'orfeo ed euridice|orfeo': [0, 'Orpheus was written for a castrato (later for a tenor); at the Met it is sung by a mezzo-soprano, contralto or countertenor.'],
  'rodelinda|bertarido': [0, 'Bertarido was written for a castrato; today usually a countertenor.'],
  'romeo et juliette|stephano': [1, 'St\u00e9phano is Rom\u00e9o\u2019s page, written for a soprano or mezzo-soprano.'],
  'semiramide|arsace': [1, 'Arsace, the army commander, was written by Rossini for a contralto.'],
  'un ballo in maschera|oscar': [1, 'Oscar is the king\u2019s page, written by Verdi for a soprano.'],
  'cendrillon|prince charming': [1, 'Massenet wrote Prince Charming for a soprano/mezzo-soprano.'],
  'cinderella|prince charming': [1, 'Massenet wrote Prince Charming for a soprano/mezzo-soprano.'],
  'guillaume tell|jemmy': [1, 'Jemmy is Tell\u2019s son, written by Rossini for a soprano.'],
  'agrippina|nerone': [0, 'Nero was written for a castrato; today usually a mezzo-soprano.'],
  'agrippina|ottone': [0, 'Ottone was written for a contralto; today usually a countertenor.'],
  'faust|siebel': [1, 'Si\u00e9bel is a young man, written by Gounod for a mezzo-soprano.'],
  'les contes d hoffmann|nicklausse': [1, 'Nicklausse is the Muse disguised as Hoffmann\u2019s friend, sung by a mezzo-soprano.'],
  'les huguenots|urbain': [1, 'Urbain is a page, written for a soprano/mezzo-soprano.'],
  'anna bolena|smeton': [1, 'Smeton, the queen\u2019s page, is written for a contralto.'],
  'boris godunov|fyodor': [1, 'Fyodor, Boris\u2019s young son, is written for a mezzo-soprano.'],
  'boris godunov|feodor': [1, 'Fyodor, Boris\u2019s young son, is written for a mezzo-soprano.'],
  'alcina|ruggiero': [0, 'Ruggiero was written for a castrato; today a mezzo-soprano or countertenor.'],
  'l enfant et les sortileges|the child': [1, 'The Child (a boy) is written by Ravel for a mezzo-soprano.'],
  'pelleas et melisande|yniold': [1, 'Yniold, a little boy, is sung by a soprano (or a boy treble).']
};

export function fold(s) {
  s = String(s || '').toLowerCase();
  try { if (s.normalize) s = s.normalize('NFD'); } catch (e) { /* ignore */ }
  return s.replace(/[\u0300-\u036f]/g, '').replace(/\u00f8/g, 'o').replace(/[^a-z0-9|]+/g, ' ').replace(/^ +| +$/g, '');
}
export function voiceOf(name) { return VOICE[fold(name)] || ''; }

// The trouser flag (or null) for a role in an opera sung by a given singer.
export function trouserInfo(opera, role, singer) {
  var t = TROUSER[fold(opera) + '|' + fold(role)];
  if (!t) return null;
  var v = voiceOf(singer);
  if (v && !FEMALE[v]) return null;            // sung by a man (countertenor / tenor) in this performance
  if (!v && !t[0]) return null;                // production-dependent and we do not know the singer's voice
  return { voice: v || '', note: t[1] };
}

// Normalise the Met cast (full /client/performance JSON or /filter item) to
// {roles:[{role, singer, voice, trouser, rank}], conductor, composer, librettist, groups:[...]}
export function castOf(meta) {
  var out = { roles: [], conductor: '', composer: '', librettist: '', groups: [], opera: (meta && (meta.opera || meta.name)) || '' };
  var cast = (meta && meta.cast) || [];
  var seen = {};
  for (var i = 0; i < cast.length; i++) {
    var c = cast[i];
    if (!c || !c.person || !c.person.name) continue;
    var nm = String(c.person.name).replace(/^\s+|\s+$/g, '');
    if (c.role === 'CONDUCTOR') { if (!out.conductor) out.conductor = nm; continue; }
    if (c.role === 'COMPOSER') { if (!out.composer) out.composer = nm; continue; }
    if (c.role === 'LIBRETTIST') { if (!out.librettist) out.librettist = nm; continue; }
    if (c.role === 'GROUP') { if (out.groups.indexOf(nm) < 0) out.groups.push(nm); continue; }
    if (c.role !== 'ARTIST') continue;
    var role = String(c.roleName || '').replace(/^\s+|\s+$/g, '');
    var key = role + '|' + nm;
    if (seen[key]) continue;
    seen[key] = 1;
    out.roles.push({ role: role, singer: nm, voice: voiceOf(nm), trouser: role ? trouserInfo(out.opera, role, nm) : null, rank: c.rank || 99 });
  }
  out.roles.sort(function (a, b) { return a.rank - b.rank; });
  return out;
}
// Compact form stored with the cached performance lists ([role, singer] pairs).
export function compactRoles(meta) {
  var c = castOf(meta), r = [];
  for (var i = 0; i < c.roles.length && r.length < 12; i++) r.push([c.roles[i].role, c.roles[i].singer]);
  return r;
}
export function fromCompact(opera, pairs, conductor) {
  var out = { roles: [], conductor: conductor || '', composer: '', librettist: '', groups: [], opera: opera };
  for (var i = 0; i < (pairs || []).length; i++) {
    var role = pairs[i][0], nm = pairs[i][1];
    out.roles.push({ role: role, singer: nm, voice: voiceOf(nm), trouser: role ? trouserInfo(opera, role, nm) : null, rank: i });
  }
  return out;
}

var ENSEMBLE = /orchestra|chorus|ballet|ensemble|choir|children/i;
// Who sings in a scene (from the cue point "artists=" list): {inRoles:{index:1}, extra:[names], ensemble:[names]}
export function sceneSingers(cast, artists) {
  var res = { inRoles: {}, extra: [], ensemble: [], any: false };
  if (!artists || !artists.length) return res;
  var byName = {};
  for (var i = 0; i < cast.roles.length; i++) { var k = fold(cast.roles[i].singer); (byName[k] = byName[k] || []).push(i); }
  for (var j = 0; j < artists.length; j++) {
    var a = String(artists[j]).replace(/^\s+|\s+$/g, '');
    if (!a) continue;
    res.any = true;
    if (ENSEMBLE.test(a)) { res.ensemble.push(a); continue; }
    if (cast.conductor && fold(a) === fold(cast.conductor)) continue;   // conductor credited on orchestral numbers
    var idx = byName[fold(a)];
    if (idx) { for (var n = 0; n < idx.length; n++) res.inRoles[idx[n]] = 1; }
    else res.extra.push(a);
  }
  return res;
}

function roleLine(r) { return r.role || 'Role not listed by the Met'; }
function singerLine(r) { return r.singer + (r.voice ? ' \u00b7 ' + r.voice : ''); }
// Menu items for the cast list: [{head, label, sub, note, on}], scene-aware when artists are known.
export function castItems(cast, scene) {
  var items = [];
  var ss = scene ? sceneSingers(cast, scene.artists) : null;
  var used = {};
  function addRole(i, head, on) {
    var r = cast.roles[i];
    items.push({ head: head, label: roleLine(r), sub: singerLine(r), note: r.trouser ? 'Trouser role \u2014 ' + r.trouser.note : '', on: on, trouser: !!r.trouser });
    used[i] = 1;
  }
  if (ss && ss.any) {
    var first = true;
    for (var i = 0; i < cast.roles.length; i++) if (ss.inRoles[i]) { addRole(i, first ? 'Singing in this scene' : '', true); first = false; }
    for (var j = 0; j < ss.extra.length; j++) { items.push({ head: first ? 'Singing in this scene' : '', label: ss.extra[j], sub: (voiceOf(ss.extra[j]) ? voiceOf(ss.extra[j]) + ' \u00b7 ' : '') + 'role not listed by the Met', on: true }); first = false; }
    if (ss.ensemble.length) { items.push({ head: first ? 'Singing in this scene' : '', label: ss.ensemble.join(', '), sub: '', on: true }); first = false; }
  }
  var headDone = false;
  for (var k = 0; k < cast.roles.length; k++) if (!used[k]) { addRole(k, headDone ? '' : (ss && ss.any ? 'Rest of the cast' : 'Cast'), false); headDone = true; }
  var cr = [];
  if (cast.conductor) cr.push({ head: 'Credits', label: 'Conductor', sub: cast.conductor });
  if (cast.composer) cr.push({ head: cr.length ? '' : 'Credits', label: 'Composer', sub: cast.composer });
  if (cast.librettist) cr.push({ head: cr.length ? '' : 'Credits', label: 'Librettist', sub: cast.librettist });
  return items.concat(cr);
}
