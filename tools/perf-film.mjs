// Film smoothness gate: scroll through the film section at a steady reading pace on an emulated
// mid-range phone (375×812 @3x, touch, CPU ×4 and ×6) and record every frame.
// Run from tools/ with the site served (node serve.mjs .. 8790):  BASE=http://127.0.0.1:8790/ node perf-film.mjs
// Reports: frames over 20ms (a dropped frame at 60Hz), p95 frame time, and main-thread work per frame
// inside the film (Long Animation Frames). Compare two builds by serving each and passing BASE.
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const BASE = process.env.BASE || 'http://127.0.0.1:8790/';
const CHROME = [process.env.CHROME, 'C:/Program Files/Google/Chrome/Application/chrome.exe', '/opt/pw-browsers/chromium'].filter(Boolean).find(fs.existsSync);
const RUNS = +(process.env.RUNS || 3);
const browser = await chromium.launch({ executablePath: CHROME });
const pct = (a, q) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * q))]; };

for (const [label, vp] of [['phone 375', { viewport: { width: 375, height: 812 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }], ['tablet 768', { viewport: { width: 768, height: 1024 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }], ['desktop 1440', { viewport: { width: 1440, height: 900 } }]])
for (const cpu of label.startsWith('desktop') ? [1] : [4, 6]) {
  const all = [], busy = [];
  for (let run = 0; run < RUNS; run++) {
    const ctx = await browser.newContext(vp);
    await ctx.addInitScript(() => { try { sessionStorage.setItem('obsidian-intro', '1'); } catch (e) {} });
    const page = await ctx.newPage();
    await page.goto(BASE, { waitUntil: 'load' });
    // Park just above the film and let every frame load and decode (a reader arrives with them warm)
    await page.evaluate(() => scrollTo({ top: document.querySelector('[data-film]').offsetTop - innerHeight * 1.2, behavior: 'instant' }));
    await page.waitForTimeout(600);
    await page.evaluate(() => scrollTo({ top: document.querySelector('[data-film]').offsetTop - innerHeight * 0.9, behavior: 'instant' }));
    await page.evaluate(() => Promise.all([...document.querySelectorAll('[data-film-frame] img')].map((i) => { i.loading = 'eager'; return i.decode().catch(() => {}); })));
    await page.waitForTimeout(400);
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });
    const r = await page.evaluate(() => new Promise((res) => {
      const film = document.querySelector('[data-film]');
      const from = scrollY, to = film.offsetTop + film.offsetHeight - innerHeight * 0.2;
      const speed = innerHeight * 0.9; // px per second: an unhurried read
      const loaf = [];
      try { new PerformanceObserver((l) => { for (const e of l.getEntries()) loaf.push(e.duration); }).observe({ type: 'long-animation-frame' }); } catch (e) {}
      const times = []; let last = 0, t0 = 0;
      function tick(now) {
        if (!t0) t0 = now;
        if (last) times.push(now - last);
        last = now;
        const y = Math.min(to, from + (now - t0) / 1000 * speed);
        scrollTo(0, y);
        if (y < to) requestAnimationFrame(tick); else setTimeout(() => res({ times, loaf, px: to - from }), 300);
      }
      requestAnimationFrame(tick);
    }));
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    all.push(...r.times); busy.push(...r.loaf);
    await ctx.close();
  }
  const over = all.filter((t) => t > 20).length;
  console.log(`${label} cpu×${cpu}`.padEnd(20), JSON.stringify({ frames: all.length, dropped: `${(over / all.length * 100).toFixed(1)}%`, p50: +pct(all, 0.5).toFixed(1), p95: +pct(all, 0.95).toFixed(1), longFrames: busy.length, worstLongFrame: busy.length ? Math.round(Math.max(...busy)) : 0 }));
}
await browser.close();
