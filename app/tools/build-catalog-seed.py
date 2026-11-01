#!/usr/bin/env python3
"""Builds src/userscript/cat/seed.json from the Met's own public catalog endpoints
(the same ones ondemand.metopera.org's React app uses):
  GET /client/filter                 -> every title with video/audio counts
  GET /client/filter/<title lower>   -> every performance of that title
Per title we keep only small aggregates (counts, decades, typical runtime, one tile image).
Usage: python3 tools/build-catalog-seed.py [--refetch]"""
import json, os, sys, re, statistics, urllib.request, urllib.parse, concurrent.futures, datetime
M = 'https://middleware.ondemand.metopera.org/client'
H = {'user-platform': 'Web', 'origin-hostname': 'ondemand.metopera.org', 'Origin': 'https://ondemand.metopera.org', 'User-Agent': 'Mozilla/5.0'}
RAW = '/workspace/met/catalog/raw'
OUT = os.path.join(os.path.dirname(__file__), '../src/userscript/cat/seed.json')
os.makedirs(RAW, exist_ok=True)
def get(u): return json.loads(urllib.request.urlopen(urllib.request.Request(u, headers=H), timeout=90).read())
lst = get(M + '/filter')['results']
def fetch(n):
    fn = os.path.join(RAW, urllib.parse.quote(n, safe='') + '.json')
    if '--refetch' in sys.argv or not os.path.exists(fn):
        json.dump(get(M + '/filter/' + urllib.parse.quote(n.lower(), safe='')), open(fn, 'w'))
    return n, json.load(open(fn))
with concurrent.futures.ThreadPoolExecutor(3) as ex: perfs = dict(ex.map(fetch, [x['name'] for x in lst]))

def img(u):
    if not u: return ''
    m = re.match(r'https?://cf-images\.us-east-1\.prod\.boltdns\.net/v1/static/76009399001/([0-9a-f-]+)/([0-9a-f-]+)/\d+x\d+/match/image\.jpg$', u)
    if m: return 'B' + m.group(1) + '/' + m.group(2)
    m = re.match(r'https?://www\.metopera\.org/ondemand/imagelinks/(.+)$', u)
    if m: return 'M' + m.group(1)
    return u.replace('http://', 'https://')
out = []
tot = {'hd': 0, 'sd': 0, 'audio': 0}
for x in lst:
    ps = perfs[x['name']]
    seen = set(); ps = [p for p in ps if not (p['id'] in seen or seen.add(p['id']))]
    hd = sum(1 for p in ps if p['mediaType'] == 'VIDEO' and p.get('resolutionType') == 'HD')
    sd = sum(1 for p in ps if p['mediaType'] == 'VIDEO' and p.get('resolutionType') != 'HD')
    au = sum(1 for p in ps if p['mediaType'] != 'VIDEO')
    tot['hd'] += hd; tot['sd'] += sd; tot['audio'] += au
    dec = {}
    for p in ps: d = p['performanceDate'][:3] + '0'; dec[d] = dec.get(d, 0) + 1
    rts = [p['runTime'] // 60000 for p in ps if p.get('runTime')]
    vids = sorted([p for p in ps if p['mediaType'] == 'VIDEO'], key=lambda p: p['performanceDate'], reverse=True)
    anyp = vids or sorted(ps, key=lambda p: p['performanceDate'], reverse=True)
    im = ''
    for p in anyp:
        u = ((p.get('tile') or {}).get('image') or {}).get('url')
        if u: im = img(u); break
    ad = sum(1 for p in ps if p.get('hasAudioDescription'))
    # [name, sort, hd, sd, audio, typicalRuntimeMin, decades, image, audioDescribed, newestDate]
    out.append([x['name'], x['sort'], hd, sd, au, int(statistics.median(rts)) if rts else 0, dec, im, ad,
                max(p['performanceDate'][:10] for p in ps) if ps else ''])
# 1.3.0: titles without proper Met artwork get a better image (thumbs/manifest.json from tools/make-thumbs.js):
# a real Met image found elsewhere ('B'/'M' code) or a generated poster ('T<slug>', served by the telemetry Worker).
# Field 10 = 1 means "use the title image for this title's performances too" (their own art is the same card).
TI = '/workspace/met/thumbs/title_imgs.json'; MF = '/workspace/met/thumbs/manifest.json'
if os.path.exists(MF):
    man = json.load(open(MF)); ti = json.load(open(TI)) if os.path.exists(TI) else {}
    for r in out:
        if r[0] in man: r[7] = man[r[0]]['code']; r.append(1)
seed = {'built': datetime.datetime.utcnow().strftime('%Y-%m-%dT%H:%MZ'), 'titles': out}
json.dump(seed, open(OUT, 'w'), ensure_ascii=False, separators=(',', ':'))
print('titles', len(out), 'performances', tot, 'bytes', os.path.getsize(OUT))
