#!/usr/bin/env python3
"""Hero: the wide kitchen frame (film-2) + its line drawing.

Writes the hero photo derivatives in AVIF/WebP/JPEG (one 16:9 frame; tall screens crop to its kitchen side in CSS) and prints the
inline SVG drawing (traced by hand over the frame, so drawing and photo register) to tools/hero-drawing.svg.
The page inlines that SVG inside .hero__frame; re-run and re-paste if the frame changes.

Dev-only. Needs python3, pillow (with AVIF). Run from the repo root:  python3 tools/make-hero.py
"""
import importlib.util, math, os
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'assets', 'img', 'film-2-2000.jpg')
W, H = 2000, 1125

spec = importlib.util.spec_from_file_location('clips', os.path.join(ROOT, 'tools', 'make-clips.py'))
clips = importlib.util.module_from_spec(spec); spec.loader.exec_module(clips)
L, E = clips.L, clips.E

def from_card(pts):
    """Card-still coordinates (960x640 crop used by the interior clip) -> full-frame coordinates."""
    r = max(960 / 1120, 640 / 934)
    return [(880 + x / r, 112 + (y + 80) / r) for x, y in pts]

# Left half of the frame (stair, bulkhead, dining table, windows), in full-frame coordinates
LEFT = [
    (1, L(0, 140, 545, 140, 850, 460)), (1, L(0, 262, 660, 262)), (0, L(200, 140, 660, 262)), (0, L(555, 350, 745, 350)),
    (1, L(100, 1020, 100, 730, 425, 420)), (1, L(425, 388, 700, 388, 700, 438, 565, 440, 185, 1000, 100, 1020)), (0, L(100, 730, 520, 330)),
    (0, L(0, 790, 100, 790)), (0, L(0, 840, 100, 840)), (0, L(0, 895, 100, 895)), (0, L(0, 965, 100, 965)),
    (0, L(260, 580, 292, 580)), (0, L(298, 545, 328, 545)), (0, L(335, 510, 362, 510)), (0, L(370, 472, 397, 472)),
    (1, L(550, 470, 905, 470)), (0, L(585, 470, 585, 765)), (0, L(655, 470, 655, 770)), (1, L(755, 470, 755, 770)), (0, L(900, 470, 900, 770)), (0, L(585, 767, 900, 767)),
    (1, E(590, 790, 175, 40)), (0, L(515, 828, 515, 950)), (0, L(600, 830, 600, 958)), (0, E(557, 950, 44, 12, 0, 180)),
    (0, E(400, 792, 65, 22, 180, 360)), (0, E(425, 850, 60, 18)), (0, L(345, 822, 340, 935)), (0, L(480, 868, 480, 950)),
    (0, E(715, 776, 55, 22, 180, 360)), (0, E(700, 826, 50, 15)), (0, L(650, 850, 650, 958)), (0, L(750, 802, 755, 948)),
    (0, E(490, 746, 50, 14, 180, 360)), (0, E(665, 726, 52, 14, 180, 360)),
    (0, L(618, 360, 618, 522)), (0, E(618, 536, 60, 14)),
    (0, L(160, 1020, 800, 1020, 872, 838)),
]
STROKES = LEFT + [(w, from_card(p)) for w, p in clips.INTERIOR]

def path(pts):
    return 'M' + ' L'.join(f'{x:.0f} {y:.0f}' for x, y in pts)

def svg():
    out = []
    for w, pts in STROKES:
        cx = sum(p[0] for p in pts) / len(pts) / W
        delay = 0.15 + 1.5 * cx + (0 if w else 0.45)
        out.append(f'<path class="{"a" if w else "b"}" pathLength="1" style="--d:{delay:.2f}s" d="{path(pts)}"/>')
    return (f'<svg class="hero__draw" viewBox="0 0 {W} {H}" preserveAspectRatio="xMidYMid slice" fill="none" '
            f'aria-hidden="true" focusable="false">' + ''.join(out) + '</svg>')

def save(im, base, q=(80, 78, 52)):
    im.save(base + '.jpg', quality=q[0], progressive=True, optimize=True)
    im.save(base + '.webp', quality=q[1], method=6)
    im.save(base + '.avif', quality=q[2], speed=4)
    print(os.path.basename(base), im.size, *(os.path.getsize(base + e) // 1024 for e in ('.jpg', '.webp', '.avif')), 'KB')

if __name__ == '__main__':
    src = Image.open(SRC).convert('RGB')
    img = os.path.join(ROOT, 'assets', 'img')
    for w in (1200, 2000):
        save(src if w == W else src.resize((w, round(w * H / W)), Image.LANCZOS), os.path.join(img, f'hero-{w}'))
    with open(os.path.join(ROOT, 'tools', 'hero-drawing.svg'), 'w') as f:
        f.write(svg() + '\n')
    print(len(STROKES), 'strokes')
