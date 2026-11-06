# Paints the game's icon by code: a rowboat and a straw hat against the sun going down over the bay.
# Writes assets/icon-*.png for the browser and "Long Light.ico" for Windows.
import math
import os
import random
from PIL import Image, ImageChops, ImageDraw, ImageFilter

ROOT = os.path.join(os.path.dirname(__file__), '..')
SS = 1024


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def gradient(draw, y0, y1, stops):
    for y in range(y0, y1):
        t = (y - y0) / max(1, y1 - y0 - 1)
        for i in range(len(stops) - 1):
            a, ca = stops[i]
            b, cb = stops[i + 1]
            if a <= t <= b:
                draw.line([(0, y), (SS, y)], fill=lerp(ca, cb, (t - a) / (b - a)))
                break


def paint(detail):
    """detail 0 is for the tiniest sizes: bold shapes only, and a bigger boat."""
    img = Image.new('RGB', (SS, SS))
    d = ImageDraw.Draw(img)
    hz = int(SS * 0.62)

    gradient(d, 0, hz, [(0, (58, 40, 120)), (0.42, (150, 58, 128)), (0.72, (232, 96, 84)), (0.9, (248, 148, 70)), (1, (255, 196, 96))])
    gradient(d, hz, SS, [(0, (238, 128, 72)), (0.3, (160, 70, 120)), (1, (34, 24, 74))])

    # Clouds as loose dabs of rose and gold.
    rnd = random.Random(7)
    if detail > 0:
        for _ in range(70):
            x = rnd.randint(-60, SS)
            y = int(SS * (0.1 + rnd.random() * 0.42))
            w = rnd.randint(70, 280)
            h = rnd.randint(8, 22)
            col = lerp((255, 170, 120), (205, 90, 140), rnd.random())
            layer = Image.new('RGBA', (SS, SS), (0, 0, 0, 0))
            ImageDraw.Draw(layer).ellipse([x, y, x + w, y + h], fill=col + (rnd.randint(45, 120),))
            img.paste(layer, (0, 0), layer)

    # The sun, with its glow, cut by the horizon.
    cx, r = int(SS * 0.5), int(SS * (0.2 if detail else 0.24))
    glow = Image.new('RGBA', (SS, SS), (0, 0, 0, 0))
    ImageDraw.Draw(glow).ellipse([cx - r * 2, hz - r * 2, cx + r * 2, hz + r * 2], fill=(255, 190, 110, 150))
    glow = glow.filter(ImageFilter.GaussianBlur(SS * 0.07))
    img.paste(glow, (0, 0), glow)
    sun = Image.new('RGBA', (SS, SS), (0, 0, 0, 0))
    ImageDraw.Draw(sun).ellipse([cx - r, hz - r, cx + r, hz + r], fill=(255, 236, 170, 255))
    ImageDraw.Draw(sun).rectangle([0, hz, SS, SS], fill=(0, 0, 0, 0))
    img.paste(sun, (0, 0), sun)

    # The burning path on the water, breaking up towards the viewer.
    d = ImageDraw.Draw(img)
    rows = 9 if detail else 5
    for i in range(rows):
        t = i / max(1, rows - 1)
        y = hz + int(SS * 0.02) + int(SS * 0.34 * t)
        w = int(r * (1.05 - 0.45 * t) * (1 if i % 2 else 0.72))
        h = int(SS * (0.012 + 0.012 * t))
        d.rounded_rectangle([cx - w, y, cx + w, y + h], radius=h // 2, fill=lerp((255, 226, 150), (246, 150, 96), t))

    # Boat and figure, in silhouette.
    ink = (32, 20, 40)
    scale = 1.0 if detail else 1.32
    bx, by = cx, int(SS * 0.735)
    w = int(SS * 0.27 * scale)
    h = int(SS * 0.075 * scale)
    d.chord([bx - w, by - h, bx + w, by + h], 0, 180, fill=ink)
    d.polygon([(bx + w - 2, by + 2), (bx + int(w * 1.1), by - int(h * 0.42)), (bx + int(w * 0.8), by + int(h * 0.3))], fill=ink)
    # Body.
    bw = int(SS * 0.042 * scale)
    bh = int(SS * 0.135 * scale)
    d.rounded_rectangle([bx - bw, by - bh, bx + bw, by + int(h * 0.3)], radius=bw // 2, fill=ink)
    # Head and straw hat, in the sunlit colour so the shape reads.
    hy = by - bh - int(SS * 0.018 * scale)
    d.ellipse([bx - int(SS * 0.032 * scale), hy - int(SS * 0.032 * scale), bx + int(SS * 0.032 * scale), hy + int(SS * 0.03 * scale)], fill=ink)
    hat = (214, 150, 70)
    bw2 = int(SS * 0.098 * scale)
    d.ellipse([bx - bw2, hy - int(SS * 0.04 * scale), bx + bw2, hy - int(SS * 0.002 * scale)], fill=hat)
    cw = int(SS * 0.046 * scale)
    d.chord([bx - cw, hy - int(SS * 0.098 * scale), bx + cw, hy - int(SS * 0.002 * scale)], 180, 360, fill=hat)
    # Rod and line, at sizes where they can be seen.
    if detail > 0:
        start = (bx + int(SS * 0.03), by - int(bh * 0.55))
        end = (bx + int(SS * 0.33), by - int(SS * 0.27))
        mid = (bx + int(SS * 0.2), by - int(SS * 0.235))
        pts = []
        for i in range(21):
            t = i / 20
            x = (1 - t) ** 2 * start[0] + 2 * (1 - t) * t * mid[0] + t * t * end[0]
            y = (1 - t) ** 2 * start[1] + 2 * (1 - t) * t * mid[1] + t * t * end[1]
            pts.append((x, y))
        d.line(pts, fill=ink, width=max(6, int(SS * 0.009)), joint='curve')
        d.line([end, (end[0] + int(SS * 0.018), by + int(SS * 0.05))], fill=(250, 232, 196), width=max(3, int(SS * 0.003)))
        by2 = by + int(SS * 0.05)
        d.ellipse([end[0] + int(SS * 0.008), by2 - 9, end[0] + int(SS * 0.03), by2 + 11], fill=(224, 60, 44))

    # Canvas grain and brush drift at larger sizes.
    if detail > 0:
        noise = Image.effect_noise((SS, SS), 22).convert('L').filter(ImageFilter.GaussianBlur(1.2))
        tint = Image.merge('RGB', (noise, noise, noise))
        img = ImageChops.overlay(img, tint)

    # Rounded corners.
    mask = Image.new('L', (SS, SS), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, SS - 1, SS - 1], radius=int(SS * 0.19), fill=255)
    out = Image.new('RGBA', (SS, SS), (0, 0, 0, 0))
    out.paste(img, (0, 0), mask)
    return out


big = paint(1)
small = paint(0)


def at(size):
    src = big if size >= 48 else small
    return src.resize((size, size), Image.LANCZOS)


os.makedirs(os.path.join(ROOT, 'assets'), exist_ok=True)
for s in (16, 32, 64, 192, 512):
    at(s).save(os.path.join(ROOT, 'assets', f'icon-{s}.png'))
sizes = [256, 128, 64, 48, 32, 24, 16]
imgs = [at(s) for s in sizes]
imgs[0].save(os.path.join(ROOT, 'Long Light.ico'), format='ICO', append_images=imgs[1:], sizes=[(s, s) for s in sizes])

sheet = Image.new('RGBA', (900, 300), (40, 36, 44, 255))
x = 10
for s in (256, 128, 64, 48, 32, 16):
    i = at(s)
    sheet.paste(i, (x, 20), i)
    x += s + 14
sheet.save(os.path.join(ROOT, 'assets', '_preview.png'))
print('icons written')
