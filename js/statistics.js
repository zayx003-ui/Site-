// Page Statistiques : moyennes, répartition, comparaison à la promotion, analyse automatique.
import { h, icon, clear } from './dom.js';
import { state } from './state.js';
import { APP } from './config.js';
import { UE_LIST, COEF } from './coefficients.js';
import { generalStatsAt, neededForUE, EPS } from './math.js';
import { fmtNum, fmtDate, fmtSigned, plural, todayKey, addDays, dayDiff, weekStart, fmtDateTimeMs } from './util.js';
import { card, emptyState, errorState, pageHead, dataNote, ueVar, gradeChip } from './components.js';
import { hbars, lineChart, progressMatrix, bigScore, gauge } from './charts.js';
import { distributionCard } from './grades.js';
import { calEvents } from './calendar.js';

/* Progression du semestre en semaines (début estimé si non renseigné dans les paramètres). */
export function semesterProgress() {
  const evs = calEvents().filter((e) => e.sem === APP.semesterNo || /\bS3\b/.test(e.title));
  if (!evs.length) return null;
  const end = evs.map((e) => e.day).sort().pop();
  let start = state.prefs.semStart, estimated = false;
  if (!start) {
    const ds = state.grades.model ? state.grades.model.graded.map((x) => x.ev.date).filter(Boolean).sort() : [];
    const first = [ds[0], evs.map((e) => e.day).sort()[0]].filter(Boolean).sort()[0];
    if (!first) return null;
    start = first; estimated = true;
  }
  const ws = weekStart(start), we = weekStart(end);
  const total = Math.max(1, Math.round(dayDiff(ws, we) / 7) + 1);
  const t = todayKey();
  const current = Math.min(total, Math.max(0, Math.floor(dayDiff(ws, t) / 7) + 1));
  return { start, end, total, current, estimated, done: t > end };
}

function analysis(m) {
  const lines = [];
  const t = m.totals;
  if (t.nGraded < 3) return [{ tone: 'info', text: `Il y a seulement ${plural(t.nGraded, 'note')} pour l’instant : trop peu pour tirer une analyse fiable. Reviens après les prochaines évaluations.` }];
  const ranked = m.resources.filter((r) => r.stats.avg != null).sort((a, b) => b.stats.avg - a.stats.avg);
  if (ranked.length >= 2) {
    const b = ranked[0], w = ranked[ranked.length - 1];
    lines.push({ tone: 'ok', text: `Ta meilleure moyenne est en ${b.code} ${b.name} : ${fmtNum(b.stats.avg)}/20.` });
    lines.push({ tone: w.stats.avg < 10 ? 'warn' : 'info', text: `Ta moyenne la plus basse est en ${w.code} ${w.name} : ${fmtNum(w.stats.avg)}/20${w.stats.nRemaining ? `, avec encore ${plural(w.stats.nRemaining, 'évaluation')} à venir pour la faire évoluer` : ''}.` });
  }
  for (const u of m.ues) {
    if (u.avg == null) { lines.push({ tone: 'info', text: `${u.ue} : aucune note pour l’instant.` }); continue; }
    if (u.avg >= 10) { lines.push({ tone: 'ok', text: `${u.ue} est au-dessus de 10 (${fmtNum(u.avg)}/20)${u.coverage < 0.5 ? ', mais seulement ' + Math.round(u.coverage * 100) + ' % des coefficients sont notés' : ''}.` }); continue; }
    const r = neededForUE(m.resources, u.ue, 10, u.expected);
    let tail = '';
    if (r.status === 'feasible' || r.status === 'hard') tail = ` Il te faudrait environ ${fmtNum(r.x, 1)}/20 en moyenne sur les évaluations restantes pour atteindre 10.`;
    else if (r.status === 'impossible') tail = ' Atteindre 10 est mathématiquement impossible avec les évaluations restantes connues.';
    else if (r.status === 'unreliable') tail = ' Le calcul de l’objectif n’est pas fiable : certaines données manquent.';
    lines.push({ tone: 'warn', text: `${u.ue} est sous 10 (${fmtNum(u.avg)}/20).${tail}` });
  }
  if (state.prefs.showPromo && m.gradedWithPromo.length >= 3) {
    const a = m.gradedWithPromo, me = a.reduce((s, x) => s + x.ev.v, 0) / a.length, pr = a.reduce((s, x) => s + x.ev.promo, 0) / a.length;
    lines.push({ tone: 'info', text: `Sur ${plural(a.length, 'évaluation')} comparable${a.length > 1 ? 's' : ''}, ta moyenne simple est de ${fmtNum(me)}/20 contre ${fmtNum(pr)}/20 pour la promotion (écart ${fmtSigned(me - pr)}).` });
  }
  lines.push({ tone: 'info', text: `${Math.round(t.progress * 100)} % des évaluations sont notées : ${t.nRemaining} restent à venir. Ces résultats sont provisoires.` });
  return lines;
}

function pairBars(m) {
  const rows = m.resources.map((r) => {
    const g = r.evals.filter((e) => e.v != null && e.hasPromo && e.w > 0);
    if (!g.length) return null;
    const sw = g.reduce((s, e) => s + e.w, 0);
    return { r, me: g.reduce((s, e) => s + e.v * e.w, 0) / sw, promo: g.reduce((s, e) => s + e.promo * e.w, 0) / sw };
  }).filter(Boolean);
  if (!rows.length) return emptyState({ ic: 'users', title: 'Pas encore de données de promotion' });
  const bar = (v, cls) => h('span', { class: 'pb-track ' + cls }, h('i', { style: { width: Math.min(100, v / 20 * 100) + '%' } }), h('b', { class: 'pb-mark' }));
  return h('div', null,
    h('div', { class: 'range-legend', 'aria-hidden': 'true' }, h('span', null, h('i', { class: 'leg-me' }), 'Ma moyenne'), h('span', null, h('i', { class: 'leg-promo2' }), 'Moyenne de la promotion')),
    h('ul', { class: 'pairbars' }, rows.map(({ r, me, promo }) => h('li', null, h('span', { class: 'pb-label' }, r.code, h('small', null, r.name)),
      h('span', { class: 'pb-bars', role: 'img', 'aria-label': `${r.code} : moi ${fmtNum(me)}, promotion ${fmtNum(promo)}` }, bar(me, 'me'), bar(promo, 'promo')),
      h('span', { class: 'pb-vals num' }, h('b', null, fmtNum(me)), h('span', null, fmtNum(promo)))))));
}

function cumulative(m) {
  const dates = [...new Set(m.graded.map((x) => x.ev.date).filter(Boolean))].sort();
  if (dates.length < 2) return emptyState({ ic: 'trend', title: 'Pas assez de dates', text: 'Il faut des notes à au moins deux dates différentes pour tracer l’évolution de la moyenne.' });
  const pts = dates.map((d) => ({ date: d, y: generalStatsAt(m.resources, d).avg, title: 'Moyenne indicative', sub: 'Notes connues à cette date' })).filter((p) => p.y != null);
  return h('div', null, lineChart([{ name: 'Moyenne indicative', color: 'var(--accent)', points: pts }]), dataNote('Moyenne pondérée par les coefficients, calculée avec les seules notes datées au plus tard à chaque date. Indicative et non officielle.'));
}

export function renderStats(host, ctx) {
  clear(host);
  host.appendChild(pageHead('Statistiques', `${APP.semester} · analyse de mes résultats`));
  const g = state.grades;
  if (g.status === 'loading' || g.status === 'idle') { host.appendChild(h('div', { class: 'skel-block', 'aria-busy': 'true' }, h('div', { class: 'skel tall' }), h('div', { class: 'skel tall' }))); return; }
  if (g.status === 'error') { host.appendChild(card(null, errorState(g.error, { retry: ctx.onRetry, what: 'Statistiques', extra: ctx.keyForm ? ctx.keyForm() : null }))); return; }
  const m = g.model, t = m.totals;
  const sp = semesterProgress();
  const mk = (ic, k, v, sub) => h('div', { class: 'mini' }, h('span', { class: 'mini-ic' }, icon(ic, 18)), h('div', null, h('span', { class: 'mini-k' }, k), h('strong', { class: 'num' }, v), sub ? h('span', { class: 'mini-s' }, sub) : null));
  host.appendChild(h('div', { class: 'hero-stats' },
    h('div', { class: 'hero-score' }, h('span', { class: 'mini-k' }, 'Moyenne générale indicative'), bigScore(m.general.avg), gauge(m.general.avg, { label: 'Moyenne générale', size: 'lg' }),
      h('p', { class: 'muted small' }, m.general.avg == null ? 'Aucune note pour l’instant.' : `Basée sur ${Math.round(m.general.coverage * 100)} % des coefficients. En BUT, chaque UE est jugée séparément : cette valeur n’est pas officielle.`)),
    h('div', { class: 'mini-grid' },
      mk('check', 'Notes enregistrées', String(t.nGraded), `sur ${t.nEval} évaluations`),
      mk('trend', 'Meilleure ressource', m.best ? m.best.code : '–', m.best ? fmtNum(m.best.stats.avg) + '/20' : ''),
      mk('alert', 'Ressource la plus basse', m.worst && m.worst !== m.best ? m.worst.code : '–', m.worst && m.worst !== m.best ? fmtNum(m.worst.stats.avg) + '/20' : ''),
      mk('calendar', 'Semestre', sp ? `Semaine ${sp.current} / ${sp.total}` : '–', sp ? (sp.estimated ? 'début estimé · réglable dans Paramètres' : sp.done ? 'terminé' : 'en cours') : 'dates du semestre indisponibles'))));
  host.appendChild(h('div', { class: 'grid-2' },
    card('Moyennes par UE', hbars(m.ues.map((u) => ({ label: u.ue, value: u.avg, color: ueVar(u.idx), sub: u.avg == null ? 'pas de note' : `${Math.round(u.coverage * 100)} % notés`, onClick: () => ctx.goNotes && ctx.goNotes() }))), { ic: 'layers', sub: 'Barre complète = 20/20 · repère = 10/20' }),
    card('Moyennes par ressource', m.resources.some((r) => r.stats.avg != null) ? hbars([...m.resources].filter((r) => r.stats.avg != null).sort((a, b) => b.stats.avg - a.stats.avg).map((r) => ({ label: r.code, value: r.stats.avg, sub: r.name, onClick: () => ctx.goNotes && ctx.goNotes(r.code) }))) : emptyState({ ic: 'book', title: 'Aucune moyenne' }), { ic: 'book' })));
  host.appendChild(h('div', { class: 'grid-2' }, distributionCard(m), card('Évolution de la moyenne', cumulative(m), { ic: 'trend' })));
  if (state.prefs.showPromo) host.appendChild(card('Comparaison avec la promotion', pairBars(m), { ic: 'users', sub: 'Moyenne par ressource, pondérée par le poids de chaque évaluation notée.' }));
  host.appendChild(h('div', { class: 'grid-2' },
    card('Avancement global', h('div', null, progressMatrix(t.nEval, t.nGraded), h('p', { class: 'muted small' }, `${t.nGraded} évaluations notées sur ${t.nEval} (${Math.round(t.progress * 100)} %).`),
      sp ? h('div', { class: 'weeks' }, h('div', { class: 'weeks-bar', role: 'img', 'aria-label': `Semaine ${sp.current} sur ${sp.total}` }, Array.from({ length: sp.total }, (_, i) => h('i', { class: i < sp.current ? 'on' : '' }))), h('p', { class: 'muted small' }, `Semaine ${sp.current} sur ${sp.total}${sp.estimated ? ' (début du semestre estimé)' : ''} · fin prévue le ${fmtDate(sp.end, { day: 'numeric', month: 'long' })}.`)) : null), { ic: 'flag' }),
    card('Analyse de mes résultats', h('ul', { class: 'analysis' }, analysis(m).map((l) => h('li', { class: 'tone-' + l.tone }, icon(l.tone === 'ok' ? 'check' : l.tone === 'warn' ? 'alert' : 'info', 16), h('span', null, l.text)))), { ic: 'sparkle', sub: 'Phrases générées automatiquement à partir de tes notes : ce n’est pas un diagnostic.' })));
}
