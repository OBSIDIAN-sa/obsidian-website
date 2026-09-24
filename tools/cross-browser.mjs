// Cross-engine check: Chromium (installed Chrome), Firefox and WebKit via Playwright, at 375/768/1440,
// Arabic and English. Functional checks + screenshots for visual comparison.
// Run from tools/ with the site served over http:  BASE=http://127.0.0.1:8790/ node cross-browser.mjs
// (needs: npx playwright install firefox webkit)
import { chromium, firefox, webkit } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.BASE || 'http://127.0.0.1:8790/';
const OUT = process.env.OUT || path.join(process.cwd(), 'cross-browser-shots');
fs.mkdirSync(OUT, { recursive: true });
const engines = [
  ['chrome', () => chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' })],
  ['firefox', () => firefox.launch()],
  ['webkit', () => webkit.launch()],
];
const problems = [], summary = [];

for (const [name, launch] of engines) {
  const browser = await launch();
  for (const [w, h] of [[375, 812], [768, 1024], [1440, 900]]) for (const lang of ['ar', 'en']) {
    const key = `${name} ${lang}@${w}`;
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: w < 1000 && name !== 'firefox', isMobile: w < 1000 && name !== 'firefox' });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(BASE + (lang === 'en' ? '?lang=en' : ''), { waitUntil: 'load' });
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
    for (let y = 0; y < H; y += 450) { await page.evaluate((y) => scrollTo(0, y), y); await page.waitForTimeout(50); }
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
      await page.evaluate(() => scrollTo(0, 0));
      await page.click('[data-menu-toggle]'); await page.waitForTimeout(700);
      const open = await page.evaluate(() => getComputedStyle(document.querySelector('[data-menu]')).visibility === 'visible' && document.querySelector('main').inert === true);
      await page.screenshot({ path: `${OUT}/${name}-${lang}${w}-menu.jpg`, type: 'jpeg', quality: 60 });
      await page.keyboard.press('Escape'); await page.waitForTimeout(100);
      const closed = await page.evaluate(() => document.querySelector('[data-menu-toggle]').getAttribute('aria-expanded') === 'false');
      if (!open || !closed) problems.push(`${key}: menu open=${open} closedOnEscape=${closed}`);
    }
    if (errors.length) problems.push(`${key}: ${[...new Set(errors)].join(' | ').slice(0, 200)}`);
    summary.push(`${key}: hero ${r.hero}`);
    await ctx.close();
  }
  await browser.close();
}
console.log(summary.filter((s) => /@(375|1440)/.test(s)).join('\n'));
console.log(problems.length ? `\n${problems.length} problem(s):\n  ` + problems.join('\n  ') : '\nall 18 engine/width/language combinations pass');
process.exit(problems.length ? 1 : 0);
