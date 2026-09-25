// Dev-only static server that behaves like GitHub Pages where it matters for timing: gzip on text files.
// (python -m http.server sends everything uncompressed, which overstates the cost of HTML/CSS/JS on Slow 4G.)
// Usage from tools/:  node serve.mjs [dir=..] [port=8790]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const ROOT = path.resolve(process.argv[2] || '..');
const PORT = +(process.argv[3] || 8790);
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };
const TEXT = /^(text\/|application\/(json|xml)|image\/svg)/;

http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
  const type = TYPES[path.extname(file)] || 'application/octet-stream';
  const body = fs.readFileSync(file);
  if (TEXT.test(type) && /\bgzip\b/.test(req.headers['accept-encoding'] || '')) {
    const gz = zlib.gzipSync(body, { level: 6 });
    res.writeHead(200, { 'Content-Type': type, 'Content-Encoding': 'gzip', 'Content-Length': gz.length, 'Cache-Control': 'max-age=600' });
    res.end(gz);
  } else {
    res.writeHead(200, { 'Content-Type': type, 'Content-Length': body.length, 'Cache-Control': 'max-age=600' });
    res.end(body);
  }
}).listen(PORT, '127.0.0.1', () => console.log(`serving ${ROOT} on http://127.0.0.1:${PORT}/ (gzip on text)`));
