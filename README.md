# Notes et emploi du temps – Semestre 3

Page web statique. Elle lit **les notes dans l'onglet « Site » de votre Google Sheet** et **l'emploi du temps dans le fichier `ADECal.ics`**. Aucune note n'est écrite dans le code.

## 1. Publier l'onglet « Site » du Sheet

1. Dans Google Sheets : **Fichier → Partager → Publier sur le Web**.
2. Choisissez **l'onglet « Site »** (pas « Document entier ») et le format **Valeurs séparées par des virgules (.csv)**.
3. Cliquez sur **Publier** et copiez le lien. Il ressemble à :
   `https://docs.google.com/spreadsheets/d/e/2PACX-1vABC.../pub?gid=371376160&single=true&output=csv`
4. Gardez seulement la partie entre `/d/e/` et `/pub`, par exemple `2PACX-1vABC...`. C'est votre **clé**.

Seul l'onglet « Site » est publié. Votre calculateur et les autres onglets restent privés.

## 2. Mettre le site sur GitHub

1. Sur github.com : **New repository**, nom `notes`, visibilité **Public**.
2. **Add file → Upload files** : déposez `index.html` et `ADECal.ics`, puis **Commit changes**.
3. **Settings → Pages** : *Source* = *Deploy from a branch*, *Branch* = `main`, dossier `/ (root)`, puis **Save**.
4. Après une minute, l'adresse est `https://VOTRE-PSEUDO.github.io/notes/`.

## 3. Le lien à donner

Ajoutez votre clé à la fin de l'adresse :

`https://VOTRE-PSEUDO.github.io/notes/#2PACX-1vABC...`

La clé reste dans le lien et **pas dans le code** : le dépôt GitHub étant public, ne mettez jamais la clé dans un fichier du dépôt ni dans un message public. Ceux qui ont le lien peuvent voir vos notes.

## 4. Mises à jour

- **Notes** : modifiez l'onglet « Site » (colonne D *Note /20*). La page se met à jour au rechargement, avec jusqu'à quelques minutes de délai côté Google.
- **Comparaison avec la promo** : les colonnes E, F, G (*Meilleure*, *Pire*, *Moyenne promo*) viennent des fichiers PDF des notes. Sans elles, la note s'affiche sans comparaison.
- **Emploi du temps** : exportez à nouveau le calendrier ADE en `.ics`, nommez-le `ADECal.ics` et remplacez le fichier dans GitHub (**Add file → Upload files**).
