import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
// Playwright doit être installé (npm i playwright) ; NODE_PATH peut pointer vers son dossier node_modules.
const require = createRequire(process.env.NODE_PATH ? process.env.NODE_PATH.split(':')[0] + '/' : import.meta.url);
export const { chromium } = require('playwright');
export const SITE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.ics': 'text/calendar', '.webmanifest': 'application/manifest+json' };
export function serve() {
  return new Promise((res) => {
    const srv = http.createServer((q, r) => {
      let p = decodeURIComponent(new URL(q.url, 'http://x').pathname);
      if (p.endsWith('/')) p += 'index.html';
      const f = path.join(SITE, p);
      if (!f.startsWith(SITE) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); r.end('nf'); return; }
      r.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' });
      fs.createReadStream(f).pipe(r);
    }).listen(0, '127.0.0.1', () => res({ srv, url: `http://127.0.0.1:${srv.address().port}` }));
  });
}
export const CSV = fs.readFileSync(path.join(SITE, 'dev-tests/fixtures/grades.csv'), 'utf8');
export const NOW = Date.UTC(2026, 10, 9, 9, 20); // lundi 9 nov 2026, 10:20 à Paris
export async function newPage(browser, { w = 1366, h = 768, csv = CSV, csvStatus = 200, ics, icsStatus, delay = 0, scheme = 'light', now = NOW, storage = true } = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: scheme, locale: 'fr-FR', timezoneId: 'Europe/Paris', deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.route(/docs\.google\.com/, async (route) => {
    if (delay) await new Promise((r) => setTimeout(r, delay));
    if (csvStatus === 'abort') return route.abort('failed');
    route.fulfill({ status: csvStatus, contentType: 'text/csv', body: csv });
  });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  if (ics !== undefined || icsStatus) await page.route(/ADECal\.ics/, (r) => r.fulfill({ status: icsStatus || 200, contentType: 'text/calendar', body: ics ?? '' }));
  await page.addInitScript((n) => { window.__BC_NOW = n; }, now);
  return { ctx, page, errors };
}
