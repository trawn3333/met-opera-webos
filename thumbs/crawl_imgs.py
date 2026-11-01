import json,os,urllib.request,urllib.parse,concurrent.futures,hashlib,io
from PIL import Image
R='/workspace/met/catalog/raw'
urls={}
for f in os.listdir(R):
  for p in json.load(open(R+'/'+f)):
    t=(p.get('tile') or {}).get('image') or {}
    u=t.get('url')
    if u: urls.setdefault(u.replace('http://','https://'),[]).append(p['id'])
print('distinct',len(urls))
def get(u):
  fn='src/'+hashlib.md5(u.encode()).hexdigest()+'.jpg'
  if os.path.exists(fn): return u,fn,200
  try:
    b=urllib.request.urlopen(urllib.request.Request(u,headers={'User-Agent':'Mozilla/5.0'}),timeout=60).read()
    open(fn,'wb').write(b); return u,fn,200
  except urllib.error.HTTPError as e: return u,None,e.code
  except Exception as e: return u,None,str(e)[:60]
out={}
with concurrent.futures.ThreadPoolExecutor(8) as ex:
  for u,fn,st in ex.map(get,list(urls)):
    info={'status':st,'perfs':len(urls[u]),'file':fn}
    if fn:
      try:
        im=Image.open(fn); info['w'],info['h']=im.size
        g=im.convert('L').resize((9,8)); px=list(g.getdata())
        info['dhash']=''.join('1' if px[r*9+c]>px[r*9+c+1] else '0' for r in range(8) for c in range(8))
        info['bytes']=os.path.getsize(fn)
      except Exception as e: info['err']=str(e)[:60]
    out[u]=info
json.dump(out,open('img_index.json','w'))
import collections
print(collections.Counter(str(v['status']) for v in out.values()))
print(collections.Counter((v.get('w'),v.get('h')) for v in out.values()).most_common(10))
