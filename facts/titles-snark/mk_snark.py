# Pop-Up-Video-style ("snark") rewrites of the Idomeneo and Tosca facts. SAMPLE pass, not wired into the app yet.
# Every bubble keeps its original fact's source + evidence (re-verified by check.js); the original wording is kept in `plain`.
# New bubbles (new: true) carry their own verbatim evidence from a cached source in facts/sources/.
import json, os, copy
HERE = os.path.dirname(os.path.abspath(__file__))
ORIG = os.path.join(HERE, '..', 'titles')

# kicker -> suggested icon (Material Symbols name, emoji fallback)
ICONS = {
  'Did you know?': ('lightbulb', '💡'), 'Fun fact': ('star', '⭐'), 'Ouch.': ('healing', '🩹'),
  'Plot hole alert': ('report', '🕳️'), 'Plot twist': ('cyclone', '🌀'), 'Critics: not fans': ('thumb_down', '🍅'),
  'Critics: big fans': ('thumb_up', '👏'), 'Diva moment': ('crown', '👑'), 'Listen for it': ('hearing', '👂'),
  'Blooper': ('sentiment_very_dissatisfied', '🙈'), 'Legend has it': ('history_edu', '📜'), 'Remix': ('tune', '🎛️'),
  'Borrowed!': ('content_copy', '♻️'), 'Burn.': ('local_fire_department', '🔥'), 'Behind the music': ('piano', '🎼'),
  'Box office': ('confirmation_number', '🎟️'), 'Translation': ('translate', '💬'), 'Villain moment': ('skull', '😈'),
  'Director\u2019s cut': ('movie', '🎬'), 'Set piece': ('castle', '🏛️'),
}
def meanwhile(y): return 'Meanwhile, in %s\u2026' % y
ICONS_DYNAMIC = ('schedule', '⏳')

def kick(k):
  ic = ICONS.get(k, ICONS_DYNAMIC)
  return {'kicker': k, 'icon': ic[0], 'emoji': ic[1]}

def build(slug, rewrites, new):
  doc = json.load(open(os.path.join(ORIG, slug + '.json')))
  by = {f['id']: f for f in doc['facts']}
  out = []
  for fid, k, text in rewrites:
    f = copy.deepcopy(by.pop(fid))
    f['plain'] = f['text']; f['text'] = text; f.update(kick(k))
    out.append(f)
  assert not by, 'not rewritten: %s' % list(by)
  for n in new:
    f = {'id': n['id'], 'type': n['type'], 'sceneMatch': n.get('sceneMatch'), 'scope': n.get('scope', 'all'),
         'plain': None, 'text': n['text'], 'attribution': n['attribution'], 'source': n['source'], 'anchor': n.get('anchor'),
         'evidence': n['evidence'], 'new': True}
    if n.get('legend'): f['legend'] = True
    f.update(kick(n['k']))
    out.append(f)
  res = {'title': doc['title'], 'match': doc['match'], 'style': 'popup-snark', 'sample': True, 'facts': out}
  json.dump(res, open(os.path.join(HERE, slug + '.json'), 'w'), ensure_ascii=False, indent=1)
  return res

W = 'Wikipedia, \u201cIdomeneo\u201d'
ido_rw = [
 ('ido-commission', meanwhile('1780'), 'Commissioned for the Munich court carnival. Nothing says party season like a vow to sacrifice your son.'),
 ('ido-overture-chords', 'Listen for it', 'That soft \u201cending\u201d is a fake-out: the chords slide straight into G minor for Ilia\u2019s first scene.'),
 ('ido-premiere', meanwhile('1781'), 'Opening night: 29 January 1781, Cuvilli\u00e9s Theatre, Munich. Conductor: Christian Cannabich.'),
 ('ido-press-ignored-mozart', 'Ouch.', 'The Munich press raved about the scenery \u2014 the port, Neptune\u2019s temple \u2014 and never named Mozart.'),
 ('ido-castrato-tenor', 'Fun fact', 'Idamante was written for a castrato. Five years later Mozart rewrote him as a tenor. Opera puberty.'),
 ('ido-vowels', 'Diva moment', 'The singers objected to vowels. Too many i\u2019s in \u201crinvigorir\u201d, so Mozart changed the words.'),
 ('ido-electra-furies', 'Diva moment', 'Elettra is jealous of Ilia, so she summons the furies of the underworld. Proportionate.'),
 ('ido-gluck-shipwreck', 'Borrowed!', 'This shipwreck follows Gluck\u2019s storm scene in Iphig\u00e9nie en Tauride almost beat for beat.'),
 ('ido-vow', 'Plot hole alert', 'The vow: sacrifice the first living creature he meets on land. Guess who shows up first. (His son.)'),
 ('ido-raaff', 'Did you know?', 'Anton Raaff, the first Idomeneo, never played another stage role. Retired on a shipwreck.'),
 ('ido-raaff-voice', 'Critics: big fans', 'Critic Schubart called Raaff\u2019s voice the most beautiful male voice of all time. No pressure, tonight\u2019s tenor.'),
 ('ido-intermezzo', 'Plot hole alert', 'The troops come home, the wives meet the boat, everyone thanks Neptune. Nobody mentions the vow.'),
 ('ido-storm-piccolo', 'Listen for it', 'Hear the piccolo? Enjoy it. This Act II storm is the only place Mozart uses it.'),
 ('ido-zeffiretti', 'Translation', 'Ilia asks the breezes to carry her love to Idamante. Long-distance messaging, 1781 edition.'),
 ('ido-trombones', 'Listen for it', 'The three trombones play nowhere else in the opera. When a god speaks, you bring brass.'),
 ('ido-key-circle', 'Did you know?', 'Ends in the overture\u2019s key: a first for Mozart, and a habit in every opera he wrote after.'),
 ('ido-three-perfs', 'Box office', 'All that work, all those fights with the librettist\u2026 Munich performed it three times.'),
 ('ido-ballet', 'Fun fact', 'Munich\u2019s management also wanted a ballet. Mozart delivered about 15 minutes of dances. Bonus track: K. 367.'),
 ('ido-gluck-plan', 'Director\u2019s cut', 'Later in 1781 Mozart considered a Gluck-style redo: bass Idomeneo, tenor Idamante. Never happened.'),
 ('ido-strauss', 'Remix', '1931: Richard Strauss \u201cupdated\u201d Idomeneo, swapping about a third of Mozart\u2019s music for his own.'),
 ('ido-us-premiere', 'Did you know?', 'America\u2019s first Idomeneo: Tanglewood, 1947. Only 166 years after the premiere.'),
 ('ido-berlin-2006', meanwhile('2006'), 'Berlin\u2019s Deutsche Oper cancelled an Idomeneo revival over an added final scene, citing an \u201cincalculable security risk\u201d.'),
 ('ido-met-first', 'Did you know?', 'This Ponnelle staging was the Met\u2019s first Idomeneo ever, in 1982: 201 years after the premiere. Pavarotti sang the king.'),
 ('ido-met-piranesi', 'Set piece', 'The Ponnelle look: Roman columns, a grand staircase, Piranesi-style ruins. Crete, via Rome.'),
 ('ido-met-showstopper', 'Diva moment', '1982: Hildegard Behrens\u2019s Elettra \u201cliterally stopped the show\u201d with this aria, said one critic.'),
 ('ido-met-storms', 'Critics: big fans', 'A 1982 critic called these perhaps the first realistic musical tempests in any opera. Umbrellas up.'),
]
WI = {'attribution': W, 'source': 'wiki-Idomeneo.txt'}
ido_new = [
 dict(id='ido-sidon', type='history', k='Plot hole alert', sceneMatch='Placido|Idol mio', anchor='Act_2', **WI,
      text='Welcome to Sidon, a port city of Crete. Population: zero. It\u2019s fictional.',
      evidence=['At the port of Sidon (a fictional city of Crete)']),
 dict(id='ido-serpent', type='music', k='Plot twist', sceneMatch='Qual nuovo terrore|Corriamo', anchor='Act_2', **WI,
      text='Neptune\u2019s reply to a dodged vow: a storm AND a sea serpent. Gods don\u2019t do refunds.',
      evidence=['a storm breaks out, and a sea serpent appears']),
 dict(id='ido-offstage-monster', type='staging', k='Plot hole alert', sceneMatch=None, anchor='Act_3', **WI,
      text='The big monster fight? Offstage. Arbace just walks in and reports that Idamante killed it.',
      evidence=['Arbace brings news that Idamante has killed the monster']),
 dict(id='ido-elettra-ending', type='music', k='Ouch.', sceneMatch="D'Oreste|D'Ajace", anchor='Act_3', **WI,
      text='Happy ending! Everyone is relieved\u2026 except Elettra, who longs for her own death.',
      evidence=['Everyone is relieved except Electra, who longs for her own death.']),
 dict(id='ido-two-remixes', type='history', k='Remix', sceneMatch=None, anchor='Richard_Strauss_version', **WI,
      text='1931: houses feared Idomeneo was \u201chopelessly unstageworthy\u201d. Fix: two remixes, by Wolf-Ferrari and Strauss.',
      evidence=['hopelessly unstageworthy', 'Munich commissioned an Idomeneo revision from Ermanno Wolf-Ferrari, performed in 1931',
                'the Vienna State Opera presented a distinctively interventionist version of the score by Richard Strauss']),
 dict(id='ido-glasgow', type='premiere', k='Did you know?', sceneMatch=None, anchor='Performance_history', **WI,
      text='Britain\u2019s first Idomeneo, 1934, wasn\u2019t at a big opera house. It was the amateur Glasgow Grand Opera Society.',
      evidence=['The British premiere was given by the amateur Glasgow Grand Opera Society under Erik Chisholm on 12 March 1934.']),
 dict(id='ido-kids', type='history', k='Fun fact', sceneMatch=None, anchor='Video', **WI,
      text='1993: a 50-minute kids\u2019 Idomeneo, with one actor playing almost every role. Quick changes.',
      evidence=['50-minute version for children, with actor Frank Groothof playing almost all roles']),
 dict(id='ido-raaff-opera', type='artist', k='Fun fact', sceneMatch=None, anchor='Other_appearances', **WI,
      text='Mozart and his first Idomeneo got their own opera, RAAFF. Its orchestra includes a Fender Rhodes and a drum kit.',
      evidence=['centers around the problematic relationship and friendship between young Mozart and the much older Anton Raaff',
                'including a fretless bass guitar, a Fender Rhodes and a drum kit']),
]
WT = {'attribution': 'Wikipedia, \u201cTosca\u201d', 'source': 'wiki-Tosca.txt'}
tosca_rw = [
 ('tosca-01', meanwhile('1900'), 'Premiere: Rome, 14 January 1900. Postponed a day for fear of unrest. Rome being Rome.'),
 ('tosca-02', 'Did you know?', 'Opening night came with an anarchist bomb warning. The conductor\u2019s emergency plan: play the royal march.'),
 ('tosca-03', 'Critics: not fans', 'Critics: lukewarm. Audiences: twenty straight performances to packed houses. Guess who won.'),
 ('tosca-04', 'Did you know?', 'Puccini, 1889, on why Tosca: \u201cno overblown proportions, no elaborate spectacle.\u201d Stay for the Te Deum.'),
 ('tosca-05', 'Ouch.', 'Young Enrico Caruso hoped to create Cavaradossi. They picked someone \u201cmore experienced\u201d.'),
 ('tosca-06', 'Listen for it', 'No overture. Three chords (Scarpia\u2019s theme) and a fugitive bursts in. Puccini skips the small talk.'),
 ('tosca-07', 'Villain moment', 'Mid-Te Deum, in church, Scarpia sings: \u201cTosca, you make me forget even God!\u201d Read the room.'),
 ('tosca-08', 'Blooper', 'Maria Jeritza fell escaping Scarpia and sang \u201cVissi d\u2019arte\u201d from the floor. It worked, so she kept doing it.'),
 ('tosca-09', 'Behind the music', 'Puccini went to Castel Sant\u2019Angelo to hear the real matins bells, then had bells cast by four foundries.'),
 ('tosca-10', 'Critics: not fans', 'Librettist Illica, after the premiere: all that fuss and money on the bells \u201cpasses completely unnoticed\u201d. Listen anyway.'),
 ('tosca-11', 'Translation', 'The shepherd boy sings in Roman dialect. Puccini asked for a \u201cgood romanesco poet\u201d and got folklorist Giggi Zanazzo.'),
 ('tosca-12', 'Borrowed!', 'Part of this duet is recycled from music Puccini cut from his opera Edgar. His publisher noticed. Too late.'),
 ('tosca-13', 'Burn.', 'Joseph Kerman: a \u201cshabby little shocker\u201d. Thomas Beecham: anything Kerman says about Puccini \u201ccan safely be ignored\u201d.'),
 ('tosca-14', 'Did you know?', 'Met premiere: 4 February 1901, barely a year after Rome. New York didn\u2019t wait.'),
 ('tosca-15', 'Diva moment', 'Pavarotti\u2019s final stage performance: Cavaradossi, at the Met, 13 March 2004.'),
 ('tosca-16', 'Box office', 'Sardou wrote La Tosca for Sarah Bernhardt. Over 3,000 performances in France alone. Big shoes.'),
 ('tosca-17', 'Critics: not fans', 'A biographer\u2019s summary: \u201cthree strong characters trapped in an airless, violent, tightly wound melodrama.\u201d Enjoy!'),
]
LAT = {'attribution': 'Los Angeles Times, 9 Jan 1990 (citing Hugh Vickers, \u201cGreat Opera Disasters\u201d)', 'source': 'lat-1990-opera-comedy.txt'}
tosca_new = [
 dict(id='tosca-n-queen', type='premiere', k='Diva moment', sceneMatch=None, anchor='Premiere', **WT,
      text='Queen Margherita attended the premiere. She arrived after Act I.',
      evidence=['as did Queen Margherita, though she arrived late, after the first act']),
 dict(id='tosca-n-latecomers', type='blooper', k='Blooper', sceneMatch='^Act I$|Ah! Finalmente|Angelotti', anchor='Premiere', **WT,
      text='Premiere night, moments in: latecomers caused a commotion, someone yelled \u201cBring down the curtain!\u201d, and the orchestra stopped.',
      evidence=['caused by latecomers attempting to enter the auditorium, and a shout of "Bring down the curtain!", at which Mugnone stopped the orchestra']),
 dict(id='tosca-n-barcelona', type='artist', k='Did you know?', sceneMatch=None, anchor='Premiere', **WT,
      text='Why trust the conductor with the bomb plan? Mugnone had already survived a theatre bombing in Barcelona.',
      evidence=['(who had survived a theatre bombing in Barcelona)']),
 dict(id='tosca-n-franchetti', type='history', k='Plot twist', sceneMatch=None, anchor='Background', **WT,
      text='Tosca was first assigned to Alberto Franchetti. One story: Ricordi talked him out of it as too violent to stage.',
      evidence=['which Ricordi then assigned to the composer Alberto Franchetti', 'One story relates that Ricordi convinced Franchetti that the work was too violent to be successfully staged.']),
 dict(id='tosca-n-escape', type='history', k='Plot hole alert', sceneMatch='Dammi i colori|Recondita|Quale occhio', anchor='Act_1', **WT,
      text='Angelotti\u2019s escape plan: disguise himself as a woman, in clothes his sister left in the chapel.',
      evidence=['his plan to flee disguised as a woman, using clothes left in the chapel by his sister']),
 dict(id='tosca-n-michele', type='music', k='Behind the music', sceneMatch='^Act II$|Tosca \u00e8 un buon falco|Ha pi\u00f9 forte', anchor='Act_2_2', **WT,
      text='That distant gavotte? Puccini adapted a student exercise by his late brother Michele, so he could \u201clive again\u201d.',
      evidence=['For this music Puccini adapted a fifteen-year-old student exercise by his late brother, Michele, stating that in this way his brother could live again through him.']),
 dict(id='tosca-n-darclee', type='artist', k='Diva moment', sceneMatch=None, anchor='Premiere', **WT,
      text='The first Tosca, Hariclea Darcl\u00e9e, came billed as \u201caccomplished (but temperamental)\u201d. Typecasting.',
      evidence=['The accomplished (but temperamental) soprano Hariclea Darcl\u00e9e was selected for the title role']),
 dict(id='tosca-n-wastebasket', type='composer', k='Diva moment', sceneMatch='E lucevan', anchor='Act_3_2', **WT,
      text='Puccini said fans of this aria owe him thrice, partly for refusing advice to throw it \u201cin the waste-paper basket\u201d.',
      evidence=['for declining expert advice to throw the result in the waste-paper basket']),
 dict(id='tosca-n-blanks', type='history', k='Plot hole alert', sceneMatch='Come \u00e8 lunga|Trionfal|Amaro sol', anchor='Act_3', **WT,
      text='Tosca coaches Mario on how to play dead, because the firing squad will use blanks. What could go wrong?',
      evidence=['Tosca then anxiously coaches Cavaradossi on how to play dead when the firing squad shoots at him with blanks.']),
 dict(id='tosca-n-gondola', type='history', k='Plot twist', sceneMatch=None, anchor='Adaptation_and_writing', **WT,
      text='An 1896 draft ended with Tosca going mad, imagining she and Mario are on a gondola. Sardou said no.',
      evidence=['The 1896 libretto also offers a different ending, in which Tosca does not die but instead goes mad.', 'she and her Mario are on a gondola', 'Sardou refused to consider this change']),
 dict(id='tosca-n-kerman-leap', type='critic', k='Burn.', sceneMatch='avanti a Dio|Presto|Finale', anchor='Act_3_2', **WT,
      text='Kerman on the final bars: \u201cTosca leaps, and the orchestra screams the first thing that comes into its head.\u201d',
      evidence=['Tosca leaps, and the orchestra screams the first thing that comes into its head.']),
 dict(id='tosca-n-trampoline', type='blooper', k='Legend has it', sceneMatch='avanti a Dio|Presto|Finale', legend=True, **LAT,
      text='Opera legend: a crew swapped Tosca\u2019s landing mattress for a trampoline. She reportedly came up 15 times.',
      evidence=['But the crew had replaced the mattress with a trampoline.', 'she came up 15 times before the curtain fell']),
 dict(id='tosca-n-callas18', type='artist', k='Did you know?', sceneMatch=None, anchor='Subsequent_productions', **WT,
      text='Maria Callas first sang Tosca at 18, in Greek, in Athens, 1942.',
      evidence=['Callas had first sung Tosca at age 18 in a performance given in Greek, in the Greek National Opera in Athens on 27 August 1942.']),
 dict(id='tosca-n-zeffirelli', type='staging', k='Set piece', sceneMatch=None, anchor='Subsequent_productions', **WT,
      text='Zeffirelli\u2019s 1964 Covent Garden Tosca (Callas and Gobbi) stayed in use for more than 40 years. Durable sets.',
      evidence=['her performances at the Royal Opera House in 1964, with Tito Gobbi as Scarpia', 'This production, by Franco Zeffirelli, remained in continuous use at Covent Garden for more than 40 years']),
 dict(id='tosca-n-faure', type='critic', k='Critics: not fans', sceneMatch=None, anchor='Critical_reception', **WT,
      text='Paris, 1903: Gabriel Faur\u00e9 was offended by Tosca\u2019s \u201cdisconcerting vulgarities\u201d. You\u2019ve been warned.',
      evidence=['Gabriel Faur\u00e9 was offended by "disconcerting vulgarities"']),
]
if __name__ == '__main__':
  for slug, rw, nw in (('idomeneo', ido_rw, ido_new), ('tosca', tosca_rw, tosca_new)):
    r = build(slug, rw, nw)
    print(slug, len(r['facts']), 'bubbles (', len(rw), 'rewritten,', len(nw), 'new )')
