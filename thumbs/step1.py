import json,os,urllib.request,hashlib,concurrent.futures,collections
from imgkind import kind
ti=json.load(open('title_imgs.json'))
need={n for n,v in ti.items() if v['cls'] in ('card','square')}
cands=collections.defaultdict(set)
for f in os.listdir('det'):
  d=json.load(open('det/'+f))
  n=d.get('name')
  if n not in need: continue
  for src in [(d.get('slide') or {}).get('image'),(d.get('mobileTile') or {}).get('image'),(d.get('tile') or {}).get('image')]+list(d.get('images') or []):
    if isinstance(src,dict) and src.get('url'): cands[n].add(src['url'].replace('http://','https://'))
def get(u):
  fn='src/'+hashlib.md5(u.encode()).hexdigest()+'.jpg'
  if not os.path.exists(fn):
    try: open(fn,'wb').write(urllib.request.urlopen(urllib.request.Request(u,headers={'User-Agent':'Mozilla/5.0'}),timeout=60).read())
    except Exception as e: return u,None
  return u,fn
allu={u for s in cands.values() for u in s}
files=dict(concurrent.futures.ThreadPoolExecutor(8).map(get,allu))
res={}
for n in sorted(need):
  best=None
  for u in cands.get(n,()):
    fn=files.get(u)
    if not fn: continue
    k=kind(fn); k['url']=u
    if not k['card'] and not k['square'] and (best is None or k['w']>best['w']): best=k
  res[n]=best
found={n:b for n,b in res.items() if b}
print('need',len(need),'found real 16:9 photo via slide/mobileTile',len(found))
print(sorted(found))
json.dump(res,open('step1.json','w'),indent=0)
