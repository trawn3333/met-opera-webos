// Curated classification table for the Categories screen, keyed by the Met's own opera title
// (the "opera" field / /client/filter names). Everything except mood is factual:
//   composer(s), sung language (as performed in the Met catalog), era/style, world-premiere year.
// Mood is a sensible, subjective grouping. Flags: G = hidden gem, S = starter opera,
// W = world premiere given by the Met itself.
// Format: 'Title': 'composerKey[+composerKey] | lang[+lang] | era[+era] | moods | premiereYear | flags'
// Eras: baroque, classical, belcanto, romantic, wagner, verismo, c20 (20th century), contemp, operetta.
// Moods: tragic, comic, epic, romance, dark, mythic.

export var COMPOSERS = {
  adams: 'John Adams', ades: 'Thomas Ad\u00e8s', alfano: 'Franco Alfano', aucoin: 'Matthew Aucoin',
  barber: 'Samuel Barber', bartok: 'B\u00e9la Bart\u00f3k', bates: 'Mason Bates', beethoven: 'Ludwig van Beethoven',
  bellini: 'Vincenzo Bellini', berg: 'Alban Berg', berlioz: 'Hector Berlioz', bizet: 'Georges Bizet',
  blanchard: 'Terence Blanchard', boito: 'Arrigo Boito', borodin: 'Alexander Borodin', britten: 'Benjamin Britten',
  catan: 'Daniel Cat\u00e1n', cherubini: 'Luigi Cherubini', cilea: 'Francesco Cil\u00e8a', corigliano: 'John Corigliano',
  davis: 'Anthony Davis', dean: 'Brett Dean', debussy: 'Claude Debussy', donizetti: 'Gaetano Donizetti',
  dvorak: 'Anton\u00edn Dvo\u0159\u00e1k', floyd: 'Carlisle Floyd', gershwin: 'George Gershwin', giordano: 'Umberto Giordano',
  glass: 'Philip Glass', gluck: 'Christoph Willibald Gluck', golijov: 'Osvaldo Golijov', gounod: 'Charles Gounod',
  halevy: 'Fromental Hal\u00e9vy', handel: 'George Frideric Handel', harbison: 'John Harbison', heggie: 'Jake Heggie',
  humperdinck: 'Engelbert Humperdinck', janacek: 'Leo\u0161 Jan\u00e1\u010dek', jstrauss: 'Johann Strauss II', lehar: 'Franz Leh\u00e1r',
  leoncavallo: 'Ruggero Leoncavallo', levy: 'Marvin David Levy', mascagni: 'Pietro Mascagni', massenet: 'Jules Massenet',
  meyerbeer: 'Giacomo Meyerbeer', mozart: 'Wolfgang Amadeus Mozart', muhly: 'Nico Muhly', mussorgsky: 'Modest Mussorgsky',
  offenbach: 'Jacques Offenbach', picker: 'Tobias Picker', ponchielli: 'Amilcare Ponchielli', poulenc: 'Francis Poulenc',
  prokofiev: 'Sergei Prokofiev', puccini: 'Giacomo Puccini', puts: 'Kevin Puts', rossini: 'Gioachino Rossini',
  saariaho: 'Kaija Saariaho', saintsaens: 'Camille Saint-Sa\u00ebns', schoenberg: 'Arnold Schoenberg', shostakovich: 'Dmitri Shostakovich',
  smetana: 'Bed\u0159ich Smetana', strauss: 'Richard Strauss', stravinsky: 'Igor Stravinsky', tandun: 'Tan Dun',
  tchaikovsky: 'Pyotr Ilyich Tchaikovsky', tesori: 'Jeanine Tesori', thomas: 'Ambroise Thomas', verdi: 'Giuseppe Verdi',
  wagner: 'Richard Wagner', weber: 'Carl Maria von Weber', weill: 'Kurt Weill', zandonai: 'Riccardo Zandonai'
};
// Short labels for chips.
export var COMPOSER_SHORT = { strauss: 'R. Strauss', jstrauss: 'J. Strauss II', saintsaens: 'Saint-Sa\u00ebns', tandun: 'Tan Dun' };

export var LANGS = {
  it: 'Italian', de: 'German', fr: 'French', en: 'English', ru: 'Russian', cs: 'Czech', hu: 'Hungarian',
  es: 'Spanish', la: 'Latin', other: 'Other languages'
};
export var ERAS = [
  ['baroque', 'Baroque'], ['classical', 'Classical'], ['belcanto', 'Bel canto'], ['romantic', 'Romantic'],
  ['wagner', 'Wagnerian music drama'], ['verismo', 'Verismo & Puccini'], ['operetta', 'Operetta'],
  ['c20', '20th century'], ['contemp', 'Contemporary']
];
export var MOODS = [
  ['tragic', 'Tragic & tearjerkers'], ['comic', 'Comic & light'], ['epic', 'Epic & grand spectacle'],
  ['romance', 'Romantic'], ['dark', 'Dark & psychological'], ['mythic', 'Mythic & fairy tale']
];

export var OPERAS = {
  "A Midsummer Night's Dream": 'britten|en|c20|comic,mythic|1960|',
  'Adriana Lecouvreur': 'cilea|it|verismo|tragic,romance|1902|G',
  'Agrippina': 'handel|it|baroque|comic,dark|1709|',
  'Aida': 'verdi|it|romantic|epic,tragic,romance|1871|S',
  'Ainadamar': 'golijov|es|contemp|tragic|2003|',
  'Akhnaten': 'glass|other|contemp|epic,mythic|1984|G',
  'An American Tragedy': 'picker|en|contemp|tragic,dark|2005|W',
  'Andrea Ch\u00e9nier': 'giordano|it|verismo|tragic,romance,epic|1896|',
  'Anna Bolena': 'donizetti|it|belcanto|tragic|1830|',
  'Antony and Cleopatra': 'barber+adams|en|c20+contemp|tragic,epic,romance|1966|',
  'Arabella': 'strauss|de|c20|romance,comic|1933|',
  'Ariadne auf Naxos': 'strauss|de|c20|comic,mythic|1916|',
  'Armida': 'rossini|it|belcanto|mythic,romance|1817|',
  'Attila': 'verdi|it|romantic|epic|1846|',
  'Benvenuto Cellini': 'berlioz|fr|romantic|comic,epic|1838|G',
  'Billy Budd': 'britten|en|c20|tragic,dark|1951|',
  "Bluebeard's Castle": 'bartok|hu|c20|dark,mythic|1918|G',
  "Bluebeard's Castle & Erwartung": 'bartok+schoenberg|hu+de|c20|dark|1918|',
  'Boris Godunov': 'mussorgsky|ru|romantic|epic,dark|1874|',
  'Capriccio': 'strauss|de|c20|comic,romance|1942|',
  'Carmen': 'bizet|fr|romantic|tragic,romance|1875|S',
  'Cavalleria Rusticana': 'mascagni|it|verismo|tragic|1890|',
  'Cavalleria Rusticana & Pagliacci': 'mascagni+leoncavallo|it|verismo|tragic,dark|1890|S',
  'Cendrillon': 'massenet|fr|romantic|comic,romance,mythic|1899|',
  'Champion': 'blanchard|en|contemp|tragic|2013|',
  'Cinderella': 'massenet|en|romantic|comic,romance,mythic|1899|S',
  'Cos\u00ec fan tutte': 'mozart|it|classical|comic,romance|1790|',
  'Cyrano de Bergerac': 'alfano|fr|c20|romance,tragic|1936|G',
  'Das Rheingold': 'wagner|de|wagner|mythic,epic|1869|',
  'Dead Man Walking': 'heggie|en|contemp|tragic,dark|2000|',
  'Death in Venice': 'britten|en|c20|dark|1973|G',
  'Der Fliegende Holl\u00e4nder': 'wagner|de|wagner|dark,mythic,romance|1843|',
  'Der Freisch\u00fctz': 'weber|de|romantic|dark,mythic|1821|G',
  'Der Rosenkavalier': 'strauss|de|c20|comic,romance|1911|',
  'Dialogues des Carm\u00e9lites': 'poulenc|fr|c20|tragic|1957|G',
  'Die Entf\u00fchrung aus dem Serail': 'mozart|de|classical|comic,romance|1782|',
  'Die Fledermaus': 'jstrauss|de|operetta|comic|1874|S',
  'Die Frau ohne Schatten': 'strauss|de|c20|mythic,epic|1919|G',
  'Die Meistersinger von N\u00fcrnberg': 'wagner|de|wagner|comic,epic,romance|1868|',
  'Die Walk\u00fcre': 'wagner|de|wagner|mythic,epic,tragic|1870|',
  'Die Zauberfl\u00f6te': 'mozart|de|classical|comic,mythic|1791|S',
  'Die \u00c4gyptische Helena': 'strauss|de|c20|mythic|1928|',
  'Doctor Atomic': 'adams|en|contemp|dark,epic|2005|',
  'Don Carlo': 'verdi|it|romantic|tragic,epic|1867|',
  'Don Carlos': 'verdi|fr|romantic|tragic,epic|1867|',
  'Don Giovanni': 'mozart|it|classical|dark,comic|1787|S',
  'Don Pasquale': 'donizetti|it|belcanto|comic|1843|',
  'El Ni\u00f1o': 'adams|other|contemp||2000|',
  'Elektra': 'strauss|de|c20|dark,tragic,mythic|1909|',
  'Ernani': 'verdi|it|romantic|tragic,epic|1844|',
  'Erwartung': 'schoenberg|de|c20|dark|1924|',
  'Esclarmonde': 'massenet|fr|romantic|mythic,romance|1889|G',
  'Eugene Onegin': 'tchaikovsky|ru|romantic|romance,tragic|1879|',
  'Eurydice': 'aucoin|en|contemp|mythic,romance|2020|',
  'Falstaff': 'verdi|it|romantic|comic|1893|',
  'Faust': 'gounod|fr|romantic|dark,mythic,tragic|1859|',
  'Fedora': 'giordano|it|verismo|tragic,romance|1898|',
  'Fidelio': 'beethoven|de|classical|epic|1805|',
  'Fire Shut Up in My Bones': 'blanchard|en|contemp|tragic,dark|2019|',
  'Florencia en el Amazonas': 'catan|es|contemp|romance,mythic|1996|',
  'Francesca da Rimini': 'zandonai|it|verismo|tragic,romance|1914|G',
  'From the House of the Dead': 'janacek|cs|c20|dark|1930|G',
  'Gianni Schicchi': 'puccini|it|verismo|comic|1918|',
  'Giulio Cesare': 'handel|it|baroque|epic,romance|1724|',
  'Grounded': 'tesori|en|contemp|dark|2023|',
  'Guillaume Tell': 'rossini|fr|romantic|epic|1829|G',
  'G\u00f6tterd\u00e4mmerung': 'wagner|de|wagner|mythic,epic,tragic|1876|',
  'Hamlet': 'thomas+dean|fr+en|romantic+contemp|tragic,dark|1868|',
  'Hansel and Gretel': 'humperdinck|en|romantic|comic,mythic|1893|S',
  'H\u00e4nsel und Gretel': 'humperdinck|de|romantic|comic,mythic|1893|S',
  'I Lombardi': 'verdi|it|romantic|epic|1843|',
  'I Puritani': 'bellini|it|belcanto|romance|1835|',
  'I Vespri Siciliani': 'verdi|it|romantic|epic,tragic|1855|',
  'Idomeneo': 'mozart|it|classical|mythic,epic|1781|',
  'Il Barbiere di Siviglia': 'rossini|it|belcanto|comic|1816|S',
  'Il Pirata': 'bellini|it|belcanto|tragic,romance|1827|G',
  'Il Tabarro': 'puccini|it|verismo|tragic,dark|1918|',
  'Il Tabarro & Pagliacci': 'puccini+leoncavallo|it|verismo|tragic,dark|1918|',
  'Il Trittico': 'puccini|it|verismo|tragic,comic|1918|',
  'Il Trovatore': 'verdi|it|romantic|tragic,dark|1853|',
  "Iolanta & Bluebeard's Castle": 'tchaikovsky+bartok|ru+hu|romantic+c20|romance,dark,mythic|1892|G',
  'Iphig\u00e9nie en Tauride': 'gluck|fr|classical|tragic,mythic|1779|G',
  'Jen\u016ffa': 'janacek|cs|c20|tragic|1904|G',
  'K\u00e1\u0165a Kabanov\u00e1': 'janacek|cs|c20|tragic|1921|G',
  "L'Amour de Loin": 'saariaho|fr|contemp|romance|2000|G',
  "L'Assedio di Corinto": 'rossini|it|belcanto|epic|1826|',
  "L'Elisir d'Amore": 'donizetti|it|belcanto|comic,romance|1832|S',
  "L'Italiana in Algeri": 'rossini|it|belcanto|comic|1813|',
  'La Boh\u00e8me': 'puccini|it|verismo|romance,tragic|1896|S',
  'La Cenerentola': 'rossini|it|belcanto|comic,romance|1817|S',
  'La Clemenza di Tito': 'mozart|it|classical|epic|1791|',
  'La Damnation de Faust': 'berlioz|fr|romantic|dark,mythic|1846|',
  'La Donna del Lago': 'rossini|it|belcanto|romance|1819|',
  'La Fanciulla del West': 'puccini|it|verismo|romance|1910|',
  'La Favorita': 'donizetti|it|belcanto|tragic,romance|1840|',
  'La Fille du R\u00e9giment': 'donizetti|fr|belcanto|comic|1840|S',
  'La Forza del Destino': 'verdi|it|romantic|tragic,epic|1862|',
  'La Gioconda': 'ponchielli|it|romantic|tragic,epic|1876|G',
  'La Juive': 'halevy|fr|romantic|tragic,epic|1835|G',
  'La Rondine': 'puccini|it|verismo|romance|1917|',
  'La Sonnambula': 'bellini|it|belcanto|romance|1831|',
  'La Traviata': 'verdi|it|romantic|tragic,romance|1853|S',
  'Lady Macbeth of Mtsensk': 'shostakovich|ru|c20|dark,tragic|1934|G',
  'Le Comte Ory': 'rossini|fr|belcanto|comic|1828|',
  'Le Nozze di Figaro': 'mozart|it|classical|comic,romance|1786|S',
  'Le Proph\u00e8te': 'meyerbeer|fr|romantic|epic|1849|G',
  'Le Sacre du Printemps | Le Rossignol | Oedipus Rex': 'stravinsky|fr+la+ru|c20|mythic|1927|',
  'Les Contes d\'Hoffmann': 'offenbach|fr|romantic|mythic,romance,dark|1881|',
  'Les P\u00eacheurs de Perles': 'bizet|fr|romantic|romance|1863|',
  'Les Troyens': 'berlioz|fr|romantic|epic,mythic,tragic|1863|G',
  'Lohengrin': 'wagner|de|wagner|mythic,romance|1850|',
  'Lucia di Lammermoor': 'donizetti|it|belcanto|tragic,dark,romance|1835|S',
  'Luisa Miller': 'verdi|it|romantic|tragic|1849|',
  'Lulu': 'berg|de|c20|dark|1937|',
  'Macbeth': 'verdi|it|romantic|dark,tragic|1847|',
  'Madama Butterfly': 'puccini|it|verismo|tragic,romance|1904|S',
  'Manon': 'massenet|fr|romantic|romance,tragic|1884|',
  'Manon Lescaut': 'puccini|it|verismo|romance,tragic|1893|',
  'Maria Stuarda': 'donizetti|it|belcanto|tragic|1835|',
  'Marnie': 'muhly|en|contemp|dark|2017|',
  'Medea': 'cherubini|it|classical|dark,mythic,tragic|1797|G',
  'Mefistofele': 'boito|it|romantic|mythic,dark|1868|',
  'Mignon': 'thomas|fr|romantic|romance|1866|',
  'Moby-Dick': 'heggie|en|contemp|epic,dark|2010|',
  'Moses und Aron': 'schoenberg|de|c20|mythic|1957|G',
  'Mourning Becomes Electra': 'levy|en|c20|dark,tragic|1967|W',
  'Nabucco': 'verdi|it|romantic|epic|1842|',
  'Nixon in China': 'adams|en|contemp|epic|1987|',
  'Norma': 'bellini|it|belcanto|tragic,epic|1831|',
  'Oedipus Rex': 'stravinsky|la|c20|mythic,tragic|1927|',
  'Orfeo ed Euridice': 'gluck|it|classical|mythic,romance|1762|',
  'Otello': 'verdi|it|romantic|tragic,dark|1887|',
  'Pagliacci': 'leoncavallo|it|verismo|tragic,dark|1892|',
  'Parsifal': 'wagner|de|wagner|mythic|1882|',
  'Pell\u00e9as et M\u00e9lisande': 'debussy|fr|c20|romance,dark|1902|G',
  'Peter Grimes': 'britten|en|c20|dark,tragic|1945|',
  'Prince Igor': 'borodin|ru|romantic|epic|1890|G',
  'Rigoletto': 'verdi|it|romantic|tragic,dark|1851|S',
  'Rise and Fall of the City of Mahagonny': 'weill|de|c20|dark|1930|',
  'Roberto Devereux': 'donizetti|it|belcanto|tragic|1837|',
  'Rodelinda': 'handel|it|baroque|romance|1725|G',
  'Rom\u00e9o et Juliette': 'gounod|fr|romantic|romance,tragic|1867|',
  'Rusalka': 'dvorak|cs|romantic|mythic,romance,tragic|1901|G',
  'Salome': 'strauss|de|c20|dark|1905|',
  'Samson et Dalila': 'saintsaens|fr|romantic|epic,romance|1877|',
  'Satyagraha': 'glass|other|contemp|epic|1980|G',
  'Semiramide': 'rossini|it|belcanto|epic|1823|G',
  'Siegfried': 'wagner|de|wagner|mythic,epic|1876|',
  'Simon Boccanegra': 'verdi|it|romantic|tragic,epic|1857|',
  'Stiffelio': 'verdi|it|romantic|romance|1850|',
  'Suor Angelica': 'puccini|it|verismo|tragic|1918|',
  'Susannah': 'floyd|en|c20|tragic|1955|G',
  'Tannh\u00e4user': 'wagner|de|wagner|romance,mythic|1845|',
  'Tha\u00efs': 'massenet|fr|romantic|romance|1894|',
  'The Amazing Adventures of Kavalier and Clay': 'bates|en|contemp|epic|2025|W',
  'The Barber of Seville': 'rossini|en|belcanto|comic|1816|S',
  'The Bartered Bride': 'smetana|en|romantic|comic,romance|1866|',
  'The Enchanted Island': 'handel|en|baroque|comic,mythic|2011|W',
  'The Exterminating Angel': 'ades|en|contemp|dark|2016|',
  'The First Emperor': 'tandun|en|contemp|epic|2006|W',
  'The Gambler': 'prokofiev|ru|c20|comic,dark|1929|',
  "The Gershwins' Porgy and Bess": 'gershwin|en|c20|tragic,romance|1935|',
  'The Ghosts of Versailles': 'corigliano|en|contemp|comic,romance|1991|W',
  'The Great Gatsby': 'harbison|en|contemp|tragic,romance|1999|W',
  'The Hours': 'puts|en|contemp|tragic|2022|',
  'The Magic Flute': 'mozart|en|classical|comic,mythic|1791|S',
  'The Makropulos Case': 'janacek|cs|c20|dark|1926|G',
  'The Merry Widow': 'lehar|en|operetta|comic,romance|1905|',
  'The Nose': 'shostakovich|ru|c20|comic,dark|1930|G',
  'The Queen of Spades': 'tchaikovsky|ru|romantic|dark,tragic|1890|',
  "The Rake's Progress": 'stravinsky|en|c20|comic,dark|1951|',
  'The Tempest': 'ades|en|contemp|mythic|2004|',
  'Tosca': 'puccini|it|verismo|tragic,dark|1900|S',
  'Tristan und Isolde': 'wagner|de|wagner|romance,tragic|1865|',
  'Turandot': 'puccini|it|verismo|epic,mythic|1926|S',
  'Two Boys': 'muhly|en|contemp|dark|2011|',
  'Un Ballo in Maschera': 'verdi|it|romantic|tragic,romance|1859|',
  'Vanessa': 'barber|en|c20|romance,tragic|1958|WG',
  'Werther': 'massenet|fr|romantic|romance,tragic|1892|',
  'Wozzeck': 'berg|de|c20|dark,tragic|1925|',
  'X: The Life and Times of Malcolm X': 'davis|en|contemp|epic|1986|'
};

// Per-performance composer split for titles shared by two different operas.
export var SPLIT_BY_COMPOSER = {
  'Antony and Cleopatra': { barber: 'c20', adams: 'contemp' },
  'Hamlet': { thomas: 'romantic', dean: 'contemp' }
};

// Hidden gems, in display order (curated: excellent but less often performed works in the catalog).
export var GEMS = [
  'Jen\u016ffa', 'Rusalka', 'Les Troyens', 'K\u00e1\u0165a Kabanov\u00e1', 'Dialogues des Carm\u00e9lites', 'Pell\u00e9as et M\u00e9lisande',
  'Satyagraha', 'Akhnaten', 'Lady Macbeth of Mtsensk', 'The Makropulos Case', 'From the House of the Dead',
  "Iolanta & Bluebeard's Castle", 'La Gioconda', 'Adriana Lecouvreur', 'Francesca da Rimini', 'Die Frau ohne Schatten',
  'Prince Igor', "L'Amour de Loin", 'Rodelinda', 'Il Pirata', 'Iphig\u00e9nie en Tauride', 'Medea', 'Semiramide',
  'Guillaume Tell', 'La Juive', 'Le Proph\u00e8te', 'The Nose', 'Death in Venice', 'Vanessa', 'Susannah',
  'Der Freisch\u00fctz', 'Esclarmonde', 'Benvenuto Cellini', 'Cyrano de Bergerac', "Bluebeard's Castle", 'Moses und Aron'
];
// Starter operas, in a sensible "first night at the opera" order.
export var STARTERS = [
  'La Boh\u00e8me', 'Carmen', 'La Traviata', 'The Magic Flute', 'Il Barbiere di Siviglia', 'Madama Butterfly', 'Tosca',
  "L'Elisir d'Amore", 'Le Nozze di Figaro', 'Rigoletto', 'Hansel and Gretel', 'La Cenerentola', 'Aida', 'Turandot',
  'Don Giovanni', 'Lucia di Lammermoor', 'Die Fledermaus', 'La Fille du R\u00e9giment', 'Cavalleria Rusticana & Pagliacci',
  'Cinderella', 'The Barber of Seville', 'Die Zauberfl\u00f6te', 'H\u00e4nsel und Gretel'
];
export var SHAKESPEARE = [
  'Otello', 'Falstaff', 'Macbeth', 'Rom\u00e9o et Juliette', 'Hamlet', "A Midsummer Night's Dream", 'The Tempest',
  'Antony and Cleopatra', 'The Enchanted Island'
];
export var RING = ['Das Rheingold', 'Die Walk\u00fcre', 'Siegfried', 'G\u00f6tterd\u00e4mmerung'];

// Non-opera titles in the catalog (galas, playlists, films, podcasts, sacred works).
export var DOCS = ["Wagner's Dream", 'The Audition', 'The Opera House', 'Karajan in Salzburg', 'Live at the Met: From Stage to Screen',
  'Yannick: An Artist\u2019s Journey', 'Soldiers of Music', 'In Rehearsal: A New Butterfly for the Met'];
export var SACRED = ['Messa da Requiem', "Verdi's Requiem", 'A Hymn for Peace'];
export function kindOf(name) {
  if (OPERAS[name]) return 'opera';
  if (DOCS.indexOf(name) >= 0) return 'film';
  if (SACRED.indexOf(name) >= 0) return 'concert';
  if (/^Aria Code/.test(name)) return 'podcast';
  if (/Playlist/i.test(name)) return 'playlist';
  return 'concert';
}

var parsed = {};
export function info(name) {
  if (parsed[name]) return parsed[name];
  var s = OPERAS[name];
  if (!s) return null;
  var p = s.split('|');
  var r = {
    composers: p[0] ? p[0].split('+') : [], langs: p[1] ? p[1].split('+') : [], eras: p[2] ? p[2].split('+') : [],
    moods: p[3] ? p[3].split(',') : [], year: p[4] ? +p[4] : 0, flags: p[5] || ''
  };
  parsed[name] = r;
  return r;
}
export function composerName(k) { return COMPOSERS[k] || k; }
export function composerShort(k) {
  if (COMPOSER_SHORT[k]) return COMPOSER_SHORT[k];
  var n = COMPOSERS[k] || k; var parts = n.split(' ');
  return parts[parts.length - 1];
}
