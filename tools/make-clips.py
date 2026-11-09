#!/usr/bin/env python3
"""Service clips (drawing -> piece), built from the card stills themselves.

Each clip: the piece is drawn as a line drawing on the ink ground (traced by hand over the
still, so the drawing and the photo register), dimensions tick in, then the material arrives
across the drawing and the camera settles into the finished piece. The last frames fade back
to ink so the loop restarts cleanly.

Dev-only. Needs: python3, numpy, pillow, opencv-python, ffmpeg (libx264 + libvpx-vp9).
Run from the repo root:  python3 tools/make-clips.py [kitchen wardrobe interior]
Writes assets/video/svc-<name>.mp4 and .webm (muted, no audio track).
`--stills` also rewrites the interior card still (a crop of film-2) in all formats.
"""
import math, os, subprocess, sys
import numpy as np
import cv2
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
W, H, FPS, DUR = 960, 640, 30, 10.0
SS = 2                                   # supersample for the line work
INK = np.array([5, 5, 4], np.float32)
BONE = np.array([237, 230, 218], np.float32)
BRONZE = np.array([201, 160, 99], np.float32)
BRONZE_LT = np.array([235, 211, 164], np.float32)

def L(*p):                 # polyline from flat coords
    return [(p[i], p[i + 1]) for i in range(0, len(p), 2)]
def R(x0, y0, x1, y1):     # rectangle
    return [(x0, y0), (x1, y0), (x1, y1), (x0, y1), (x0, y0)]
def E(cx, cy, rx, ry, a0=0, a1=360, n=48):   # ellipse / arc
    return [(cx + rx * math.cos(math.radians(a0 + (a1 - a0) * k / n)), cy + ry * math.sin(math.radians(a0 + (a1 - a0) * k / n))) for k in range(n + 1)]

# Drawings, in the 960x640 frame of each still. Heavier strokes (w=1) are the carcass, lighter (w=0) the detail.
KITCHEN = [
    (1, L(0, 40, 368, 40)), (1, L(0, 66, 368, 66)), (1, L(368, 0, 368, 66)), (0, L(157, 0, 157, 40)), (0, L(133, 53, 184, 53)),
    (1, L(368, 65, 580, 65)), (1, L(580, 0, 580, 430)),
    (0, L(20, 323, 358, 323, 340, 343, 0, 343)),
    (1, L(0, 355, 580, 355)), (1, L(0, 369, 580, 369)), (0, L(387, 355, 387, 428)), (1, L(0, 420, 580, 420)), (0, L(0, 429, 580, 429)),
    (0, R(538, 222, 556, 328)), (0, L(541, 222, 541, 165)), (0, L(553, 222, 553, 160)),
    (1, R(583, 192, 877, 480)), (1, L(583, 180, 877, 180)), (0, L(583, 240, 877, 240)), (0, R(604, 248, 868, 474)),
    (1, L(640, 482, 875, 482)), (0, L(640, 495, 875, 495)), (1, L(640, 608, 873, 608)), (0, L(640, 620, 873, 620)),
    (1, L(878, 0, 878, 640)), (0, L(878, 355, 960, 355)), (0, L(878, 368, 960, 368)),
    (1, L(0, 432, 633, 432, 640, 560)), (1, L(0, 545, 623, 545)), (0, L(0, 560, 623, 560)), (0, L(192, 560, 192, 640)), (1, L(640, 482, 640, 640)),
]
WARDROBE = [
    (1, L(32, 0, 32, 640)), (1, L(243, 40, 243, 560)), (1, L(250, 48, 250, 558)), (1, L(357, 118, 357, 510)), (1, L(362, 118, 362, 510)),
    (1, L(470, 45, 470, 555)), (1, L(478, 30, 478, 570)), (1, L(712, 0, 712, 620)),
    (1, L(243, 40, 357, 118)), (1, L(243, 560, 357, 510)), (1, L(470, 45, 362, 118)), (1, L(470, 555, 362, 510)),
    (0, L(240, 0, 359, 100, 478, 0)),
    (0, L(35, 110, 200, 150)), (0, L(40, 185, 198, 210)), (0, L(35, 325, 198, 328)), (0, L(35, 395, 200, 385)), (0, L(35, 470, 180, 460)), (0, L(35, 560, 243, 548)),
    (0, L(712, 110, 525, 150)), (0, L(705, 190, 525, 212)), (0, L(705, 325, 525, 328)), (0, L(705, 395, 525, 385)), (0, L(705, 465, 525, 458)),
    (0, L(255, 190, 357, 215)), (0, L(255, 350, 357, 352)), (0, L(470, 190, 362, 215)), (0, L(470, 350, 362, 352)),
    (1, L(722, 0, 722, 640)), (1, L(768, 0, 768, 640)), (0, R(745, 410, 765, 475)),
    (0, E(915, 400, 30, 30)), (0, E(915, 400, 62, 62, 100, 260)), (0, E(915, 400, 98, 98, 108, 252)), (0, E(915, 400, 140, 140, 115, 245)), (0, E(915, 400, 190, 190, 125, 235)),
    (0, L(243, 560, 160, 640)), (0, L(357, 520, 250, 640)), (0, L(362, 520, 470, 640)), (0, L(470, 555, 560, 640)),
]
INTERIOR = [
    (1, L(250, 225, 555, 0)),
    (1, L(555, 0, 555, 640)), (1, L(630, 0, 630, 640)), (1, L(735, 0, 735, 640)), (1, L(875, 0, 875, 640)),
    (0, L(473, 60, 473, 255)), (0, L(418, 100, 418, 262)), (0, L(384, 127, 384, 640)), (0, L(340, 160, 340, 640)), (0, L(305, 185, 305, 345)), (0, L(275, 207, 275, 345)),
    (1, L(413, 275, 548, 252, 548, 640)), (1, L(413, 275, 413, 640)), (0, L(467, 308, 467, 640)), (0, L(416, 290, 536, 272)), (0, L(416, 298, 536, 281)),
    (0, L(555, 358, 738, 358)),
    (0, R(250, 343, 340, 400)), (0, L(250, 405, 340, 430)), (0, L(250, 440, 340, 490)),
    (1, L(0, 227, 250, 227)), (0, L(30, 227, 30, 480)), (0, L(160, 227, 160, 440)), (1, L(245, 227, 245, 465)),
    (0, L(173, 0, 173, 158)), (0, E(173, 178, 48, 20)), (0, E(155, 212, 36, 13)), (0, E(140, 240, 28, 10)), (0, E(132, 258, 23, 8)),
    (1, L(80, 520, 307, 520, 228, 440)), (1, R(80, 520, 307, 640)), (0, L(148, 449, 210, 449, 227, 468, 150, 468, 148, 449)), (0, L(140, 455, 140, 398, 165, 398)),
    (0, E(50, 493, 30, 8)), (0, L(28, 497, 18, 610)), (0, L(72, 497, 78, 560)), (0, E(52, 472, 26, 7)), (0, E(58, 455, 23, 6)),
]

# name -> (source image, crop box as fractions l,t,r,b or None, drawing, dimension labels (width, height) in mm)
CLIPS = {
    'kitchen':  ('assets/img/svc-kitchen-1200.jpg',  None, KITCHEN,  ('3600', '2400')),
    'wardrobe': ('assets/img/svc-wardrobe-1200.jpg', None, WARDROBE, ('2800', '2700')),
    'interior': ('assets/img/film-2-2000.jpg', (0.44, 0.10, 1.0, 0.93), INTERIOR, ('4200', '2900')),
}

def font(size):
    for p in ('/usr/share/fonts/opentype/inter/Inter-Light.otf', '/usr/share/fonts/opentype/inter/Inter-Regular.otf',
              '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'):
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()

def ease_out(x):   x = min(max(x, 0.0), 1.0); return 1 - (1 - x) ** 3
def ease_inout(x): x = min(max(x, 0.0), 1.0); return x * x * (3 - 2 * x)

def frame_image(src, box, w=W, h=H):
    im = Image.open(os.path.join(ROOT, src)).convert('RGB')
    if box:
        iw, ih = im.size
        im = im.crop((int(box[0] * iw), int(box[1] * ih), int(box[2] * iw), int(box[3] * ih)))
    r = max(w / im.width, h / im.height)
    im = im.resize((math.ceil(im.width * r), math.ceil(im.height * r)), Image.LANCZOS)
    l, t = (im.width - w) // 2, (im.height - h) // 2
    return im.crop((l, t, l + w, t + h))

def plan(drawing):
    """Give every stroke a start time and a duration: a sweep across the frame, carcass before detail."""
    strokes = []
    for wgt, pts in drawing:
        seg = [math.hypot(pts[k + 1][0] - pts[k][0], pts[k + 1][1] - pts[k][1]) for k in range(len(pts) - 1)]
        cx = sum(p[0] for p in pts) / len(pts) / W
        strokes.append([wgt, pts, seg, sum(seg), cx])
    out = []
    for wgt, pts, seg, tot, cx in strokes:
        t0 = 0.4 + (0.0 if wgt else 0.9) + 2.0 * cx
        dur = 0.45 + 0.75 * min(1.0, tot / 600)
        out.append((t0, dur, wgt, pts, seg, tot))
    return out

def draw_lines(strokes, t):
    """Line layer at time t: (alpha HxW 0..1, pen-tip glow HxW 0..1)."""
    a = np.zeros((H * SS, W * SS), np.uint8)
    tip = np.zeros((H, W), np.float32)
    for t0, dur, wgt, pts, seg, tot in strokes:
        p = ease_out((t - t0) / dur)
        if p <= 0:
            continue
        left = tot * p
        v, th = (240, 2) if wgt else (150, 2)
        end = pts[0]
        for k, s in enumerate(seg):
            if left <= 0:
                break
            f = min(1.0, left / s) if s else 1.0
            x1, y1 = pts[k]; x2, y2 = pts[k + 1]
            end = (x1 + (x2 - x1) * f, y1 + (y2 - y1) * f)
            cv2.line(a, (round(x1 * SS), round(y1 * SS)), (round(end[0] * SS), round(end[1] * SS)), v, th, cv2.LINE_AA)
            left -= s
        if p < 1:
            cv2.circle(tip, (round(end[0]), round(end[1])), 2, 1.0, -1, cv2.LINE_AA)
    a = cv2.resize(a, (W, H), interpolation=cv2.INTER_AREA).astype(np.float32) / 255
    tip = cv2.GaussianBlur(tip, (0, 0), 2.4) * 2.4
    return a, np.clip(tip, 0, 1)

def grid_layer():
    g = np.zeros((H, W), np.float32)
    for x in range(0, W, 80): g[:, x] = 1
    for y in range(0, H, 80): g[y, :] = 1
    return g

def dims_layer(labels):
    """Dimension lines + numerals (bronze), as an alpha mask, inset so they sit over the drawing's margin."""
    im = Image.new('L', (W * SS, H * SS), 0)
    d = ImageDraw.Draw(im)
    f = font(11 * SS)
    tk = 5 * SS
    x0, x1, y = 90 * SS, (W - 90) * SS, (H - 24) * SS
    d.line([(x0, y), (x1, y)], 255, SS); d.line([(x0, y - tk), (x0, y + tk)], 255, SS); d.line([(x1, y - tk), (x1, y + tk)], 255, SS)
    tw = d.textlength(labels[0], font=f)
    d.rectangle([((x0 + x1) / 2 - tw / 2 - 8 * SS, y - 8 * SS), ((x0 + x1) / 2 + tw / 2 + 8 * SS, y + 8 * SS)], 0)
    d.text(((x0 + x1) / 2 - tw / 2, y - 7 * SS), labels[0], 255, font=f)
    xx, y0, y1 = (W - 24) * SS, 60 * SS, (H - 60) * SS
    d.line([(xx, y0), (xx, y1)], 255, SS); d.line([(xx - tk, y0), (xx + tk, y0)], 255, SS); d.line([(xx - tk, y1), (xx + tk, y1)], 255, SS)
    txt = Image.new('L', (int(d.textlength(labels[1], font=f)) + 16 * SS, 16 * SS), 0)
    ImageDraw.Draw(txt).text((8 * SS, 1 * SS), labels[1], 255, font=f)
    txt = txt.rotate(90, expand=True)
    px, py = xx - txt.width // 2, (y0 + y1) // 2 - txt.height // 2
    im.paste(0, (px, py, px + txt.width, py + txt.height))
    im.paste(txt, (px, py), txt)
    return np.asarray(im.resize((W, H), Image.LANCZOS)).astype(np.float32) / 255

def zoom(img, s):
    if abs(s - 1) < 1e-4:
        return img
    M = np.float32([[s, 0, (1 - s) * W / 2], [0, s, (1 - s) * H * 0.54]])
    return cv2.warpAffine(img, M, (W, H), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)

def render(name):
    src, box, drawing, labels = CLIPS[name]
    photo = np.asarray(frame_image(src, box)).astype(np.float32)
    strokes = plan(drawing)
    grid, dims = grid_layer(), dims_layer(labels)
    xs = np.linspace(0, 1, W, dtype=np.float32)[None, :]
    out_dir = os.path.join(ROOT, 'assets', 'video'); os.makedirs(out_dir, exist_ok=True)
    mp4, webm = os.path.join(out_dir, f'svc-{name}.mp4'), os.path.join(out_dir, f'svc-{name}.webm')
    raw = ['-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-']
    ff1 = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', *raw, '-an', '-c:v', 'libx264', '-profile:v', 'high', '-pix_fmt', 'yuv420p',
                            '-preset', 'veryslow', '-crf', '24', '-movflags', '+faststart', mp4], stdin=subprocess.PIPE)
    ff2 = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', *raw, '-an', '-c:v', 'libvpx-vp9', '-pix_fmt', 'yuv420p', '-b:v', '0',
                            '-crf', '35', '-row-mt', '1', '-deadline', 'good', '-cpu-used', '2', webm], stdin=subprocess.PIPE)
    prev = os.environ.get('CLIP_PREVIEW')
    for i in range(int(DUR * FPS)):
        t = i / FPS
        fade_in = ease_inout(t / 0.5)
        la, tip = draw_lines(strokes, t)
        da = dims * ease_inout((t - 3.0) / 0.8)
        # material arrives 4.3 -> 6.9 as a soft wipe (left -> right) behind a thin warm front
        wp = ease_inout((t - 4.3) / 2.6)
        front = -0.25 + 1.5 * wp
        mask = np.clip((front - xs) / 0.25, 0, 1) if t >= 4.3 else np.zeros((1, W), np.float32)
        mask = mask * mask * (3 - 2 * mask)
        edge = np.exp(-((xs - front) / 0.010) ** 2) * (1.0 if 4.3 <= t <= 7.0 else 0.0)
        s = 1.0 + 0.055 * ease_inout((t - 4.3) / 5.2)
        # the drawing: fades out fully once the material has settled
        linger = 1 - ease_inout((t - 6.6) / 1.2)
        keep = (1 - mask) + mask * 0.22 * linger
        frame = np.broadcast_to(INK, (H, W, 3)).copy()
        frame += (BONE - INK) * (grid * 0.04 * fade_in)[..., None]
        lift = 0.70 + 0.30 * ease_inout((t - 4.9) / 2.4)        # the photo arrives a touch under-lit, then comes up
        ph = INK + (photo - INK) * lift
        frame = frame * (1 - mask[..., None]) + ph * mask[..., None]
        frame += (BONE - frame) * (la * 0.85 * keep)[..., None]
        frame += (BRONZE - frame) * (da * 0.95 * (1 - mask))[..., None]
        frame += (BRONZE_LT - frame) * (tip * (1 - mask))[..., None]
        frame += (BRONZE_LT - frame) * (edge * 0.5)[..., None]
        frame = zoom(frame, s)
        frame = INK + (frame - INK) * ease_inout((DUR - t) / 0.55)   # back to ink for the loop
        b = np.clip(frame + 0.5, 0, 255).astype(np.uint8)
        ff1.stdin.write(b.tobytes()); ff2.stdin.write(b.tobytes())
        if prev and i in (int(3.9 * FPS), int(5.6 * FPS), int(8.6 * FPS)):
            Image.fromarray(b).save(os.path.join(prev, f'{name}-{i:03d}.jpg'), quality=88)
    for ff in (ff1, ff2):
        ff.stdin.close(); ff.wait()
    print(name, len(strokes), 'strokes', os.path.getsize(mp4) // 1024, 'KB mp4', os.path.getsize(webm) // 1024, 'KB webm')

def stills():
    """Interior card still = the clip's own final framing, in the three formats the page serves."""
    src, box, _, _ = CLIPS['interior']
    for w in (800, 1200):
        im = frame_image(src, box, w, round(w * 2 / 3))
        base = os.path.join(ROOT, 'assets', 'img', f'svc-interior-{w}')
        im.save(base + '.jpg', quality=82, progressive=True, optimize=True)
        im.save(base + '.webp', quality=80, method=6)
        im.save(base + '.avif', quality=55, speed=4)
        print('still', w, os.path.getsize(base + '.jpg') // 1024, 'KB jpg')

if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    if '--stills' in sys.argv:
        stills()
    for nm in (args or list(CLIPS)):
        render(nm)
