#!/usr/bin/env python3
"""Builds src/userscript/search/index.idx: a compact, bundled search index of the whole Met on Demand archive
(every title + performance with composer, conductor and principal cast) from the catalog snapshot that
tools/build-catalog-seed.py downloads to /workspace/met/catalog/raw (Met /client/filter/<title>).
Format (JSON text): {b: built, t: [title names], p: [person names], tc: [[composer idx...] per title],
  r: [[perfId, titleIdx, 'YYYY-MM-DD', media ('H' HD video, 'V' SD video, 'A' audio), conductorIdx or -1, [artist idx...], runMin]]}"""
import json, os, glob, datetime
RAW = '/workspace/met/catalog/raw'
OUT = os.path.join(os.path.dirname(__file__), '../src/userscript/search/index.idx')
seed = json.load(open(os.path.join(os.path.dirname(__file__), '../src/userscript/cat/seed.json')))
titles = [r[0] for r in seed['titles']]
tidx = {n: i for i, n in enumerate(titles)}
people, pidx = [], {}
def P(n):
    if n not in pidx: pidx[n] = len(people); people.append(n)
    return pidx[n]
tc = [[] for _ in titles]
perfs, seen = [], set()
import urllib.parse
for n in titles:
    fn = os.path.join(RAW, urllib.parse.quote(n, safe='') + '.json')
    if not os.path.exists(fn): continue
    for p in json.load(open(fn)):
        if p['id'] in seen: continue
        seen.add(p['id'])
        cast = p.get('cast') or []
        comp = [x['person']['name'] for x in cast if x['role'] == 'COMPOSER']
        for c in comp:
            i = P(c)
            if i not in tc[tidx[n]]: tc[tidx[n]].append(i)
        cond = [x['person']['name'] for x in cast if x['role'] == 'CONDUCTOR']
        arts = sorted([x for x in cast if x['role'] == 'ARTIST'], key=lambda x: (x['rank'] is None, x['rank'] or 0))
        a = []
        for x in arts[:8]:
            i = P(x['person']['name'])
            if i not in a: a.append(i)
        m = 'A' if p['mediaType'] != 'VIDEO' else ('H' if p.get('resolutionType') == 'HD' else 'V')
        perfs.append([p['id'], tidx[n], p['performanceDate'][:10], m, P(cond[0]) if cond else -1, a, (p.get('runTime') or 0) // 60000])
perfs.sort(key=lambda r: r[2], reverse=True)
out = {'b': datetime.datetime.now(datetime.UTC).strftime('%Y-%m-%d'), 't': titles, 'p': people, 'tc': tc, 'r': perfs}
s = json.dumps(out, ensure_ascii=False, separators=(',', ':'))
open(OUT, 'w').write(s)
print('titles', len(titles), 'people', len(people), 'performances', len(perfs), 'bytes', len(s.encode()))
