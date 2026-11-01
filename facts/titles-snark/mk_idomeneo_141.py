#!/usr/bin/env python3
"""1.4.1: build facts/titles/idomeneo.json from Matt's GOOD-rated candidates.

Input: idomeneo-candidates.json (24, rated) + idomeneo-candidates-music.json (M1-M14, rated) + idomeneo-2017-scenes.json.
- keeps only rating == "good"
- dedupes pairs about the same thing (#19/M8 piccolo, #22/M12 trombones, #24/M14 final key) into one bubble each
- scope: bubbles about today's cast/host/conductor -> "perf:19a5ae2a" (the 2017 HD, Met OD id prefix);
  about the Ponnelle staging / its 1982 premiere -> "production:1982-10-14"; about the piece -> "all"
- every bubble is scene-only (never floats to a random time) and has an explicit offset (s) into its 2017 scene,
  chosen so no two bubbles are closer than GAP seconds on the 2017 timeline (checked here, fails otherwise)
Usage: python3 facts/titles-snark/mk_idomeneo_141.py
"""
import json, os, re, sys
H = os.path.dirname(os.path.abspath(__file__))
GAP = 60
A = {c['n']: c for c in json.load(open(os.path.join(H, 'idomeneo-candidates.json')))['candidates']}
M = {c['n']: c for c in json.load(open(os.path.join(H, 'idomeneo-candidates-music.json')))['candidates']}
SC = json.load(open(os.path.join(H, 'idomeneo-2017-scenes.json')))['scenes']

PERF = 'perf:19a5ae2a'
PROD = 'production:1982-10-14'
TYPE = {'Met history': 'history', 'singers': 'artist', 'conductor': 'artist', 'production': 'staging', 'Mozart': 'composer',
        'plot': 'history', 'the music right now': 'music', 'orchestration': 'music', 'form': 'music', 'marches': 'music',
        'keys & harmony': 'music', 'Gluck & the French tradition': 'music'}
# per bubble: scope, scene regex for other recordings (piece-level only), offset into the 2017 scene, type override
PLAN = {
    1: (PERF, None, 6), 2: (PERF, None, 30), 3: (PERF, None, 20), 4: ('all', 'Quando avran fine', 20),
    'M2': ('all', 'Quando avran fine', 120), 5: (PERF, None, 25), 6: (PERF, None, 25), 8: ('all', 'Tutte nel cor', 20),
    10: (PERF, None, 25), 11: (PROD, 'Il padre adorato', 20), 'M3': ('all', 'Numi, piet', 15), 12: ('all', 'Intermezzo: Marcia', 15),
    13: (PROD, 'Siam soli', 25), 14: (PERF, None, 25), 'M5': ('all', 'Se il padre perdei', 25), 15: ('all', 'Fuor del mar', 25),
    16: (PERF, None, 25), 17: ('all', 'Odo da lunge', 20), 18: ('all', 'Placido . il mar', 25), 19: (PROD, 'Qual nuovo terrore', 20),
    20: (PERF, None, 4), 21: ('all', 'Zeffiretti', 25), 'M10': ('all', 'Andr. ramingo', 25), 'M11': ('all', 'Act III: Marcia$|^Marcia$', 15),
    22: ('all', 'Ha vinto Amore', 20), 23: (PROD, "D.Oreste, d.Ajace", 20), 24: ('all', 'Scenda Amor', 20),
}
TYPE_OVERRIDE = {17: 'critic', 23: 'critic', 8: 'music', 21: 'music'}

# merged pairs (music version preferred when richer; same topic never shown twice)
MERGE = {
    19: dict(with_='M8', text='Hear the piccolo? It plays only in this storm. A 1982 critic called these perhaps opera’s first realistic tempests.',
             attribution='Critic: F. Warren O’Reilly, Washington Times, reviewing the Met premiere of this Ponnelle staging, Oct 14, 1982',
             kicker='Listen for it'),
    22: dict(with_='M12', text='Mozart’s plan for Neptune: three trombones (heard only here) and two horns, placed with the voice. The orchestra falls silent.',
             attribution='Mozart to his father Leopold, Munich, 3 Jan 1781', kicker='Listen for it', primary='M12'),
    24: dict(with_='M14', use='M14'),
}
DROPPED = {'M8', 'M12', 'M14'}

def sources_of(c): return list(c['sources'])
def mk(key):
    c = A[key] if isinstance(key, int) else M[key]
    assert c['rating'] == 'good', key
    text, attr, kicker, srcs, url = c['text'], c.get('attribution'), c['kicker'], sources_of(c), c['sourceUrl']
    cat = c.get('category')
    if key in MERGE:
        m = MERGE[key]; o = M[m['with_']]
        assert o['rating'] == 'good'
        if m.get('use'):
            text, attr, kicker, url, cat = o['text'], o.get('attribution'), o['kicker'], o['sourceUrl'], o.get('category')
            srcs = sources_of(o) + [s for s in srcs if s not in sources_of(o)]
        else:
            text, attr, kicker = m['text'], m['attribution'], m['kicker']
            if m.get('primary'): url = o['sourceUrl']; srcs = sources_of(o) + srcs
            else: srcs = srcs + sources_of(o)
    scope, loose, off = PLAN[key]
    scene = next(s for s in SC if s['title'] == c['scene'])
    rx = loose if loose else '^' + re.escape(c['scene']) + '$'
    hits = [s['title'] for s in SC if re.search(rx, s['title'], re.I)]
    assert hits == [c['scene']], (key, rx, hits)
    # primary source = the one whose URL is the bubble's sourceUrl (anchor kept); the rest become extraSources
    base = url.split('#')[0]; anchor = url.split('#')[1] if '#' in url else None
    prim = [s for s in srcs if s['url'].split('#')[0] == base]
    assert prim, (key, url)
    ev = []
    for s in prim: ev += s['evidence']
    extra = []
    for s in srcs:
        if s['url'].split('#')[0] == base: continue
        x = next((e for e in extra if e['source'] == s['file']), None)
        if x: x['evidence'] += [e for e in s['evidence'] if e not in x['evidence']]
        else: extra.append({'source': s['file'], 'url': s['url'], 'evidence': list(s['evidence'])})
    words = len(re.findall(r"[\w’'][\w’'\-.]*", text))
    assert words <= 20, (key, words, text)
    f = {'id': 'ido-' + (('c%02d' % key) if isinstance(key, int) else key.lower()) + ('-' + MERGE[key]['with_'].lower() if key in MERGE else ''),
         'type': TYPE_OVERRIDE.get(key) or TYPE[cat], 'kicker': kicker, 'sceneMatch': rx, 'sceneOnly': True, 'offset': off,
         'scope': scope, 'text': text}
    if attr: f['attribution'] = attr
    f['source'] = prim[0]['file']
    if anchor: f['anchor'] = anchor
    f['evidence'] = list(dict.fromkeys(ev))
    if extra: f['extraSources'] = extra
    f['candidate'] = key if isinstance(key, str) else '#%d' % key
    return f, scene['t'] + off, scene

order = [k for k in PLAN]
rows = [mk(k) for k in order]
rows.sort(key=lambda r: r[1])
# timeline check on the 2017 scenes
ends = {s['title']: (SC[i + 1]['t'] if i + 1 < len(SC) else s['t'] + 300) for i, s in enumerate(SC)}
bad = 0
for i, (f, at, sc) in enumerate(rows):
    if at + 12 > ends[sc['title']]: print('BUBBLE PAST SCENE END', f['id'], at, sc['title']); bad += 1
    if i and at - rows[i - 1][1] < GAP: print('TOO CLOSE', rows[i - 1][0]['id'], f['id'], at - rows[i - 1][1]); bad += 1
if bad: sys.exit(1)
doc = {'title': 'Idomeneo', 'match': ['Idomeneo'], 'gap': GAP,
       'note': '1.4.1: Matt’s GOOD-rated bubbles (24 + M1–M14 candidates, deduped), timed to the Met HD 2017-03-25 scene markers. Generated by facts/titles-snark/mk_idomeneo_141.py; edit the candidates and re-run.',
       'facts': [r[0] for r in rows]}
out = os.path.join(H, '..', 'titles', 'idomeneo.json')
json.dump(doc, open(out, 'w'), ensure_ascii=False, indent=1); open(out, 'a').write('\n')
gaps = [rows[i][1] - rows[i - 1][1] for i in range(1, len(rows))]
print('wrote', os.path.normpath(out), len(rows), 'bubbles; min gap', min(gaps), 's')
for f, at, sc in rows: print('%5d  %-22s %-14s %s' % (at, f['id'], f['scope'], f['kicker']))
