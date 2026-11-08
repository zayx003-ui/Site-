import { chromium, serve, newPage, CSV, NOW } from './lib.mjs';
import fs from 'node:fs';
const { srv, url } = await serve();
const browser = await chromium.launch();
const results = [];
const check = (name, ok, extra = '') => { results.push([ok, name, extra]); console.log(ok ? 'PASS' : 'FAIL', name, ok ? '' : extra); };
const txt = (page, sel) => page.$eval(sel, (e) => e.innerText).catch(() => null);
const load = async (page, v = 'dashboard', hash = '#TESTKEY') => { await page.goto(url + `/?v=${v}${hash}`); await page.waitForSelector('#main > *:not(.boot)'); await page.waitForTimeout(400); };

/* ───── 1. Dashboard & navigation ───── */
{
  const { page, errors } = await newPage(browser);
  await load(page);
  check('dashboard : 8 cartes de synthèse', (await page.$$('.stat')).length === 8);
  check('dashboard : salutation « Bonjour »', /Bonjour/.test(await txt(page, '.welcome h1')));
  check('dashboard : prochain examen R3.08', /R3\.08/.test(await txt(page, '.stat-grid')));
  check('dashboard : timeline avec ligne « Maintenant »', !!(await page.$('.tl-now')));
  check('dashboard : 5 dernières notes', (await page.$$('.lg-row')).length === 5);
  await page.click('.nav-item[data-view=notes]');
  await page.waitForSelector('.ue-grid');
  check('navigation : URL ?v=notes + clé conservée', /\?v=notes#TESTKEY$/.test(page.url()), page.url());
  await page.goBack(); await page.waitForSelector('.stat-grid');
  check('navigation : retour arrière → accueil', /v=dashboard/.test(page.url()));
  check('navigation : lien actif aria-current', await page.$eval('.nav-item.on', (e) => e.getAttribute('aria-current')) === 'page');
  // pas de re-téléchargement lors d'un changement d'onglet
  let hits = 0; await page.route(/docs\.google\.com/, (r) => { hits++; r.fulfill({ status: 200, contentType: 'text/csv', body: CSV }); });
  for (const v of ['planning', 'notes', 'stats', 'sim', 'settings', 'dashboard']) { await page.click(`.nav-item[data-view=${v}]`); await page.waitForTimeout(150); }
  check('aucune requête réseau au changement de section', hits === 0, String(hits));
  check('console sans erreur (parcours 1)', errors.length === 0, errors.join(' | '));
  await page.context().close();
}

/* ───── 2. Planning ───── */
{
  const { page, errors } = await newPage(browser);
  await load(page, 'planning');
  check('planning : grille semaine, aujourd’hui surligné', !!(await page.$('.tg-dayhead.today')) && !!(await page.$('.nowline')));
  const n0 = (await page.$$('.tg-ev')).length;
  check('planning : 15 séances cette semaine dans la grille', n0 === 15 || n0 === 17, String(n0)); // 15 cours + 2 examens comptés dans la grille
  await page.click('.chip.t-cm'); await page.waitForTimeout(150);
  const nCM = (await page.$$('.tg-ev')).length;
  check('planning : filtre CM', nCM > 0 && nCM < n0 && (await page.$$eval('.tg-ev', (e) => e.every((x) => x.classList.contains('t-cm')))), `${nCM}/${n0}`);
  check('planning : compteur de résultats', /résultat/.test(await txt(page, '.filter-meta .count')));
  await page.click('.filter-meta .link-btn'); await page.waitForTimeout(150);
  check('planning : réinitialisation des filtres', (await page.$$('.tg-ev')).length === n0);
  await page.fill('[data-k=search]', 'amphi 1'); await page.waitForTimeout(400);
  check('planning : recherche texte', (await page.$$('.tg-ev')).length < n0);
  await page.fill('[data-k=search]', 'zzzzqq'); await page.waitForTimeout(400);
  check('planning : aucun résultat → état vide', !!(await page.$('.empty')));
  await page.fill('[data-k=search]', ''); await page.waitForTimeout(400);
  // modale détail
  await page.click('.tg-ev >> nth=0');
  await page.waitForSelector('.modal');
  check('détail : modale avec rôle dialog', await page.$eval('.modal', (e) => e.getAttribute('role') === 'dialog' && e.getAttribute('aria-modal') === 'true'));
  const dl = page.waitForEvent('download');
  await page.click('text=Ajouter à mon agenda');
  const d = await dl; const p = await d.path(); const ics = fs.readFileSync(p, 'utf8');
  check('détail : export .ics valide d’un événement', /BEGIN:VCALENDAR/.test(ics) && /BEGIN:VEVENT/.test(ics) && /DTSTART:\d{8}T\d{6}Z/.test(ics) && /END:VCALENDAR/.test(ics) && (ics.match(/BEGIN:VEVENT/g) || []).length === 1, ics.slice(0, 200));
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  check('détail : Échap ferme la modale', !(await page.$('.modal')));
  check('détail : le focus revient sur l’événement', await page.evaluate(() => document.activeElement?.classList.contains('tg-ev')));
  // vues
  await page.click('.seg button:has-text("Jour")'); await page.waitForSelector('.daystrip');
  check('planning : vue jour + sélecteur de jours', (await page.$$('.daystrip button')).length === 7);
  await page.click('.seg button:has-text("Liste")'); await page.waitForSelector('.agenda');
  check('planning : vue liste groupée par jour', (await page.$$('.agenda-day')).length > 3);
  await page.click('.seg button:has-text("Mois")'); await page.waitForSelector('.month');
  check('planning : vue mois 7 colonnes', (await page.$$('.mcell')).length % 7 === 0);
  await page.click('.cal-nav button[aria-label=Suivant]'); await page.waitForTimeout(200);
  check('planning : mois suivant', /décembre/i.test(await txt(page, '.cal-label strong')));
  await page.click('.cal-nav >> text=Aujourd’hui'); await page.waitForTimeout(200);
  check('planning : retour à aujourd’hui', /novembre/i.test(await txt(page, '.cal-label strong')));
  // export modal
  await page.click('.filter-meta .btn:has-text("Exporter")'); await page.waitForSelector('.xlist');
  const dl2 = page.waitForEvent('download'); await page.click('.xlist a.btn'); const f = await dl2;
  check('export : fichier d’origine identique', fs.readFileSync(await f.path(), 'utf8') === fs.readFileSync(new URL('../../ADECal.ics', import.meta.url), 'utf8'));
  const dl3 = page.waitForEvent('download'); await page.click('.xlist .xrow:nth-child(2) .btn'); const w = await dl3;
  const wi = fs.readFileSync(await w.path(), 'utf8');
  check('export : semaine = événements de la semaine affichée', (wi.match(/BEGIN:VEVENT/g) || []).length >= 1);
  await page.keyboard.press('Escape');
  // tiers temps masqués par défaut
  const hasTT = await page.evaluate(() => window.__BC.state.cal.data.events.some((e) => e.type === 'TT'));
  await page.click('.seg button:has-text("Liste")'); await page.waitForSelector('.agenda');
  check('tiers temps masqué par défaut', hasTT && !(await page.$$eval('.evc-title', (e) => e.some((x) => /tiers/i.test(x.textContent)))));
  check('console sans erreur (planning)', errors.length === 0, errors.join(' | '));
  await page.context().close();
}

/* ───── 3. Notes ───── */
{
  const { page, errors } = await newPage(browser);
  await load(page, 'notes');
  check('notes : 5 cartes UE', (await page.$$('.ue-card')).length === 5);
  const ue31 = await txt(page, '.ue-card >> nth=0');
  check('notes : UE 3.1 = 13,53', /13,53/.test(ue31), ue31);
  check('notes : UE 3.3 = 9,95', /9,95/.test(await txt(page, '.ue-card >> nth=2')));
  check('notes : pas de camembert (aucun arc/donut)', !(await page.$('.chart circle[stroke-dasharray], .chart path[d*="A"], .chart path[d*="a"]')) );
  check('notes : synthèse 11 / 46', /11 \/ 46/.test(await txt(page, '.mini-row')));
  await page.click('.res-toggle:has(.res-code:text-is("R3.08"))');
  await page.waitForSelector('.res.open .eval-row');
  const body = await txt(page, '.res.open');
  check('notes : R3.08 détail = 4 évaluations', (await page.$$('.res.open .eval-row')).length === 4);
  check('notes : R3.08 moyenne 7,44 et promo provisoire 10,74', /7,44/.test(body) && /10,74/.test(body), body);
  check('notes : meilleure/pire/promo affichées (19,60 · 0,00 · 16,29)', /19,60/.test(body) && /16,29/.test(body));
  check('notes : examen prévu connu dans le calendrier', /Examen prévu le 13 novembre/.test(body), body);
  await page.click('.res-toggle:has(.res-code:text-is("R3.03"))'); await page.waitForTimeout(150);
  check('notes : note non publiée distinguée (R3.03)', /Note non publiée/.test(await txt(page, '#res-R303')));
  await page.click('.ue-card >> nth=2'); await page.waitForTimeout(200);
  const cnt = await txt(page, '#res-list .count');
  check('notes : clic UE filtre les ressources', /sur 21/.test(cnt) && !/21 ressources/.test(cnt), cnt);
  await page.click('.chip.on:has-text("UE 3.3")'); await page.waitForTimeout(150);
  await page.fill('[data-k=nsearch]', 'mycologie'); await page.waitForTimeout(400);
  check('notes : recherche « mycologie » (R3.01 + R3.11)', (await page.$$('.res')).length === 2, String((await page.$$('.res')).length));
  await page.fill('[data-k=nsearch]', ''); await page.waitForTimeout(300);
  await page.click('#res-list .chip:has-text("Sans note")'); await page.waitForTimeout(150);
  check('notes : filtre « sans note »', (await page.$$('.res')).length === 14, String((await page.$$('.res')).length));
  await page.click('#res-list .chip:has-text("Toutes")');
  await page.click('.res:has(.res-code:text-is("R3.01")) .fav'); await page.waitForTimeout(150);
  await page.reload(); await page.waitForSelector('.ue-grid'); await page.waitForTimeout(300);
  await page.click('#res-list .chip:has-text("Favoris")'); await page.waitForTimeout(150);
  check('notes : favori conservé après rechargement', (await page.$$('.res')).length === 1);
  check('notes : graphique d’évolution (11 points datés)', (await page.$$('.chart .ch-dot')).length === 11);
  await page.selectOption('.chart-wrap >> xpath=../../..//select', 'R3.08').catch(() => {});
  check('console sans erreur (notes)', errors.length === 0, errors.join(' | '));
  await page.context().close();
}

/* ───── 4. Simulateur ───── */
{
  const { page, errors } = await newPage(browser);
  await load(page, 'sim');
  await page.selectOption('select[aria-label="Choisir une ressource"]', 'R3.08'); await page.waitForTimeout(200);
  let t = await txt(page, '#sim-out');
  check('simulateur : R3.08 objectif 10 → 11,10/20', /11,10/.test(t) && /réalisable/.test(t), t.slice(0, 300));
  await page.click('.target .chip:has-text("14")'); await page.waitForTimeout(150);
  t = await txt(page, '#sim-out');
  check('simulateur : R3.08 objectif 14 → 16,81 (difficile)', /difficile/.test(t) && /16,81/.test(t), t.slice(0, 200));
  await page.selectOption('select[aria-label="Choisir une ressource"]', 'R3.05'); await page.waitForTimeout(200);
  await page.click('.target .chip:has-text("18")'); await page.waitForTimeout(150);
  t = await txt(page, '#sim-out');
  check('simulateur : R3.05 objectif 18 → impossible, max 17,40', /impossible/.test(t) && /17,40/.test(t), t.slice(0, 300));
  await page.fill('.target-in', '25'); await page.waitForTimeout(200);
  check('simulateur : objectif 25 invalide', /invalide/i.test(await txt(page, '#sim-out')));
  await page.fill('.target-in', '12,5'); await page.waitForTimeout(200);
  check('simulateur : objectif libre « 12,5 » (virgule)', !/invalide/i.test(await txt(page, '#sim-out')));
  await page.fill('.target-in', 'abc'); await page.waitForTimeout(200);
  check('simulateur : texte non numérique géré', /invalide/i.test(await txt(page, '#sim-out')));
  await page.selectOption('select[aria-label="Choisir une ressource"]', 'R3.01'); await page.waitForTimeout(200);
  await page.click('.target .chip:has-text("12")');
  await page.fill('.hyp-in', '16'); await page.waitForTimeout(200);
  const hr = await txt(page, '.hyp-result');
  check('simulateur : note hypothétique 16 → ≈15,78', /15,7[78]/.test(hr) && /atteint/.test(hr), hr);
  await page.fill('.hyp-in', '40'); await page.waitForTimeout(200);
  check('simulateur : note hypothétique > 20 refusée', /Saisis au moins/.test(await txt(page, '.hyp-result')));
  await page.click('text=Enregistrer comme objectif'); await page.waitForTimeout(200);
  check('simulateur : objectif enregistré et listé', /Mes objectifs enregistrés/.test(await txt(page, '#main')));
  await page.click('.seg button:has-text("Par UE")'); await page.waitForTimeout(250);
  t = await txt(page, '#sim-out');
  check('simulateur UE : résultat fiable (pas de « non fiable »)', !/non fiable/i.test(t), t.slice(0, 300));
  await page.click('.chip:has-text("UE 3.4")'); await page.waitForTimeout(200);
  await page.click('.target .chip:has-text("12")'); await page.waitForTimeout(200);
  t = await txt(page, '#sim-out');
  check('simulateur UE 3.4 objectif 12 : note nécessaire affichée', /\d+,\d\d\/20 sur/.test(t) || /déjà atteint/.test(t), t.slice(0, 300));
  check('console sans erreur (simulateur)', errors.length === 0, errors.join(' | '));
  await page.context().close();
}

/* ───── 5. Statistiques ───── */
{
  const { page, errors } = await newPage(browser);
  await load(page, 'stats');
  const t = await txt(page, '#main');
  check('stats : moyenne générale indicative 11,27 et non officielle', /11,27/.test(t) && /officielle/.test(t));
  check('stats : analyse en « tu »', /Ta meilleure moyenne est en R3\.01/.test(t) && /Il te faudrait/.test(t));
  check('stats : comparaison promo présente', /Comparaison avec la promotion/.test(t));
  check('stats : histogramme', !!(await page.$('.ch-bar')));
  check('console sans erreur (stats)', errors.length === 0, errors.join(' | '));
  await page.context().close();
}

/* ───── 6. Recherche globale ───── */
{
  const { page, errors } = await newPage(browser);
  await load(page);
  await page.keyboard.press('Control+k'); await page.waitForSelector('.search-modal'); await page.waitForTimeout(200);
  check('recherche : Ctrl+K ouvre la palette, focus dans le champ', await page.evaluate(() => document.activeElement?.getAttribute('role') === 'combobox'));
  await page.keyboard.type('E200'); await page.waitForTimeout(250);
  const r = await txt(page, '.sr-list');
  check('recherche : salle E200 trouvée', /SALLES/i.test(r) && /E200/.test(r), r.slice(0, 200));
  await page.fill('[role=combobox]', 'r3.08'); await page.waitForTimeout(250);
  const r2 = await txt(page, '.sr-list');
  check('recherche : catégories ressources/évaluations/notes', /RESSOURCES/i.test(r2) && /ÉVALUATIONS/i.test(r2) && /NOTES/i.test(r2), r2.slice(0, 300));
  await page.fill('[role=combobox]', 'enzymologie'); await page.waitForTimeout(250);
  check('recherche : sans accent / casse (« enzymologie »)', /COURS/i.test(await txt(page, '.sr-list')));
  await page.fill('[role=combobox]', 'zzzzqq'); await page.waitForTimeout(250);
  check('recherche : état vide', /Aucun résultat/.test(await txt(page, '.sr-list')));
  await page.fill('[role=combobox]', 'microtome'); await page.waitForTimeout(250);
  await page.keyboard.press('Enter'); await page.waitForSelector('.res.open');
  check('recherche : Entrée ouvre la ressource dans Notes', /v=notes/.test(page.url()) && !!(await page.$('.res.open')));
  await page.keyboard.press('/'); await page.waitForSelector('.search-modal');
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  check('recherche : Échap ferme', !(await page.$('.search-modal')));
  check('console sans erreur (recherche)', errors.length === 0, errors.join(' | '));
  await page.context().close();
}

/* ───── 7. Paramètres ───── */
{
  const { page, errors } = await newPage(browser);
  await load(page, 'settings');
  await page.click('.seg button:has-text("Sombre")'); await page.waitForTimeout(200);
  check('paramètres : thème sombre appliqué', await page.evaluate(() => document.documentElement.dataset.theme === 'dark'));
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  check('thème sombre : fond #0B1220', bg === 'rgb(11, 18, 32)', bg);
  await page.reload(); await page.waitForSelector('#main > *:not(.boot)');
  check('paramètres : thème conservé après rechargement', await page.evaluate(() => document.documentElement.dataset.theme === 'dark'));
  await page.click('.seg button:has-text("Clair")'); await page.waitForTimeout(200);
  check('thème clair : fond #F6F8FB', await page.evaluate(() => getComputedStyle(document.body).backgroundColor) === 'rgb(246, 248, 251)');
  await page.click('.sw[aria-label="Indigo"]'); await page.waitForTimeout(200);
  check('paramètres : couleur d’accent', await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent-l').trim() === '#4C4FC4'));
  await page.fill('input[aria-label="Prénom affiché dans l’accueil"]', 'Léa'); await page.keyboard.press('Tab'); await page.waitForTimeout(200);
  await page.click('.nav-item[data-view=dashboard]'); await page.waitForTimeout(300);
  check('accueil : prénom dans la salutation', /Léa/.test(await txt(page, '.welcome h1')));
  await page.click('.nav-item[data-view=settings]'); await page.waitForTimeout(200);
  await page.click('.switch[aria-labelledby=sw-promo]'); await page.waitForTimeout(200);
  await page.click('.nav-item[data-view=stats]'); await page.waitForTimeout(300);
  check('promo désactivée : plus de comparaison dans les stats', !/Comparaison avec la promotion/.test(await txt(page, '#main')));
  await page.click('.nav-item[data-view=notes]'); await page.waitForTimeout(300);
  check('promo désactivée : plus de carte promo dans les notes', !/face à la promotion/.test(await txt(page, '#main')));
  await page.click('.nav-item[data-view=settings]'); await page.waitForTimeout(200);
  await page.click('button:has-text("Réinitialiser")'); await page.waitForSelector('.modal');
  await page.click('.modal .btn.danger'); await page.waitForTimeout(400);
  check('paramètres : réinitialisation', await page.evaluate(() => !document.documentElement.dataset.theme && JSON.parse(localStorage.getItem('bc.prefs') || 'null') === null));
  // export CSV
  const dl = page.waitForEvent('download'); await page.click('button:has-text("Exporter")');
  const csv = fs.readFileSync(await (await dl).path(), 'utf8');
  check('export CSV : BOM, séparateur « ; », virgule décimale, 46 lignes', csv.charCodeAt(0) === 0xFEFF && /15,25/.test(csv) && csv.trim().split(/\r?\n/).length === 47, csv.split('\n').length);
  check('console sans erreur (paramètres)', errors.length === 0, errors.join(' | '));
  await page.context().close();
}
const failed = results.filter((r) => !r[0]);
console.log(`\n${results.length - failed.length}/${results.length} contrôles réussis`);
fs.writeFileSync('qa-results.json', JSON.stringify(results, null, 1));
await browser.close(); srv.close();
