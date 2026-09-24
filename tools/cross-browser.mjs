// Cross-engine check: Chromium (installed Chrome), Firefox and WebKit via Playwright, at 375/768/1440,
// Arabic and English. Functional checks + screenshots for visual comparison.
// Run from tools/ with the site served over http:  BASE=http://127.0.0.1:8790/ node cross-browser.mjs
// (needs: npx playwright install chromium firefox webkit — CI does this, see .github/workflows/cross-browser.yml)
// Each context is a first visit, so the intro curtain runs; Phase 2 behaviour is checked per engine too.
import { chromium, firefox, webkit } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.BASE || 'http://127.0.0.1:8790/';
const OUT = process.env.OUT || path.join(process.cwd(), 'cross-browser-shots');
fs.mkdirSync(OUT, { recursive: true });
const engines = [
  ['chrome', () => chromium.launch(fs.existsSync(process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe') ? { executablePath: process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe' } : {})],
  ['firefox', () => firefox.launch()],
  ['webkit', () => webkit.launch()],
];
const problems = [], summary = [];

const only = process.env.ENGINES ? process.env.ENGINES.split(',') : null; // e.g. ENGINES=chrome
for (const [name, launch] of engines.filter(([n]) => !only || only.includes(n))) {
  const browser = await launch();
  for (const [w, h] of [[375, 812], [768, 1024], [1440, 900]]) for (const lang of ['ar', 'en']) {
    const key = `${name} ${lang}@${w}`;
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: w < 1000 && name !== 'firefox', isMobile: w < 1000 && name !== 'firefox' });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    // Phase 2 · intro curtain: recorded from the first frame (after the head script has run)
    await ctx.addInitScript(() => { window.__intro = { seen: false, at: 0 };
      (function poll() { const on = document.documentElement && document.documentElement.classList.contains('intro');
        if (on) window.__intro.seen = true; else if (document.documentElement) { window.__intro.at = performance.now(); return; }
        requestAnimationFrame(poll); })(); });
    await page.goto(BASE + (lang === 'en' ? '?lang=en' : ''), { waitUntil: 'load' });
    await page.waitForFunction(() => window.__intro.at > 0, null, { timeout: 5000 }).catch(() => {});
    const intro = await page.evaluate(() => window.__intro);
    if (!intro.seen) problems.push(`${key}: intro curtain did not show on a first visit`);
    if (!intro.at || intro.at > 1650) problems.push(`${key}: intro curtain still up at ${Math.round(intro.at)}ms`);
    await page.waitForTimeout(900);
    const r = await page.evaluate(async () => {
      await document.fonts.ready;
      const fonts = [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family.replace(/"/g, ''));
      const hero = document.querySelector('.hero__media img').currentSrc.split('/').pop();
      return { lang: document.documentElement.lang, dir: document.documentElement.dir, fonts: [...new Set(fonts)], hero, overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth };
    });
    if (r.lang !== lang || r.dir !== (lang === 'ar' ? 'rtl' : 'ltr')) problems.push(`${key}: lang/dir ${r.lang}/${r.dir}`);
    if (r.overflow > 0) problems.push(`${key}: horizontal overflow ${r.overflow}px`);
    if (!r.fonts.includes(lang === 'ar' ? 'Tajawal' : 'Inter') || !r.fonts.includes('Cormorant Garamond')) problems.push(`${key}: fonts ${r.fonts.join(',')}`);
    await page.screenshot({ path: `${OUT}/${name}-${lang}${w}-hero.jpg`, type: 'jpeg', quality: 60 });

    // Scroll through: reveals and lazy images must land
    const H = await page.evaluate(() => document.documentElement.scrollHeight);
    for (let y = 0; y < H; y += 450) { await page.evaluate((y) => scrollTo({ top: y, behavior: 'instant' }), y); await page.waitForTimeout(50); }
    // The material strip scrolls sideways: swipe it end to end, as a visitor would
    await page.evaluate(async () => { const t = document.querySelector('.material__track'); t.scrollIntoView({ block: 'center' }); const dir = document.dir === 'rtl' ? -1 : 1; for (let i = 0; i < 8; i++) { t.scrollBy({ left: dir * 300, behavior: 'instant' }); await new Promise((r) => setTimeout(r, 120)); } });
    await page.waitForTimeout(1300);
    const s = await page.evaluate(() => ({
      hidden: [...document.querySelectorAll('[data-reveal]')].filter((e) => getComputedStyle(e).opacity !== '1').length,
      imgs: [...document.querySelectorAll('img[loading="lazy"]')].filter((i) => !(i.complete && i.naturalWidth)).length,
      wm: (() => { const wm = document.querySelector('.principle__watermark'), sec = wm.closest('.principle').getBoundingClientRect(); const rg = document.createRange(); rg.selectNodeContents(wm); const t = rg.getBoundingClientRect(); return t.left >= sec.left - 1 && t.right <= sec.right + 1; })(),
    }));
    if (s.hidden) problems.push(`${key}: ${s.hidden} reveal(s) never shown`);
    if (s.imgs) problems.push(`${key}: ${s.imgs} lazy image(s) not loaded`);
    if (!s.wm) problems.push(`${key}: watermark cropped`);

    // Interactions: FAQ, form validation, phone menu
    await page.evaluate(() => document.querySelector('#faq').scrollIntoView());
    await page.click('#faq-2-q');
    if ((await page.getAttribute('#faq-2-q', 'aria-expanded')) !== 'true') problems.push(`${key}: FAQ did not open`);
    await page.evaluate(() => { window.open = () => ({}); document.querySelector('#register').scrollIntoView(); });
    await page.click('.form__submit');
    if (!(await page.evaluate(() => document.querySelector('#f-name-err').textContent.trim()))) problems.push(`${key}: form validation silent`);
    await page.evaluate(() => document.querySelector('#register').scrollIntoView({ block: 'start' }));
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${OUT}/${name}-${lang}${w}-form.jpg`, type: 'jpeg', quality: 60 });
    if (w < 760) {
      await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
      await page.click('[data-menu-toggle]'); await page.waitForTimeout(700);
      const open = await page.evaluate(() => getComputedStyle(document.querySelector('[data-menu]')).visibility === 'visible' && document.querySelector('main').inert === true);
      await page.screenshot({ path: `${OUT}/${name}-${lang}${w}-menu.jpg`, type: 'jpeg', quality: 60 });
      await page.keyboard.press('Escape'); await page.waitForTimeout(100);
      const closed = await page.evaluate(() => document.querySelector('[data-menu-toggle]').getAttribute('aria-expanded') === 'false');
      if (!open || !closed) problems.push(`${key}: menu open=${open} closedOnEscape=${closed}`);
    }
    // Phase 2 · film scrub: a mid-dissolve playhead shows exactly two frames, both partly
    const film = await page.evaluate(async () => {
      const line = document.querySelectorAll('[data-film-line]')[1], r = line.getBoundingClientRect();
      scrollTo({ top: scrollY + r.top + r.height * 0.8 - innerHeight / 2, behavior: 'instant' });
      await new Promise((res) => setTimeout(res, 80)); // IntersectionObserver + rAF
      await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
      const o = [...document.querySelectorAll('[data-film-frame]')].map((el) => +getComputedStyle(el).opacity);
      return { scrub: document.querySelector('[data-film]').classList.contains('is-scrub'), o };
    });
    if (!film.scrub || film.o.filter((x) => x > 0.001).length !== 2 || !(film.o[2] > 0 && film.o[2] < 1)) problems.push(`${key}: film not scrubbing (${JSON.stringify(film)})`);
    await page.waitForTimeout(250);
    await page.screenshot({ path: `${OUT}/${name}-${lang}${w}-film.jpg`, type: 'jpeg', quality: 60 });
    // Phase 2 · pointer effects: desktop mouse gets the cursor + magnet; touch contexts never get the cursor
    const touch = w < 1000 && name !== 'firefox';
    await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' })); await page.waitForTimeout(300);
    const btn = await page.evaluate(() => { const b = document.querySelector('.hero .btn').getBoundingClientRect(); return [b.right + 12, b.top - 10]; });
    if (!touch) {
      await page.mouse.move(btn[0] - 200, btn[1] + 120); await page.mouse.move(btn[0], btn[1], { steps: 6 }); await page.waitForTimeout(450);
      const p = await page.evaluate(() => ({ cursor: document.documentElement.classList.contains('has-cursor'), pull: getComputedStyle(document.querySelector('.hero .btn')).transform }));
      if (!p.cursor) problems.push(`${key}: custom cursor did not switch on for the mouse`);
      if (p.pull === 'none') problems.push(`${key}: magnetic button did not move`);
      if (w === 1440) await page.screenshot({ path: `${OUT}/${name}-${lang}${w}-pointer.jpg`, type: 'jpeg', quality: 70, clip: { x: btn[0] - 360, y: btn[1] - 80, width: 460, height: 200 } });
    } else if (await page.evaluate(() => !!document.querySelector('.cursor') || document.documentElement.classList.contains('has-cursor'))) problems.push(`${key}: custom cursor on a touch device`);
    // Phase 2 · second visit in the same tab: no curtain
    await page.reload({ waitUntil: 'load' });
    if ((await page.evaluate(() => window.__intro)).seen) problems.push(`${key}: curtain shown again on a repeat visit`);
    if (errors.length) problems.push(`${key}: ${[...new Set(errors)].join(' | ').slice(0, 200)}`);
    summary.push(`${key}: hero ${r.hero}; curtain lifted at ${Math.round(intro.at)}ms`);
    await ctx.close();
  }
  await browser.close();
}
console.log(summary.filter((s) => /@(375|1440)/.test(s)).join('\n'));
console.log(problems.length ? `\n${problems.length} problem(s):\n  ` + problems.join('\n  ') : `\nall ${summary.length} engine/width/language combinations pass`);
process.exit(problems.length ? 1 : 0);
