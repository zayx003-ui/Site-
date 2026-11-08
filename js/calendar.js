// Emploi du temps : sélecteurs, vues (semaine / jour / liste / mois), filtres, fenêtre de détail, exports ICS.
import { h, icon, openModal, toast, download, debounce, announce, clear } from './dom.js';
import { state, setPref, on } from './state.js';
import { TYPE_META, APP } from './config.js';
import { TYPE_LABEL } from './data.js';
import {
  todayKey, nowMin, getNow, addDays, dayDiff, dow, weekStart, monthStart, addMonths, isoWeek,
  fmtDate, fmtDateShort, fmtTime, fmtDur, cap, norm, plural, keyOf,
} from './util.js';
import {
  card, emptyState, errorState, eventCard, typeBadge, segmented, pageHead, btn, iconBtn, evTime, evDuration,
  eventStatus, countdown, eventMeta, dataNote,
} from './components.js';

/* ───────── Sélecteurs partagés ───────── */
export const isCourse = (ev) => ev.type === 'CM' || ev.type === 'TD' || ev.type === 'TP' || ev.type === 'EX' || ev.type === 'AUTO';
export const isVisible = (ev) => (state.prefs.showTT || ev.type !== 'TT');
export const calEvents = () => (state.cal.data ? state.cal.data.events.filter(isVisible) : []);
export const eventsOn = (day, list = calEvents()) => list.filter((e) => e.day === day).sort((a, b) => a.start - b.start);
export function nextCourse(nowMs = getNow()) {
  return calEvents().filter((e) => isCourse(e) && e.end > nowMs).sort((a, b) => a.start - b.start)[0] || null;
}
export function upcomingExams(nowMs = getNow()) {
  return calEvents().filter((e) => e.type === 'EX' && e.end > nowMs).sort((a, b) => a.start - b.start);
}
export const hoursOf = (list) => list.filter(isCourse).reduce((s, e) => s + (e.end - e.start) / 3600000, 0);
export function weekEvents(weekKey, list = calEvents()) {
  const end = addDays(weekKey, 6);
  return list.filter((e) => e.day >= weekKey && e.day <= end).sort((a, b) => a.start - b.start);
}
const dayName = (k) => cap(fmtDate(k, { weekday: 'long' }));
export const dayLabel = (k) => {
  const t = todayKey(), d = dayDiff(t, k);
  const base = cap(fmtDate(k, { weekday: 'long', day: 'numeric', month: 'long' }));
  return d === 0 ? `Aujourd’hui · ${base}` : d === 1 ? `Demain · ${base}` : base;
};

/* ───────── Export ICS (le fichier d'origine n'est jamais modifié) ───────── */
const icsEsc = (s) => String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const icsDate = (ms) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
function fold(line) {
  const enc = new TextEncoder(); if (enc.encode(line).length <= 75) return line;
  const out = []; let cur = '';
  for (const ch of line) { if (enc.encode(cur + ch).length > (out.length ? 74 : 75)) { out.push(cur); cur = ch; } else cur += ch; }
  out.push(cur); return out.join('\r\n ');
}
export function buildICS(events, name = APP.brand) {
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', `PRODID:-//${name}//FR`, 'CALSCALE:GREGORIAN', `X-WR-CALNAME:${icsEsc(name)}`];
  const stamp = icsDate(Date.now());
  for (const e of events) {
    const desc = [e.teachers.join(', '), e.groups.join(', ')].filter(Boolean).join('\n');
    L.push('BEGIN:VEVENT', `UID:${icsEsc(e.id)}@bio-campus`, `DTSTAMP:${stamp}`, `DTSTART:${icsDate(e.start)}`, `DTEND:${icsDate(e.end)}`,
      `SUMMARY:${icsEsc(e.title)}`, e.room ? `LOCATION:${icsEsc(e.room)}` : null, desc ? `DESCRIPTION:${icsEsc(desc)}` : null, 'END:VEVENT');
  }
  L.push('END:VCALENDAR');
  return L.filter(Boolean).map(fold).join('\r\n') + '\r\n';
}
export function exportEvents(events, filename) {
  if (!events.length) { toast('Aucun événement à exporter pour cette sélection.', 'error'); return; }
  download(filename, buildICS(events), 'text/calendar;charset=utf-8');
  toast(`${plural(events.length, 'événement')} exporté${events.length > 1 ? 's' : ''}.`, 'ok');
}

/* ───────── Fenêtre de détail ───────── */
export function openEvent(ev, { goNotes } = {}) {
  const m = TYPE_META[ev.type] || TYPE_META.OTHER;
  const st = eventStatus(ev);
  const rows = [
    ['clock', 'Horaire', `${cap(fmtDate(ev.day, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))}, ${evTime(ev)}${evDuration(ev) ? ` (${evDuration(ev)})` : ''}`],
    ev.room ? ['door', 'Salle', ev.room + (ev.online ? ' (à distance)' : '')] : null,
    ev.teachers.length ? ['user', ev.teachers.length > 1 ? 'Enseignants' : 'Enseignant', ev.teachers.join(', ')] : null,
    ev.groups.length ? ['users', 'Groupe', ev.groups.join(', ')] : null,
    ev.code ? ['book', 'Ressource', ev.code + (ev.name && ev.type !== 'AUTO' ? ' – ' + ev.name : '')] : null,
  ].filter(Boolean);
  const res = ev.code && state.grades.model ? state.grades.model.byCode.get(ev.code) : null;
  const body = h('div', { class: 'evd' },
    h('div', { class: 'evd-top t-' + m.cls }, typeBadge(ev.type),
      st === 'now' ? h('span', { class: 'live-pill' }, 'En cours') : st === 'future' ? h('span', { class: 'badge soft' }, countdown(ev.start)) : h('span', { class: 'badge soft' }, 'Terminé')),
    h('dl', { class: 'evd-list' }, rows.map(([ic, k, v]) => h('div', null, h('dt', null, icon(ic, 16), k), h('dd', null, v)))),
    ev.notes.length ? h('p', { class: 'note note-info' }, icon('info', 16), h('span', null, ev.notes.join(' · '))) : null,
    h('div', { class: 'evd-actions' },
      btn('Ajouter à mon agenda', { ic: 'cal_add', kind: 'primary', onClick: () => exportEvents([ev], `${(ev.code || 'evenement').replace(/\s/g, '')}-${ev.day}.ics`) }),
      res && goNotes ? btn('Voir mes notes de cette ressource', { ic: 'award', onClick: () => { api.close(); goNotes(res.code); } }) : null));
  const api = openModal({ title: ev.name, content: body });
  return api;
}

/* ───────── État de la page ───────── */
const cs = { view: null, date: null, types: new Set(), q: '', listMax: 40 };
const FILTERS = [['CM', 'CM'], ['TD', 'TD'], ['TP', 'TP'], ['EX', 'Examens'], ['AUTO', 'Autonomie']];
const isMobile = () => matchMedia('(max-width: 820px)').matches;
function effectiveView() {
  const v = cs.view || state.prefs.calView;
  return isMobile() && (v === 'week') ? 'day' : v;
}
function matches(ev) {
  if (cs.types.size && !cs.types.has(ev.type)) return false;
  if (cs.q) {
    const hay = norm([ev.title, ev.name, ev.code, ev.room, ev.teachers.join(' '), ev.groups.join(' '), TYPE_LABEL[ev.type]].join(' '));
    for (const w of norm(cs.q).split(/\s+/).filter(Boolean)) if (!hay.includes(w)) return false;
  }
  return true;
}
const filtersActive = () => cs.types.size > 0 || !!cs.q;

/* ───────── Disposition des chevauchements ───────── */
export function layoutDay(evs) {
  const sorted = [...evs].sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin);
  const out = []; let cluster = [], clusterEnd = -1;
  const flush = () => {
    if (!cluster.length) return;
    const ends = [];
    cluster.forEach((c) => {
      let i = ends.findIndex((e) => e <= c.ev.startMin);
      if (i < 0) { i = ends.length; ends.push(0); }
      ends[i] = c.ev.endMin; c.col = i;
    });
    cluster.forEach((c) => { c.cols = ends.length; });
    out.push(...cluster); cluster = []; clusterEnd = -1;
  };
  for (const ev of sorted) {
    if (cluster.length && ev.startMin >= clusterEnd) flush();
    cluster.push({ ev }); clusterEnd = Math.max(clusterEnd, ev.endMin);
  }
  flush();
  return out;
}

/* ───────── Rendu ───────── */
let root, goNotesFn, rerenderFn;
const HOUR = 58;

function toolbar() {
  const v = effectiveView();
  const step = (dir) => {
    if (v === 'week') cs.date = addDays(cs.date, 7 * dir);
    else if (v === 'day') cs.date = addDays(cs.date, dir);
    else if (v === 'month') cs.date = addMonths(cs.date, dir);
    else cs.date = addDays(cs.date, 14 * dir);
    cs.listMax = 40; rerender();
  };
  let label;
  if (v === 'week') { const a = weekStart(cs.date), b = addDays(a, 6); label = `${fmtDate(a, { day: 'numeric', month: 'short' })} – ${fmtDate(b, { day: 'numeric', month: 'short', year: 'numeric' })}`; }
  else if (v === 'day') label = cap(fmtDate(cs.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }));
  else if (v === 'month') label = cap(fmtDate(cs.date, { month: 'long', year: 'numeric' }));
  else label = `À partir du ${fmtDate(cs.date, { day: 'numeric', month: 'long' })}`;
  const views = [{ value: 'week', label: 'Semaine' }, { value: 'day', label: 'Jour' }, { value: 'list', label: 'Liste' }, { value: 'month', label: 'Mois' }]
    .filter((o) => !(isMobile() && o.value === 'week'));
  const dateInput = h('input', { type: 'date', class: 'input date-in', value: cs.date, 'aria-label': 'Aller à une date', onchange: (e) => { if (e.target.value) { cs.date = e.target.value; rerender(); } } });
  return h('div', { class: 'cal-bar' },
    h('div', { class: 'cal-nav' },
      iconBtn('chevL', 'Précédent', () => step(-1)),
      h('div', { class: 'cal-label', 'aria-live': 'polite' }, h('strong', null, label), v === 'week' ? h('span', null, `Semaine ${isoWeek(cs.date)}`) : null),
      iconBtn('chevR', 'Suivant', () => step(1)),
      h('button', { type: 'button', class: 'btn', onclick: () => { cs.date = todayKey(); rerender(); } }, 'Aujourd’hui'),
      dateInput),
    segmented(views, v, (val) => { cs.view = val; setPref('calView', val); }, 'Vue du planning'));
}

function filterBar(total, shown) {
  const search = h('input', { type: 'search', class: 'input', placeholder: 'Rechercher un cours, une salle, un enseignant…', value: cs.q, 'aria-label': 'Rechercher dans le planning' });
  search.addEventListener('input', debounce(() => { cs.q = search.value; cs.listMax = 40; rerender({ keepFocus: 'search' }); }, 180));
  search.dataset.k = 'search';
  return h('div', { class: 'cal-filters' },
    h('div', { class: 'searchbox' }, icon('search', 18), search),
    h('div', { class: 'chips', role: 'group', 'aria-label': 'Filtrer par type' },
      FILTERS.map(([t, l]) => h('button', { type: 'button', class: `chip t-${TYPE_META[t].cls}` + (cs.types.has(t) ? ' on' : ''), 'aria-pressed': String(cs.types.has(t)), onclick: () => { cs.types.has(t) ? cs.types.delete(t) : cs.types.add(t); rerender(); } }, l))),
    h('div', { class: 'filter-meta' },
      h('span', { class: 'count', role: 'status' }, filtersActive() ? `${plural(shown, 'résultat')} sur ${total}` : `${plural(total, 'événement')}`),
      filtersActive() ? h('button', { type: 'button', class: 'link-btn', onclick: () => { cs.types.clear(); cs.q = ''; rerender(); } }, 'Réinitialiser les filtres') : null,
      btn('Exporter', { ic: 'download', onClick: () => exportModal() })));
}

function summaryCards(list, scopeLabel) {
  const courses = list.filter(isCourse), exams = list.filter((e) => e.type === 'EX');
  const perDay = new Map(); courses.forEach((e) => perDay.set(e.day, (perDay.get(e.day) || 0) + (e.end - e.start) / 3600000));
  const busiest = [...perDay.entries()].sort((a, b) => b[1] - a[1])[0];
  const mk = (ic, k, v, sub) => h('div', { class: 'mini' }, h('span', { class: 'mini-ic' }, icon(ic, 18)), h('div', null, h('span', { class: 'mini-k' }, k), h('strong', { class: 'num' }, v), sub ? h('span', { class: 'mini-s' }, sub) : null));
  return h('div', { class: 'mini-row', 'aria-label': 'Résumé ' + scopeLabel },
    mk('clock', 'Heures de cours', fmtDur(Math.round(hoursOf(list) * 60)), scopeLabel),
    mk('book', 'Séances', String(courses.length), `${courses.filter((e) => e.type === 'CM').length} CM · ${courses.filter((e) => e.type === 'TD').length} TD · ${courses.filter((e) => e.type === 'TP').length} TP`),
    mk('flag', 'Examens', String(exams.length), exams.length ? exams.map((e) => e.code || e.name).slice(0, 2).join(', ') : 'Aucun'),
    mk('trend', 'Journée la plus chargée', busiest ? dayName(busiest[0]) : '–', busiest ? fmtDur(Math.round(busiest[1] * 60)) : ''));
}

function banners(evs) {
  return evs.map((e) => h('button', { type: 'button', class: 'banner t-' + (TYPE_META[e.type] || TYPE_META.OTHER).cls, onclick: () => openEvent(e, { goNotes: goNotesFn }) }, icon(e.type === 'OFF' ? 'sun' : 'info', 14), e.name));
}

/* Grille horaire : 1 colonne (jour) ou 5–7 colonnes (semaine) */
function timeGrid(days, list) {
  const byDay = new Map(days.map((d) => [d, list.filter((e) => e.day === d && e.type !== 'OFF' && !e.allDay)]));
  const all = [...byDay.values()].flat();
  let h0 = 8, h1 = 18;
  if (all.length) { h0 = Math.min(8, Math.floor(Math.min(...all.map((e) => e.startMin)) / 60)); h1 = Math.max(18, Math.ceil(Math.max(...all.map((e) => e.endMin)) / 60)); }
  const total = (h1 - h0) * HOUR, today = todayKey();
  const head = h('div', { class: 'tg-head' }, h('div', { class: 'tg-corner' }),
    days.map((d) => h('button', { type: 'button', class: 'tg-dayhead' + (d === today ? ' today' : ''), onclick: () => { cs.date = d; cs.view = 'day'; rerender(); }, 'aria-label': `Voir ${dayLabel(d)}` },
      h('span', null, cap(fmtDate(d, { weekday: 'short' }))), h('b', { class: 'num' }, fmtDate(d, { day: 'numeric' })))));
  const bannerRow = h('div', { class: 'tg-banners' }, h('div', { class: 'tg-corner' }),
    days.map((d) => h('div', { class: 'tg-bcell' }, banners(list.filter((e) => e.day === d && (e.type === 'OFF' || e.allDay))))));
  const hasBanner = list.some((e) => days.includes(e.day) && (e.type === 'OFF' || e.allDay));
  const gutter = h('div', { class: 'tg-gutter', style: { height: total + 'px' } }, Array.from({ length: h1 - h0 }, (_, i) => h('span', { style: { top: i * HOUR + 'px' }, class: 'num' }, fmtTime((h0 + i) * 60))));
  const cols = days.map((d) => {
    const col = h('div', { class: 'tg-col' + (d === today ? ' today' : ''), style: { height: total + 'px' }, role: 'list', 'aria-label': dayLabel(d) });
    for (let i = 1; i < h1 - h0; i++) col.appendChild(h('i', { class: 'tg-line', style: { top: i * HOUR + 'px' } }));
    layoutDay(byDay.get(d)).forEach(({ ev, col: c, cols: n }) => {
      const top = ((ev.startMin - h0 * 60) / 60) * HOUR, height = Math.max(26, ((ev.endMin - ev.startMin) / 60) * HOUR - 2);
      const m = TYPE_META[ev.type] || TYPE_META.OTHER, st = eventStatus(ev);
      const compact = height < 56 || n > 2;
      col.appendChild(h('button', {
        type: 'button', role: 'listitem', class: `tg-ev t-${m.cls} st-${st}` + (compact ? ' compact' : ''),
        style: { top: top + 'px', height: height + 'px', left: `calc(${(c / n) * 100}% + 2px)`, width: `calc(${100 / n}% - 4px)` },
        onclick: () => openEvent(ev, { goNotes: goNotesFn }),
        'aria-label': `${ev.name}, ${m.long}, ${evTime(ev)}${ev.room ? ', salle ' + ev.room : ''}`,
      }, h('span', { class: 'tg-ev-t' }, h('b', null, ev.code ? ev.code + ' · ' : '', ev.type === 'AUTO' ? 'Autonomie' : ev.name)),
        compact ? null : h('span', { class: 'tg-ev-s num' }, `${m.label} · ${evTime(ev)}`),
        !compact && ev.room ? h('span', { class: 'tg-ev-s' }, ev.room) : null,
        height >= 92 && n <= 1 && ev.teachers.length && state.prefs.secondary !== 'hide' ? h('span', { class: 'tg-ev-s sec' }, ev.teachers[0]) : null));
    });
    if (d === today) {
      const nm = nowMin();
      if (nm >= h0 * 60 && nm <= h1 * 60) col.appendChild(h('i', { class: 'nowline', style: { top: ((nm - h0 * 60) / 60) * HOUR + 'px' }, 'aria-hidden': 'true' }));
    }
    return col;
  });
  return h('div', { class: 'tgrid' + (days.length === 1 ? ' single' : '') }, head, hasBanner ? bannerRow : null,
    h('div', { class: 'tg-body' }, gutter, cols));
}

function weekView(list) {
  const ws = weekStart(cs.date);
  const wk = weekEvents(ws, list);
  const withWeekend = wk.some((e) => dow(e.day) >= 5 && e.type !== 'OFF');
  const days = Array.from({ length: withWeekend ? 7 : 5 }, (_, i) => addDays(ws, i));
  const wrap = h('div', null, summaryCards(wk, 'cette semaine'));
  if (!wk.length) wrap.appendChild(emptyState({ ic: 'calendar', title: 'Rien de prévu cette semaine', text: filtersActive() ? 'Aucun événement ne correspond à tes filtres.' : 'Pas de cours ni d’examen sur cette période.' }));
  wrap.appendChild(timeGrid(days, wk));
  return wrap;
}

function dayView(list) {
  const ws = weekStart(cs.date), today = todayKey();
  const strip = h('div', { class: 'daystrip', role: 'tablist', 'aria-label': 'Jours de la semaine' },
    Array.from({ length: 7 }, (_, i) => addDays(ws, i)).map((d) => {
      const n = eventsOn(d, list).filter((e) => e.type !== 'OFF').length;
      return h('button', { type: 'button', role: 'tab', 'aria-selected': String(d === cs.date), class: (d === cs.date ? 'on ' : '') + (d === today ? 'today' : ''), onclick: () => { cs.date = d; rerender(); }, 'aria-label': `${dayLabel(d)}${n ? ', ' + plural(n, 'événement') : ', rien de prévu'}` },
        h('span', null, cap(fmtDate(d, { weekday: 'short' }))), h('b', { class: 'num' }, fmtDate(d, { day: 'numeric' })), h('i', { class: n ? 'dot' : '' }));
    }));
  const evs = eventsOn(cs.date, list);
  const wrap = h('div', null, strip, summaryCards(evs, 'ce jour'));
  if (!evs.length) wrap.appendChild(emptyState({ ic: 'sun', title: 'Rien de prévu ce jour', text: filtersActive() ? 'Aucun événement ne correspond à tes filtres.' : 'Profites-en pour réviser ou te reposer.' }));
  else wrap.appendChild(h('div', { class: 'daylist' }, timeGrid([cs.date], list)));
  return wrap;
}

function listView(list) {
  const from = cs.date;
  const evs = list.filter((e) => e.day >= from).sort((a, b) => a.start - b.start);
  const shown = evs.slice(0, cs.listMax);
  if (!evs.length) return emptyState({ ic: 'calendar', title: 'Aucun événement à venir', text: filtersActive() ? 'Aucun événement ne correspond à tes filtres.' : 'Aucun événement après cette date.' });
  const groups = new Map(); shown.forEach((e) => { if (!groups.has(e.day)) groups.set(e.day, []); groups.get(e.day).push(e); });
  const wrap = h('div', { class: 'agenda' });
  for (const [d, es] of groups) {
    wrap.appendChild(h('section', { class: 'agenda-day' }, h('h3', { class: d === todayKey() ? 'today' : '' }, dayLabel(d)),
      h('div', { class: 'agenda-items' }, es.map((e) => eventCard(e, { onOpen: (x) => openEvent(x, { goNotes: goNotesFn }) })))));
  }
  if (evs.length > shown.length) wrap.appendChild(btn(`Afficher plus (${evs.length - shown.length} restants)`, { onClick: () => { cs.listMax += 40; rerender(); } }));
  return wrap;
}

function monthView(list) {
  const ms = monthStart(cs.date), gridStart = weekStart(ms), today = todayKey();
  const nWeeks = Math.ceil((dow(ms) + new Date(Date.UTC(+ms.slice(0, 4), +ms.slice(5, 7), 0)).getUTCDate()) / 7);
  const cells = [];
  for (let i = 0; i < nWeeks * 7; i++) {
    const d = addDays(gridStart, i), es = eventsOn(d, list), inMonth = d.slice(0, 7) === ms.slice(0, 7);
    const off = es.find((e) => e.type === 'OFF');
    cells.push(h('button', { type: 'button', class: 'mcell' + (inMonth ? '' : ' out') + (d === today ? ' today' : '') + (off ? ' off' : ''), onclick: () => { cs.date = d; cs.view = 'day'; rerender(); },
      'aria-label': `${dayLabel(d)} : ${es.length ? plural(es.length, 'événement') : 'rien de prévu'}` },
      h('b', { class: 'num' }, fmtDate(d, { day: 'numeric' })),
      h('span', { class: 'mdots' }, es.filter((e) => e.type !== 'OFF').slice(0, 5).map((e) => h('i', { class: 'd t-' + (TYPE_META[e.type] || TYPE_META.OTHER).cls }))),
      es.filter((e) => e.type !== 'OFF').length > 0 ? h('span', { class: 'mcount' }, es.filter((e) => e.type !== 'OFF').length) : null,
      off ? h('span', { class: 'mlabel' }, 'Congé') : null));
  }
  return h('div', { class: 'month' }, h('div', { class: 'mhead' }, ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map((x) => h('span', null, x))), h('div', { class: 'mgrid', style: { '--rows': nWeeks } }, cells),
    h('div', { class: 'legend' }, ['CM', 'TD', 'TP', 'EX', 'AUTO'].map((t) => h('span', null, h('i', { class: 'd t-' + TYPE_META[t].cls }), TYPE_META[t].long))));
}

function exportModal() {
  const all = calEvents().filter(matches);
  const ws = weekStart(cs.date);
  const opt = (title, desc, n, run, extra) => h('div', { class: 'xrow' }, h('div', null, h('strong', null, title), h('p', null, desc)), extra || btn(`Exporter (${n})`, { ic: 'download', onClick: run }));
  const wk = weekEvents(ws, all), dy = eventsOn(cs.date, all);
  const api = openModal({
    title: 'Exporter le planning',
    content: h('div', { class: 'xlist' },
      h('div', { class: 'xrow' }, h('div', null, h('strong', null, 'Calendrier complet (fichier d’origine)'), h('p', null, 'Le fichier ADE tel que publié, sans aucune modification.')),
        h('a', { class: 'btn', href: 'ADECal.ics', download: 'ADECal.ics', onclick: () => { toast('Téléchargement du fichier d’origine.', 'ok'); } }, icon('download', 16), 'Télécharger')),
      opt('Cette semaine', `${cap(fmtDateShort(ws))} – ${fmtDateShort(addDays(ws, 6))}`, wk.length, () => exportEvents(wk, `planning-semaine-${ws}.ics`)),
      opt('Ce jour', dayLabel(cs.date), dy.length, () => exportEvents(dy, `planning-${cs.date}.ics`)),
      filtersActive() ? opt('Tous les résultats filtrés', 'Selon les filtres actuellement actifs', all.length, () => exportEvents(all, 'planning-filtre.ics')) : null,
      h('p', { class: 'note note-info' }, icon('info', 16), h('span', null, 'Les fichiers générés s’importent dans Google Agenda, Apple Calendrier ou Outlook. Les horaires sont envoyés en UTC et s’affichent à l’heure locale.'))),
  });
  return api;
}

function dataBanner() {
  const c = state.cal;
  if (c.status === 'ok' && c.stale) return dataNote('Connexion indisponible : affichage de la dernière copie enregistrée de l’emploi du temps.', 'warn');
  const w = c.data?.warnings || [];
  return w.length ? dataNote(`${w.length} remarque${w.length > 1 ? 's' : ''} sur le fichier d’emploi du temps : ${w.slice(0, 2).join(' ')}`, 'warn') : null;
}

function draw() {
  const host = root.querySelector('.cal-content');
  if (!host) return;
  clear(host);
  const all = calEvents(), list = all.filter(matches);
  const v = effectiveView();
  const content = v === 'week' ? weekView(list) : v === 'day' ? dayView(list) : v === 'list' ? listView(list) : monthView(list);
  host.appendChild(content);
  const bar = root.querySelector('.cal-filters-host');
  if (bar) { clear(bar); bar.appendChild(filterBar(all.length, list.length)); }
  const tb = root.querySelector('.cal-toolbar-host');
  if (tb) { clear(tb); tb.appendChild(toolbar()); }
}
function rerender({ keepFocus } = {}) {
  draw();
  if (keepFocus === 'search') { const i = root.querySelector('[data-k="search"]'); if (i) { i.focus(); const l = i.value.length; i.setSelectionRange(l, l); } }
  announce(effectiveView() === 'month' ? '' : '');
}

export function renderPlanning(host, { goNotes, onRetry }) {
  root = host; goNotesFn = goNotes; rerenderFn = rerender;
  if (!cs.date) cs.date = todayKey();
  const c = state.cal;
  clear(host);
  host.appendChild(pageHead('Emploi du temps', `${APP.formation} · groupe ${APP.group}`, null));
  if (c.status === 'loading' || c.status === 'idle') {
    host.appendChild(h('div', { class: 'skel-block', 'aria-busy': 'true', 'aria-label': 'Chargement du planning' }, h('div', { class: 'skel tall' }), h('div', { class: 'skel tall' })));
    return;
  }
  if (c.status === 'error') { host.appendChild(card(null, errorState(c.error, { retry: onRetry, what: 'Planning' }))); return; }
  const b = dataBanner(); if (b) host.appendChild(b);
  host.append(h('div', { class: 'cal-toolbar-host' }), h('div', { class: 'cal-filters-host' }), h('div', { class: 'cal-content' }));
  draw();
  const off = on('tick', () => { if (!document.querySelector('.modal-back') && root.isConnected) draw(); });
  const resize = debounce(() => { if (root.isConnected) draw(); }, 200);
  window.addEventListener('resize', resize);
  return () => { off(); window.removeEventListener('resize', resize); };
}

export function jumpToDay(day, view = 'day') { cs.date = day; cs.view = view; }
export function setPlanningSearch(q) { cs.q = q || ''; }

export function jumpToExams() { cs.types = new Set(['EX']); cs.q = ''; cs.date = todayKey(); cs.view = 'list'; }
export function resetPlanning() { cs.types.clear(); cs.q = ''; }

on('prefs', (e) => { if (e && (e.k === 'calView' || e.k === '*')) cs.view = null; });
