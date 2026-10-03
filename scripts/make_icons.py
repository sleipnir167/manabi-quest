"""アプリアイコン（PNG）を生成する: python3 scripts/make_icons.py"""
from PIL import Image, ImageDraw, ImageFilter
import os

OUT = os.path.join(os.path.dirname(__file__), '..', 'public', 'icons')
os.makedirs(OUT, exist_ok=True)
S = 1024


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def background():
    img = Image.new('RGB', (S, S))
    px = img.load()
    c1, c2 = (124, 108, 246), (79, 70, 229)
    for y in range(S):
        for x in range(S):
            t = (x + y) / (2 * S)
            px[x, y] = lerp(c1, c2, t)
    # やわらかいハイライト
    glow = Image.new('L', (S, S), 0)
    ImageDraw.Draw(glow).ellipse((-200, -260, 700, 560), fill=90)
    glow = glow.filter(ImageFilter.GaussianBlur(120))
    white = Image.new('RGB', (S, S), (255, 255, 255))
    return Image.composite(white, img, glow)


def owl(img, scale, cx, cy):
    d = ImageDraw.Draw(img)
    k = scale

    def P(x, y):
        return (cx + (x - 60) * k, cy + (y - 62) * k)

    def E(x0, y0, x1, y1, **kw):
        a, b = P(x0, y0), P(x1, y1)
        d.ellipse((a[0], a[1], b[0], b[1]), **kw)

    # 影
    E(33, 111, 87, 119, fill=(40, 30, 120))
    # つばさ
    d.polygon([P(24, 62), P(15, 72), P(12, 86), P(17, 98), P(26, 90)], fill=(58, 44, 170))
    d.polygon([P(96, 62), P(105, 72), P(108, 86), P(103, 98), P(94, 90)], fill=(58, 44, 170))
    # 体（白いふちどりで背景から浮かせる）
    E(17, 19, 103, 115, fill=(236, 232, 255))
    E(20, 22, 100, 112, fill=(150, 138, 255))
    E(23, 34, 97, 112, fill=(128, 112, 250))
    # おなか
    E(36, 69, 84, 109, fill=(241, 237, 255))
    # 顔
    E(27.5, 41.5, 60.5, 74.5, fill=(238, 233, 255))
    E(59.5, 41.5, 92.5, 74.5, fill=(238, 233, 255))
    # 目
    E(33, 47, 55, 69, fill=(255, 255, 255))
    E(65, 47, 87, 69, fill=(255, 255, 255))
    E(39.2, 53.2, 50.8, 64.8, fill=(27, 35, 64))
    E(71.2, 53.2, 82.8, 64.8, fill=(27, 35, 64))
    E(45.5, 54, 49.5, 58, fill=(255, 255, 255))
    E(77.5, 54, 81.5, 58, fill=(255, 255, 255))
    # くちばし
    d.polygon([P(60, 65), P(54, 72), P(60, 76), P(66, 72)], fill=(255, 176, 32))
    # 帽子
    d.polygon([P(60, 6), P(97, 19), P(60, 32), P(23, 19)], fill=(27, 35, 64))
    d.polygon([P(39, 24), P(81, 24), P(81, 32), P(60, 38), P(39, 32)], fill=(43, 53, 102))
    d.line([P(95, 20), P(95, 34)], fill=(255, 176, 32), width=int(3 * k))
    E(91.2, 32.2, 98.8, 39.8, fill=(255, 176, 32))


def make(size, name, owl_scale=7.0, rounded=False):
    big = background()
    owl(big, owl_scale, S / 2, S / 2 + 20)
    if rounded:
        mask = Image.new('L', (S, S), 0)
        ImageDraw.Draw(mask).rounded_rectangle((0, 0, S, S), radius=int(S * 0.22), fill=255)
        out = Image.new('RGBA', (S, S), (0, 0, 0, 0))
        out.paste(big, (0, 0), mask)
        big = out
    big.resize((size, size), Image.LANCZOS).save(os.path.join(OUT, name))
    print('wrote', name)


make(512, 'icon-512.png', 7.0)
make(192, 'icon-192.png', 7.0)
make(512, 'icon-maskable-512.png', 5.4)
make(180, 'apple-touch-icon.png', 6.6)
