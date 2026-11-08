import { chromium, serve, newPage } from './lib.mjs';
const { srv, url } = await serve();
const browser = await chromium.launch();
let fails = 0;
const check = (n, ok, x = '') => { if (!ok) fails++; console.log(ok ? 'PASS' : 'FAIL', n, ok ? '' : x); };
for (const scheme of ['light', 'dark']) {
  const { page } = await newPage(browser, { scheme });
  for (const v of ['dashboard', 'planning', 'notes', 'stats', 'sim', 'settings']) {
    await page.goto(url + `/?v=${v}#KEY`); await page.waitForSelector('#main > *:not(.boot)'); await page.waitForTimeout(400);
    const r = await page.evaluate(() => {
      const name = (e) => (e.getAttribute('aria-label') || e.getAttribute('title') || (e.getAttribute('aria-labelledby') && document.getElementById(e.getAttribute('aria-labelledby'))?.textContent) || e.textContent || (e.id && document.querySelector(`label[for="${e.id}"]`)?.textContent) || e.closest('label')?.textContent || '').trim();
      const unnamed = [...document.querySelectorAll('button,a[href],input:not([type=hidden]),select,textarea,[role=button],[role=tab],[role=radio],[role=switch]')].filter((e) => !name(e)).map((e) => e.outerHTML.slice(0, 90));
      const h1 = document.querySelectorAll('h1').length;
      const dupIds = [...document.querySelectorAll('[id]')].map((e) => e.id).filter((id, i, a) => a.indexOf(id) !== i);
      const lang = document.documentElement.lang;
      const small = [...document.querySelectorAll('button,a[href],.tab,.chip,.icon-btn,select,input')].filter((e) => { const b = e.getBoundingClientRect(); return b.width && (b.height < 24 || b.width < 24); }).map((e) => e.className + '|' + Math.round(e.getBoundingClientRect().width) + 'x' + Math.round(e.getBoundingClientRect().height));
      return { unnamed, h1, dupIds, lang, small: [...new Set(small)].slice(0, 5), landmarks: ['main', 'nav', 'header', 'aside'].map((t) => document.querySelectorAll(t).length) };
    });
    check(`${scheme}/${v} : éléments interactifs nommés`, r.unnamed.length === 0, JSON.stringify(r.unnamed));
    check(`${scheme}/${v} : un seul h1`, r.h1 === 1, String(r.h1));
    check(`${scheme}/${v} : ids uniques`, r.dupIds.length === 0, r.dupIds.join());
    check(`${scheme}/${v} : cibles ≥ 24 px (WCAG 2.2 AA)`, r.small.length === 0, r.small.join(';'));
    if (v === 'dashboard' && scheme === 'light') check('lang=fr et repères (main/nav/header/aside)', r.lang === 'fr' && r.landmarks.every((n) => n >= 1), JSON.stringify(r));
  }
  await page.context().close();
}
// clavier
{
  const { page } = await newPage(browser);
  await page.goto(url + '/#KEY'); await page.waitForSelector('.stat-grid .stat'); await page.waitForTimeout(300);
  await page.keyboard.press('Tab');
  check('clavier : 1ʳᵉ tabulation = lien d’évitement', await page.evaluate(() => document.activeElement.classList.contains('skip')));
  await page.keyboard.press('Enter'); await page.waitForTimeout(100);
  check('clavier : le lien d’évitement mène au contenu', await page.evaluate(() => location.hash.includes('main') || document.activeElement.id === 'main'));
  // piège à focus dans la modale
  await page.goto(url + '/?v=planning#KEY'); await page.waitForSelector('.tg-ev');
  await page.focus('.tg-ev >> nth=0'); await page.keyboard.press('Enter'); await page.waitForSelector('.modal'); await page.waitForTimeout(250);
  const seq = []; for (let i = 0; i < 8; i++) { await page.keyboard.press('Tab'); seq.push(await page.evaluate(() => !!document.activeElement.closest('.modal'))); }
  check('clavier : le focus reste piégé dans la modale', seq.every(Boolean), seq.join());
  await page.keyboard.press('Escape');
  // indicateur de focus visible
  await page.focus('.nav-item[data-view=notes]'); await page.keyboard.press('Shift+Tab'); await page.keyboard.press('Tab');
  const ol = await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle + ' ' + getComputedStyle(document.activeElement).outlineWidth);
  check('clavier : indicateur de focus visible', /solid 2\.5px|solid 2px/.test(ol), ol);
  await page.context().close();
}
// mouvement réduit
{
  const ctx = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1366, height: 768 }, locale: 'fr-FR' });
  const page = await ctx.newPage();
  await page.route(/docs\.google\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/csv', body: (await_csv()) }));
  function await_csv() { return CSV_; }
  await page.route(/fonts\./, (r) => r.fulfill({ status: 200, body: '' }));
  await page.goto(url + '/?v=dashboard#KEY'); await page.waitForSelector('.stat-grid .stat'); await page.waitForTimeout(300);
  const d = await page.evaluate(() => { const e = document.querySelector('.live-pill::before') || document.querySelector('.skel') || document.querySelector('.gauge i'); return [getComputedStyle(document.querySelector('.gauge i')).transitionDuration, getComputedStyle(document.querySelector('.skel') || document.body).animationDuration]; });
  check('mouvement réduit : transitions/animations neutralisées', d.every((x) => parseFloat(x) < 0.01), d.join());
  await ctx.close();
}
import { CSV as CSV_ } from './lib.mjs';
console.log(fails ? `${fails} échec(s)` : 'a11y : tout est conforme aux contrôles automatisés');
await browser.close(); srv.close();
