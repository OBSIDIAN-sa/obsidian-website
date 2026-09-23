// Render tools/og/og-image.html to assets/img/og-image.jpg (1200×630) in the installed Chrome.
// Run from tools/:  node make-og.mjs
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = pathToFileURL(path.join(ROOT, 'tools', 'og', 'og-image.html')).href;
const OUT = path.join(ROOT, 'assets', 'img', 'og-image.jpg');
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync);

const browser = await chromium.launch({ executablePath: CHROME });
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await page.goto(SRC, { waitUntil: 'load' });
await page.evaluate(() => document.fonts.ready);
const fonts = await page.evaluate(() => [...document.fonts].map((f) => `${f.family} ${f.weight}: ${f.status}`));
if (fonts.some((f) => !f.endsWith('loaded'))) throw new Error('font not loaded: ' + fonts.join(', '));
await page.screenshot({ path: OUT, type: 'jpeg', quality: 88 });
await browser.close();
console.log(`wrote ${path.relative(ROOT, OUT)} — ${Math.round(fs.statSync(OUT).size / 1024)}KB; fonts: ${fonts.join(', ')}`);
