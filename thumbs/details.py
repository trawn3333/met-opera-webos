import json,os,urllib.request,concurrent.futures
M='https://middleware.ondemand.metopera.org/client'
H={'user-platform':'Web','origin-hostname':'ondemand.metopera.org','Origin':'https://ondemand.metopera.org','User-Agent':'Mozilla/5.0'}
ti=json.load(open('title_imgs.json'))
need=[n for n,v in ti.items() if v['cls'] in ('card','square')]
R='/workspace/met/catalog/raw'
perfs=[]
import urllib.parse
for n in need:
  for p in json.load(open(R+'/'+urllib.parse.quote(n,safe='')+'.json')): perfs.append((n,p['id']))
os.makedirs('det',exist_ok=True)
def get(a):
  n,i=a; fn='det/'+i+'.json'
  if os.path.exists(fn): return a,200
  try:
    b=urllib.request.urlopen(urllib.request.Request(M+'/performance/'+i,headers=H),timeout=60).read(); open(fn,'wb').write(b); return a,200
  except urllib.error.HTTPError as e: return a,e.code
  except Exception as e: return a,str(e)[:50]
import collections
st=collections.Counter()
with concurrent.futures.ThreadPoolExecutor(4) as ex:
  for a,s in ex.map(get,perfs): st[str(s)]+=1
print(len(need),len(perfs),st)
