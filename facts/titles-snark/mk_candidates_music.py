# 14 candidate bubbles about the MUSIC of Idomeneo (M1-M14), tied to the Met's 2017-03-25 HD scene markers.
# Sources cached in ../sources with verbatim evidence; check with: node check_candidates.js idomeneo-candidates-music.json
import json, os, re
HERE = os.path.dirname(os.path.abspath(__file__))
W_IDO = ('https://en.wikipedia.org/wiki/Idomeneo', 'wiki-Idomeneo.txt')
W_REC = ('https://en.wikipedia.org/wiki/Recitative', 'wiki-Recitative.txt')
W_CAN = ('https://en.wikipedia.org/wiki/Christian_Cannabich', 'wiki-Christian_Cannabich.txt')
LET = ('https://www.gutenberg.org/files/5307/5307-h/5307-h.htm', 'gutenberg-mozart-letters-5307.txt')   # Lady Wallace tr. (1866)
DME = ('https://dme.mozarteum.at/DME/objs/raradocs/transcr/pdf_eng/0538_WAM_LM_1780.pdf', 'dme-0538.txt')  # Mozarteum, letter of 15 Nov 1780
def src(s, *ev, anchor=None): return {'url': s[0] + ('#' + anchor if anchor else ''), 'file': s[1], 'evidence': list(ev)}
L = 'Mozart to his father Leopold, Munich, '
C = [
 ('Overture', 'orchestration', 'informative', 'The band',
  'Premiere conductor Christian Cannabich directed the famed Mannheim orchestra, whose crescendos reportedly made ladies faint.',
  'Mozart, ' + '8 Nov 1780: \u201cDo come soon to hear it, and to admire the orchestra.\u201d',
  [src(W_IDO, 'under the musical direction of Christian Cannabich', anchor='Performance_history'),
   src(W_CAN, 'In 1774 Cannabich became director of the Mannheim court orchestra', 'Ladies reportedly fainted when the Mannheimers unleashed their roaring crescendo'),
   src(LET, 'Do come soon to hear it, and to admire the orchestra.', 'Munich, Nov. 8, 1780.')]),
 ('Act I: Quando avran fine omai', 'form', 'informative', 'Listen for it',
  'Recitative comes two ways here: \u201csecco\u201d, with just harpsichord and cello, and orchestral \u201caccompagnato\u201d, which Mozart handles masterfully.', None,
  [src(W_IDO, 'the secco and stromentato recitatives', 'Basso continuo (harpsichord and violoncello)', 'he demonstrated a mastery of orchestral color, accompanied recitatives, and melodic line'),
   src(W_REC, 'recitativo secco ("dry", accompanied only by continuo, typically cello and harpsichord)', 'recitativo accompagnato (which uses an orchestra to accompany the singer)')]),
 ('Act I: Piet\u00e0! Numi, piet\u00e0!', 'Gluck & the French tradition', 'informative', 'Echoes of Gluck',
  'Shipwreck! Mozart builds this scene almost exactly like the storm scene in Gluck\u2019s Iphig\u00e9nie en Tauride.', None,
  [src(W_IDO, "the shipwreck scene towards the end of act 1 is almost identical to the structure and dramatic working-out of a similar scene in Gluck's Iphig\u00e9nie en Tauride", anchor='Composition')]),
 ('Act I: Intermezzo: Marcia', 'Gluck & the French tradition', 'playful', 'French accent',
  'Marches, choruses, dances: their style is \u201cvery French\u201d. Mozart even wrote the opera\u2019s ballet himself, \u201call by the same master.\u201d',
  '\u201cVery French\u201d: Wikipedia, Idomeneo \u00b7 \u201cAll by the same master\u201d: ' + L + '30 Dec 1780',
  [src(W_IDO, 'The style of the choruses, marches, and ballets is very French', anchor='Composition'),
   src(LET, 'Munich, Dec. 30. 1780.', 'I have the honor to write that music also, but I am glad of it, for now the music will be all by the same master')]),
 ('Act II: Se il padre perdei', 'orchestration', 'informative', 'Listen for it',
  'Four solo winds join Ilia: flute, oboe, horn, bassoon. Her first singer, Dorothea Wendling, was a flautist\u2019s wife.',
  L + '8 Nov 1780, planning this aria \u201cin concert with four wind instruments\u201d',
  [src(LET, 'Munich, Nov. 8, 1780.', '"Se il padre perdei, in te lo ritrovo"', 'an aria andantino here in concert with four wind instruments, viz. flute, hautboy, horn, and bassoon'),
   src(DME, '\u201cIlia\u201d was sung by Dorothea (I) Wendling, n\u00e9e Spurni, wife of the traverse flautist Johann Baptist')]),
 ('Act II: Fuor del mar', 'letters', 'playful', 'Behind the music',
  'Raaff, the first Idomeneo, loved this aria \u201cas a young passionate lover\u201d: he sang it at bedtime and on waking.',
  L + '1 Dec 1780',
  [src(LET, 'Munich, Dec. 1, 1780.', 'Yesterday morning Herr Raaff came to me again to hear the aria in the second act. The man is as much enamored of his aria as a young passionate lover ever was of his fair one. He sings it the last thing before he goes to sleep, and the first thing in the morning when he awakes.')]),
 ('Act II: Idol mio, se ritroso', "Elettra's arias", 'playful', 'Diva moment',
  'Elettra\u2019s first singer, Elisabeth Wendling, sang her two arias through half a dozen times and was \u201cvery satisfied.\u201d',
  L + '15 Nov 1780 (Mozarteum translation)',
  [src(DME, 'Lisel Wendling11 has also already sung her two arias12 through half a dozen times [30] \u2013 she is very satisfied.',
       'Elisabeth Augusta Wendling (I) [\u201cLisl\u201d]', 'Elettra\u2019s arias Nos. 4 and 13: \u201cTutte nel cor vi sento\u201d and \u201cIdol mio, se ritroso\u201d.')]),
 ('Act II: Qual nuovo terrore!', 'orchestration', 'informative', 'Listen for it',
  'Hear the piccolo? It plays only here, in the Act II storm, as Neptune\u2019s sea serpent appears.', None,
  [src(W_IDO, 'piccolo (only in the storm of act 2)', anchor='Instrumentation'), src(W_IDO, 'a storm breaks out, and a sea serpent appears', anchor='Act_2')]),
 ('Act II: Eccoti in me, barbaro Nume, il reo!', 'form', 'playful', 'Mozart\u2019s call',
  'Once planned as an aria. Mozart chose orchestral recitative: the storm was \u201cnot likely to subside during Raaff\u2019s aria!\u201d',
  L + '15 Nov 1780',
  [src(LET, 'Munich, Nov. 15, 1780.', 'In the last scene also of the second act, Idomeneo has an aria, or rather a kind of cavatina, to sing between the choruses. For this it would be better to substitute a mere recitative, well supported by the instruments',
       'there is a thunderstorm which is not likely to subside during Raaff\'s aria!'),
   src(DME, 'The aria was indeed replaced by a recitative')]),
 ('Act III: Andr\u00f2 ramingo e solo', 'form', 'informative', 'Mozart\u2019s favorite',
  'Mozart on this quartet: \u201cthere is no single thing in my opera with which I am so pleased.\u201d',
  L + '27 Dec 1780',
  [src(LET, 'Munich, Dec 27, 1780.', 'there is no single thing in my opera with which I am so pleased as with this quartet')]),
 ('Act III: Marcia', 'marches', 'informative', 'Behind the music',
  'Mozart added this march so the king can enter with his whole suite. Scored simply, to be played mezza voce.',
  L + '3 Jan 1781',
  [src(LET, 'he must come accompanied by his whole suite. A march must necessarily be introduced here, so I have composed a very simple one for two violins, tenor, bass, and two hautboys, to be played a mezza voce, and during this time the King appears')]),
 ('Act III: Ha vinto Amore', 'orchestration', 'informative', 'Listen for it',
  'Mozart\u2019s plan for Neptune: just three trombones and two horns, placed with the voice, while the orchestra falls silent.',
  L + '3 Jan 1781',
  [src(LET, 'The accompaniment of the underground music consists merely of five instruments, namely, three trombones and two French horns, which are placed on the spot whence the voice proceeds. The whole orchestra is silent at this part.')]),
 ('Act III: Oh ciel pietoso!', 'letters', 'informative', 'Mozart\u2019s edit',
  'Neptune\u2019s verdict, tightened: Mozart shortened the oracle during rehearsals so it would \u201cmake a good effect.\u201d',
  L + '5 Dec 1780 and 18 Jan 1781',
  [src(LET, 'Munich, Dec. 5, 1780.', 'the oracle\'s subterranean speech too long to make a good effect', 'The rehearsal of the third act went off admirably.', 'The prediction of the oracle is still far too long, so I have shortened it')]),
 ('Act III: Scenda Amor, scenda Imeneo', 'keys & harmony', 'informative', 'Full circle',
  'Home to D major, the overture\u2019s key. Mozart first closed an opera this way here, then in every one after.', None,
  [src(W_IDO, 'The overture, in D major and common time', anchor='Overture'),
   src(W_IDO, 'for the first time and continuing this for all his subsequent operas, ended the work in the key of the overture', anchor='Performance_history')]),
]
out = []
for i, (scene, cat, tone, kicker, text, attr, sources) in enumerate(C, 1):
  out.append({'n': 'M%d' % i, 'kicker': kicker, 'text': text, 'attribution': attr, 'scene': scene,
              'sceneMatch': '^' + re.escape(scene) + '$', 'category': cat, 'tone': tone,
              'sourceUrl': sources[0]['url'], 'sources': sources, 'rating': None})
doc = {'title': 'Idomeneo', 'topic': 'the music', 'performance': 'Met Live in HD, Sat March 25, 2017 matinee (Ponnelle production; cond. James Levine)',
       'note': 'Music candidates for rating. Mozart letters: Lady Wallace translation (Project Gutenberg #5307; it misdates the January 1781 letters as 1780) and the Mozarteum DME English translation. `attribution` = small second line.',
       'candidates': out}
json.dump(doc, open(os.path.join(HERE, 'idomeneo-candidates-music.json'), 'w'), ensure_ascii=False, indent=1)
print(len(out), 'music candidates')
