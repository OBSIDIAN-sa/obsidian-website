# OBSIDIAN DESIGN — Build Brief

**Type:** One-page bilingual site (AR primary / EN secondary), pre-launch
**Stack:** Vanilla HTML/CSS/JS. No framework, no build step, no runtime dependencies.
**Deploy:** GitHub Pages — static files only.
**Content source:** `CONTENT.md` is canonical. Don't write copy. Don't translate.

---

## 1. The problem this site solves

Obsidian is a bespoke kitchen, wardrobe and interior joinery brand in Dammam. The showroom hasn't opened. There is no portfolio, no client list, no reviews, no opening date.

So the site can't do what a normal studio site does — prove itself with work. It has to establish credibility through **craft signals instead of evidence**: the precision of the typography, the restraint of the palette, the quality of the motion. The medium is the proof.

Two jobs, in order:

1. **Convince in the first eight seconds** that this is a serious, expensive, detail-obsessed operation.
2. **Capture the lead** before the visitor leaves.

Everything else is secondary. If a decision serves neither, cut it.

---

## 2. Art direction

### The register

Think gallery, not catalogue. Auction house, not showroom. The reference set — Nothin' Studio, ALCHE, Pear — shares one trait worth stealing: **they withhold**. Wide negative space, few elements per viewport, one idea at a time, nothing competing.

The failure mode to avoid is the generic "premium interiors" template: gold gradient buttons, stock serif headline over a bright kitchen photo, three feature cards with icons, a testimonial slider. That reads as a contractor's site with a nice theme. This should read as a brand that had a designer.

### Palette

```css
:root {
  --ink:       #050504;  /* page ground */
  --onyx:      #0C0A09;  /* section & card ground */
  --bone:      #EDE6DA;  /* primary text */
  --warm-grey: #9A938A;  /* secondary text — never below 14px */
  --bronze:    #C9A063;  /* hairlines, indices, eyebrow labels */
  --bronze-lt: #EBD3A4;  /* emphasis only */
}
```

**Hard rule:** no colour enters the interface beyond these six. Warmth and variation come from the photography alone — honeyed walnut, veined stone, brass, warm raking light. The chrome stays black and bronze. A seventh colour breaks the brand.

Bronze is a **line weight, not a fill.** 1px hairlines, section indices, eyebrow labels, focus rings. Bronze-filled buttons will cheapen the whole thing — use outlined or text buttons with a bronze rule.

### Typography

| Role | Face | Notes |
|---|---|---|
| AR display | Tajawal 700/800 | Tight tracking, generous leading |
| AR body | Tajawal 400/500 | |
| EN display | Cormorant Garamond 300/400 | High contrast, light weight at large size |
| EN body / numerals | Inter 300/400 | |

Self-host `woff2`. Subset to the weights actually used. `font-display: swap` with a real fallback stack.

Set a modular scale and hold to it. Display sizes should be genuinely large — the hero wordmark can be uncomfortable-large; that's the point. Body copy should be comfortable, not small-for-effect.

Arabic and Latin need separate tracking and leading values. Don't apply one set to both — Tajawal at Cormorant's letter-spacing will look broken.

### Photography direction

Images carry the entire emotional load. Selection rules:

- **Dark base, warm accent.** A uniformly bright frame breaks the page.
- **Detail over room.** A macro of a mitred edge outperforms a wide shot of a kitchen. Closer is better.
- **Raking light.** Directional side-light, deep shadow, visible texture. Flat even lighting reads as catalogue.
- **No people. No food. No styling props.** Nothing dated.
- The hero image must hold light text and the logo — check contrast before committing.

Apply a consistent grade across the whole set: slight desaturation, blacks lifted toward warm, a shared colour temperature. A gallery of inconsistently-graded stock photos is the fastest way to look cheap. Handle this in the image pipeline, not with CSS filters at runtime.

---

## 3. Motion language

Motion is the main craft signal here. It has to feel **engineered, not decorative** — the way a soft-close drawer feels.

- **Easing is the whole game.** No linear, no default `ease`. Custom cubic-bezier with a slow, long tail — entries decelerate into place, never snap.
- **Slower than feels right.** Entry transitions 600–900ms. Fast animation reads as cheap.
- **Stagger siblings.** 60–80ms between list items. Never animate a group as one block.
- **Small distances.** 16–24px of travel on entry. Large translations look like a template.
- **One thing moves at a time.** If two elements animate simultaneously in the same viewport, one of them is wrong.
- **Scroll-driven, not scroll-triggered,** where it matters — the marquee and the film section should be tied to scroll position so the user feels they're driving it.

Everything animates on `transform` and `opacity` only. `IntersectionObserver` for entries, never a scroll listener doing layout reads. Respect `prefers-reduced-motion` completely — reduced motion yields a fully readable, fully functional static page, not a degraded one.

---

## 4. Section architecture

Sections in order; content per `CONTENT.md`.

| # | Section | Design intent |
|---|---|---|
| 00 | Preloader | Logo + progress. Under 1.5s on slow connection, hard-skip after. |
| 01 | Hero | Logo, rotating word, one line, two CTAs. Must hold as a still frame. |
| 02 | Marquee | Scroll-linked velocity. Direction reverses with scroll direction. |
| 03 | Principle | **Light section** — the palette inversion is the page's structural beat. Don't lose it. |
| 04 | Interstitial line | Single line, enormous negative space. Resist filling it. |
| 05 | The Island | Full-bleed image, parallax. The emotional peak. |
| 06 | Drawing → Piece | Process. Text-led, image supporting. |
| 07 | Material | Four macro shots, horizontal scroll. Tactile. |
| 08 | Standards | Four criteria. Editorial, indexed, hairline-separated. |
| 09 | Services | Three cards. Cards are the cliché risk — kill the borders, use hairlines and space. |
| 10 | Why Obsidian | Numbered 01–04. Large bronze indices. |
| 11 | Film | Six frames, scroll-scrubbed. The technical showpiece. |
| 12 | FAQ | Accordion. Restrained. |
| 13 | Register interest | The conversion point. Must feel considered, not bolted on. |
| 14 | Footer | Three columns + oversized wordmark. |

The light Principle section (03) and the full-bleed Island (05) are the page's two structural surprises. Protect them — they're what stops fourteen dark sections reading as one long scroll.

---

## 5. Technical contract

**Non-negotiable**

- Zero runtime network requests to third parties. Fonts, images, scripts — all local. Verify in the Network panel.
- No backend. The interest form composes a WhatsApp deep link to `966569997565` with fields pre-filled (`CONTENT.md §15`). Validate client-side before opening.
- `logo.png` is used as-is. Not redrawn, re-traced, converted to SVG, or procedurally reconstructed. Brand requirement, not a preference.
- No maps, no coordinates, no street address. City only.
- No testimonials, lead times, warranty terms, payment terms, or opening date.

**Bilingual**

- Single `i18n` object, `{ ar: {...}, en: {...} }`.
- Switch flips `<html lang>` and `<html dir>` and re-renders all strings. Persist to `localStorage`. Default AR.
- Logical properties throughout (`margin-inline-start`, `padding-inline`, `inset-inline`). A site built on physical properties will break in RTL and you'll patch it forever.
- Verify RTL on: marquee direction, numbered indices, accordion chevrons, form alignment, footer column order.

**Performance budget**

- Above-the-fold payload under 1.5MB total.
- WebP with JPEG fallback, quality 80. `srcset` at 1200w and 2000w. No single image over 300KB.
- Explicit `width`/`height` on every image. Zero CLS.
- `loading="lazy"` + `decoding="async"` below the fold.
- Target LCP under 2.5s on a throttled 4G profile.

**Accessibility**

- Full keyboard path through every interactive element. Visible focus — bronze hairline ring, not the browser default, never `outline: none`.
- Accordion with correct ARIA. Language toggle announces state.
- Descriptive `alt` in the active language.
- `--warm-grey` on `--ink` fails at small sizes — audit contrast rather than assuming.

---

## 6. Build phases

**Phase 1 — ship this first.** All fourteen sections, full content, both languages, responsive, entry animations, parallax, scroll-linked marquee, accordion, working form. Nothing from Phase 2.

Get Phase 1 clean and reviewed before touching Phase 2. A polished simple version beats a broken elaborate one.

**Phase 2 — layered on, each gated:**

| Layer | Gate |
|---|---|
| Preloader | Must not exceed 1.5s; auto-skip |
| Logo pendulum rotation | CSS transform only; negligible CPU |
| Scroll-scrubbed film | Smooth on mid-range mobile or it doesn't ship |
| Custom cursor | Desktop pointer only; fully disabled on touch |
| Magnetic buttons | Desktop only |
| Scroll progress hairline | Always acceptable |
| Typed easter egg (`OBSIDIAN`) | Desktop only; breaks nothing |

**Out of scope:** ambient audio, background video in hero, WebGL, infinite 3D grid, any procedural reconstruction of the logo.

---

## 7. File structure

```
obsidian-website/
├── index.html
├── logo.png                 # do not modify
├── CONTENT.md
├── BRIEF.md
├── raw-images/              # source images, unprocessed
└── assets/
    ├── css/
    ├── js/
    ├── fonts/               # self-hosted woff2
    └── img/                 # processed, graded, WebP + JPEG
```

---

## 8. Image manifest

Source from **Unsplash or Pexels only** — free for commercial use. Not Pinterest, not Google Images.

| File | Section | Subject | Ratio | Note |
|---|---|---|---|---|
| `hero` | 01 | Dark luxury kitchen, depth, raking side light | 16:9 | Must hold light text |
| `hero-mobile` | 01 | Same scene or near | 9:16 | |
| `island` | 05 | Central island, stone top, pendant lighting | 21:9 | Warmth enters here |
| `plan` | 06 | Light oak kitchen, or technical drawing on a surface | 4:3 | Lighter frame acceptable |
| `mat-walnut` | 07 | Walnut grain macro | 1:1 | Warm honey |
| `mat-marble` | 07 | Black marble, white/gold veining | 1:1 | |
| `mat-oak` | 07 | Light oak macro | 1:1 | |
| `mat-glass` | 07 | Black-framed glass / steel partition | 1:1 | Reflection |
| `svc-kitchen` | 09 | Handleless modern kitchen | 3:2 | |
| `svc-wardrobe` | 09 | Dressing room, shelf-integrated lighting | 3:2 | Warm glow |
| `svc-interior` | 09 | Media unit or timber wall panelling | 3:2 | |
| `film-1…6` | 11 | Polished surface · island · edge detail · concealed cabinet · handleless front · final detail | 16:9 | Alternate dark and warm |
| `texture-stone` | global | Black stone grain | any | Low-opacity overlay |

**20 files.** Pipeline: crop to ratio → apply the shared grade → export WebP q80 + JPEG q82 → generate 1200w and 2000w → write to `assets/img/`.

Search entry points:
`unsplash.com/s/photos/` + `dark-kitchen` · `kitchen-island` · `walk-in-closet` · `wood-grain-texture` · `black-marble-texture` · `black-stone-texture`

---

## 9. Definition of done

- Opens from `index.html` with no server
- Network panel shows zero third-party requests
- AR↔EN switch flips direction correctly across every section
- 380px viewport: no horizontal overflow, no clipped text
- `prefers-reduced-motion` yields a complete, readable page
- Full keyboard path with visible focus throughout
- WhatsApp deep link opens with correct number and populated message
- No image over 300KB; no CLS
- Logo used unmodified
- No testimonials, lead times, warranty, payment terms, map, or opening date

---

## 10. Where to push back

If something here fights good design, say so before building it. Worth challenging:

- Fourteen sections may be three too many. If a section earns nothing, argue for cutting it.
- The film section (11) is the highest-risk, highest-cost element. If it can't be smooth on mobile, cut it rather than ship it degraded.
- The rotating word in the hero is a common device. If a stronger idea says the same thing, propose it.

A brief followed literally into a mediocre result is a failed brief.
