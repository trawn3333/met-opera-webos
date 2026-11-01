import json,os,hashlib,sys
from PIL import Image,ImageDraw,ImageFont
seed=json.load(open('/workspace/met/app/src/userscript/cat/seed.json'))['titles']
def url(code):
  if code[0]=='B': return 'https://cf-images.us-east-1.prod.boltdns.net/v1/static/76009399001/'+code[1:]+'/1280x720/match/image.jpg'
  if code[0]=='M': return 'https://www.metopera.org/ondemand/imagelinks/'+code[1:]
  return code
idx=json.load(open('img_index.json'))
f=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',13)
items=[]
for i,t in enumerate(seed):
  u=url(t[7]); fn='src/'+hashlib.md5(u.encode()).hexdigest()+'.jpg'
  if not os.path.exists(fn):
    import urllib.request
    try: open(fn,'wb').write(urllib.request.urlopen(urllib.request.Request(u,headers={'User-Agent':'Mozilla/5.0'}),timeout=60).read())
    except Exception as e: fn=None
  items.append((i,t[0],fn))
W,H=240,135
for s in range(0,len(items),64):
  sh=Image.new('RGB',(W*8,(H+18)*8),'black'); d=ImageDraw.Draw(sh)
  for k,(i,name,fn) in enumerate(items[s:s+64]):
    x,y=(k%8)*W,(k//8)*(H+18)
    if fn:
      im=Image.open(fn).convert('RGB'); im.thumbnail((W,H)); sh.paste(im,(x+(W-im.width)//2,y))
      lab='%d %s %dx%d'%(i,name[:18],*Image.open(fn).size)
    else: lab='%d %s MISSING'%(i,name[:18])
    d.text((x+2,y+H+2),lab,fill='yellow',font=f)
  sh.save('sheet_%d.jpg'%(s//64),quality=80)
print(len(items))
