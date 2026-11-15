"""Generate app icon concepts as 512x512 SVGs (isometric voxel art)."""
import math, os, random

OUT = os.path.dirname(os.path.abspath(__file__))
COS30 = math.cos(math.pi / 6)


def hexrgb(h):
    h = h.lstrip('#')
    return [int(h[i:i + 2], 16) for i in (0, 2, 4)]


def shade(h, f):
    r, g, b = hexrgb(h)
    c = lambda v: max(0, min(255, round(v * f)))
    return '#%02x%02x%02x' % (c(r), c(g), c(b))


class Iso:
    """Isometric projection: +x goes right-down, +y left-down, +z up."""

    def __init__(self, cx, cy, s):
        self.cx, self.cy, self.s = cx, cy, s

    def p(self, x, y, z):
        return (self.cx + (x - y) * self.s * COS30, self.cy + (x + y) * self.s * 0.5 - z * self.s)


def poly(pts, fill, stroke=True):
    d = ' '.join('%.2f,%.2f' % p for p in pts)
    st = f' stroke="{fill}" stroke-width="0.8" stroke-linejoin="round"' if stroke else ''
    return f'<polygon points="{d}" fill="{fill}"{st}/>'


FACE = {'top': 1.0, 'left': 0.80, 'right': 0.64}


def voxels_svg(iso, vox):
    """vox: dict (x,y,z) -> color. Draws visible faces back to front."""
    out = []
    for (x, y, z) in sorted(vox, key=lambda v: (v[0] + v[1] + v[2], v[2])):
        c = vox[(x, y, z)]
        P = lambda a, b, cc: iso.p(x + a, y + b, z + cc)
        if (x, y, z + 1) not in vox:
            out.append(poly([P(0, 0, 1), P(1, 0, 1), P(1, 1, 1), P(0, 1, 1)], shade(c, FACE['top'])))
        if (x, y + 1, z) not in vox:
            out.append(poly([P(0, 1, 0), P(1, 1, 0), P(1, 1, 1), P(0, 1, 1)], shade(c, FACE['left'])))
        if (x + 1, y, z) not in vox:
            out.append(poly([P(1, 0, 0), P(1, 1, 0), P(1, 1, 1), P(1, 0, 1)], shade(c, FACE['right'])))
    return '\n'.join(out)


def grass_block(n, ox=0, oy=0, oz=0, seed=1, drip=True):
    """An n^3 grass block made of pixels: grass top (with drips), dirt body."""
    rnd = random.Random(seed)
    greens = ['#6cbf4a', '#79cc55', '#5fb041', '#83d65f']
    dirts = ['#8a5a35', '#7a4e2c', '#94653d', '#6f4627']
    vox = {}
    for x in range(n):
        for y in range(n):
            for z in range(n):
                edge = x == n - 1 or y == n - 1
                depth = n - 1 - z
                grassy = depth == 0 or (drip and edge and depth == 1 and rnd.random() < 0.45)
                vox[(ox + x, oy + y, oz + z)] = rnd.choice(greens if grassy else dirts)
    return vox


def stone_block(n, seed=1):
    """An n^3 stone block, mossy on top and dripping moss down the sides."""
    rnd = random.Random(seed)
    stones = ['#8b8f98', '#7d818b', '#969aa3', '#727680']
    moss = ['#5f9a3e', '#6dab48', '#4f8a33']
    vox = {}
    for x in range(n):
        for y in range(n):
            for z in range(n):
                depth = n - 1 - z
                edge = x == n - 1 or y == n - 1
                mossy = (depth == 0 and rnd.random() < 0.55) or (edge and depth == 1 and rnd.random() < 0.3)
                vox[(x, y, z)] = rnd.choice(moss if mossy else stones)
    return vox


def svg(body, defs='', view='0 0 512 512'):
    w, h = view.split()[2:]
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="{view}" width="{w}" height="{h}">
<defs>{defs}</defs>
{body}
</svg>
'''


def pixels(grid, palette, x0, y0, px):
    """2D pixel art: grid rows of palette keys ('.' = empty)."""
    out = []
    for r, row in enumerate(grid):
        for c, k in enumerate(row):
            if k == '.':
                continue
            out.append(f'<rect x="{x0 + c * px}" y="{y0 + r * px}" width="{px + 0.5}" height="{px + 0.5}" fill="{palette[k]}"/>')
    return '\n'.join(out)


# ── A: Rift ──────────────────────────────────────────────
def icon_rift(mark=False):
    """The Riftholm icon; mark=True drops the background for use as a logo."""
    defs = '''<radialGradient id="bg" cx="50%" cy="40%" r="75%">
  <stop offset="0" stop-color="#2a2350"/><stop offset="1" stop-color="#0d0b1a"/></radialGradient>
<radialGradient id="portal" cx="50%" cy="50%" r="50%">
  <stop offset="0" stop-color="#ffffff"/><stop offset="0.3" stop-color="#e2c9ff"/><stop offset="0.75" stop-color="#9b5cff"/><stop offset="1" stop-color="#5a2bb0"/></radialGradient>
<radialGradient id="halo" cx="50%" cy="50%" r="50%">
  <stop offset="0" stop-color="#9b5cff" stop-opacity="0.45"/><stop offset="1" stop-color="#9b5cff" stop-opacity="0"/></radialGradient>'''
    rnd = random.Random(5)
    vox = {}
    N = 8
    greens = ['#6cbf4a', '#79cc55', '#5fb041', '#83d65f']
    dirts = ['#8a5a35', '#7a4e2c', '#94653d']
    stones = ['#8b8f98', '#7a7e87', '#6d717b']
    corrupt = ['#8a4fd8', '#a46cf0', '#6e3cc0']
    mid = (N - 1) / 2

    def inside(x, y, inset):
        # rounded square footprint, shrinking by `inset` per layer
        dx, dy = abs(x - mid), abs(y - mid)
        r = mid + 0.5 - inset
        return dx < r and dy < r and dx + dy < r * 1.55

    for x in range(N):
        for y in range(N):
            if not inside(x, y, 0):
                continue
            d = math.hypot(x - mid, y - mid)
            # grass turns rift-purple near the portal
            top = rnd.choice(corrupt) if d < 1.6 or (d < 2.4 and rnd.random() < 0.4) else rnd.choice(greens)
            vox[(x, y, 1)] = top
            vox[(x, y, 0)] = rnd.choice(dirts)
    # the island tapers to a point underneath
    for z, inset in [(-1, 0.6), (-2, 1.3), (-3, 2.1), (-4, 2.9)]:
        for x in range(N):
            for y in range(N):
                if inside(x, y, inset):
                    vox[(x, y, z)] = rnd.choice(stones if z < -1 or rnd.random() < 0.7 else dirts)
    # details: tufts and rocks on the rim
    for (x, y, c) in []:
        if (x, y, 1) in vox:
            vox[(x, y, 2)] = c

    s_ = 24
    top_y = 292  # screen y of the island's top center
    iso = Iso(256, top_y + 2 * s_ - N * s_ * 0.5, s_)
    body = ''
    if not mark:
        body += '<rect width="512" height="512" fill="url(#bg)"/>\n'
        for (x, y) in [(110, 120), (400, 96), (150, 70), (420, 210), (92, 230), (368, 150)]:
            body += f'<rect x="{x}" y="{y}" width="7" height="7" fill="#c9a8ff" opacity="0.8"/>\n'
    body += voxels_svg(iso, vox)
    # rift light spilling onto the ground

    # The rift: a ring of purple voxel pixels around a glowing core, standing on the island
    R = 88
    cx, cy = 256, top_y - R - 4
    body += f'<ellipse cx="{cx}" cy="{cy}" rx="{R * 1.05}" ry="{R * 1.2}" fill="url(#halo)"/>\n'
    body += f'<ellipse cx="{cx}" cy="{cy}" rx="{R * 0.6}" ry="{R * 0.98}" fill="url(#portal)"/>\n'
    px = 15
    for i in range(28):
        a = i / 28 * math.tau
        x, y = cx + math.cos(a) * R * 0.62, cy + math.sin(a) * R
        col = ['#7b3fe4', '#9b5cff', '#b88bff', '#5a2bb0'][i % 4]
        body += f'<rect x="{x - px / 2:.1f}" y="{y - px / 2:.1f}" width="{px}" height="{px}" fill="{col}"/>\n'
    # sparks drifting out
    for (x, y, sz) in [(334, 128, 10), (172, 150, 8), (346, 238, 7), (162, 248, 9), (300, 96, 6)]:
        body += f'<rect x="{x}" y="{y}" width="{sz}" height="{sz}" fill="#e7d4ff"/>\n'
    return svg(body, defs, '84 84 344 368' if mark else '0 0 512 512')


# ── B: Block & Blade ─────────────────────────────────────────
SWORD = [
    '....W....',
    '...WSW...',
    '...WSW...',
    '...WSW...',
    '...WSW...',
    '...WSW...',
    '...WSW...',
    '...WSW...',
    '...WSW...',
    '.GGGGGGG.',
    'GGgGGGgGG',
    '....H....',
    '....H....',
    '....h....',
    '...GPG...',
    '....G....',
]


def icon_blade():
    defs = '''<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#3a2f63"/><stop offset="1" stop-color="#151226"/></linearGradient>
<radialGradient id="glow" cx="50%" cy="50%" r="50%">
  <stop offset="0" stop-color="#f2c14e" stop-opacity="0.55"/><stop offset="1" stop-color="#f2c14e" stop-opacity="0"/></radialGradient>'''
    body = '<rect width="512" height="512" fill="url(#bg)"/>\n'
    body += '<circle cx="256" cy="210" r="190" fill="url(#glow)"/>\n'
    body += '<ellipse cx="256" cy="442" rx="132" ry="22" fill="#000" opacity="0.4"/>\n'
    iso = Iso(256, 236, 24)
    body += voxels_svg(iso, stone_block(6, seed=7))
    # Sword point-down into the top face, flipped vertically
    pal = {'W': '#e9eef5', 'S': '#a9b6c8', 'G': '#f2c14e', 'g': '#a8711f', 'H': '#6b4226', 'h': '#4a2d18', 'P': '#e5484d'}
    px = 13
    flipped = SWORD[::-1]
    sx = 256 - 4.5 * px
    sy = 238 - 13 * px  # blade tip buried in the top face
    body += pixels(flipped, pal, sx, sy, px)
    # dirt kicked up where it entered
    for dx, dy in [(-34, 240), (30, 244), (-14, 250)]:
        body += f'<rect x="{256 + dx}" y="{dy}" width="10" height="10" fill="#6d717b"/>\n'
    return svg(body, defs)


# ── C: Hearth (little settlement island) ─────────────────────
def icon_hearth():
    defs = '''<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#2b3a7a"/><stop offset="0.55" stop-color="#c8607a"/><stop offset="1" stop-color="#f2a65a"/></linearGradient>'''
    rnd = random.Random(11)
    vox = {}
    N = 7
    greens = ['#6cbf4a', '#79cc55', '#5fb041']
    dirts = ['#8a5a35', '#7a4e2c', '#94653d']
    stones = ['#8b8f98', '#7a7e87']
    for x in range(N):
        for y in range(N):
            if (x in (0, N - 1)) and (y in (0, N - 1)):
                continue  # rounded corners
            h = 2
            for z in range(h):
                vox[(x, y, z)] = rnd.choice(dirts if z < h - 1 else greens)
            vox[(x, y, -1)] = rnd.choice(stones)
    # house: walls 3x3x2 at (1..3, 1..3)
    wood, wood2 = '#b07a45', '#9a6638'
    for x in range(1, 4):
        for y in range(1, 4):
            for z in (2, 3):
                vox[(x, y, z)] = wood if (x + y + z) % 2 else wood2
    vox[(2, 3, 2)] = '#3a2414'  # door (on +y face)
    vox[(3, 2, 3)] = '#ffd977'  # lit window (on +x face)
    # roof: stepped
    roof, roof2 = '#c2453c', '#a8342e'
    for x in range(0, 5):
        for y in range(0, 5):
            if 0 <= x <= 4 and 0 <= y <= 4:
                vox[(x, y, 4)] = roof if (x + y) % 2 else roof2
    for x in range(1, 4):
        for y in range(1, 4):
            vox[(x, y, 5)] = roof2 if (x + y) % 2 else roof
    vox[(2, 2, 6)] = roof
    # tree
    for z in (2, 3, 4):
        vox[(5, 1, z)] = '#6b4226'
    for x in (4, 5, 6):
        for y in (0, 1, 2):
            for z in (5, 6):
                if (x, y) in ((4, 0), (6, 2)) and z == 6:
                    continue
                if 0 <= x < N and 0 <= y < N or True:
                    vox[(x, y, z)] = rnd.choice(['#3c7c27', '#4f9a34', '#468d2e'])
    vox[(5, 1, 7)] = '#4f9a34'
    # campfire
    vox[(5, 5, 2)] = '#5b3a22'
    vox[(5, 5, 3)] = '#ff8a1a'
    vox[(5, 5, 4)] = '#ffd34a'
    iso = Iso(252, 214, 23)
    body = '<rect width="512" height="512" fill="url(#bg)"/>\n'
    # stars
    for (x, y) in [(70, 80), (140, 46), (420, 70), (452, 150), (96, 160), (370, 36)]:
        body += f'<rect x="{x}" y="{y}" width="6" height="6" fill="#fff6d8" opacity="0.85"/>\n'
    body += '<circle cx="256" cy="330" r="150" fill="#ffd977" opacity="0.12"/>\n'
    body += voxels_svg(iso, vox)
    return svg(body, defs)


# ── D: Hero ──────────────────────────────────────────────────
HERO = [
    '................',
    '....HHHHHHHH....',
    '...HHHHHHHHHH...',
    '..HHHHHHHHHHHH..',
    '..HHhhhhhhhhHH..',
    '..HSSSSSSSSSSH..',
    '..HSSSSSSSSSSH..',
    '..SSEeSSSSEeSS..',
    '..SSEeSSSSEeSS..',
    '..SSSSSSSSSSSS..',
    '..sSSSSmmSSSSs..',
    '...SSSSSSSSSS...',
    '..CCBBBBBBBBCC..',
    '.CCBBBTTTTBBBCC.',
    '.CBBBBBTTBBBBBC.',
    '.CBBLBBBBBBBBBC.',
]


def icon_hero():
    defs = '''<radialGradient id="bg" cx="50%" cy="38%" r="75%">
  <stop offset="0" stop-color="#ffd977"/><stop offset="1" stop-color="#d9962e"/></radialGradient>'''
    pal = {
        'H': '#6b4226', 'h': '#5a3720', 'S': '#f0c39a', 's': '#d9a67c', 'E': '#ffffff', 'e': '#2a3a5a',
        'm': '#b9705a', 'B': '#3f6fd8', 'T': '#e2b955', 'C': '#a8342e', 'L': '#5b3a22',
    }
    body = '<rect width="512" height="512" fill="url(#bg)"/>\n'
    # sunburst rays
    for i in range(12):
        a = i * math.pi / 6
        x1, y1 = 256 + math.cos(a - 0.12) * 400, 230 + math.sin(a - 0.12) * 400
        x2, y2 = 256 + math.cos(a + 0.12) * 400, 230 + math.sin(a + 0.12) * 400
        body += f'<polygon points="256,230 {x1:.1f},{y1:.1f} {x2:.1f},{y2:.1f}" fill="#fff3c4" opacity="0.18"/>\n'
    px = 18
    x0 = 256 - 8 * px
    y0 = 256 - 8 * px + 20
    # outline: draw the art offset in dark, then the art
    dark = {k: '#2a1b06' for k in pal}
    for dx, dy in [(-6, 0), (6, 0), (0, -6), (0, 6)]:
        body += pixels(HERO, dark, x0 + dx, y0 + dy, px)
    body += pixels(HERO, pal, x0, y0, px)
    return svg(body, defs)


def export(dest):
    """Write the shipped icon files into dest (public/icons)."""
    with open(os.path.join(dest, 'icon.svg'), 'w') as f:
        f.write(icon_rift())
    with open(os.path.join(dest, 'rift-mark.svg'), 'w') as f:
        f.write(icon_rift(mark=True))


if __name__ == '__main__':
    import sys
    if len(sys.argv) > 1:
        export(sys.argv[1])
        print('exported')
        sys.exit(0)
    for name, fn in [('a-rift', icon_rift), ('b-blade', icon_blade), ('c-hearth', icon_hearth), ('d-hero', icon_hero)]:
        with open(os.path.join(OUT, f'icon-{name}.svg'), 'w') as f:
            f.write(fn())
    print('ok')
