// Paramètres : thème, accent, affichage, données locales, exports.
import { h, icon, clear, toast, openModal } from './dom.js';
import { state, setPref, resetPrefs, forgetKey, purgeLocal, clearCaches, ACCENTS, VIEWS, reload } from './state.js';
import { APP, VIEW_META } from './config.js';
import { card, pageHead, segmented, btn, dataNote } from './components.js';
import { fmtDateTimeMs, store, storageAvailable } from './util.js';
import { exportGradesCSV, printReport } from './exports.js';

export function confirmDialog({ title, text, confirmLabel = 'Confirmer', danger = false }) {
  return new Promise((resolve) => {
    let answered = false;
    const api = openModal({
      title,
      content: h('div', null, h('p', null, text), h('div', { class: 'modal-actions' },
        btn('Annuler', { onClick: () => { answered = true; api.close(); resolve(false); } }),
        btn(confirmLabel, { kind: danger ? 'danger' : 'primary', onClick: () => { answered = true; api.close(); resolve(true); } }))),
      onClose: () => { if (!answered) resolve(false); },
    });
  });
}

function toggle(label, desc, value, onChange, id) {
  const b = h('button', { type: 'button', class: 'switch' + (value ? ' on' : ''), role: 'switch', 'aria-checked': String(!!value), 'aria-labelledby': id, onclick: () => onChange(!value) }, h('i', null));
  return h('div', { class: 'setrow' }, h('div', null, h('strong', { id }, label), desc ? h('p', null, desc) : null), b);
}
function row(label, desc, control) { return h('div', { class: 'setrow' }, h('div', null, h('strong', null, label), desc ? h('p', null, desc) : null), control); }

export function renderSettings(host, ctx) {
  clear(host);
  const p = state.prefs;
  host.appendChild(pageHead('Paramètres', 'Ces réglages sont enregistrés uniquement sur cet appareil.'));
  const set = (k) => (v) => { setPref(k, v); };
  const select = (k, opts, label) => h('select', { class: 'input', 'aria-label': label, onchange: (e) => setPref(k, e.target.value) }, opts.map(([v, l]) => h('option', { value: v, selected: v === p[k] ? '' : null }, l)));

  host.appendChild(card('Apparence', h('div', { class: 'setlist' },
    row('Thème', 'Clair, sombre, ou selon ton appareil.', segmented([{ value: 'light', label: 'Clair', icon: 'sun' }, { value: 'dark', label: 'Sombre', icon: 'moon' }, { value: 'auto', label: 'Auto' }], p.theme, set('theme'), 'Thème')),
    row('Couleur d’accent', 'Les couleurs des types de cours et des résultats ne changent pas.', h('div', { class: 'swatches', role: 'radiogroup', 'aria-label': 'Couleur d’accent' }, Object.entries(ACCENTS).map(([id, a]) => h('button', { type: 'button', role: 'radio', 'aria-checked': String(p.accent === id), class: 'sw' + (p.accent === id ? ' on' : ''), style: { '--sw': a.light }, title: a.name, 'aria-label': a.name, onclick: () => setPref('accent', id) }, p.accent === id ? icon('check', 16) : null)))),
    row('Densité', 'Espacement des listes et des cartes.', segmented([{ value: 'comfortable', label: 'Confortable' }, { value: 'compact', label: 'Compacte' }], p.density, set('density'), 'Densité')),
  ), { ic: 'sun' }));

  const nameIn = h('input', { type: 'text', class: 'input', maxlength: 30, value: p.name, placeholder: 'Ton prénom', 'aria-label': 'Prénom affiché dans l’accueil', autocomplete: 'off' });
  nameIn.addEventListener('change', () => setPref('name', nameIn.value.trim()));
  const semIn = h('input', { type: 'date', class: 'input', value: p.semStart, 'aria-label': 'Date de début du semestre' });
  semIn.addEventListener('change', () => setPref('semStart', semIn.value));
  host.appendChild(card('Affichage', h('div', { class: 'setlist' },
    row('Prénom', 'Affiché dans le message d’accueil.', nameIn),
    row('Section au démarrage', null, select('start', VIEWS.filter((v) => v !== 'settings').map((v) => [v, VIEW_META[v].label]), 'Section au démarrage')),
    row('Vue par défaut du planning', 'Sur téléphone, la vue Semaine devient la vue Jour.', select('calView', [['week', 'Semaine'], ['day', 'Jour'], ['list', 'Liste'], ['month', 'Mois']], 'Vue du planning')),
    row('Format de l’heure', null, segmented([{ value: '24', label: '14:30' }, { value: 'fr', label: '14 h 30' }], p.timeFormat, set('timeFormat'), 'Format de l’heure')),
    row('Informations secondaires', 'Enseignants et détails complémentaires.', segmented([{ value: 'show', label: 'Afficher' }, { value: 'hide', label: 'Masquer' }], p.secondary, set('secondary'), 'Informations secondaires')),
    toggle('Comparaison avec la promotion', 'Meilleure, pire et moyenne de la promotion dans les notes et les statistiques.', p.showPromo, set('showPromo'), 'sw-promo'),
    toggle('Afficher le tiers temps', 'Les séances « Tiers temps » sont masquées par défaut.', p.showTT, set('showTT'), 'sw-tt'),
    row('Début du semestre', 'Sert à calculer la semaine en cours. Laisse vide pour une estimation automatique.', semIn),
  ), { ic: 'sliders' }));

  const g = state.grades, c = state.cal;
  const stat = (s, okText) => s.status === 'ok' ? `${okText}${s.stale ? ' (copie enregistrée)' : ''}` : s.status === 'loading' ? 'Chargement…' : s.status === 'error' ? 'Indisponible' : 'En attente';
  host.appendChild(card('Données', h('div', { class: 'setlist' },
    row('Notes', g.at ? `${stat(g, 'Chargées')} · consultées le ${fmtDateTimeMs(g.at)}` : stat(g, ''), btn('Actualiser', { ic: 'refresh', onClick: () => ctx.refresh() })),
    row('Emploi du temps', c.data?.exportedAt ? `Export ADE du ${fmtDateTimeMs(c.data.exportedAt)} · consulté le ${c.at ? fmtDateTimeMs(c.at) : '–'}` : stat(c, 'Chargé')),
    row('Clé de publication', state.key ? 'Mémorisée sur cet appareil.' : 'Aucune clé enregistrée.', state.key ? btn('Oublier la clé', { onClick: async () => { if (await confirmDialog({ title: 'Oublier la clé ?', text: 'Il faudra rouvrir le lien complet (avec « # ») pour retrouver les notes sur cet appareil.', confirmLabel: 'Oublier', danger: true })) { forgetKey(); clearCaches(); location.hash = ''; location.reload(); } } }) : null),
    toggle('Copie hors ligne', 'Garde une copie des données sur cet appareil pour les consulter sans connexion. Désactivé par défaut car les notes sont personnelles.', p.offline, (v) => { setPref('offline', v); if (!v) { clearCaches(); toast('Copie hors ligne supprimée.', 'ok'); } else reload(); }, 'sw-off'),
    !storageAvailable() ? dataNote('Le stockage local est bloqué par le navigateur : les réglages ne seront pas conservés après fermeture.', 'warn') : null,
  ), { ic: 'refresh' }));

  host.appendChild(card('Exports', h('div', { class: 'setlist' },
    row('Notes au format CSV', 'Tableur (séparateur « ; », ouvert directement par Excel et LibreOffice).', btn('Exporter', { ic: 'download', onClick: exportGradesCSV, disabled: g.status !== 'ok' })),
    row('Relevé imprimable (PDF)', 'Ouvre l’impression : choisis « Enregistrer au format PDF ».', btn('Imprimer', { ic: 'print', onClick: printReport, disabled: g.status !== 'ok' })),
    row('Emploi du temps (.ics)', 'Fichier d’origine, sans modification.', h('a', { class: 'btn', href: 'ADECal.ics', download: 'ADECal.ics' }, icon('download', 16), 'Télécharger')),
  ), { ic: 'download' }));

  host.appendChild(card('Données locales', h('div', { class: 'setlist' },
    row('Favoris, objectifs et notes personnelles', `${state.favs.length} favori(s) · ${Object.keys(state.goals).length} objectif(s) · ${Object.keys(state.notes).length} note(s) personnelle(s). Ils restent sur cet appareil.`, btn('Tout effacer', { ic: 'trash', onClick: async () => { if (await confirmDialog({ title: 'Effacer les données locales ?', text: 'Favoris, objectifs, notes personnelles et copies hors ligne seront supprimés de cet appareil. Les réglages d’affichage et la clé sont conservés.', confirmLabel: 'Effacer', danger: true })) { const k = store.get('k'), pr = store.get('bc.prefs'); purgeLocal(); if (k) store.set('k', k); if (pr) store.set('bc.prefs', pr); toast('Données locales effacées.', 'ok'); ctx.rerender(); } } })),
    row('Réinitialiser les paramètres', 'Revient aux réglages d’origine.', btn('Réinitialiser', { onClick: async () => { if (await confirmDialog({ title: 'Réinitialiser les paramètres ?', text: 'Thème, accent, vues et préférences d’affichage reviendront à leurs valeurs par défaut.', confirmLabel: 'Réinitialiser', danger: true })) { resetPrefs(); toast('Paramètres réinitialisés.', 'ok'); ctx.rerender(); } } })),
  ), { ic: 'trash' }));

  host.appendChild(h('p', { class: 'foot-note muted small' }, `${APP.brand} · ${APP.formation} · ${APP.semester}. Les moyennes affichées sont provisoires et ne remplacent pas les résultats officiels.`));
}
