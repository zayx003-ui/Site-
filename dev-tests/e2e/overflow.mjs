import { chromium, serve, newPage } from './lib.mjs';
const { srv, url } = await serve();
const browser = await chromium.launch();
const sizes = [[1920,1080],[1366,768],[820,1180],[390,844],[360,740]];
for (const [w,h] of sizes) {
  const { page, errors } = await newPage(browser, { w, h });
  for (const v of ['dashboard','planning','notes','stats','sim','settings']) {
    await page.goto(url + `/?v=${v}#TESTKEY`);
    await page.waitForSelector('#main > *:not(.boot)'); await page.waitForTimeout(350);
    const r = await page.evaluate(() => {
      const W = document.documentElement.clientWidth; const bad = [];
      document.querySelectorAll('main *').forEach((e) => { const b = e.getBoundingClientRect(); if (b.width && (b.right > W + 1 || b.left < -1) && !e.closest('.daystrip,.tablewrap,svg')) bad.push(e.className?.baseVal ?? e.className + '|' + e.tagName + '|' + Math.round(b.right)); });
      return { sw: document.documentElement.scrollWidth, W, bad: [...new Set(bad)].slice(0, 6) };
    });
    if (r.sw > r.W || r.bad.length) console.log(w, v, JSON.stringify(r));
  }
  if (errors.length) console.log(w, 'errors', errors);
}
console.log('done');
await browser.close(); srv.close();
