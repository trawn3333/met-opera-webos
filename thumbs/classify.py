import json,os,hashlib,collections
from PIL import Image
R='/workspace/met/catalog/raw'
idx=json.load(open('img_index.json'))
def kind(fn):
  im=Image.open(fn).convert('RGB'); w,h=im.size
  sq=abs(w-h)<w*0.15
  s=im.resize((40,40))
  px=s.load()
  top=[px[x,y] for x in range(2,38) for y in range(1,7)]
  white=sum(1 for p in top if min(p)>215)/len(top)
  low=[px[x,y] for x in range(2,38) for y in range(22,38)]
  # dominant colour share in lower part
  q=collections.Counter((p[0]//32,p[1]//32,p[2]//32) for p in low).most_common(1)[0][1]/len(low)
  card = white>0.55 and q>0.45
  return {'w':w,'h':h,'square':sq,'card':card}

titles=collections.defaultdict(list)
for f in os.listdir(R):
  for p in json.load(open(R+'/'+f)):
    u=(((p.get('tile') or {}).get('image') or {}).get('url') or '').replace('http://','https://')
    titles[p['name']].append((p,u))
out={}
for name,ps in titles.items():
  cands=[]
  for p,u in ps:
    v=idx.get(u)
    if not v or not v.get('file'): continue
    k=kind(v['file']); k['url']=u; k['perf']=p['id']; k['date']=p.get('performanceDate','')[:10]; k['media']=p.get('mediaType')
    cands.append(k)
  def score(k):
    if k['card']: return 0
    if k['square']: return 1 + k['w']/10000
    return 2 + k['w']/10000
  best=max(cands,key=score) if cands else None
  out[name]={'best':best,'n':len(ps),'classes':collections.Counter('card' if k['card'] else 'square' if k['square'] else 'wide%d'%k['w'] for k in cands)}
json.dump(out,open('title_imgs.json','w'),indent=0)
c=collections.Counter()
for n,v in out.items():
  b=v['best']; cls='none' if not b else 'card' if b['card'] else ('square' if b['square'] else ('wide-hi' if b['w']>=1000 else 'wide-lo'))
  v['cls']=cls; c[cls]+=1
json.dump(out,open('title_imgs.json','w'),indent=0)
print(c)
for cls in ['card','square','wide-lo']:
  print(cls, sorted([n for n,v in out.items() if v['cls']==cls]))
