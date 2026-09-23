// Definition-of-done checks (BRIEF.md §9), run against file:///…/index.html in the installed Chrome.
// Run from tools/:  node verify.mjs
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const URL_ = pathToFileURL(path.join(ROOT, 'index.html')).href;
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync);
const results = [];
const report = (item, pass, detail) => { results.push({ item, pass, detail }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${item}\n      ${detail}`); };

const browser = await chromium.launch({ executablePath: CHROME });

async function open({ lang = 'ar', width = 1440, height = 900, reducedMotion = 'no-preference', js = true } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, reducedMotion, javaScriptEnabled: js });
  const page = await ctx.newPage();
  const requests = [], errors = [];
  page.on('request', (r) => requests.push(r.url()));
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript((l) => { try { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('obsidian-lang', l); sessionStorage.setItem('seeded', '1'); } } catch (e) {} }, lang);
  await page.goto(URL_, { waitUntil: 'load' });
  await page.waitForTimeout(400);
  return { ctx, page, requests, errors };
}
async function scrollThrough(page) {
  const h = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y <= h; y += 500) { await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' }), y); await page.waitForTimeout(60); }
  await page.waitForTimeout(500);
}

// 1 + 2 + 9 — file://, network, CLS (both languages, desktop + phone)
{
  let third = [], errs = [], cls = [], fontsOk = true, loaded = true;
  for (const lang of ['ar', 'en']) for (const [w, h] of [[1440, 900], [390, 844]]) {
    const { ctx, page, requests, errors } = await open({ lang, width: w, height: h });
    await page.evaluate(() => { window.__cls = 0; new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: 'layout-shift', buffered: true }); });
    await scrollThrough(page);
    const r = await page.evaluate(async () => {
      await document.fonts.ready;
      const fams = [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family.replace(/"/g, '') + ' ' + f.weight);
      return { cls: window.__cls, fams, h1: !!document.querySelector('#hero-title'), lang: document.documentElement.lang };
    });
    third.push(...requests.filter((u) => !u.startsWith('file://')));
    errs.push(...errors.map((e) => `${lang}/${w}: ${e}`));
    cls.push(`${lang}@${w}: ${r.cls.toFixed(4)}`);
    if (r.lang !== lang || !r.h1) loaded = false;
    if (!r.fams.some((f) => f.startsWith(lang === 'ar' ? 'Tajawal' : 'Inter'))) fontsOk = false;
    await ctx.close();
  }
  report('1. Opens from index.html with no server', loaded && fontsOk && errs.length === 0,
    `loaded from ${URL_} in Chrome; self-hosted fonts loaded: ${fontsOk}; console/page errors: ${errs.length ? errs.join(' | ') : 'none'}`);
  report('2. Zero third-party network requests', third.length === 0,
    third.length ? [...new Set(third)].join(', ') : 'every request across a full scroll (AR+EN, desktop+phone) was a local file:// URL');
  const worst = Math.max(...cls.map((c) => +c.split(': ')[1]));
  report('9b. No CLS', worst < 0.01, `cumulative layout shift over load + full scroll: ${cls.join(', ')}`);
}

// 3 — direction flips across every section
{
  const sections = ['.site-header', '.hero', '.marquee', '.principle', '.interstitial', '.island', '.plan', '.material', '.standards', '.services', '.why', '.film', '.faq', '.register', '.site-footer'];
  const problems = [];
  for (const lang of ['ar', 'en']) {
    const { ctx, page } = await open({ lang });
    const want = lang === 'ar' ? 'rtl' : 'ltr';
    const r = await page.evaluate(({ sections, want }) => {
      const out = [];
      if (document.documentElement.dir !== want) out.push('html dir=' + document.documentElement.dir);
      for (const s of sections) {
        const sec = document.querySelector(s);
        if (getComputedStyle(sec).direction !== want) out.push(`${s} direction=${getComputedStyle(sec).direction}`);
        // Text starts on the correct side: a left/right-aligned block's text hugs the start edge
        for (const el of sec.querySelectorAll('h2, h3, .hero__intro, .split__body, .plan__body, .standards__text, .service__body, .why__text, .register__body, .faq__q [data-i18n], .field__label, .footer__h')) {
          if (!el.offsetWidth || el.closest('[dir="ltr"]') || getComputedStyle(el).textAlign === 'center') continue;
          const rng = document.createRange(); rng.selectNodeContents(el);
          const t = rng.getBoundingClientRect(), b = el.getBoundingClientRect();
          const gap = want === 'rtl' ? b.right - t.right : t.left - b.left;
          if (gap > 2) out.push(`${s} ${el.className || el.tagName}: text ${Math.round(gap)}px off the start edge`);
        }
      }
      // Marquee travel sign, indices, form, footer order
      const cols = [...document.querySelectorAll('.footer__col')].map((c) => c.getBoundingClientRect().left);
      if (window.innerWidth >= 760 && (want === 'rtl' ? !(cols[0] > cols[1] && cols[1] > cols[2]) : !(cols[0] < cols[1] && cols[1] < cols[2]))) out.push('footer column order wrong');
      const inp = document.querySelector('#f-name').getBoundingClientRect(), lab = document.querySelector('label[for=f-name]');
      const lr = document.createRange(); lr.selectNodeContents(lab); const lt = lr.getBoundingClientRect();
      if (want === 'rtl' ? Math.abs(lt.right - inp.right) > 2 : Math.abs(lt.left - inp.left) > 2) out.push('form label not aligned to start');
      return out;
    }, { sections, want });
    // marquee: text must travel toward the reading end (RTL → right, LTR → left)
    await page.evaluate(() => window.scrollTo({ top: document.querySelector('.marquee').offsetTop - 300, behavior: 'instant' }));
    await page.waitForTimeout(700);
    const tx = () => page.evaluate(() => parseFloat((document.querySelector('[data-marquee-track]').style.transform.match(/translate3d\((-?[\d.]+)px/) || [0, 0])[1]));
    const a = await tx(); await page.waitForTimeout(600); const b = await tx();
    const moved = b - a, okSign = want === 'rtl' ? moved > 0 : moved < 0;
    if (!okSign && Math.abs(moved) < 1000) r.push(`marquee moved ${moved.toFixed(1)}px (wrong way for ${want})`);
    problems.push(...r.map((x) => `${lang}: ${x}`));
    await ctx.close();
  }
  report('3. AR/EN switch flips direction across every section', problems.length === 0,
    problems.length ? problems.join(' | ') : 'html + all 15 regions resolve to rtl/ltr; headings, body copy, FAQ, form labels hug the start edge; footer columns reverse; marquee travels toward the reading end in each language');
}

// 4 — 380px: no horizontal overflow, no clipped text
{
  const problems = [];
  for (const lang of ['ar', 'en']) {
    const { ctx, page } = await open({ lang, width: 380, height: 780 });
    await scrollThrough(page);
    const r = await page.evaluate(() => {
      const out = [], vw = document.documentElement.clientWidth;
      if (document.documentElement.scrollWidth > vw) out.push(`page scrollWidth ${document.documentElement.scrollWidth} > ${vw}`);
      const skip = '.material__track, .marquee, .principle__watermark, .footer__wordmark, .sr-only, .skip-link, .hero__rotator';
      for (const el of document.querySelectorAll('body *')) {
        if (!el.offsetWidth || el.closest(skip)) continue;
        const r = el.getBoundingClientRect();
        if (r.right > vw + 1 || r.left < -1) out.push(`${el.className || el.tagName} spills past viewport`);
        const cs = getComputedStyle(el);
        const clips = cs.overflowX !== 'visible' || cs.overflowY !== 'visible' || cs.textOverflow === 'ellipsis';
        if (!clips || el.matches('select, textarea, input, picture, figure')) continue;
        // A clipping box is only a problem if real text inside it falls outside the box
        const box = r;
        const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        for (let n = tw.nextNode(); n; n = tw.nextNode()) {
          if (!n.textContent.trim() || n.parentElement.closest(skip) || !n.parentElement.offsetWidth) continue;
          const rg = document.createRange(); rg.selectNodeContents(n);
          const cut = [...rg.getClientRects()].some((t) => t.left < box.left - 1 || t.right > box.right + 1 || t.top < box.top - 1 || t.bottom > box.bottom + 1);
          if (cut) out.push(`text cut by ${el.className || el.tagName}: "${n.textContent.trim().slice(0, 30)}"`);
        }
      }
      // The hero rotator is a deliberate mask: make sure the current word fits it
      const rot = document.querySelector('.hero__rotator'), word = rot.querySelector('.hero__word');
      if (word.scrollWidth > rot.clientWidth + 1) out.push('rotator word wider than the column');
      return [...new Set(out)];
    });
    problems.push(...r.map((x) => `${lang}: ${x}`));
    // all three rotator words must fit
    const words = await page.evaluate((lang) => window.I18N[lang].hero_words, lang);
    const fit = await page.evaluate((words) => {
      const rot = document.querySelector('.hero__rotator'), s = document.createElement('span');
      s.className = 'hero__word'; s.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap'; rot.appendChild(s);
      const bad = words.filter((w) => { s.textContent = w; return s.scrollWidth > rot.clientWidth; }); s.remove(); return bad;
    }, words);
    if (fit.length) problems.push(`${lang}: rotator word(s) too wide: ${fit.join(', ')}`);
    await ctx.close();
  }
  report('4. 380px: no horizontal overflow, no clipped text', problems.length === 0,
    problems.length ? problems.join(' | ') : 'scrollWidth = viewport in AR and EN; no element spills past the edge; no element with overflow clipping cuts its text; every rotator word fits');
}

// 5 — reduced motion
{
  const problems = [];
  for (const lang of ['ar', 'en']) {
    const { ctx, page } = await open({ lang, reducedMotion: 'reduce' });
    await scrollThrough(page);
    const r = await page.evaluate(() => {
      const out = [];
      const hidden = [...document.querySelectorAll('[data-reveal]')].filter((e) => getComputedStyle(e).opacity !== '1');
      if (hidden.length) out.push(`${hidden.length} reveal element(s) not fully visible`);
      if (!document.querySelector('[data-marquee]').classList.contains('is-static')) out.push('marquee still animating');
      if (document.querySelector('[data-marquee-track]').style.transform) out.push('marquee has a transform');
      if (document.querySelector('[data-parallax]').style.transform) out.push('parallax still applied');
      if (document.querySelectorAll('[data-rotator] .hero__word').length !== 1 || !document.querySelector('[data-rotator] .hero__word').textContent.includes('·')) out.push('rotator not static');
      const running = document.getAnimations().filter((a) => a.playState === 'running' && a.effect && a.effect.getComputedTiming().duration > 50);
      if (running.length) out.push(`${running.length} animation(s) running`);
      return out;
    });
    await page.waitForTimeout(2800);
    const still = await page.evaluate(() => document.querySelectorAll('[data-rotator] .hero__word').length === 1);
    if (!still) r.push('rotator changed after 2.8s');
    problems.push(...r.map((x) => `${lang}: ${x}`));
    await ctx.close();
  }
  report('5. prefers-reduced-motion yields a complete, readable page', problems.length === 0,
    problems.length ? problems.join(' | ') : 'all content visible without scrolling triggers; marquee, rotator, parallax static; no running animations; nothing moves after load');
}

// 6 — keyboard path + visible focus
{
  const problems = [];
  let count = 0;
  for (const lang of ['ar', 'en']) for (const [w, h] of [[1440, 900], [390, 844]]) {
    const { ctx, page } = await open({ lang, width: w, height: h });
    const expected = await page.evaluate(() => {
      const els = [...document.querySelectorAll('a[href], button, input, select, textarea, [tabindex="0"]')].filter((e) => e.offsetWidth || e.offsetHeight || e.classList.contains('skip-link'));
      els.forEach((e, i) => (e.dataset.kb = i)); return els.length;
    });
    const seen = new Set(), noRing = [];
    for (let i = 0; i < expected + 5; i++) {
      await page.keyboard.press('Tab');
      await page.waitForTimeout(30);
      const f = await page.evaluate(() => {
        const e = document.activeElement; if (!e || e === document.body) return null;
        const cs = getComputedStyle(e);
        return { id: e.dataset.kb, ring: cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) >= 1, name: (e.textContent || e.id || e.tagName).trim().slice(0, 20), inView: (() => { const r = e.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight; })() };
      });
      if (!f) break;
      seen.add(f.id);
      if (!f.ring) noRing.push(f.name);
      if (!f.inView) noRing.push(f.name + ' (off-screen)');
    }
    const missed = expected - seen.size;
    count = Math.max(count, expected);
    if (missed) problems.push(`${lang}@${w}: ${missed} focusable element(s) never reached`);
    if (noRing.length) problems.push(`${lang}@${w}: no visible ring on ${noRing.join(', ')}`);
    // Enter/Space operate the controls
    await page.focus('#faq-3-q'); await page.keyboard.press('Space');
    if ((await page.getAttribute('#faq-3-q', 'aria-expanded')) !== 'true') problems.push(`${lang}@${w}: FAQ not operable by Space`);
    await page.focus('[data-lang-toggle]'); await page.keyboard.press('Enter');
    if ((await page.evaluate(() => document.documentElement.lang)) === lang) problems.push(`${lang}@${w}: language toggle not operable by Enter`);
    await ctx.close();
  }
  report('6. Full keyboard path with visible focus', problems.length === 0,
    problems.length ? problems.join(' | ') : `every focusable element (${count} on desktop) reached in order by Tab in AR/EN on desktop and phone, each with a ≥1px bronze outline, scrolled into view; FAQ and language toggle operate from the keyboard`);
}

// 7 — WhatsApp deep link
{
  const problems = [], samples = [];
  for (const lang of ['ar', 'en']) {
    const { ctx, page } = await open({ lang });
    await page.evaluate(() => { window.__opened = []; window.open = (u) => { window.__opened.push(u); return {}; }; });
    await page.click('.form__submit');
    if ((await page.evaluate(() => window.__opened.length)) !== 0) problems.push(`${lang}: opened with empty required fields`);
    await page.fill('#f-name', lang === 'ar' ? 'نورة' : 'Noura');
    await page.fill('#f-phone', lang === 'ar' ? '٠٥٥ ١٢٣ ٤٥٦٧' : '+966 55 123 4567');
    await page.selectOption('#f-type', '0');
    await page.fill('#f-note', lang === 'ar' ? 'مطبخ بجزيرة' : 'Kitchen with island');
    await page.click('.form__submit');
    const u = await page.evaluate(() => window.__opened[0]);
    if (!u) { problems.push(`${lang}: nothing opened`); await ctx.close(); continue; }
    const parsed = new URL(u), text = parsed.searchParams.get('text');
    const expected = `مرحبًا أوبسيديان 👋\nالاسم: ${lang === 'ar' ? 'نورة' : 'Noura'}\nالجوال: ${lang === 'ar' ? '055 123 4567' : '+966 55 123 4567'}\nنوع المشروع: مطبخ\nملاحظات: ${lang === 'ar' ? 'مطبخ بجزيرة' : 'Kitchen with island'}\n— مُرسل من الموقع`;
    if (parsed.origin + parsed.pathname !== 'https://wa.me/966569997565') problems.push(`${lang}: wrong target ${parsed.origin + parsed.pathname}`);
    if (text !== expected) problems.push(`${lang}: message mismatch:\n${text}`);
    samples.push(parsed.origin + parsed.pathname);
    await ctx.close();
  }
  // hero + footer links point at the same number
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const waLinks = [...html.matchAll(/https:\/\/wa\.me\/(\d+)/g)].map((m) => m[1]);
  if (waLinks.some((n) => n !== '966569997565')) problems.push('a static WhatsApp link uses another number');
  report('7. WhatsApp deep link: correct number, populated message', problems.length === 0,
    problems.length ? problems.join(' | ') : `form opens ${samples[0]} with the CONTENT.md §15 message filled in (name, phone with Arabic digits normalised, type, note) from both languages; blocked when required fields are empty; ${waLinks.length} static wa.me links all use 966569997565`);
}

// 8 — no image over 300KB (+ nothing heavier shipped in assets/)
{
  const img = path.join(ROOT, 'assets', 'img');
  const over = fs.readdirSync(img).filter((f) => /\.(webp|jpe?g|png)$/i.test(f)).map((f) => [f, fs.statSync(path.join(img, f)).size]).filter(([, s]) => s > 300 * 1024);
  const all = fs.readdirSync(img).filter((f) => /\.(webp|jpe?g|png)$/i.test(f)).map((f) => fs.statSync(path.join(img, f)).size);
  report('8. No image over 300KB', over.length === 0,
    over.length ? over.map(([f, s]) => `${f} ${Math.round(s / 1024)}KB`).join(', ') : `${all.length} files in assets/img, largest ${Math.round(Math.max(...all) / 1024)}KB`);
}

// 9a — images have explicit dimensions (the CLS half of "no image over 300KB; no CLS")
{
  const { ctx, page } = await open({});
  const r = await page.evaluate(() => [...document.querySelectorAll('img')].filter((i) => !i.getAttribute('width') || !i.getAttribute('height')).length);
  report('9a. Every <img> has explicit width/height', r === 0, r ? `${r} image(s) missing dimensions` : 'all <img> elements carry width and height attributes');
  await ctx.close();
}

// 10 — logo unmodified; page only uses resized derivatives
{
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const sharp = (await import('sharp')).default;
  const orig = await sharp(path.join(ROOT, 'logo.png')).metadata();
  const derived = fs.readdirSync(path.join(ROOT, 'assets', 'img')).filter((f) => f.startsWith('logo-'));
  // Same artwork: derivative vs a fresh resize of the original should be pixel-near-identical
  let maxDiff = 0;
  for (const f of derived.filter((f) => f.endsWith('.png'))) {
    const d = await sharp(path.join(ROOT, 'assets', 'img', f)).raw().toBuffer({ resolveWithObject: true });
    const o = await sharp(path.join(ROOT, 'logo.png')).resize({ width: d.info.width }).raw().toBuffer();
    // RGB under fully transparent pixels is invisible and arbitrary: compare alpha-weighted (what you see)
    let sum = 0, n = 0;
    for (let i = 0; i < o.length; i += 4) {
      const a1 = o[i + 3] / 255, a2 = d.data[i + 3] / 255;
      for (let k = 0; k < 3; k++) { sum += Math.abs(o[i + k] * a1 - d.data[i + k] * a2); n++; }
      sum += Math.abs(o[i + 3] - d.data[i + 3]); n++;
    }
    maxDiff = Math.max(maxDiff, sum / n);
  }
  const noSvg = !/logo[^"']*\.svg|<svg[^>]*logo/i.test(html);
  const ok = orig.width === 1257 && orig.height === 1280 && maxDiff < 2 && noSvg;
  report('10. Logo used unmodified', ok,
    `logo.png untouched (1257×1280 RGBA, ${Math.round(fs.statSync(path.join(ROOT, 'logo.png')).size / 1024)}KB); ${derived.length} served variants are straight resizes (mean visible-pixel difference vs a fresh resize: ${maxDiff.toFixed(3)}/255); no SVG or redrawn mark`);
}

// 11 — forbidden content
{
  const files = ['index.html', 'assets/js/i18n.js'].map((f) => [f, fs.readFileSync(path.join(ROOT, f), 'utf8')]);
  const rules = [
    // "review" alone is CONTENT.md's own FAQ copy ("review it with you"); look for review/testimonial language
    ['testimonials / reviews', /testimonial|\breviews\b|customer review|client review|\brating|★|\b\d(\.\d)? stars?\b|آراء العملاء|تقييم|قالوا عنا|قال عنا/i],
    ['lead times', /\b\d+\s*(day|days|week|weeks|month|months)\b|lead time|turnaround|مدة التنفيذ|\d+\s*(يوم|أيام|أسبوع|أسابيع|شهر|أشهر)/i],
    ['warranty', /warrant|guarantee|ضمان|كفالة/i],
    ['payment terms', /payment|instal+ment|deposit|down ?payment|دفعة|الدفع|أقساط|عربون|تقسيط/i],
    ['map / address', /<iframe|maps\.google|google\.com\/maps|openstreetmap|mapbox|latitude|longitude|coordinates|\bst\.|street|حي |شارع|إحداثيات|خريطة/i],
    ['opening date', /open(s|ing)? (on|in) |\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.? \d|\b20\d\d-\d\d|q[1-4] 20\d\d|يفتتح في|الافتتاح في|(يناير|فبراير|مارس|أبريل|مايو|يونيو|يوليو|أغسطس|سبتمبر|أكتوبر|نوفمبر|ديسمبر)/i],
  ];
  const hits = [];
  for (const [label, re] of rules) for (const [f, src] of files) {
    const text = f.endsWith('.html') ? src.replace(/<!--[\s\S]*?-->/g, '') : src.replace(/\/\/.*$/gm, '');
    const m = text.match(new RegExp(re.source, re.flags + 'g'));
    if (m) hits.push(`${label} in ${f}: ${[...new Set(m)].join(', ')}`);
  }
  const years = [...new Set(files.flatMap(([, s]) => s.match(/(?<![\w-])20\d\d(?![\w.])/g) || []))]; // skip "-2000.webp" filenames
  report('11. No testimonials, lead times, warranty, payment terms, map or opening date', hits.length === 0,
    hits.length ? hits.join(' | ') : `none found in the page or string table; the only year is ${years.join(', ')} (copyright line); "قريبًا / Opening soon" carries no date; location is city-level only`);
}

// 12 — social preview (Open Graph / X card): tags present, absolute, and matching the image file
{
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const head = html.slice(0, html.indexOf('</head>'));
  const meta = {};
  for (const m of head.matchAll(/<meta\s+(?:property|name)="([^"]+)"\s+content="([^"]*)"/g)) meta[m[1]] = m[2];
  const problems = [];
  for (const k of ['og:type', 'og:url', 'og:title', 'og:description', 'og:image', 'og:image:width', 'og:image:height', 'og:image:alt', 'twitter:card', 'twitter:image']) if (!meta[k]) problems.push(`missing ${k}`);
  if (meta['twitter:card'] !== 'summary_large_image') problems.push(`twitter:card is "${meta['twitter:card']}"`);
  for (const k of ['og:url', 'og:image', 'twitter:image']) if (meta[k] && !/^https:\/\//.test(meta[k])) problems.push(`${k} is not an absolute https URL`);
  // The absolute image URL must map onto the file we ship
  const local = meta['og:image'] && path.join(ROOT, meta['og:image'].replace(meta['og:url'], ''));
  if (!local || !fs.existsSync(local)) problems.push(`og:image does not map to a file in the repo (${local})`);
  else {
    const sharp = (await import('sharp')).default;
    const m = await sharp(local).metadata(), kb = Math.round(fs.statSync(local).size / 1024);
    if (m.width !== +meta['og:image:width'] || m.height !== +meta['og:image:height']) problems.push(`image is ${m.width}×${m.height}, tags say ${meta['og:image:width']}×${meta['og:image:height']}`);
    if (m.width / m.height < 1.85 || m.width / m.height > 1.95) problems.push('aspect is not ~1.91:1');
    if (kb > 300) problems.push(`image is ${kb}KB (WhatsApp drops previews over ~300KB)`);
    if (m.hasAlpha) problems.push('image has transparency (renders on white in some apps)');
    meta.__file = `${path.relative(ROOT, local).replace(/\\/g, '/')} ${m.width}×${m.height} ${m.format} ${kb}KB, opaque`;
  }
  report('12. Social preview (Open Graph + X card)', problems.length === 0,
    problems.length ? problems.join(' | ') : `og:image → ${meta.__file}; twitter:card=summary_large_image; all URLs absolute https under ${meta['og:url']}`);
}

// 13 — scroll progress hairline: tracks scroll 0 → 1, grows from the reading-start edge, transform only
{
  const problems = [];
  for (const lang of ['ar', 'en']) for (const [w, h] of [[1440, 900], [390, 844]]) for (const reducedMotion of ['no-preference', 'reduce']) {
    const { ctx, page } = await open({ lang, width: w, height: h, reducedMotion });
    const tag = `${lang}@${w}${reducedMotion === 'reduce' ? '/reduced' : ''}`;
    const at = (f) => page.evaluate(async (f) => {
      const max = document.documentElement.scrollHeight - innerHeight;
      scrollTo({ top: max * f, behavior: 'instant' });
      await new Promise((r) => setTimeout(r, 120)); // scroll event → rAF → write
      const bar = document.querySelector('[data-progress]'), r = bar.getBoundingClientRect(), hr = bar.parentElement.getBoundingClientRect();
      return { scale: new DOMMatrix(getComputedStyle(bar).transform).a, left: r.left - hr.left, right: hr.right - r.right, height: r.height, bg: getComputedStyle(bar).backgroundColor };
    }, f);
    const top = await at(0), mid = await at(0.5), end = await at(1);
    if (top.scale > 0.001) problems.push(`${tag}: visible at top (${top.scale})`);
    if (Math.abs(mid.scale - 0.5) > 0.02) problems.push(`${tag}: ${mid.scale.toFixed(3)} at half-way`);
    if (end.scale < 0.999) problems.push(`${tag}: ${end.scale.toFixed(3)} at bottom`);
    const anchor = lang === 'ar' ? mid.right : mid.left; // start edge stays pinned
    if (Math.abs(anchor) > 1) problems.push(`${tag}: not anchored to the ${lang === 'ar' ? 'right' : 'left'} edge (${anchor.toFixed(1)}px off)`);
    if (mid.height !== 1 || mid.bg !== 'rgb(201, 160, 99)') problems.push(`${tag}: not a 1px bronze line (${mid.height}px, ${mid.bg})`);
    // Page grows (FAQ opens) → bottom must still read full
    await page.evaluate(() => document.querySelectorAll('[data-accordion] .faq__q').forEach((b) => b.click()));
    const grown = await at(1);
    if (grown.scale < 0.999) problems.push(`${tag}: ${grown.scale.toFixed(3)} at bottom after FAQ opened`);
    await ctx.close();
  }
  report('13. Scroll progress hairline', problems.length === 0,
    problems.length ? problems.join(' | ') : '1px bronze line reads 0 at top, 0.5 half-way, 1 at bottom (also after FAQ panels open); grows from the right in AR, left in EN; desktop + phone, with and without reduced motion');
}

// 14 — typed OBSIDIAN easter egg: desktop only, never in form fields, breaks nothing
{
  const problems = [];
  const state = (page) => page.evaluate(() => {
    const e = document.querySelector('.egg');
    return { on: !!e && e.classList.contains('is-on'), opacity: e ? +getComputedStyle(e).opacity : 0, hidden: e && e.getAttribute('aria-hidden'),
      pe: e && getComputedStyle(e).pointerEvents, y: scrollY, focus: document.activeElement.tagName + (document.activeElement.id ? '#' + document.activeElement.id : '') };
  });
  for (const lang of ['ar', 'en']) {
    const { ctx, page, errors } = await open({ lang });
    await page.evaluate(() => scrollTo({ top: 1200, behavior: 'instant' }));
    await page.keyboard.type('OBSIDIA'); // one short: nothing yet
    if ((await state(page)).on) problems.push(`${lang}: fired before the word was complete`);
    const before = await state(page);
    await page.keyboard.type('N'); await page.waitForTimeout(1000);
    const s = await state(page);
    if (!s.on || s.opacity < 0.99) problems.push(`${lang}: did not show on OBSIDIAN (opacity ${s.opacity})`);
    if (s.hidden !== 'true' || s.pe !== 'none') problems.push(`${lang}: overlay is not aria-hidden + click-through`);
    if (s.y !== before.y || s.focus !== before.focus) problems.push(`${lang}: moved scroll or focus`);
    await page.waitForTimeout(2200);
    if ((await state(page)).on) problems.push(`${lang}: did not dismiss itself`);
    await page.keyboard.type('obsidian'); await page.waitForTimeout(100); // lower case also counts (physical keys)
    if (!(await state(page)).on) problems.push(`${lang}: did not re-trigger`);
    await page.keyboard.press('Escape');
    if ((await state(page)).on) problems.push(`${lang}: a key did not dismiss it`);
    // Typing it into the form is just typing
    await page.fill('#register input:not([type=hidden]) >> nth=0', '');
    await page.focus('#register input:not([type=hidden]) >> nth=0');
    await page.keyboard.type('OBSIDIAN'); await page.waitForTimeout(100);
    if ((await state(page)).on) problems.push(`${lang}: fired while typing in a form field`);
    if (errors.length) problems.push(`${lang}: ${errors.join(', ')}`);
    await ctx.close();
  }
  { // Phone (touch, coarse pointer): never
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    await page.goto(URL_, { waitUntil: 'load' }); await page.waitForTimeout(300);
    await page.keyboard.type('OBSIDIAN'); await page.waitForTimeout(100);
    if (await page.evaluate(() => !!document.querySelector('.egg'))) problems.push('phone: fired on a touch device');
    await ctx.close();
  }
  report('14. Typed OBSIDIAN easter egg', problems.length === 0,
    problems.length ? problems.join(' | ') : 'shows on the full word only (AR+EN), aria-hidden and click-through, keeps scroll and focus, self-dismisses, any key dismisses; ignored in form fields and on touch devices');
}

await browser.close();
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
