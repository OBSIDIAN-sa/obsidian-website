// LCP / CLS on a throttled phone and on desktop, over http (like GitHub Pages).
// Run from tools/ with the site served gzip'd, like GitHub Pages:  node serve.mjs .. 8790
//   BASE=http://127.0.0.1:8790/ RUNS=5 node perf.mjs
// Phone: 375×812 @3x, touch, Slow 4G (150ms RTT, 1.6Mbps down), CPU ×4. Desktop: 1440×900 @1x, 40ms RTT, 10Mbps.
// Each run is a cold first visit (fresh context, empty cache, empty sessionStorage). Reports medians.
// REPEAT=1: same cold cache, but as a repeat visit in the tab (no intro curtain).
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const BASE = process.env.BASE || 'http://127.0.0.1:8790/';
const RUNS = +(process.env.RUNS || 5);
const CHROME = [process.env.CHROME, 'C:/Program Files/Google/Chrome/Application/chrome.exe', '/opt/pw-browsers/chromium'].filter(Boolean).find(fs.existsSync);
const profiles = {
  phone: { viewport: { width: 375, height: 812 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, net: { latency: 150, down: 1.6e6 / 8, up: 750e3 / 8 }, cpu: 4 },
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false, net: { latency: 40, down: 10e6 / 8, up: 5e6 / 8 }, cpu: 1 },
};
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };

const browser = await chromium.launch({ executablePath: CHROME });
const out = {};
for (const [name, p] of Object.entries(profiles)) for (const lang of ['ar', 'en']) {
  const lcp = [], cls = [], fcp = [], intro = [], el = [];
  for (let i = 0; i < RUNS; i++) {
    const ctx = await browser.newContext({ viewport: p.viewport, deviceScaleFactor: p.deviceScaleFactor, isMobile: p.isMobile, hasTouch: p.hasTouch });
    const page = await ctx.newPage();
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: p.net.latency, downloadThroughput: p.net.down, uploadThroughput: p.net.up });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: p.cpu });
    if (process.env.REPEAT) await page.addInitScript(() => { try { sessionStorage.setItem('obsidian-intro', '1'); } catch (e) {} }); // no curtain
    await page.addInitScript(() => {
      window.__lcp = 0; window.__lcpEl = ''; window.__cls = 0; window.__intro = 0;
      new PerformanceObserver((l) => { for (const e of l.getEntries()) { window.__lcp = e.startTime; window.__lcpEl = e.element ? (e.element.className || e.element.tagName) + (e.url ? ' ' + e.url.split('/').pop() : '') : e.url; } }).observe({ type: 'largest-contentful-paint', buffered: true });
      new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: 'layout-shift', buffered: true });
      // When the (Phase 2) intro curtain is gone, i.e. when the visitor can actually see the page
      const poll = () => { const d = document.documentElement; if (d && !d.classList.contains('intro')) { window.__intro = performance.now(); return; } requestAnimationFrame(poll); };
      requestAnimationFrame(poll);
    });
    await page.goto(BASE + (lang === 'en' ? '?lang=en' : ''), { waitUntil: 'load', timeout: 60000 });
    await page.waitForTimeout(2500);
    const r = await page.evaluate(() => ({ lcp: window.__lcp, el: window.__lcpEl, cls: window.__cls, intro: window.__intro,
      fcp: (performance.getEntriesByName('first-contentful-paint')[0] || {}).startTime || 0 }));
    lcp.push(r.lcp); cls.push(r.cls); fcp.push(r.fcp); intro.push(r.intro); el.push(r.el);
    await ctx.close();
  }
  const key = `${name} ${lang}`;
  out[key] = { fcp: Math.round(median(fcp)), lcp: Math.round(median(lcp)), cls: +median(cls).toFixed(4), pageVisible: Math.round(Math.max(median(intro), median(fcp))), lcpElement: el[0] };
  console.log(key.padEnd(12), JSON.stringify(out[key]));
}
await browser.close();
if (process.env.JSON) fs.writeFileSync(process.env.JSON, JSON.stringify(out, null, 2));
