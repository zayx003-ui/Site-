# BIO CAMPUS – notes, emploi du temps et simulateur

Site statique (aucun serveur, aucune base de données) pour BUT Génie Biologique, semestre 3.
Il lit les notes dans un Google Sheet publié en CSV et l'emploi du temps dans `ADECal.ics`.

## Mettre en ligne (GitHub Pages)

1. Dans le dépôt GitHub : **Add file → Upload files**, puis glisse **tout le contenu de ce dossier**
   (`index.html`, `styles.css`, `sw.js`, `manifest.webmanifest`, `offline.html`, `ADECal.ics`, dossiers `js/` et `icons/`).
   Le dossier `dev-tests/` est facultatif : il ne sert pas au site, ne le téléverse pas.
2. Remplace les anciens fichiers quand GitHub le propose. Supprime l'ancien `index.html`, `apple-touch-icon.png`,
   `icon-512.png` s'ils sont encore à la racine (les nouvelles icônes sont dans `icons/`).
3. **Settings → Pages** : branche `main`, dossier `/ (root)`. Le site s'ouvre sur `https://<compte>.github.io/<dépôt>/`.
4. Lien à donner : `https://<compte>.github.io/<dépôt>/#CLÉ`, où `CLÉ` est la partie centrale du lien de
   publication Google Sheets (`…/spreadsheets/d/e/CLÉ/pub?…`). Le navigateur mémorise la clé après la première ouverture.
   **Ne mets jamais la clé dans un fichier du dépôt.**

## Mises à jour courantes

| Quoi | Comment |
|---|---|
| Nouvelle note | Écrire dans l'onglet **Site** du Sheet. Le site la lit au chargement ou avec le bouton Actualiser. |
| Emploi du temps | Exporter ADE en `.ics`, le renommer `ADECal.ics`, le re-téléverser dans le dépôt. |
| Coefficients des UE | `js/coefficients.js` (matrice R3.xx / SAE → UE). |
| Groupe, parcours, semestre | `js/config.js`. |

Le Sheet doit rester publié : **Fichier → Partager → Publier sur le web → onglet « Site » → CSV**.
Colonnes de l'onglet : Ressource | Évaluation | Poids (%) | Note /20 | Meilleure | Pire | Moyenne promo | Date.
Une ligne « Moyenne provisoire » par ressource est reconnue (statistiques de la promo).

## Règles de calcul

- Moyenne d'une ressource : uniquement les évaluations **déjà notées**, pondérées par leur poids. Une case vide n'est pas un 0 ; un vrai 0/20 est une note.
- Moyenne d'UE : ressources notées, pondérées par les coefficients de l'UE. Elle est **provisoire** et **non officielle** (la feuille personnelle compte les cases vides comme 0, pas le site).
- Note nécessaire : même note `x` sur toutes les évaluations restantes. « Difficile » à partir de 15/20, « impossible » si > 20.
- Simulation par UE : exacte avec cette hypothèse, et marquée « non fiable » si une ressource ou une pondération manque.

## Confidentialité

- Aucune donnée n'est envoyée ailleurs que vers Google (CSV) et GitHub (site).
- Réglages, favoris, objectifs et notes personnelles : `localStorage` de l'appareil uniquement.
- Le service worker ne met en cache que la coque du site, **jamais** les notes ni l'emploi du temps.
  La « copie hors ligne » des données est **désactivée par défaut** (Paramètres) et effaçable.
- `<meta name="robots" content="noindex">` : le site n'est pas référencé, mais il n'est pas protégé par mot de passe.
  Quiconque a la clé peut lire les notes.

## Structure

```
index.html  styles.css  sw.js  manifest.webmanifest  offline.html  ADECal.ics
icons/      favicon, icônes 192/512, maskable, apple-touch
js/         app (coque, navigation) · state (préférences, chargement) · data (CSV/ICS) · math (calculs purs)
            model · dashboard · calendar · grades · statistics · simulator · settings · search · exports
            charts (SVG) · components · dom (DOM sûr, modales) · util · config · coefficients
dev-tests/  tests Node (calculs, CSV, ICS) et scénarios Playwright (facultatifs)
```

## Tests (facultatif, en local)

```
node --test dev-tests/*.test.mjs                 # calculs, lecteurs CSV/ICS
cd dev-tests/e2e && node qa.mjs                  # scénarios navigateur (Playwright requis)
```
