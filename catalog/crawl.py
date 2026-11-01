import json,urllib.request,urllib.parse,concurrent.futures,os,time
M='https://middleware.ondemand.metopera.org/client'
H={'user-platform':'Web','origin-hostname':'ondemand.metopera.org','Origin':'https://ondemand.metopera.org','User-Agent':'Mozilla/5.0'}
names=[x['name'] for x in json.load(open('filter.json'))['results']]
def get(n):
    fn='raw/'+urllib.parse.quote(n,safe='')+'.json'
    if os.path.exists(fn): return n,os.path.getsize(fn)
    u=M+'/filter/'+urllib.parse.quote(n.lower(),safe='')
    for i in range(3):
        try:
            b=urllib.request.urlopen(urllib.request.Request(u,headers=H),timeout=60).read()
            open(fn,'wb').write(b); return n,len(b)
        except Exception as e: err=e; time.sleep(2)
    return n,str(err)
tot=0
with concurrent.futures.ThreadPoolExecutor(3) as ex:
    for n,r in ex.map(get,names):
        if isinstance(r,int): tot+=r
        else: print('FAIL',n,r)
print('bytes',tot,'files',len(os.listdir('raw')))
