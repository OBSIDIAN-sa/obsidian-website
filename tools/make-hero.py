#!/usr/bin/env python3
"""Hero: the showroom render (tools/hero-source.png, supplied by the owner) + its line drawing.

Writes the hero photo derivatives in AVIF/WebP/JPEG (one frame for every screen; tall screens show its middle)
and the inline SVG drawing (traced by hand over the frame, so drawing and photo register) to tools/hero-drawing.svg.
The page inlines that SVG inside .hero__frame; re-run and re-paste if the frame changes.

Dev-only. Needs python3, pillow (with AVIF). Run from the repo root:  python3 tools/make-hero.py
"""
import importlib.util, math, os
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'tools', 'hero-source.png')
W, H = 1390, 752

spec = importlib.util.spec_from_file_location('clips', os.path.join(ROOT, 'tools', 'make-clips.py'))
clips = importlib.util.module_from_spec(spec); spec.loader.exec_module(clips)
L, E, R = clips.L, clips.E, clips.R

# The showroom, in frame coordinates. 1 = structure (heavier line), 0 = detail.
STROKES = [
    # left wall: glass display cabinets
    (1, L(85, 8, 510, 238, 540, 243, 540, 270)), (1, L(82, 0, 82, 752)), (1, L(88, 12, 208, 82, 300, 135)), (1, L(208, 82, 208, 752)), (1, L(300, 135, 300, 690, 208, 752)),
    (0, L(0, 285, 82, 285)), (0, L(0, 398, 82, 398)), (0, L(0, 512, 82, 512)), (0, L(0, 612, 82, 612)),
    (0, L(95, 285, 205, 300)), (0, L(95, 398, 205, 390)), (0, L(95, 512, 205, 490)), (0, L(95, 612, 205, 570)),
    (0, L(215, 225, 295, 240)), (0, L(215, 300, 295, 310)), (0, L(215, 395, 295, 390)), (0, L(215, 480, 295, 468)), (0, L(215, 555, 295, 535)),
    # left kitchen: open shelf, uppers, counter, base units, oven tower
    (1, L(300, 135, 490, 252, 490, 300)), (1, L(300, 238, 490, 300)), (0, L(392, 190, 392, 270)), (0, L(448, 223, 448, 287)),
    (1, L(300, 400, 460, 392, 460, 292)), (0, L(345, 255, 345, 398)), (0, L(383, 268, 383, 396)), (0, L(414, 278, 414, 394)), (0, L(440, 286, 440, 393)),
    (1, L(300, 508, 490, 465)), (0, L(300, 492, 490, 455)), (1, L(300, 690, 498, 565)), (0, L(352, 498, 352, 658)), (0, L(390, 490, 390, 632)), (0, L(450, 476, 450, 595)), (0, L(392, 558, 450, 527)),
    (1, L(492, 300, 492, 565)), (1, L(515, 250, 515, 500)), (0, L(492, 362, 514, 358, 514, 495, 492, 500, 492, 362)),
    # slatted screen, islands
    (1, L(535, 520, 535, 270, 645, 270, 645, 440)), (1, L(557, 270, 557, 500)), (0, L(568, 270, 568, 470)), (0, L(590, 270, 590, 460)), (0, L(603, 270, 603, 455)), (0, L(625, 270, 625, 440)),
    (1, L(590, 470, 590, 500, 685, 500, 695, 456, 600, 458, 590, 470)), (0, L(652, 432, 697, 432, 697, 470)),
    # table and chairs
    (1, L(492, 572, 600, 490, 698, 490, 650, 572, 492, 572)), (0, L(492, 572, 492, 582, 650, 582, 650, 572)), (1, L(560, 582, 560, 690, 640, 690, 640, 582)),
    (0, L(468, 527, 492, 518, 496, 560, 470, 570, 468, 527)), (0, L(470, 570, 446, 672)), (0, L(470, 585, 545, 590)), (0, L(533, 600, 537, 675)),
    (0, L(505, 512, 527, 500, 530, 540, 508, 548, 505, 512)),
    (0, L(742, 495, 748, 545)), (0, L(700, 540, 750, 545)), (0, L(685, 590, 685, 668)), (0, L(745, 560, 777, 668)), (0, L(712, 600, 712, 668)),
    # back wall: door, TV wall
    (1, L(650, 281, 862, 281)), (0, R(695, 352, 750, 448)), (0, R(715, 375, 730, 412)),
    (1, L(755, 448, 755, 315, 850, 315, 850, 448)), (0, R(775, 348, 843, 388)), (0, L(770, 425, 850, 425)),
    (0, L(875, 300, 875, 480)), (0, L(884, 300, 884, 485)),
    # right wall and right kitchen
    (1, L(1280, 0, 905, 255)),
    (1, L(896, 275, 896, 498)), (0, L(910, 270, 910, 448)),
    (1, L(938, 265, 1010, 237)), (0, L(938, 265, 938, 378)), (0, L(955, 258, 955, 378)), (0, L(992, 244, 992, 380)), (1, L(938, 378, 1010, 380)),
    (1, L(1012, 212, 1012, 480)), (1, L(1012, 212, 1093, 172, 1093, 255)), (1, E(1052, 262, 40, 65, 180, 360)), (1, L(1092, 262, 1092, 498)),
    (0, L(1014, 326, 1092, 312)), (0, L(1014, 390, 1092, 385)),
    (1, L(1100, 400, 1100, 165, 1168, 140, 1168, 400, 1100, 400)), (1, L(1097, 403, 1170, 408, 1170, 532, 1097, 505, 1097, 403)),
    (1, L(1172, 692, 1172, 130, 1260, 130, 1260, 692)),
    (1, L(896, 448, 1097, 505)), (0, L(912, 440, 990, 440)), (1, L(896, 500, 1170, 712)),
    (0, L(918, 453, 918, 518)), (0, L(960, 464, 960, 550)), (0, L(990, 472, 990, 572)), (0, L(1012, 480, 1012, 590)), (0, L(1050, 492, 1050, 620)), (0, L(1095, 505, 1095, 655)), (0, L(1170, 532, 1170, 712)),
    (0, L(930, 457, 958, 465, 958, 546, 930, 525, 930, 457)),
    # planter
    (1, L(1242, 535, 1250, 752)), (1, L(1362, 545, 1355, 752)), (1, E(1302, 538, 60, 12)),
    (0, L(1300, 530, 1262, 225, 1290, 400)), (0, L(1310, 530, 1345, 232)), (0, L(1300, 530, 1200, 345)), (0, L(1320, 530, 1378, 262)), (0, L(1295, 530, 1240, 290)),
    # ceiling lights
    (0, L(532, 42, 548, 42, 573, 98, 558, 98, 532, 42)), (0, L(840, 42, 878, 42, 855, 95, 825, 95, 840, 42)),
]

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
    assert src.size == (W, H), src.size
    img = os.path.join(ROOT, 'assets', 'img')
    for w in (1200, W):
        save(src if w == W else src.resize((w, round(w * H / W)), Image.LANCZOS), os.path.join(img, f'hero-{w}'))
    for e in ('.jpg', '.webp', '.avif'):
        p = os.path.join(img, 'hero-2000' + e)
        if os.path.exists(p): os.remove(p)
    with open(os.path.join(ROOT, 'tools', 'hero-drawing.svg'), 'w') as f:
        f.write(svg() + '\n')
    print(len(STROKES), 'strokes')
