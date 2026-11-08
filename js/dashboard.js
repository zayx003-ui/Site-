// Tableau de bord : vue d'ensemble du jour, de la semaine et des résultats.
import { h, icon, clear } from './dom.js';
import { state } from './state.js';
import { APP, TYPE_META } from './config.js';
import { needed } from './math.js';
import { getNow, todayKey, addDays, dayDiff, fmtDate, fmtTime, fmtDur, fmtNum, cap, nowMin, weekStart, plural, fmtHM, fmtDateTimeMs, dow, parisParts } from './util.js';
import { card, statCard, emptyState, errorState, eventCard, typeBadge, evTime, countdown, eventStatus, pageHead, btn, dataNote, ueVar, badge, gradeChip } from './components.js';
import { calEvents, eventsOn, nextCourse, upcomingExams, hoursOf, weekEvents, isCourse, openEvent, dayLabel, jumpToDay, jumpToExams } from './calendar.js';
import { lastGradeRow, UE_EXPLAIN } from './grades.js';
import { gauge, progressMatrix } from './charts.js';
import { semesterProgress } from './statistics.js';

function greeting() {
  const hr = parisParts(getNow()).h;
  return hr < 5 ? 'Bonne nuit' : hr < 18 ? 'Bonjour' : 'Bonsoir';
}

function welcome(ctx) {
  const t = todayKey(), nm = state.prefs.name.trim();
  const evs = state.cal.status === 'ok' ? eventsOn(t).filter(isCourse) : null;
  let line = '';
  if (evs) {
    const nxt = nextCourse(), rest = evs.filter((e) => e.end > getNow());
    if (!evs.length) line = nxt ? `Pas de cours aujourd’hui. Prochaine séance : ${nxt.name} ${dayDiff(t, nxt.day) === 1 ? 'demain' : 'le ' + fmtDate(nxt.day, { weekday: 'long', day: 'numeric', month: 'long' })} à ${fmtTime(nxt.startMin)}.` : 'Pas de cours aujourd’hui.';
    else if (!rest.length) line = `Journée terminée : ${plural(evs.length, 'séance')} aujourd’hui.`;
    else line = `Tu as ${plural(evs.length, 'séance')} aujourd’hui${rest.length < evs.length ? `, il en reste ${rest.length}` : ''}. ${rest[0].start <= getNow() ? 'En cours : ' + rest[0].name + '.' : 'Prochaine à ' + fmtTime(rest[0].startMin) + ' : ' + rest[0].name + '.'}`;
  }
  return h('section', { class: 'welcome' },
    h('div', null, h('p', { class: 'welcome-date' }, cap(fmtDate(t, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))),
      h('h1', null, `${greeting()}${nm ? ' ' + nm : ''} 👋`), line ? h('p', { class: 'welcome-sub' }, line) : null));
}

function stats(ctx) {
  const cal = state.cal, g = state.grades, now = getNow(), t = todayKey();
  const calOk = cal.status === 'ok', gOk = g.status === 'ok';
  const loadingV = (s) => (s.status === 'loading' || s.status === 'idle');
  const v = (ok, s, fn) => (ok ? fn() : loadingV(s) ? '…' : '–');
  const nxt = calOk ? nextCourse(now) : null;
  const today = calOk ? eventsOn(t).filter(isCourse) : [];
  const ws = weekStart(t), wk = calOk ? weekEvents(ws) : [];
  const ex = calOk ? upcomingExams(now)[0] : null;
  const m = g.model;
  const cards = [];
  cards.push(statCard({ ic: 'calendar', label: 'Prochain cours', value: v(calOk, cal, () => nxt ? nxt.name : 'Aucun'), sub: calOk && nxt ? `${cap(fmtDate(nxt.day, { weekday: 'short', day: 'numeric', month: 'short' }))} · ${evTime(nxt)}` : (calOk ? 'Rien de prévu' : errTxt(cal)), onClick: nxt ? () => openEvent(nxt, { goNotes: ctx.goNotes }) : () => ctx.go('planning') }));
  cards.push(statCard({ ic: 'clock', label: 'Dans', value: v(calOk, cal, () => nxt ? (nxt.start <= now ? 'En cours' : countdown(nxt.start, now).replace('dans ', '')) : '–'), sub: calOk && nxt ? (nxt.start <= now ? 'jusqu’à ' + fmtTime(nxt.endMin) : (nxt.room ? 'Salle ' + nxt.room : '')) : '', tone: nxt && nxt.start <= now ? 'live' : '', onClick: () => ctx.go('planning') }));
  const todayHours = hoursOf(today);
  cards.push(statCard({ ic: 'book', label: 'Cours aujourd’hui', value: v(calOk, cal, () => String(today.length)), sub: calOk ? (today.length ? fmtDur(Math.round(todayHours * 60)) + ' de cours' : 'Journée libre') : '', onClick: () => { jumpToDay(t, 'day'); ctx.go('planning'); } }));
  cards.push(statCard({ ic: 'trend', label: 'Heures cette semaine', value: v(calOk, cal, () => fmtDur(Math.round(hoursOf(wk) * 60))), sub: calOk ? plural(wk.filter(isCourse).length, 'séance') : '', onClick: () => { jumpToDay(t, state.prefs.calView === 'month' ? 'week' : state.prefs.calView); ctx.go('planning'); } }));
  cards.push(statCard({ ic: 'flag', label: 'Prochain examen', value: v(calOk, cal, () => ex ? (ex.code || ex.name) : 'Aucun'), sub: calOk && ex ? `${cap(fmtDate(ex.day, { day: 'numeric', month: 'long' }))} · ${countdown(ex.start, now)}` : (calOk ? 'Aucun examen prévu' : ''), tone: ex ? 'ex' : '', onClick: ex ? () => openEvent(ex, { goNotes: ctx.goNotes }) : () => ctx.go('planning') }));
  const nOk = gOk ? m.ues.filter((u) => u.avg != null && u.avg >= 10).length : 0, nGr = gOk ? m.ues.filter((u) => u.avg != null).length : 0;
  cards.push(statCard({ ic: 'layers', label: 'Moyennes des UE', value: v(gOk, g, () => `${nOk}/${nGr || m.ues.length}`), sub: gOk ? (nGr ? 'UE à 10 ou plus · provisoires' : 'Pas encore de note') : errTxt(g), tone: gOk && nGr && nOk === nGr ? 'ok' : gOk && nGr ? 'warn' : '', onClick: () => ctx.go('notes') }));
  cards.push(statCard({ ic: 'check', label: 'Évaluations notées', value: v(gOk, g, () => `${m.totals.nGraded}/${m.totals.nEval}`), sub: gOk ? `${Math.round(m.totals.progress * 100)} % du semestre` : '', onClick: () => ctx.go('notes') }));
  const lg = gOk ? m.lastGrades[0] : null;
  cards.push(statCard({ ic: 'award', label: 'Dernière note', value: v(gOk, g, () => lg ? `${fmtNum(lg.ev.v)}/20` : '–'), sub: lg ? `${lg.res.code} · ${lg.ev.name}` : '', tone: lg ? (lg.ev.v >= 10 ? 'ok' : 'warn') : '', onClick: lg ? () => ctx.goNotes(lg.res.code) : () => ctx.go('notes') }));
  return h('section', { class: 'stat-grid', 'aria-label': 'Résumé' }, cards);
}
const errTxt = (s) => (s.status === 'error' ? 'Indisponible' : '');

function todayTimeline(ctx) {
  const cal = state.cal;
  if (cal.status === 'loading' || cal.status === 'idle') return card('Aujourd’hui', h('div', { class: 'skel-block' }, h('div', { class: 'skel tall' })), { ic: 'clock' });
  if (cal.status === 'error') return card('Aujourd’hui', errorState(cal.error, { retry: ctx.onRetry, what: 'Planning' }), { ic: 'clock' });
  const t = todayKey(), now = getNow();
  const evs = eventsOn(t).filter((e) => e.type !== 'OFF');
  const off = eventsOn(t).find((e) => e.type === 'OFF');
  if (!evs.length) {
    const nxt = nextCourse(now);
    return card('Aujourd’hui', emptyState({ ic: 'sun', title: off ? off.name : 'Pas de cours aujourd’hui', text: nxt ? `Prochain cours : ${nxt.name}, ${dayDiff(t, nxt.day) === 1 ? 'demain' : cap(fmtDate(nxt.day, { weekday: 'long', day: 'numeric', month: 'long' }))} à ${fmtTime(nxt.startMin)}.` : 'Aucun cours à venir dans le calendrier.', action: btn('Ouvrir le planning', { onClick: () => ctx.go('planning') }) }), { ic: 'clock' });
  }
  const items = []; let nowDone = false;
  const nm = nowMin();
  evs.forEach((e) => {
    if (!nowDone && e.start > now) { items.push(h('li', { class: 'tl-now' }, h('span', { class: 'tl-now-t num' }, fmtHM(now)), h('i', null), h('span', { class: 'tl-now-l' }, 'Maintenant'))); nowDone = true; }
    const st = eventStatus(e, now), m = TYPE_META[e.type] || TYPE_META.OTHER;
    const progress = st === 'now' ? Math.round(((now - e.start) / (e.end - e.start)) * 100) : null;
    items.push(h('li', { class: `tl-item st-${st} t-${m.cls}` },
      h('span', { class: 'tl-time num' }, fmtTime(e.startMin), h('small', null, fmtTime(e.endMin === 1440 ? 0 : e.endMin))),
      h('span', { class: 'tl-dot', 'aria-hidden': 'true' }, st === 'past' ? icon('check', 12) : null),
      h('div', { class: 'tl-card' }, eventCard(e, { onOpen: (x) => openEvent(x, { goNotes: ctx.goNotes }), status: st }),
        progress != null ? h('div', { class: 'tl-progress', role: 'progressbar', 'aria-valuenow': progress, 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-label': 'Avancement du cours' }, h('i', { style: { width: progress + '%' } })) : null,
        st === 'future' && !items.some((x) => x.classList.contains('is-next')) && e === evs.find((q) => q.start > now) ? h('span', { class: 'next-pill' }, countdown(e.start, now)) : null)));
  });
  if (!nowDone) items.push(h('li', { class: 'tl-now end' }, h('span', { class: 'tl-now-t num' }, fmtHM(now)), h('i', null), h('span', { class: 'tl-now-l' }, 'Journée terminée')));
  return card('Aujourd’hui', h('ol', { class: 'timeline' }, items), { ic: 'clock', sub: cap(fmtDate(t, { weekday: 'long', day: 'numeric', month: 'long' })), actions: btn('Planning', { ic: 'chevR', onClick: () => { jumpToDay(t, 'day'); ctx.go('planning'); } }) });
}

function deadlines(ctx) {
  if (state.cal.status !== 'ok') return card('Mes prochaines échéances', state.cal.status === 'error' ? errorState(state.cal.error, { retry: ctx.onRetry, what: 'Échéances' }) : h('div', { class: 'skel-block' }, h('div', { class: 'skel tall' })), { ic: 'flag' });
  const now = getNow(), ex = upcomingExams(now).slice(0, 5);
  const body = ex.length ? h('ul', { class: 'deadlines' }, ex.map((e) => {
    const d = dayDiff(todayKey(), e.day);
    return h('li', null, h('button', { type: 'button', class: 'dl', onclick: () => openEvent(e, { goNotes: ctx.goNotes }) },
      h('span', { class: 'dl-date num' }, h('b', null, fmtDate(e.day, { day: 'numeric' })), h('small', null, fmtDate(e.day, { month: 'short' }))),
      h('span', { class: 'dl-main' }, h('strong', null, e.name), h('small', null, `${e.code ? e.code + ' · ' : ''}${evTime(e)}${e.room ? ' · ' + e.room : ''}`)),
      h('span', { class: 'dl-count' + (d <= 7 ? ' soon' : '') }, d === 0 ? 'Aujourd’hui' : d === 1 ? 'Demain' : `J−${d}`)));
  })) : emptyState({ ic: 'flag', title: 'Aucun examen à venir', text: 'Les prochains examens apparaîtront ici dès qu’ils seront dans le calendrier.' });
  return card('Mes prochaines échéances', body, { ic: 'flag', actions: ex.length ? btn('Tous les examens', { onClick: () => { jumpToExams(); ctx.go('planning'); } }) : null });
}

function lastGrades(ctx) {
  const g = state.grades;
  if (g.status === 'loading' || g.status === 'idle') return card('Dernières notes', h('div', { class: 'skel-block' }, h('div', { class: 'skel tall' })), { ic: 'award' });
  if (g.status === 'error') return card('Dernières notes', errorState(g.error, { retry: ctx.onRetry, what: 'Notes', extra: ctx.keyForm ? ctx.keyForm() : null }), { ic: 'award' });
  const l = g.model.lastGrades.slice(0, 5);
  return card('Dernières notes', l.length ? h('div', { class: 'lg-list' }, l.map((x) => lastGradeRow(x, { showPromo: state.prefs.showPromo, onClick: () => ctx.goNotes(x.res.code) }))) : emptyState({ ic: 'award', title: 'Aucune note pour l’instant' }), { ic: 'award', actions: btn('Toutes les notes', { onClick: () => ctx.go('notes') }) });
}

function weekLoad(ctx) {
  if (state.cal.status !== 'ok') return null;
  const t = todayKey(), ws = weekStart(t), days = Array.from({ length: 5 }, (_, i) => addDays(ws, i));
  const hrs = days.map((d) => hoursOf(eventsOn(d)));
  const max = Math.max(6, ...hrs), total = hrs.reduce((a, b) => a + b, 0);
  return card('Charge de la semaine', h('div', null,
    h('div', { class: 'load', role: 'img', 'aria-label': 'Heures de cours par jour : ' + days.map((d, i) => `${cap(fmtDate(d, { weekday: 'long' }))} ${fmtDur(Math.round(hrs[i] * 60))}`).join(', ') },
      days.map((d, i) => h('div', { class: 'load-col' + (d === t ? ' today' : '') }, h('span', { class: 'load-v num' }, hrs[i] ? fmtNum(hrs[i], 1).replace(',0', '') : ''), h('i', { style: { height: Math.max(3, hrs[i] / max * 100) + '%' } }), h('span', { class: 'load-d' }, cap(fmtDate(d, { weekday: 'short' })))))),
    h('p', { class: 'muted small' }, `${fmtDur(Math.round(total * 60))} de cours cette semaine.`)), { ic: 'trend' });
}

function progress(ctx) {
  const g = state.grades;
  if (g.status !== 'ok') return null;
  const m = g.model, sp = semesterProgress();
  return card('Progression du semestre', h('div', null, progressMatrix(m.totals.nEval, m.totals.nGraded),
    h('p', { class: 'muted small' }, `${m.totals.nGraded} évaluations notées sur ${m.totals.nEval}.`),
    sp ? h('div', { class: 'weeks' }, h('div', { class: 'weeks-bar', role: 'img', 'aria-label': `Semaine ${sp.current} sur ${sp.total}` }, Array.from({ length: sp.total }, (_, i) => h('i', { class: i < sp.current ? 'on' : '' }))), h('p', { class: 'muted small' }, `Semaine ${sp.current} sur ${sp.total}${sp.estimated ? ' (début estimé)' : ''}.`)) : null), { ic: 'flag' });
}

function ueOverview(ctx) {
  const g = state.grades;
  if (g.status !== 'ok') return null;
  return card('Moyennes des UE', h('div', null, h('ul', { class: 'ue-mini' }, g.model.ues.map((u) => h('li', null, h('button', { type: 'button', class: 'ue-mini-b', style: { '--c': ueVar(u.idx) }, onclick: () => ctx.go('notes'), 'aria-label': `${u.ue} : ${u.avg == null ? 'pas de note' : fmtNum(u.avg) + ' sur 20'}` },
    h('span', { class: 'ue-mini-n' }, u.ue), gauge(u.avg, { size: 'sm', label: u.ue }), h('span', { class: 'num ue-mini-v ' + (u.avg == null ? 'muted' : u.avg >= 10 ? 'ok' : 'warn') }, u.avg == null ? '–' : fmtNum(u.avg)))))),
    h('p', { class: 'muted small' }, 'Moyennes provisoires, calculées sur les ressources déjà notées.')), { ic: 'layers' });
}

function shortcuts(ctx) {
  const t = todayKey();
  const items = [
    ['calendar', 'Cours de demain', () => { jumpToDay(addDays(t, 1), 'day'); ctx.go('planning'); }],
    ['flag', 'Mes examens', () => { jumpToExams(); ctx.go('planning'); }],
    ['award', 'Mes notes', () => ctx.go('notes')],
    ['calc', 'Simuler un objectif', () => ctx.go('sim')],
    ['chart', 'Statistiques', () => ctx.go('stats')],
    ['search', 'Rechercher', () => ctx.openSearch()],
  ];
  return h('section', { class: 'shortcuts', 'aria-label': 'Accès rapide' }, items.map(([ic, l, fn]) => h('button', { type: 'button', class: 'shortcut', onclick: fn }, icon(ic, 20), h('span', null, l))));
}

export function renderDashboard(host, ctx) {
  clear(host);
  host.appendChild(welcome(ctx));
  const w = [];
  if (state.grades.status === 'ok' && state.grades.stale) w.push('Les notes affichées proviennent de la dernière copie enregistrée (connexion indisponible).');
  if (state.cal.status === 'ok' && state.cal.stale) w.push('L’emploi du temps affiché provient de la dernière copie enregistrée (connexion indisponible).');
  w.forEach((x) => host.appendChild(dataNote(x, 'warn')));
  host.appendChild(stats(ctx));
  host.appendChild(h('div', { class: 'dash-grid' },
    h('div', { class: 'dash-main' }, todayTimeline(ctx), lastGrades(ctx)),
    h('div', { class: 'dash-side' }, deadlines(ctx), ueOverview(ctx), weekLoad(ctx), progress(ctx))));
  host.appendChild(shortcuts(ctx));
}
