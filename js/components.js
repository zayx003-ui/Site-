// Composants d'interface réutilisables.
import { h, icon } from './dom.js';
import { TYPE_META } from './config.js';
import { fmtTime, fmtNum, fmtDur, prefs, getNow } from './util.js';

export const ueVar = (n) => `var(--ue${n})`;

export function card(title, body, { icon: ic, actions, cls = '', sub, id } = {}) {
  return h('section', { class: 'card ' + cls, id: id || null, 'aria-labelledby': title ? undefined : null },
    title ? h('header', { class: 'card-head' },
      h('div', { class: 'card-title' }, ic ? h('span', { class: 'card-ic' }, icon(ic, 18)) : null, h('div', null, h('h2', null, title), sub ? h('p', { class: 'card-sub' }, sub) : null)),
      actions ? h('div', { class: 'card-actions' }, actions) : null) : null,
    h('div', { class: 'card-body' }, body));
}

export function statCard({ ic, label, value, sub, tone = '', onClick, href, big = false }) {
  const inner = [
    h('span', { class: 'stat-ic' }, icon(ic, 20)),
    h('span', { class: 'stat-label' }, label),
    h('span', { class: 'stat-value num' + (big ? ' big' : '') }, value),
    sub ? h('span', { class: 'stat-sub' }, sub) : null,
  ];
  if (onClick || href) return h('button', { type: 'button', class: 'stat is-link tone-' + (tone || 'none'), onclick: onClick, 'aria-label': `${label} : ${typeof value === 'string' ? value : ''} ${sub || ''}`.trim() }, inner);
  return h('div', { class: 'stat tone-' + (tone || 'none') }, inner);
}

export function badge(text, cls = '') { return h('span', { class: 'badge ' + cls }, text); }
export function typeBadge(type) {
  const m = TYPE_META[type] || TYPE_META.OTHER;
  return h('span', { class: 'tbadge t-' + m.cls }, icon(m.icon, 13), m.label);
}
export function gradeChip(v, { dec = 2, small = false } = {}) {
  if (v == null) return h('span', { class: 'gchip none' + (small ? ' sm' : '') }, '–');
  return h('span', { class: 'gchip num ' + (v >= 10 ? 'ok' : 'warn') + (small ? ' sm' : '') }, fmtNum(v, dec), h('small', null, '/20'));
}

export function segmented(options, value, onChange, label) {
  const wrap = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': label });
  options.forEach((o) => {
    const b = h('button', { type: 'button', role: 'radio', 'aria-checked': String(o.value === value), class: o.value === value ? 'on' : '', onclick: () => onChange(o.value) }, o.icon ? icon(o.icon, 16) : null, o.label);
    wrap.appendChild(b);
  });
  wrap.addEventListener('keydown', (e) => {
    if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
    const bs = [...wrap.children], i = bs.indexOf(document.activeElement);
    if (i < 0) return;
    const n = bs[(i + (e.key === 'ArrowRight' ? 1 : bs.length - 1)) % bs.length];
    n.focus(); n.click(); e.preventDefault();
  });
  return wrap;
}

export function emptyState({ ic = 'info', title, text, action }) {
  return h('div', { class: 'empty' }, h('span', { class: 'empty-ic' }, icon(ic, 28)), h('h3', null, title), text ? h('p', null, text) : null, action || null);
}

const ERR = {
  nokey: { ic: 'lock', title: 'Clé de publication manquante', text: 'Ouvre le lien complet, celui qui se termine par « # » suivi de la clé, ou saisis la clé ci-dessous.' },
  network: { ic: 'wifiOff', title: 'Connexion impossible', text: 'Le site n’arrive pas à joindre le serveur. Vérifie ta connexion Internet puis réessaie.' },
  timeout: { ic: 'clock', title: 'Le chargement prend trop de temps', text: 'Le serveur n’a pas répondu à temps. Réessaie dans un instant.' },
  http: { ic: 'alert', title: 'Le serveur renvoie une erreur', text: 'Google ou GitHub rencontre un problème temporaire. Réessaie un peu plus tard.' },
  notpublished: { ic: 'lock', title: 'Feuille inaccessible', text: 'La feuille n’est pas publiée sur le web, ou la clé est incorrecte. Dans Google Sheets : Fichier → Partager → Publier sur le web (onglet « Site », format CSV).' },
  format: { ic: 'alert', title: 'Format inattendu', text: 'Le fichier reçu n’a pas la structure attendue. Vérifie l’onglet « Site » (Ressource, Évaluation, Poids, Note, Meilleure, Pire, Moyenne promo, Date).' },
  invalid: { ic: 'alert', title: 'Données invalides', text: 'Aucune donnée exploitable n’a été trouvée.' },
  missing: { ic: 'calendar', title: 'Emploi du temps introuvable', text: 'Le fichier ADECal.ics n’est pas présent sur le site. Il doit être déposé à la racine du dépôt GitHub.' },
};
export function errorState(err, { retry, what = '', extra } = {}) {
  const m = ERR[err?.kind] || ERR.invalid;
  return h('div', { class: 'empty error', role: 'alert' },
    h('span', { class: 'empty-ic' }, icon(m.ic, 28)),
    h('h3', null, what ? `${what} – ${m.title.toLowerCase()}` : m.title),
    h('p', null, m.text),
    err?.message && err.kind !== 'nokey' ? h('p', { class: 'err-detail' }, err.message) : null,
    extra && (err?.kind === 'nokey' || err?.kind === 'notpublished') ? extra : null,
    retry && err?.kind !== 'nokey' ? h('button', { type: 'button', class: 'btn primary', onclick: retry }, icon('refresh', 16), 'Réessayer') : null);
}

/* ───── Événements du planning ───── */
export function eventStatus(ev, nowMs = getNow()) {
  if (ev.end <= nowMs) return 'past';
  if (ev.start <= nowMs) return 'now';
  return 'future';
}
export const evTime = (ev) => (ev.allDay ? 'Toute la journée' : `${fmtTime(ev.startMin)} – ${fmtTime(ev.endMin === 1440 ? 0 : ev.endMin)}`);
export const evDuration = (ev) => (ev.allDay ? null : fmtDur((ev.end - ev.start) / 60000));
export const evClass = (ev) => (TYPE_META[ev.type] || TYPE_META.OTHER).cls;
export function evTitle(ev) {
  const m = TYPE_META[ev.type];
  return ev.type === 'OTHER' || ev.type === 'OFF' || ev.type === 'AUTO' ? ev.name : `${ev.name}`;
}

export function eventMeta(ev, { teacher = true } = {}) {
  const bits = [];
  if (ev.room) bits.push(h('span', { class: 'meta' }, icon(ev.online ? 'wifiOff' : 'door', 14), ev.room));
  if (teacher && ev.teachers.length && prefs.secondary !== 'hide') bits.push(h('span', { class: 'meta sec' }, icon('user', 14), ev.teachers.join(', ')));
  return bits;
}

export function eventCard(ev, { onOpen, status, showDate = false, dateLabel } = {}) {
  const st = status || eventStatus(ev);
  const m = TYPE_META[ev.type] || TYPE_META.OTHER;
  const el = h('button', { type: 'button', class: `evc t-${m.cls} st-${st}`, onclick: () => onOpen && onOpen(ev), 'aria-label': `${ev.name}, ${m.long}, ${dateLabel ? dateLabel + ', ' : ''}${evTime(ev)}${ev.room ? ', salle ' + ev.room : ''}` },
    h('span', { class: 'evc-time num' }, showDate && dateLabel ? h('b', null, dateLabel) : null, evTime(ev)),
    h('span', { class: 'evc-main' },
      h('span', { class: 'evc-title' }, ev.name),
      h('span', { class: 'evc-meta' }, typeBadge(ev.type), ev.code ? h('span', { class: 'code' }, ev.code) : null, eventMeta(ev))),
    st === 'now' ? h('span', { class: 'live-pill' }, 'En cours') : null);
  return el;
}

/* ───── Compte à rebours en français ───── */
export function countdown(ms, nowMs = getNow()) {
  const d = ms - nowMs;
  if (d <= 0) return 'maintenant';
  const min = Math.floor(d / 60000);
  if (min < 1) return 'dans moins d’1 min';
  if (min < 60) return `dans ${min} min`;
  const hh = Math.floor(min / 60);
  if (hh < 24) return `dans ${hh} h${min % 60 ? ' ' + String(min % 60).padStart(2, '0') : ''}`;
  const days = Math.floor(hh / 24);
  return days === 1 ? 'demain' : `dans ${days} jours`;
}

export function linkBtn(text, onClick, cls = '') { return h('button', { type: 'button', class: 'link-btn ' + cls, onclick: onClick }, text); }
export function btn(text, { ic, onClick, kind = '', title, disabled } = {}) {
  return h('button', { type: 'button', class: 'btn ' + kind, onclick: onClick, title: title || null, disabled: disabled || null }, ic ? icon(ic, 16) : null, text);
}
export function iconBtn(ic, label, onClick, cls = '') { return h('button', { type: 'button', class: 'icon-btn ' + cls, 'aria-label': label, title: label, onclick: onClick }, icon(ic, 20)); }
export function pageHead(title, sub, actions) {
  return h('div', { class: 'page-head' }, h('div', null, h('h1', null, title), sub ? h('p', { class: 'page-sub' }, sub) : null), actions ? h('div', { class: 'page-actions' }, actions) : null);
}
export function dataNote(text, kind = 'info') { return h('p', { class: 'note note-' + kind }, icon(kind === 'warn' ? 'alert' : 'info', 16), h('span', null, text)); }
export { fmtNum };
