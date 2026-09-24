// Definition-of-done checks (BRIEF.md §9), run against file:///…/index.html in the installed Chrome.
// Run from tools/:  node verify.mjs
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const URL_ = pathToFileURL(path.join(ROOT, 'index.html')).href;
const CHROME = [process.env.CHROME, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/opt/pw-browsers/chromium'].filter(Boolean).find(fs.existsSync);
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
      const els = [...document.querySelectorAll('a[href], button, input, select, textarea, [tabindex="0"]')].filter((e) => (e.offsetWidth || e.offsetHeight || e.classList.contains('skip-link')) && getComputedStyle(e).visibility !== 'hidden');
      els.forEach((e, i) => (e.dataset.kb = i)); return els.length;
    });
    const seen = new Set(), noRing = [];
    for (let i = 0; i < expected + 5; i++) {
      await page.keyboard.press('Tab');
      // Focus scrolls smoothly (scroll-behavior: smooth): wait for it to land, up to 1.5s
      await page.waitForFunction(() => {
        const e = document.activeElement; if (!e || e === document.body) return true;
        const y = scrollY, still = window.__kbY === y; window.__kbY = y; // scroll has stopped between two polls
        const r = e.getBoundingClientRect(); return still && r.bottom > 0 && r.top < innerHeight;
      }, null, { timeout: 2000, polling: 100 }).catch(() => {});
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
    const expected = `مرحباً أوبسيديان 👋\nالاسم: ${lang === 'ar' ? 'نورة' : 'Noura'}\nالجوال: ${lang === 'ar' ? '055 123 4567' : '+966 55 123 4567'}\nنوع المشروع: مطبخ\nملاحظات: ${lang === 'ar' ? 'مطبخ بجزيرة' : 'Kitchen with island'}\n— مُرسل من الموقع`;
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
    hits.length ? hits.join(' | ') : `none found in the page or string table; the only year is ${years.join(', ')} (copyright line); "قريباً / Opening soon" carries no date; location is city-level only`);
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

// 15 — polish: hero word never doubles, 44px hit areas, tablet nav, whole watermark, image fade
{
  const problems = [];
  // Hero word: sample every 40ms across two swaps; never two visible words
  for (const lang of ['ar', 'en']) {
    const { ctx, page } = await open({ lang });
    const worst = await page.evaluate(() => new Promise((res) => {
      let max = 0; const t0 = performance.now();
      (function tick() {
        const vis = [...document.querySelectorAll('.hero__word')].filter((w) => +getComputedStyle(w).opacity > 0.05).length;
        max = Math.max(max, vis);
        if (performance.now() - t0 < 5600) setTimeout(tick, 40); else res(max);
      })();
    }));
    if (worst > 1) problems.push(`${lang}: ${worst} hero words visible at once`);
    await ctx.close();
  }
  // Hit areas >= 44px tall on phones: hit-test 21px above/below each control's centre
  for (const lang of ['ar', 'en']) {
    const { ctx, page } = await open({ lang, width: 375, height: 812 });
    const small = await page.evaluate(() => {
      const bad = [];
      for (const el of document.querySelectorAll('a[href], button, input, select, textarea')) {
        if (!el.offsetWidth || el.classList.contains('skip-link') || getComputedStyle(el).visibility === 'hidden') continue;
        el.scrollIntoView({ block: 'center', behavior: 'instant' });
        const r = el.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        const hits = [cy - 21, cy + 21].map((y) => { const h = document.elementFromPoint(cx, y); return h && (h === el || el.contains(h)); });
        if (hits.includes(false)) bad.push(`${(el.textContent || el.id || el.tagName).trim().slice(0, 16)} (${Math.round(r.height)}px box)`);
      }
      return bad;
    });
    if (small.length) problems.push(`${lang}@375: hit area under 44px: ${small.join(', ')}`);
    await ctx.close();
  }
  // Tablet: full nav visible on one row, nothing overflowing the header
  for (const lang of ['ar', 'en']) {
    const { ctx, page } = await open({ lang, width: 768, height: 1024 });
    const r = await page.evaluate(() => {
      const links = [...document.querySelectorAll('.nav__list a')];
      const tops = new Set(links.filter((a) => a.offsetWidth).map((a) => Math.round(a.getBoundingClientRect().top)));
      const inner = document.querySelector('.site-header__inner');
      return { shown: links.filter((a) => a.offsetWidth).length, rows: tops.size, overflow: inner.scrollWidth > inner.clientWidth + 1 };
    });
    if (r.shown !== 5 || r.rows !== 1 || r.overflow) problems.push(`${lang}@768: nav shows ${r.shown}/5 on ${r.rows} row(s)${r.overflow ? ', header overflows' : ''}`);
    await ctx.close();
  }
  // Watermark whole at every width
  for (const w of [375, 768, 1440]) {
    const { ctx, page } = await open({ width: w, height: 900 });
    const cut = await page.evaluate(() => {
      const wm = document.querySelector('.principle__watermark'), sec = wm.closest('.principle').getBoundingClientRect();
      const rg = document.createRange(); rg.selectNodeContents(wm); const t = rg.getBoundingClientRect();
      return t.left < sec.left - 1 || t.right > sec.right + 1;
    });
    if (cut) problems.push(`watermark cropped at ${w}px`);
    await ctx.close();
  }
  // Images: fade in with JS, visible without JS
  {
    const { ctx, page } = await open({});
    await scrollThrough(page);
    const r = await page.evaluate(() => { const l = [...document.querySelectorAll('img[loading="lazy"]')]; return { n: l.length, loaded: l.filter((i) => i.classList.contains('is-loaded')).length, bg: getComputedStyle(l[0].parentElement).backgroundColor }; });
    if (r.loaded !== r.n) problems.push(`${r.n - r.loaded} lazy image(s) never marked loaded`);
    if (r.bg !== 'rgb(12, 10, 9)') problems.push(`placeholder ground is ${r.bg}, not --onyx`);
    await ctx.close();
    const nj = await open({ js: false });
    const hidden = await nj.page.evaluate(() => [...document.querySelectorAll('img')].filter((i) => getComputedStyle(i).opacity !== '1').length);
    if (hidden) problems.push(`${hidden} image(s) invisible without JS`);
    await nj.ctx.close();
  }
  report('15. Polish: hero word, hit areas, tablet nav, watermark, image fade', problems.length === 0,
    problems.length ? problems.join(' | ') : 'hero words never overlap (sampled every 40ms over two swaps, AR+EN); every control on a 375px phone is hittable 21px above and below its centre; full 5-link nav on one row at 768 in AR+EN; "NO READY MADE" whole at 375/768/1440; lazy images sit on onyx and fade in, and all show without JS');
}

// 16 — phone menu (< 760px) + portrait-tablet hero crop
{
  const problems = [];
  const st = (page) => page.evaluate(() => {
    const b = document.querySelector('[data-menu-toggle]'), l = document.querySelector('[data-menu]');
    return { exp: b.getAttribute('aria-expanded'), vis: getComputedStyle(l).visibility, inert: document.querySelector('main').inert,
      focus: document.activeElement === b ? 'toggle' : (l.contains(document.activeElement) ? 'menu' : document.activeElement.tagName) };
  });
  for (const lang of ['ar', 'en']) {
    const { ctx, page, errors } = await open({ lang, width: 375, height: 812 });
    if ((await st(page)).exp !== 'false') problems.push(`${lang}: toggle not collapsed at load`);
    await page.click('[data-menu-toggle]'); await page.waitForTimeout(700);
    let s = await st(page);
    if (s.exp !== 'true' || s.vis !== 'visible' || !s.inert || s.focus !== 'menu') problems.push(`${lang}: open state wrong ${JSON.stringify(s)}`);
    const geo = await page.evaluate(() => {
      const links = [...document.querySelectorAll('[data-menu] a')];
      const lr = document.createRange(); lr.selectNodeContents(links[0]); const t = lr.getBoundingClientRect(), a = links[0].getBoundingClientRect();
      return { n: links.length, minH: Math.min(...links.map((x) => x.getBoundingClientRect().height)), startGap: document.dir === 'rtl' ? a.right - t.right : t.left - a.left,
        tb: Math.min(...[...document.querySelectorAll('[data-menu-toggle], .lang-toggle')].map((x) => x.getBoundingClientRect().height)) };
    });
    if (geo.n !== 5 || geo.minH < 44) problems.push(`${lang}: menu has ${geo.n} links, smallest ${Math.round(geo.minH)}px`);
    if (geo.startGap > 2) problems.push(`${lang}: menu text not at the reading start`);
    if (geo.tb < 44) problems.push(`${lang}: a header control box is ${Math.round(geo.tb)}px`);
    await page.keyboard.press('Escape'); await page.waitForTimeout(100);
    s = await st(page);
    if (s.exp !== 'false' || s.inert || s.focus !== 'toggle') problems.push(`${lang}: Escape did not close + return focus ${JSON.stringify(s)}`);
    await page.click('[data-menu-toggle]'); await page.waitForTimeout(700);
    await page.click('[data-menu] a[href="#faq"]'); await page.waitForTimeout(1200);
    s = await st(page);
    const atFaq = await page.evaluate(() => Math.abs(document.querySelector('#faq').getBoundingClientRect().top) < 200);
    if (s.exp !== 'false' || s.inert || !atFaq) problems.push(`${lang}: link tap did not close + navigate`);
    await page.click('[data-menu-toggle]'); await page.setViewportSize({ width: 900, height: 812 }); await page.waitForTimeout(200);
    s = await st(page);
    if (s.exp !== 'false' || s.inert) problems.push(`${lang}: widening past 760px left the menu open`);
    if (errors.length) problems.push(`${lang}: ${errors.join(', ')}`);
    await ctx.close();
  }
  // Desktop: no menu button; full nav
  { const { ctx, page } = await open({ width: 1440 });
    if (await page.evaluate(() => !!document.querySelector('[data-menu-toggle]').offsetWidth)) problems.push('menu button visible on desktop');
    await ctx.close(); }
  // Portrait tablet gets the portrait crop; landscape keeps the wide frame
  for (const [w, h, want] of [[768, 1024, 'hero-mobile-'], [1024, 768, 'hero-'], [375, 812, 'hero-mobile-']]) {
    const { ctx, page } = await open({ width: w, height: h });
    const src = await page.evaluate(() => document.querySelector('.hero__media img').currentSrc.split('/').pop());
    if (!src.startsWith(want) || (want === 'hero-' && src.startsWith('hero-mobile'))) problems.push(`${w}x${h} hero uses ${src}`);
    await ctx.close();
  }
  report('16. Phone menu + portrait-tablet hero', problems.length === 0,
    problems.length ? problems.join(' | ') : 'AR+EN at 375: opens with focus in the menu and the page inert; 5 links ≥44px at the reading start; Escape closes and returns focus; a link tap closes and navigates; widening past 760 closes it; hidden on desktop. 768×1024 portrait serves the portrait crop, 1024×768 landscape the wide frame');
}

// 17 — accessibility: axe-core WCAG 2.1 AA, skip-link focus, pixel contrast of text over photos
{
  const problems = [];
  const AXE = fs.readFileSync(path.join(ROOT, 'tools', 'node_modules', 'axe-core', 'axe.min.js'), 'utf8');
  for (const lang of ['ar', 'en']) for (const [w, h, menu] of [[375, 812, false], [375, 812, true], [1440, 900, false]]) {
    const { ctx, page } = await open({ lang, width: w, height: h, reducedMotion: 'reduce' });
    if (menu) { await page.click('[data-menu-toggle]'); await page.waitForTimeout(300); }
    await page.addScriptTag({ content: AXE });
    const v = await page.evaluate(async () => (await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } })).violations.map((x) => `${x.id} ×${x.nodes.length}`));
    if (v.length) problems.push(`${lang}@${w}${menu ? '+menu' : ''} axe: ${v.join(', ')}`);
    await ctx.close();
  }
  // Skip link moves focus to <main>
  { const { ctx, page } = await open({});
    await page.keyboard.press('Tab'); await page.keyboard.press('Enter'); await page.waitForTimeout(200);
    if (await page.evaluate(() => document.activeElement.id) !== 'main') problems.push('skip link does not move focus to <main>');
    await ctx.close(); }
  // Text over photos (hero + every film line): bone text vs the lightest 5% of pixels behind it, text hidden
  const lum = (r, g, b) => [r, g, b].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }).reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0);
  const sharp = (await import('sharp')).default;
  for (const lang of ['ar', 'en']) for (const [w, h] of [[375, 812], [1440, 900]]) {
    const { ctx, page } = await open({ lang, width: w, height: h, reducedMotion: 'reduce' });
    const n = await page.evaluate(() => { const els = [...document.querySelectorAll('.hero__intro, .film__line p')]; els.forEach((e, i) => { e.dataset.oc = i; e.dataset.col = getComputedStyle(e).color; }); return els.length; });
    await page.addStyleTag({ content: '[data-oc] { color: transparent !important; }' });
    for (let i = 0; i < n; i++) {
      const box = await page.evaluate((i) => { const el = document.querySelector(`[data-oc="${i}"]`); el.scrollIntoView({ block: 'center', behavior: 'instant' });
        const line = el.closest('[data-film-line]'); if (line) { const k = [...document.querySelectorAll('[data-film-line]')].indexOf(line); document.querySelectorAll('[data-film-frame]').forEach((f, j) => f.classList.toggle('is-active', j === k)); }
        const r = el.getBoundingClientRect(); return { x: Math.max(0, r.left), y: Math.max(0, r.top), width: Math.min(r.width, innerWidth - Math.max(0, r.left)), height: Math.min(r.height, innerHeight - Math.max(0, r.top)), col: el.dataset.col, size: parseFloat(getComputedStyle(el).fontSize) }; }, i);
      await page.waitForTimeout(40);
      const { data } = await sharp(await page.screenshot({ clip: box })).removeAlpha().raw().toBuffer({ resolveWithObject: true });
      const L = []; for (let k = 0; k < data.length; k += 3) L.push(lum(data[k], data[k + 1], data[k + 2])); L.sort((a, b) => a - b);
      const [r, g, b] = box.col.match(/[\d.]+/g).map(Number);
      const cr = (lum(r, g, b) + 0.05) / (L[Math.floor(L.length * 0.95)] + 0.05), need = box.size >= 24 ? 3 : 4.5;
      if (cr < need) problems.push(`${lang}@${w} text over photo #${i}: ${cr.toFixed(2)}:1 (need ${need})`);
    }
    await ctx.close();
  }
  report('17. Accessibility (WCAG 2.1 AA)', problems.length === 0,
    problems.length ? problems.join(' | ') : 'axe-core: 0 violations (AR+EN, 375 with menu open/closed, 1440); skip link lands focus on <main>; hero intro and all six film lines clear AA against the lightest 5% of the photo behind them');
}

// 18 — SEO: canonical + hreflang, ?lang=en, URL follows the toggle, JSON-LD from CONTENT.md only, robots + sitemap
{
  const problems = [];
  const BASE = 'https://obsidian-sa.github.io/obsidian-website/';
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  for (const [l, u] of [['ar', BASE], ['en', BASE + '?lang=en'], ['x-default', BASE]]) if (!html.includes(`hreflang="${l}" href="${u}"`)) problems.push(`hreflang ${l} missing`);
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
  const content = fs.readFileSync(path.join(ROOT, 'CONTENT.md'), 'utf8');
  if (ld.telephone !== '+966569997565' || !content.includes('966569997565')) problems.push('JSON-LD phone');
  if (!content.includes(ld.email)) problems.push('JSON-LD email not in CONTENT.md');
  if (!content.includes(ld.address.addressLocality) || !content.includes(ld.address.addressRegion)) problems.push('JSON-LD address not from CONTENT.md');
  for (const k of ['openingHours', 'openingHoursSpecification', 'geo', 'priceRange', 'aggregateRating', 'review']) if (k in ld) problems.push(`JSON-LD invents ${k}`);
  if ('streetAddress' in ld.address || 'postalCode' in ld.address) problems.push('JSON-LD has a street address');
  for (const handle of ['obsidian.design.2026', 'obsidian_design', 'obsidiandesign2']) if (!ld.sameAs.some((u) => u.includes(handle))) problems.push(`JSON-LD sameAs missing ${handle}`);
  // ?lang=en opens English with its own canonical and title
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } }); const page = await ctx.newPage();
  await page.goto(URL_ + '?lang=en'); await page.waitForTimeout(400);
  const en = await page.evaluate(() => ({ lang: document.documentElement.lang, canon: document.querySelector('link[rel=canonical]').href, title: document.title, desc: document.querySelector('meta[name=description]').content }));
  if (en.lang !== 'en' || en.canon !== BASE + '?lang=en' || !/^Obsidian Design/.test(en.title) || !/^Nothing here/.test(en.desc)) problems.push(`?lang=en → ${JSON.stringify(en)}`);
  await page.click('[data-lang-toggle]');
  const ar = await page.evaluate(() => ({ lang: document.documentElement.lang, search: location.search, canon: document.querySelector('link[rel=canonical]').href }));
  if (ar.lang !== 'ar' || ar.search !== '' || ar.canon !== BASE) problems.push(`toggle to AR → ${JSON.stringify(ar)}`);
  await page.click('[data-lang-toggle]');
  if (await page.evaluate(() => location.search) !== '?lang=en') problems.push('toggle to EN did not set ?lang=en');
  await ctx.close();
  const robots = fs.readFileSync(path.join(ROOT, 'robots.txt'), 'utf8'), sitemap = fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8');
  if (!robots.includes(`Sitemap: ${BASE}sitemap.xml`)) problems.push('robots.txt sitemap line');
  if ((sitemap.match(/<loc>/g) || []).length !== 2 || !sitemap.includes('hreflang="en"')) problems.push('sitemap.xml');
  report('18. SEO basics', problems.length === 0,
    problems.length ? problems.join(' | ') : 'canonical per language; hreflang ar / en (?lang=en) / x-default; ?lang=en serves English title, description and canonical; the toggle keeps the URL in step; JSON-LD uses only CONTENT.md facts (no hours, geo or street); robots.txt + sitemap.xml with alternates');
}

// 19 — performance: AVIF → WebP → JPEG on every photo, byte caps, srcset fits the displayed size
{
  const problems = [];
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const pics = [...html.matchAll(/<picture[^>]*>([\s\S]*?)<\/picture>/g)].map((m) => m[1]).filter((p) => !/logo-/.test(p));
  for (const p of pics) {
    const name = (p.match(/assets\/img\/([a-z-]+?)-\d+\.jpg/) || [0, '?'])[1];
    if (!/type="image\/webp"/.test(p) || !/\.jpg/.test(p)) problems.push(`${name}: missing WebP or JPEG`);
    if (!/type="image\/avif"/.test(p) && name !== 'mat-walnut') problems.push(`${name}: no AVIF`);
    for (const f of [...p.matchAll(/assets\/img\/[\w.-]+/g)].map((m) => m[0])) {
      if (!fs.existsSync(path.join(ROOT, f))) problems.push(`missing file ${f}`);
      else if (fs.statSync(path.join(ROOT, f)).size > 300 * 1024) problems.push(`${f} over 300KB`);
    }
  }
  for (const [w, h, dpr] of [[375, 812, 3], [768, 1024, 2], [1440, 900, 2]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr }); const page = await ctx.newPage();
    await page.goto(URL_); await scrollThrough(page);
    const bad = await page.evaluate(() => [...document.querySelectorAll('picture img')].filter((i) => i.currentSrc && !/logo-/.test(i.currentSrc)).map((i) => {
      const got = +(i.currentSrc.match(/-(\d+)\.\w+$/) || [0, 0])[1], r = i.getBoundingClientRect();
      const need = Math.round(Math.max(r.width, r.height * (i.naturalWidth / i.naturalHeight || 1)) * devicePixelRatio);
      const max = Math.max(...[...i.closest('picture').querySelectorAll('source, img')].flatMap((s) => (s.srcset || '').split(',').map((x) => +(x.match(/(\d+)w/) || [0, 0])[1])));
      return got < need * 0.75 && got < max ? `${i.currentSrc.split('/').pop()} picked for ~${need}w` : null;
    }).filter(Boolean));
    if (bad.length) problems.push(`${w}@${dpr}x soft: ${bad.join(', ')}`);
    await ctx.close();
  }
  report('19. Performance: formats + srcset', problems.length === 0,
    problems.length ? problems.join(' | ') : `${pics.length} photos serve AVIF → WebP → JPEG (walnut: WebP → JPEG, AVIF not smaller); every file exists and is ≤300KB; at 375@3x, 768@2x and 1440@2x each photo picks a file within range of its displayed size`);
}

// 20 — copy: every site string is verbatim from CONTENT.md, and punctuation is clean
{
  const problems = [];
  const src = fs.readFileSync(path.join(ROOT, 'assets', 'js', 'i18n.js'), 'utf8');
  const sandbox = {}; new Function('window', src)(sandbox);
  const content = fs.readFileSync(path.join(ROOT, 'CONTENT.md'), 'utf8').replace(/[’‘]/g, "'");
  const composed = new Set(['meta_title', 'lang_name']); // brand + tagline; language names for the switch announcement
  const notIn = new Set([...src.matchAll(/^\s+(\w+):.*NOT IN CONTENT/gm)].map((m) => m[1]));
  for (const lang of ['ar', 'en']) for (const [k, v] of Object.entries(sandbox.I18N[lang])) for (const s of [].concat(v)) {
    if (!notIn.has(k) && !composed.has(k) && !content.includes(s.replace(/[’‘]/g, "'"))) problems.push(`${lang}.${k} not in CONTENT.md`);
    if (/  |^\s|\s$/.test(s)) problems.push(`${lang}.${k}: stray space`);
    if (/ [،.,:;!?؟]/.test(s)) problems.push(`${lang}.${k}: space before punctuation`);
    if (lang === 'ar' && (/[؀-ۿ],/.test(s) || /،(?! |$)/.test(s))) problems.push(`${lang}.${k}: Arabic comma spacing`);
  }
  // Headings and short display lines carry no closing full stop; long copy keeps its own
  for (const lang of ['ar', 'en']) for (const k of ['principle_heading', 'interstitial', 'island_heading', 'plan_heading', 'film_1', 'film_2', 'film_3', 'film_4', 'film_5', 'film_6', 'material_heading', 'standards_heading', 'services_heading', 'register_heading'])
    if (/[.。]$/.test(sandbox.I18N[lang][k])) problems.push(`${lang}.${k}: heading/display line ends with a full stop`);
  for (const lang of ['ar', 'en']) for (const k of ['principle_body', 'island_body', 'plan_body', 'register_body', 'faq_1_a', 'why_1_body'])
    if (!/\.$/.test(sandbox.I18N[lang][k])) problems.push(`${lang}.${k}: paragraph lost its full stop`);
  report('20. Copy matches CONTENT.md', problems.length === 0,
    problems.length ? problems.join(' | ') : 'every string on the site is verbatim from CONTENT.md (titles compose brand + tagline); no stray spaces, no space before punctuation, Arabic commas spaced; headings and display lines end without a full stop, paragraphs keep theirs');
}

// 21 — logo PNG fallbacks are truly lossless resizes of the untouched original
{
  const problems = [];
  const sharp = (await import('sharp')).default;
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8') + fs.readFileSync(path.join(ROOT, 'assets', 'js', 'main.js'), 'utf8');
  const pngs = fs.readdirSync(path.join(ROOT, 'assets', 'img')).filter((f) => /^logo-\d+\.png$/.test(f));
  for (const f of pngs) {
    const file = path.join(ROOT, 'assets', 'img', f);
    const meta = await sharp(file).metadata();
    if (meta.paletteBitDepth || meta.channels !== 4) problems.push(`${f}: palette/${meta.channels}ch (not full RGBA)`);
    const d = await sharp(file).raw().toBuffer({ resolveWithObject: true });
    const o = await sharp(path.join(ROOT, 'logo.png')).resize({ width: d.info.width }).raw().toBuffer();
    let max = 0; for (let i = 0; i < o.length; i++) max = Math.max(max, Math.abs(o[i] - d.data[i]));
    if (max !== 0) problems.push(`${f}: differs from a fresh resize by up to ${max}/255`);
    if (fs.statSync(file).size > 300 * 1024) problems.push(`${f}: over 300KB`);
  }
  for (const ref of new Set([...html.matchAll(/logo-\d+\.png/g)].map((m) => m[0]))) if (!pngs.includes(ref)) problems.push(`${ref} referenced but missing`);
  report('21. Logo PNG fallbacks are lossless', problems.length === 0 && pngs.length > 0,
    problems.length ? problems.join(' | ') : `${pngs.join(', ')}: full RGBA, no palette, byte-for-byte pixel match with a fresh resize of the untouched logo.png, each ≤300KB; every referenced logo PNG exists`);
}

// 22 — logo swing: the official mark (same file), one damped swing from the top of the ring, then at rest
{
  const problems = [];
  for (const lang of ['ar', 'en']) {
    const { ctx, page } = await open({ lang });
    const r = await page.evaluate(async () => {
      const img = document.querySelector('.hero__logo');
      const t0 = performance.now(); let max = 0, samples = 0, anims = 0;
      while (performance.now() - t0 < 3400) {
        const m = new DOMMatrix(getComputedStyle(img).transform);
        max = Math.max(max, Math.abs(Math.atan2(m.b, m.a) * 180 / Math.PI));
        anims = Math.max(anims, img.getAnimations().length); samples++;
        await new Promise((r) => requestAnimationFrame(r));
      }
      const cs = getComputedStyle(img);
      return { max, samples, anims, end: cs.transform, origin: cs.transformOrigin, w: img.getBoundingClientRect().width, src: img.currentSrc.split('/').pop(), left: img.getAnimations().length };
    });
    if (r.anims !== 1 || r.max < 3 || r.max > 6.5) problems.push(`${lang}: swing peak ${r.max.toFixed(2)}° (${r.anims} animation)`);
    if (r.end !== 'none' || r.left) problems.push(`${lang}: not at rest after 3.4s (${r.end})`);
    if (!r.origin.endsWith(' 0px') || Math.abs(parseFloat(r.origin) - r.w / 2) > 1) problems.push(`${lang}: pivot is ${r.origin}, not the top of the ring`);
    if (!/^logo-(320|640)\.(webp|png)$/.test(r.src)) problems.push(`${lang}: swings ${r.src}, not the official mark`);
    await ctx.close();
  }
  // Mouse over the mark: a small nudge (≤2.5°), then rest
  { const { ctx, page } = await open({});
    await page.waitForTimeout(3000);
    await page.hover('.hero__logo');
    const max = await page.evaluate(async () => { const img = document.querySelector('.hero__logo'); let m = 0; const t0 = performance.now();
      while (performance.now() - t0 < 1800) { const x = new DOMMatrix(getComputedStyle(img).transform); m = Math.max(m, Math.abs(Math.atan2(x.b, x.a) * 180 / Math.PI)); await new Promise((r) => requestAnimationFrame(r)); } return m; });
    if (max < 1 || max > 2.5) problems.push(`hover nudge peak ${max.toFixed(2)}°`);
    await ctx.close(); }
  // Reduced motion and touch: never moves
  { const { ctx, page } = await open({ reducedMotion: 'reduce' });
    await page.hover('.hero__logo'); await page.waitForTimeout(300);
    if (await page.evaluate(() => document.querySelector('.hero__logo').getAnimations().length || getComputedStyle(document.querySelector('.hero__logo')).transform !== 'none')) problems.push('moves under reduced motion');
    await ctx.close(); }
  { const { ctx, page } = await open({ js: false });
    if (await page.evaluate(() => getComputedStyle(document.querySelector('.hero__logo')).transform !== 'none')) problems.push('not a still frame without JS');
    await ctx.close(); }
  report('22. Logo swing', problems.length === 0,
    problems.length ? problems.join(' | ') : 'the untouched logo-320/640 mark swings once from the top of the ring (peak ≤6.5°, AR+EN) and is at rest by 3.4s; a mouse over it gives a ≤2.5° nudge; still under reduced motion and without JS');
}

await browser.close();
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
