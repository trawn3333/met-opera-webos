import collections
from PIL import Image
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

