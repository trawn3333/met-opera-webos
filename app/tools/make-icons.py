"""Generate neutral (non-trademark) app art: a gold proscenium arch with curtains on burgundy,
and the words MET OPERA set in Cinzel. No Met logos are used."""
import os, glob
from PIL import Image, ImageDraw, ImageFont, ImageFilter

OUT = os.path.join(os.path.dirname(__file__), '..', 'assets')
os.makedirs(OUT, exist_ok=True)
G = '/usr/share/fonts/truetype/sand-box/google/'
def font(pattern, size):
    files = sorted(glob.glob(G + pattern))
    return ImageFont.truetype(files[0], size)

BG = (32, 10, 14)
BURG = (96, 22, 32)
GOLD = (214, 172, 74)
GOLD_D = (150, 112, 40)

def arch(d, box, w):
    x0, y0, x1, y1 = box
    r = (x1 - x0) / 2
    d.rectangle([x0, y0 + r, x0 + w, y1], fill=GOLD)
    d.rectangle([x1 - w, y0 + r, x1, y1], fill=GOLD)
    d.arc([x0, y0, x1, y0 + 2 * r], 180, 360, fill=GOLD, width=w)

def curtains(d, box):
    x0, y0, x1, y1 = box
    r = (x1 - x0) / 2
    mid = (x0 + x1) / 2
    # inner stage: dark; two draped curtains
    d.pieslice([x0, y0, x1, y0 + 2 * r], 180, 360, fill=BURG)
    d.rectangle([x0, y0 + r, x1, y1], fill=BURG)
    n = 6
    for i in range(n):
        for side in (-1, 1):
            xs = mid + side * (r * i / n)
            d.line([xs, y0 + r * 0.25, xs, y1], fill=(70, 14, 22), width=max(1, int(r / 30)))
    # opening in the middle (stage light)
    d.polygon([(mid - r * 0.28, y1), (mid, y0 + r * 0.55), (mid + r * 0.28, y1)], fill=(58, 20, 22))

def icon(size, path, text=True):
    S = size * 4
    im = Image.new('RGB', (S, S), BG)
    d = ImageDraw.Draw(im)
    pad = int(S * 0.14)
    w = max(4, int(S * 0.045))
    top = int(S * 0.08)
    bottom = int(S * (0.70 if text else 0.90))
    box = [pad, top, S - pad, bottom]
    curtains(d, [box[0] + w, box[1] + w, box[2] - w, box[3]])
    arch(d, box, w)
    d.rectangle([pad - w, bottom, S - pad + w, bottom + w], fill=GOLD)
    if text:
        f = font('Cinzel/*.ttf', int(S * (0.135 if size >= 120 else 0.17)))
        t = 'MET OPERA' if size >= 120 else 'MET'
        tw = d.textlength(t, font=f)
        d.text(((S - tw) / 2, bottom + int(S * 0.06)), t, font=f, fill=GOLD)
    im = im.resize((size, size), Image.LANCZOS)
    im.save(path, optimize=True)

def splash(path):
    W, H = 1920, 1080
    im = Image.new('RGB', (W, H), BG)
    d = ImageDraw.Draw(im)
    # soft vignette glow
    glow = Image.new('L', (W, H), 0)
    ImageDraw.Draw(glow).ellipse([W * 0.2, H * 0.05, W * 0.8, H * 1.1], fill=90)
    glow = glow.filter(ImageFilter.GaussianBlur(160))
    im = Image.composite(Image.new('RGB', (W, H), (70, 18, 26)), im, glow)
    d = ImageDraw.Draw(im)
    aw, ah = 420, 470
    box = [(W - aw) / 2, 150, (W + aw) / 2, 150 + ah]
    curtains(d, [box[0] + 18, box[1] + 18, box[2] - 18, box[3]])
    arch(d, [int(v) for v in box], 18)
    d.rectangle([box[0] - 18, box[3], box[2] + 18, box[3] + 18], fill=GOLD)
    f = font('Cinzel/*.ttf', 120)
    t = 'MET OPERA'
    tw = d.textlength(t, font=f)
    d.text(((W - tw) / 2, 690), t, font=f, fill=GOLD)
    f2 = font('Cormorant Garamond/*Italic*.ttf', 46)
    t2 = 'on Demand \u00b7 for TV'
    tw2 = d.textlength(t2, font=f2)
    d.text(((W - tw2) / 2, 850), t2, font=f2, fill=(233, 220, 195))
    im.save(path, optimize=True)

icon(80, os.path.join(OUT, 'icon.png'))
icon(130, os.path.join(OUT, 'largeIcon.png'))
splash(os.path.join(OUT, 'splash.png'))
print('ok')
