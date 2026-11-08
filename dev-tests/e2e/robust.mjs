import { chromium, serve, newPage, CSV } from './lib.mjs';
import fs from 'node:fs';
const { srv, url } = await serve();
const browser = await chromium.launch();
const results = [];
const check = (name, ok, extra = '') => { results.push([ok, name, extra]); console.log(ok ? 'PASS' : 'FAIL', name, ok ? '' : extra); };
const txt = (page, sel) => page.$eval(sel, (e) => e.innerText).catch(() => null);
const wait = async (page) => { await page.waitForSelector('#main > *:not(.boot)'); await page.waitForFunction(() => window.__BC.state.grades.status !== 'loading' && window.__BC.state.grades.status !== 'idle' && window.__BC.state.cal.status !== 'loading' && window.__BC.state.cal.status !== 'idle', null, { timeout: 20000 }); await page.waitForTimeout(300); };

// A. aucune clé
{
  const { page, errors } = await newPage(browser);
  await page.goto(url + '/'); await wait(page);
  let t = await txt(page, '#main');
  check('sans clé : message clair + champ de saisie', /clé de publication manquante/i.test(t) && !!(await page.$('.keyform input')), t.slice(0, 200));
  check('sans clé : le planning reste fonctionnel', /Prochain cours/.test(t) && !!(await page.$('.timeline')));
  check('sans clé : pas de bouton Réessayer inutile', !/Réessayer/.test(await txt(page, '.empty.error') || ''));
  await page.fill('.keyform input', 'https://x/y#TESTKEY2'); await page.click('.keyform .btn'); await page.waitForSelector('.lg-row', { timeout: 8000 });
  check('sans clé : saisie de la clé → notes chargées', true);
  check('sans clé : clé mémorisée (sans # ni URL)', await page.evaluate(() => localStorage.getItem('k') === 'TESTKEY2'));
  check('console (sans clé) : aucune erreur inattendue', errors.every((e) => !/pageerror/.test(e)), errors.join('|'));
  await page.context().close();
}
// B. erreurs réseau / HTTP / contenu
const cases = [
  ['réseau coupé', { csvStatus: 'abort' }, /connexion impossible/i],
  ['HTTP 500', { csvStatus: 500 }, /serveur renvoie une erreur/i],
  ['HTTP 404 (non publiée)', { csvStatus: 404 }, /feuille inaccessible/i],
  ['page HTML au lieu du CSV', { csv: '<!DOCTYPE html><html><body>Sign in</body></html>' }, /feuille inaccessible/i],
  ['CSV vide', { csv: '' }, /format inattendu/i],
  ['CSV colonnes absentes', { csv: 'a,b\n1,2\n' }, /format inattendu/i],
  ['CSV sans évaluation valide', { csv: 'R,E,P,N\nR3.01 X,,,\n' }, /données invalides/i],
];
for (const [name, opts, re] of cases) {
  const { page } = await newPage(browser, opts);
  await page.goto(url + '/?v=notes#KEY'); await wait(page);
  const t = await txt(page, '#main');
  check(`erreur « ${name} » : message précis`, re.test(t), t.slice(0, 160));
  check(`erreur « ${name} » : bouton Réessayer`, /Réessayer/.test(t));
  await page.goto(url + '/?v=dashboard#KEY'); await wait(page);
  const d = await txt(page, '#main');
  check(`erreur « ${name} » : accueil utilisable (planning OK)`, /Prochain cours/.test(d) && !!(await page.$('.timeline .evc')));
  await page.context().close();
}
// C. réessayer après erreur
{
  const { page } = await newPage(browser, { csvStatus: 500 });
  await page.goto(url + '/?v=notes#KEY'); await wait(page);
  await page.unroute(/docs\.google\.com/); await page.route(/docs\.google\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/csv', body: CSV }));
  await page.click('.empty.error .btn.primary'); await page.waitForSelector('.ue-grid', { timeout: 8000 });
  check('Réessayer : récupération sans recharger la page', true);
  await page.context().close();
}
// D. calendrier absent / invalide, notes OK
for (const [name, opts, re] of [['ICS 404', { icsStatus: 404, ics: 'nope' }, /introuvable|inaccessible/i], ['ICS invalide', { ics: 'ceci n’est pas un calendrier' }, /format inattendu/i], ['ICS sans événement', { ics: 'BEGIN:VCALENDAR\nEND:VCALENDAR' }, /données invalides/i]]) {
  const { page } = await newPage(browser, opts);
  await page.goto(url + '/?v=planning#KEY'); await wait(page);
  const t = await txt(page, '#main');
  check(`calendrier « ${name} » : message dédié`, re.test(t), t.slice(0, 200));
  await page.goto(url + '/?v=notes#KEY'); await wait(page);
  check(`calendrier « ${name} » : les notes ne sont pas affectées`, !!(await page.$('.ue-grid')));
  await page.context().close();
}
// E. lenteur : squelette puis contenu
{
  const { page } = await newPage(browser, { delay: 1800 });
  await page.goto(url + '/?v=notes#KEY'); await page.waitForSelector('.skel');
  check('chargement lent : squelette affiché', !!(await page.$('.skel.tall')));
  await page.waitForSelector('.ue-grid', { timeout: 8000 });
  check('chargement lent : contenu affiché ensuite', true);
  await page.context().close();
}
// F. délai dépassé (12 s)
{
  const { page } = await newPage(browser, { delay: 14000 });
  await page.goto(url + '/?v=notes#KEY'); await wait(page);
  const t = await txt(page, '#main');
  check('délai dépassé : message « trop de temps »', /trop de temps/.test(t), t.slice(0, 200));
  await page.context().close();
}
// G. stockage bloqué
{
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 }, locale: 'fr-FR', timezoneId: 'Europe/Paris' });
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('blocked', 'SecurityError'); } }); window.__BC_NOW = Date.UTC(2026, 10, 9, 9, 20); });
  await page.route(/docs\.google\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/csv', body: CSV }));
  await page.route(/fonts\./, (r) => r.fulfill({ status: 200, body: '' }));
  await page.goto(url + '/#KEY'); await page.waitForSelector('.stat-grid .stat'); await page.waitForTimeout(500);
  check('stockage bloqué : le site fonctionne', !!(await page.$('.lg-row')));
  await page.goto(url + '/?v=settings#KEY').catch(() => {}); await page.waitForSelector('.setrow');
  await page.click('.seg button:has-text("Sombre")');
  check('stockage bloqué : thème modifiable en mémoire + avertissement', await page.evaluate(() => document.documentElement.dataset.theme === 'dark') && /bloqué/.test(await txt(page, '#main')));
  check('stockage bloqué : aucune exception', errors.length === 0, errors.join('|'));
  await ctx.close();
}
// H. préférences corrompues
{
  const { page, errors } = await newPage(browser);
  await page.addInitScript(() => { localStorage.setItem('bc.prefs', '{oops'); localStorage.setItem('bc.favs', '"x"'); localStorage.setItem('bc.goals', '[1]'); localStorage.setItem('bc.notes', 'null'); });
  await page.goto(url + '/#KEY'); await page.waitForSelector('.stat-grid .stat');
  check('préférences corrompues : valeurs par défaut, pas de plantage', errors.length === 0 && !!(await page.$('.lg-row')), errors.join('|'));
  await page.context().close();
}
// I. valeurs de notes extrêmes dans le CSV
{
  const csv = 'Ressource,Évaluation,Poids,Note,Meilleure,Pire,Promo,Date\nR3.01 Test,A,50,"1 2,5",,,,31/02/2026\nR3.01 Test,B,50,0,20,0,10,2026-11-01\nR3.02 <img src=x onerror=alert(1)>,<b>x</b>,100,18,,,,\n';
  const { page, errors } = await newPage(browser, { csv });
  let dialog = false; page.on('dialog', async (d) => { dialog = true; await d.dismiss(); });
  await page.goto(url + '/?v=notes#KEY'); await wait(page);
  check('CSV étrange : pas d’exécution de HTML (XSS)', !dialog && !(await page.$('#main img')));
  const t = await txt(page, '#main');
  check('CSV étrange : texte affiché littéralement', /<img src=x/.test(t));
  check('CSV étrange : avertissements affichés', /remarque/.test(t));
  check('CSV étrange : 0/20 traité comme une vraie note', /0,00/.test(t));
  check('CSV étrange : aucune erreur console', errors.length === 0, errors.join('|'));
  await page.context().close();
}
// J. PWA : cache limité à la coque
{
  const { page } = await newPage(browser);
  await page.goto(url + '/?v=planning#KEY'); await wait(page);
  await page.waitForTimeout(1500);
  const info = await page.evaluate(async () => { const reg = await navigator.serviceWorker.getRegistration(); const ks = await caches.keys(); const urls = []; for (const k of ks) { const c = await caches.open(k); (await c.keys()).forEach((r) => urls.push(r.url)); } return { sw: !!reg, n: urls.length, ics: urls.filter((u) => /\.ics/.test(u)), google: urls.filter((u) => /google/.test(u)) }; });
  check('PWA : service worker enregistré', info.sw);
  check('PWA : coque en cache', info.n >= 20, String(info.n));
  check('PWA : ni ICS ni données Google en cache', info.ics.length === 0 && info.google.length === 0, JSON.stringify(info));
  const man = await page.evaluate(async () => (await fetch('manifest.webmanifest')).json());
  check('PWA : manifeste valide (nom, icônes 192/512/maskable)', man.name && man.icons.length === 3 && man.display === 'standalone');
  await page.context().close();
}
const failed = results.filter((r) => !r[0]);
console.log(`\n${results.length - failed.length}/${results.length} contrôles de robustesse réussis`);
fs.writeFileSync('robust-results.json', JSON.stringify(results, null, 1));
await browser.close(); srv.close();
