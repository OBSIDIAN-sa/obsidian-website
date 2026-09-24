// Image pipeline: raw-images/ -> assets/img/
//   crop to slot ratio -> resize -> shared grade -> WebP q80 + JPEG q82 -> enforce 300KB cap
// Also writes optimised logo variants (resized only; artwork untouched) and assets/img/manifest.json.
//
// Run from tools/:  npm install && npm run images

import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RAW = path.join(ROOT, 'raw-images');
const OUT = path.join(ROOT, 'assets', 'img');
const MAX_BYTES = 300 * 1024;

// Final picks (contact sheet, open pool).
// box   = pre-crop as fractions of the source {l,t,w,h}
// focus = where the ratio crop centres, fractions {x,y}
// widths: 1200/2000 for anything shown near full-bleed; smaller sets for cards,
//         where a 2000w file would add weight with no visible gain.
const FULL = [1200, 2000];
const CARD = [800, 1200];
const SQUARE = [600, 1200];

const SLOTS = [
  { slot: 'hero',          src: 'hero/hero-1.jpg',                 ratio: 16 / 9,  widths: FULL },
  { slot: 'hero-mobile',   src: 'hero-mobile/hero-mobile-3.jpg',   ratio: 9 / 16,  widths: [800, 1200, 1600], focus: { x: .55, y: .5 } }, // 1600w: portrait tablets at 2x
  { slot: 'island',        src: 'island/island-1.jpg',             ratio: 21 / 9,  widths: FULL, focus: { x: .5, y: .55 } },
  { slot: 'plan',          src: 'plan/plan-1.jpg',                 ratio: 4 / 3,   widths: CARD, focus: { x: .4, y: .5 } },
  { slot: 'mat-walnut',    src: 'mat-walnut/mat-walnut-3.jpg',     ratio: 1,       widths: SQUARE },
  { slot: 'mat-marble',    src: 'hero/hero.jpeg',                  ratio: 1,       widths: SQUARE, box: { l: .3, t: 0, w: .671, h: 1 } },
  { slot: 'mat-oak',       src: 'mat-oak/mat-oak-7.jpg',           ratio: 1,       widths: SQUARE },
  { slot: 'mat-glass',     src: 'mat-glass/mat-glass-1.jpg',       ratio: 1,       widths: SQUARE },
  { slot: 'svc-kitchen',   src: 'svc-kitchen/hero-3.jpg',          ratio: 3 / 2,   widths: CARD },
  { slot: 'svc-wardrobe',  src: 'svc-wardrobe/svc-wardrobe-4.jpg', ratio: 3 / 2,   widths: CARD },
  { slot: 'svc-interior',  src: 'svc-interior/svc-interior-1.jpg', ratio: 3 / 2,   widths: CARD, box: { l: .42, t: .17, w: .5, h: .5 } },
  { slot: 'film-1',        src: 'film-1/film-1-4.jpg',             ratio: 16 / 9,  widths: FULL },
  { slot: 'film-2',        src: 'film-2/film-2-2.jpg',             ratio: 16 / 9,  widths: FULL, focus: { x: .55, y: .5 } },
  { slot: 'film-3',        src: 'film-3/film-3-1.jpg',             ratio: 16 / 9,  widths: FULL },
  { slot: 'film-4',        src: 'film-4/film-4-1.jpg',             ratio: 16 / 9,  widths: FULL, focus: { x: .5, y: .45 } },
  { slot: 'film-5',        src: 'film-5/hero-4.jpg',               ratio: 16 / 9,  widths: FULL, focus: { x: .5, y: .55 } },
  { slot: 'film-6',        src: 'film-6/film-6-3.jpg',             ratio: 16 / 9,  widths: FULL, sat: .35 }, // neutralise teal cabinet paint
  { slot: 'texture-stone', src: 'texture-stone/texture-stone-1.jpg', ratio: 3 / 2, widths: [1200], grade: 'mono' },
];

// ---- shared grade -------------------------------------------------------
// Slight desaturation, a touch of warmth, blacks lifted toward warm and
// highlights rolled toward --bone, so every frame shares one temperature.
const SAT = 0.85;
const WARM = [1.02, 1, 0.96];
const LO = [9, 7, 5];        // where pure black lands (warm, just above --ink #050504)
const HI = [246, 241, 232];  // where pure white lands (toward --bone)

function grade(buf, channels, sat = SAT) {
  for (let i = 0; i < buf.length; i += channels) {
    const r = buf[i], g = buf[i + 1], b = buf[i + 2];
    const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const c = [l + (r - l) * sat, l + (g - l) * sat, l + (b - l) * sat];
    for (let k = 0; k < 3; k++) {
      const v = Math.min(255, Math.max(0, c[k] * WARM[k]));
      buf[i + k] = Math.round(LO[k] + (HI[k] - LO[k]) * v / 255);
    }
  }
  return buf;
}

// ---- crop ---------------------------------------------------------------
function cropBox(w, h, { ratio, box, focus = { x: .5, y: .5 } }) {
  let L = 0, T = 0, W = w, H = h;
  if (box) {
    L = Math.round(box.l * w); T = Math.round(box.t * h);
    W = Math.min(Math.round(box.w * w), w - L); H = Math.min(Math.round(box.h * h), h - T);
  }
  let cw = W, ch = Math.round(W / ratio);
  if (ch > H) { ch = H; cw = Math.round(H * ratio); }
  const cx = Math.min(Math.max(Math.round(L + focus.x * W - cw / 2), L), L + W - cw);
  const cy = Math.min(Math.max(Math.round(T + focus.y * H - ch / 2), T), T + H - ch);
  return { left: cx, top: cy, width: cw, height: ch };
}

// ---- encode under the byte cap -----------------------------------------
async function encode(pipeline, fmt, file) {
  const start = fmt === 'webp' ? 80 : 82;
  for (let q = start; q >= 55; q -= 3) {
    const buf = fmt === 'webp'
      ? await pipeline.clone().webp({ quality: q, effort: 6 }).toBuffer()
      : await pipeline.clone().jpeg({ quality: q, mozjpeg: true, progressive: true }).toBuffer();
    if (buf.length <= MAX_BYTES || q - 3 < 55) {
      fs.writeFileSync(file, buf);
      return { q, kb: Math.round(buf.length / 1024), over: buf.length > MAX_BYTES };
    }
  }
}

async function processSlot(s) {
  const src = path.join(RAW, s.src);
  const base = sharp(src).rotate();
  const { width, height } = await base.clone().toBuffer({ resolveWithObject: true }).then(r => r.info);
  const box = cropBox(width, height, s);
  const cropped = await base.clone().extract(box).toBuffer();

  const variants = [];
  const widths = s.widths.filter(w => w <= box.width);
  if (widths.length < s.widths.length) widths.push(box.width); // source smaller than target: ship native
  for (const w of [...new Set(widths)]) {
    const h = Math.round(w / (box.width / box.height));
    let img = sharp(cropped).resize(w, h, { fit: 'fill', kernel: 'lanczos3' });
    if (s.grade === 'mono') img = img.greyscale();
    const { data, info } = await img.removeAlpha().raw().toBuffer({ resolveWithObject: true });
    if (s.grade !== 'mono') grade(data, info.channels, s.sat);
    const graded = sharp(data, { raw: info }).toColourspace('srgb');
    const webp = await encode(graded, 'webp', path.join(OUT, `${s.slot}-${w}.webp`));
    const jpg = await encode(graded, 'jpeg', path.join(OUT, `${s.slot}-${w}.jpg`));
    variants.push({ w, h: info.height, webp: `${s.slot}-${w}.webp`, jpg: `${s.slot}-${w}.jpg`, webpKB: webp.kb, jpgKB: jpg.kb, webpQ: webp.q, jpgQ: jpg.q, over: webp.over || jpg.over });
  }
  return { slot: s.slot, source: s.src, crop: box, variants };
}

// Logo: resize + recompress only. The artwork itself is never altered.
async function processLogo() {
  const src = path.join(ROOT, 'logo.png');
  const out = [];
  for (const w of [160, 320, 640, 960]) {
    const img = sharp(src).resize({ width: w });
    const webp = await img.clone().webp({ quality: 90, alphaQuality: 100, effort: 6 }).toBuffer();
    const png = await img.clone().png({ compressionLevel: 9, effort: 10 }).toBuffer();
    fs.writeFileSync(path.join(OUT, `logo-${w}.webp`), webp);
    fs.writeFileSync(path.join(OUT, `logo-${w}.png`), png);
    const { height } = await sharp(webp).metadata();
    out.push({ w, h: height, webp: `logo-${w}.webp`, png: `logo-${w}.png`, webpKB: Math.round(webp.length / 1024), pngKB: Math.round(png.length / 1024) });
  }
  return out;
}

fs.mkdirSync(OUT, { recursive: true });
const manifest = { images: {}, logo: null };
for (const s of SLOTS) {
  const r = await processSlot(s);
  manifest.images[r.slot] = { source: r.source, crop: r.crop, variants: r.variants.map(({ w, h, webp, jpg }) => ({ w, h, webp, jpg })) };
  console.log(r.slot.padEnd(14), r.variants.map(v => `${v.w}w ${v.webpKB}KB(q${v.webpQ})/${v.jpgKB}KB(q${v.jpgQ})${v.over ? ' OVER' : ''}`).join('  '));
}
manifest.logo = await processLogo();
for (const l of manifest.logo) console.log('logo'.padEnd(14), `${l.w}w webp ${l.webpKB}KB / png ${l.pngKB}KB`);
manifest.logo = manifest.logo.map(({ w, h, webp, png }) => ({ w, h, webp, png }));
fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log('wrote', path.relative(ROOT, path.join(OUT, 'manifest.json')));
