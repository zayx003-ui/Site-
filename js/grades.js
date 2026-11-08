// Page Notes : synthèse, UE, évolution, détail par ressource, comparaison à la promotion.
import { h, icon, clear, debounce, toast } from './dom.js';
import { state, setPref, toggleFav, setNote, on } from './state.js';
import { APP } from './config.js';
import { UE_LIST } from './coefficients.js';
import { histogram } from './math.js';
import { fmtNum, fmtDate, fmtDateShort, cap, norm, plural, todayKey, fmtDateTimeMs, dayDiff } from './util.js';
import { card, emptyState, errorState, gradeChip, pageHead, segmented, statCard, ueVar, dataNote, btn, iconBtn, badge } from './components.js';
import { gauge, hbars, rangeRow, rangeLegend, histogramChart, lineChart, progressMatrix } from './charts.js';
import { upcomingExams } from './calendar.js';

const ns = { q: '', ue: '', filter: 'all', sort: 'code', open: new Set(), chart: 'all' };
let ctx = {};

export function openResource(code) { ns.open.add(code); ns.q = ''; ns.ue = ''; ns.filter = 'all'; state.params.r = code; }

export const UE_EXPLAIN = 'Moyenne provisoire : calculée uniquement sur les ressources déjà notées, pondérées par leurs coefficients. Elle évoluera avec les prochaines notes. La moyenne officielle est calculée par l’IUT.';

export function ueTags(res) {
  return Object.keys(res.coef || {}).map((u) => h('span', { class: 'uetag', style: { '--c': ueVar(UE_LIST.indexOf(u) + 1) } }, u.replace('UE ', 'UE ')));
}
export function lastGradeRow(x, { showPromo = true, onClick } = {}) {
  const { res, ev } = x;
  return h('button', { type: 'button', class: 'lg-row', onclick: onClick },
    h('span', { class: 'lg-main' }, h('strong', null, `${res.code}`, h('span', { class: 'lg-name' }, ` ${res.name}`)), h('span', { class: 'lg-ev' }, ev.name, ev.date ? ` · ${fmtDate(ev.date, { day: 'numeric', month: 'short' })}` : '')),
    h('span', { class: 'lg-score' }, gradeChip(ev.v), showPromo && ev.hasPromo ? h('span', { class: 'lg-promo' }, 'Promo ', h('b', { class: 'num' }, fmtNum(ev.promo))) : null),
    gauge(ev.v, { size: 'sm', label: `${res.code} ${ev.name}` }));
}

/* ───────── Synthèse ───────── */
function summary(m) {
  const t = m.totals;
  const mk = (ic, k, v, sub, tone) => h('div', { class: 'mini' }, h('span', { class: 'mini-ic' }, icon(ic, 18)), h('div', null, h('span', { class: 'mini-k' }, k), h('strong', { class: 'num' }, v), sub ? h('span', { class: 'mini-s' }, sub) : null));
  return h('div', null,
    h('div', { class: 'mini-row' },
      mk('check', 'Évaluations notées', `${t.nGraded} / ${t.nEval}`, `${t.nRemaining} restante${t.nRemaining > 1 ? 's' : ''}`),
      mk('trend', 'Progression', `${Math.round(t.progress * 100)} %`, 'des évaluations du semestre'),
      mk('book', 'Ressources évaluées', `${t.nResGraded} / ${t.nRes}`, `${t.nResWithout} sans note`),
      mk('award', 'Moyenne indicative', m.general.avg == null ? '–' : fmtNum(m.general.avg), 'non officielle')),
    h('div', { class: 'pm-wrap' }, progressMatrix(t.nEval, t.nGraded), h('p', { class: 'muted small' }, `Chaque case représente une évaluation : ${t.nGraded} notée${t.nGraded > 1 ? 's' : ''}, ${t.nRemaining} à venir.`)));
}

/* ───────── Cartes d'UE ───────── */
function ueCards(m) {
  return h('div', { class: 'ue-grid' }, m.ues.map((u) => {
    const tone = u.avg == null ? 'none' : u.avg >= 10 ? 'ok' : 'warn';
    const on_ = ns.ue === u.ue;
    return h('button', { type: 'button', class: `ue-card tone-${tone}` + (on_ ? ' on' : ''), style: { '--c': ueVar(u.idx) }, 'aria-pressed': String(on_),
      onclick: () => { ns.ue = on_ ? '' : u.ue; redraw(); document.getElementById('res-list')?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }); },
      'aria-label': `${u.ue}, moyenne provisoire ${u.avg == null ? 'aucune' : fmtNum(u.avg)} sur 20. Filtrer les ressources.` },
      h('span', { class: 'ue-name' }, u.ue),
      h('span', { class: 'ue-avg num' }, u.avg == null ? '–' : fmtNum(u.avg), h('small', null, '/20')),
      gauge(u.avg, { label: u.ue }),
      h('span', { class: 'ue-state' }, u.avg == null ? 'Pas encore de note' : u.avg >= 10 ? 'Au-dessus de la moyenne' : 'Sous la moyenne : à surveiller'),
      h('span', { class: 'ue-cov' }, u.nRes ? `${u.nResGraded}/${u.nRes} ressources notées · ${Math.round(u.coverage * 100)} % des coefficients` : 'Aucune ressource trouvée'));
  }));
}

/* ───────── Évolution ───────── */
function evolution(m) {
  const opts = [{ v: 'all', l: 'Toutes les notes' }, ...UE_LIST.map((u) => ({ v: u, l: u })), ...m.resources.filter((r) => r.stats.nGraded).map((r) => ({ v: r.code, l: `${r.code} ${r.name}` }))];
  const sel = h('select', { class: 'input', 'aria-label': 'Choisir ce qui est affiché dans le graphique', onchange: (e) => { ns.chart = e.target.value; redraw(); } },
    opts.map((o) => h('option', { value: o.v, selected: o.v === ns.chart ? '' : null }, o.l)));
  let pool = m.graded;
  if (UE_LIST.includes(ns.chart)) pool = pool.filter((x) => x.res.coef[ns.chart] > 0);
  else if (ns.chart !== 'all') pool = pool.filter((x) => x.res.code === ns.chart);
  const dated = pool.filter((x) => x.ev.date), undated = pool.length - dated.length;
  const accent = 'var(--accent)';
  const pts = dated.map((x) => ({ date: x.ev.date, y: x.ev.v, title: `${x.res.code} ${x.ev.name}`, sub: x.res.name }));
  const body = h('div', null, h('div', { class: 'row-between' }, sel, h('span', { class: 'muted small' }, `${plural(dated.length, 'note')} datée${dated.length > 1 ? 's' : ''}`)),
    pts.length ? lineChart([{ name: 'Notes', color: accent, points: pts }]) : emptyState({ ic: 'trend', title: 'Pas encore assez de notes datées', text: 'Le graphique apparaîtra dès qu’une note avec une date sera disponible.' }),
    undated ? dataNote(`${plural(undated, 'note')} sans date ne ${undated > 1 ? 'sont' : 'est'} pas représentée${undated > 1 ? 's' : ''} : l’évolution ne serait pas fiable.`) : null,
    pts.length === 1 ? dataNote('Une seule note datée pour l’instant : aucune tendance ne peut être tracée.') : null);
  return card('Évolution de mes notes', body, { ic: 'trend', sub: 'Chaque point est une note sur 20. La ligne pointillée marque 10/20.' });
}

export function distributionCard(m, { title = 'Répartition de mes notes' } = {}) {
  const vals = m.graded.map((x) => x.ev.v);
  const bins = histogram(vals);
  return card(title, vals.length ? h('div', null, histogramChart(bins), h('p', { class: 'muted small' }, `${plural(vals.length, 'note')} · tranches de 2 points sur 20.`)) : emptyState({ ic: 'chart', title: 'Aucune note pour l’instant' }), { ic: 'chart' });
}

/* ───────── Comparaison à la promotion ───────── */
export function promoCard(m) {
  const items = m.gradedWithPromo.filter((x) => x.ev.best != null);
  if (!state.prefs.showPromo) return null;
  const body = items.length
    ? h('div', null, rangeLegend(), h('div', { class: 'range-list' }, items.map((x) => rangeRow({ label: `${x.res.code} · ${x.ev.name}`, sub: x.res.name, v: x.ev.v, best: x.ev.best, worst: x.ev.worst, promo: x.ev.promo, onClick: () => { openResource(x.res.code); redraw(); document.getElementById('res-list')?.scrollIntoView({ block: 'start' }); } }))))
    : emptyState({ ic: 'users', title: 'Pas encore de données de promotion', text: 'Les statistiques de la promotion apparaissent avec les relevés de notes.' });
  return card('Ma note face à la promotion', body, { ic: 'users', sub: 'Pour chaque évaluation : écart entre la pire et la meilleure note, moyenne de la promotion et ta note.' });
}

/* ───────── Détail d'une ressource ───────── */
function evalRows(res) {
  const showPromo = state.prefs.showPromo;
  const exams = upcomingExams().filter((e) => e.code === res.code);
  let firstExam = false;
  return h('div', { class: 'evals' },
    h('div', { class: 'evals-head', 'aria-hidden': 'true' }, h('span', null, 'Évaluation'), h('span', null, 'Poids'), h('span', null, 'Note'), showPromo ? h('span', null, 'Meilleure · Pire · Promo') : null),
    res.evals.map((e) => {
      let status = null;
      if (e.v == null) {
        if (!firstExam && exams.length && /(ecrit|écrit|examen|final|épreuve|epreuve|théorique|theorique)/i.test(e.name)) { status = `Examen prévu le ${fmtDate(exams[0].day, { day: 'numeric', month: 'long' })}`; firstExam = true; }
        else status = 'Note non publiée';
      }
      return h('div', { class: 'eval-row' + (e.v == null ? ' pending' : '') },
        h('span', { class: 'ev-name' }, e.name, e.date && e.v != null ? h('small', null, fmtDate(e.date, { day: 'numeric', month: 'short', year: 'numeric' })) : null, e.invalid ? h('small', { class: 'warn' }, e.invalid) : null),
        h('span', { class: 'ev-w num' }, e.w ? `${fmtNum(e.w, e.w % 1 ? 1 : 0)} %` : '–'),
        h('span', { class: 'ev-v' }, e.v != null ? gradeChip(e.v) : h('span', { class: 'status-txt' }, status)),
        showPromo ? h('span', { class: 'ev-p num' }, e.hasPromo ? [h('b', null, fmtNum(e.best)), ' · ', h('b', null, fmtNum(e.worst)), ' · ', h('b', null, fmtNum(e.promo))] : h('span', { class: 'muted' }, '–')) : null);
    }));
}
function resourceItem(r) {
  const open = ns.open.has(r.code) || ns.open.has(r.id);
  const st = r.stats, fav = state.favs.includes(r.code);
  const noteId = 'res:' + r.code;
  const noteField = h('textarea', { class: 'input note-in', rows: 2, maxlength: 2000, placeholder: 'Note personnelle (visible uniquement sur cet appareil)…', 'aria-label': `Note personnelle pour ${r.code}` }, state.notes[noteId] || '');
  noteField.addEventListener('input', debounce(() => setNote(noteId, noteField.value.trim()), 400));
  const head = h('div', { class: 'res-head' },
    h('button', { type: 'button', class: 'res-toggle', 'aria-expanded': String(open), 'aria-controls': 'rb-' + r.code.replace(/\W/g, ''), onclick: () => { open ? ns.open.delete(r.code) : ns.open.add(r.code); redraw({ keep: r.code }); } },
      h('span', { class: 'res-code' }, r.code),
      h('span', { class: 'res-name' }, r.name, h('small', null, ueTags(r))),
      h('span', { class: 'res-prog muted small' }, `${st.nGraded}/${st.nTotal} note${st.nGraded > 1 ? 's' : ''}`),
      h('span', { class: 'res-avg' }, gradeChip(st.avg)),
      icon(open ? 'chevU' : 'chevD', 18, 'res-chev')),
    h('button', { type: 'button', class: 'icon-btn fav' + (fav ? ' on' : ''), 'aria-pressed': String(fav), 'aria-label': fav ? `Retirer ${r.code} des favoris` : `Ajouter ${r.code} aux favoris`, onclick: () => { toggleFav(r.code); redraw({ keep: r.code }); } }, icon('star', 18)));
  const prov = r.provisional && state.prefs.showPromo;
  const body = open ? h('div', { class: 'res-body', id: 'rb-' + r.code.replace(/\W/g, '') },
    evalRows(r),
    h('div', { class: 'res-foot' },
      h('div', null, h('span', { class: 'mini-k' }, 'Moyenne provisoire'), h('strong', { class: 'num' }, st.avg == null ? '–' : fmtNum(st.avg) + '/20'),
        st.Pr > 0 ? h('span', { class: 'mini-s' }, `Il reste ${fmtNum(st.Pr, st.Pr % 1 ? 1 : 0)} % de la pondération à noter`) : h('span', { class: 'mini-s' }, 'Toutes les évaluations sont notées')),
      prov ? h('div', null, h('span', { class: 'mini-k' }, 'Moyenne provisoire de la promo'), h('strong', { class: 'num' }, fmtNum(r.provisional.promo) + '/20'), h('span', { class: 'mini-s' }, `Meilleure ${fmtNum(r.provisional.best)} · pire ${fmtNum(r.provisional.worst)}`)) : null,
      h('div', { class: 'res-act' }, ctx.goSim ? btn('Simuler un objectif', { ic: 'target', onClick: () => ctx.goSim(r.code) }) : null)),
    h('details', { class: 'pnote' }, h('summary', null, icon('edit', 14), state.notes[noteId] ? 'Ma note personnelle' : 'Ajouter une note personnelle'), noteField)) : null;
  return h('article', { class: 'res' + (open ? ' open' : ''), id: 'res-' + r.code.replace(/\W/g, '') }, head, body);
}

function resourceList(m) {
  let list = [...m.resources];
  if (ns.ue) list = list.filter((r) => r.coef[ns.ue] > 0);
  if (ns.filter === 'graded') list = list.filter((r) => r.stats.nGraded > 0);
  else if (ns.filter === 'none') list = list.filter((r) => r.stats.nGraded === 0);
  else if (ns.filter === 'fav') list = list.filter((r) => state.favs.includes(r.code));
  if (ns.q) { const q = norm(ns.q).split(/\s+/).filter(Boolean); list = list.filter((r) => { const hay = norm([r.code, r.name, ...r.evals.map((e) => e.name)].join(' ')); return q.every((w) => hay.includes(w)); }); }
  const key = { code: (a, b) => a.code.localeCompare(b.code, 'fr', { numeric: true }), avgD: (a, b) => (b.stats.avg ?? -1) - (a.stats.avg ?? -1), avgA: (a, b) => (a.stats.avg ?? 99) - (b.stats.avg ?? 99),
    last: (a, b) => lastDate(b).localeCompare(lastDate(a)), coef: (a, b) => coefSum(b) - coefSum(a) }[ns.sort];
  list.sort(key);
  const search = h('input', { type: 'search', class: 'input', placeholder: 'Rechercher une ressource ou une évaluation…', value: ns.q, 'aria-label': 'Rechercher dans mes notes', 'data-k': 'nsearch' });
  search.addEventListener('input', debounce(() => { ns.q = search.value; redraw({ focus: 'nsearch' }); }, 180));
  const sort = h('select', { class: 'input', 'aria-label': 'Trier les ressources', onchange: (e) => { ns.sort = e.target.value; redraw(); } },
    [['code', 'Trier : code'], ['avgD', 'Moyenne décroissante'], ['avgA', 'Moyenne croissante'], ['last', 'Dernière note'], ['coef', 'Coefficient']].map(([v, l]) => h('option', { value: v, selected: v === ns.sort ? '' : null }, l)));
  const filters = h('div', { class: 'chips', role: 'group', 'aria-label': 'Filtrer les ressources' },
    [['all', 'Toutes'], ['graded', 'Avec note'], ['none', 'Sans note'], ['fav', 'Favoris']].map(([v, l]) => h('button', { type: 'button', class: 'chip' + (ns.filter === v ? ' on' : ''), 'aria-pressed': String(ns.filter === v), onclick: () => { ns.filter = v; redraw(); } }, l)),
    ns.ue ? h('button', { type: 'button', class: 'chip on', style: { '--c': ueVar(UE_LIST.indexOf(ns.ue) + 1) }, onclick: () => { ns.ue = ''; redraw(); }, 'aria-label': `Retirer le filtre ${ns.ue}` }, ns.ue, icon('x', 14)) : null);
  const toolbar = h('div', { class: 'res-tools' }, h('div', { class: 'searchbox' }, icon('search', 18), search), sort);
  const body = h('div', null, toolbar, filters,
    h('p', { class: 'count muted small', role: 'status' }, `${plural(list.length, 'ressource')}${list.length !== m.resources.length ? ` sur ${m.resources.length}` : ''}`),
    list.length ? h('div', { class: 'res-list' }, list.map(resourceItem)) : emptyState({ ic: 'search', title: 'Aucune ressource ne correspond', text: 'Modifie ta recherche ou réinitialise les filtres.', action: btn('Réinitialiser', { onClick: () => { ns.q = ''; ns.ue = ''; ns.filter = 'all'; redraw(); } }) }));
  return card('Détail par ressource', body, { ic: 'layers', id: 'res-list' });
}
const lastDate = (r) => r.evals.filter((e) => e.v != null && e.date).map((e) => e.date).sort().pop() || '';
const coefSum = (r) => Object.values(r.coef || {}).reduce((a, b) => a + b, 0);

/* ───────── Page ───────── */
let host, model;
function redraw({ keep, focus } = {}) {
  if (!host?.isConnected) return;
  const y = window.scrollY;
  renderNotes(host, ctx);
  if (focus) { const i = host.querySelector(`[data-k="${focus}"]`); if (i) { i.focus(); const l = i.value.length; i.setSelectionRange(l, l); } }
  else if (keep) { const el = host.querySelector('#res-' + keep.replace(/\W/g, '') + ' .res-toggle'); if (el) el.focus({ preventScroll: true }); }
  window.scrollTo(0, y);
}
export function renderNotes(el, c) {
  host = el; ctx = c || ctx;
  clear(host);
  host.appendChild(pageHead('Notes', `${APP.semester} · ${APP.formation}`));
  const g = state.grades;
  if (g.status === 'loading' || g.status === 'idle') { host.appendChild(h('div', { class: 'skel-block', 'aria-busy': 'true' }, h('div', { class: 'skel tall' }), h('div', { class: 'skel tall' }), h('div', { class: 'skel tall' }))); return; }
  if (g.status === 'error') { host.appendChild(card(null, errorState(g.error, { retry: ctx.onRetry, what: 'Notes', extra: ctx.keyForm ? ctx.keyForm() : null }))); return; }
  const m = model = g.model;
  if (g.stale) host.appendChild(dataNote('Connexion indisponible : affichage de la dernière copie enregistrée des notes.', 'warn'));
  const w = g.data.warnings || [];
  if (w.length) host.appendChild(h('details', { class: 'note note-warn warns' }, h('summary', null, icon('alert', 16), `${plural(w.length, 'remarque')} sur les données`), h('ul', null, w.map((x) => h('li', null, x)))));
  host.appendChild(card('Synthèse', summary(m), { ic: 'award' }));
  host.appendChild(h('section', { 'aria-label': 'Moyennes par UE' }, h('div', { class: 'section-title' }, h('h2', null, 'Moyennes par UE'), h('p', { class: 'muted small' }, UE_EXPLAIN)), ueCards(m)));
  host.appendChild(h('div', { class: 'grid-2' }, evolution(m), card('Mes 5 dernières notes', m.lastGrades.length ? h('div', { class: 'lg-list' }, m.lastGrades.slice(0, 5).map((x) => lastGradeRow(x, { showPromo: state.prefs.showPromo, onClick: () => { openResource(x.res.code); redraw(); document.getElementById('res-' + x.res.code.replace(/\W/g, ''))?.scrollIntoView({ block: 'center' }); } }))) : emptyState({ ic: 'award', title: 'Aucune note pour l’instant' }), { ic: 'star' })));
  const pc = promoCard(m);
  host.appendChild(h('div', { class: 'grid-2' }, distributionCard(m), pc || card('Mes meilleures et moins bonnes moyennes', bestWorst(m), { ic: 'trend' })));
  host.appendChild(resourceList(m));
  const upd = m.lastDate ? `Dernière note datée : ${fmtDate(m.lastDate, { day: 'numeric', month: 'long', year: 'numeric' })}. ` : '';
  host.appendChild(h('p', { class: 'foot-note muted small' }, `${upd}Consulté le ${fmtDateTimeMs(g.at)}. Les dates des notes sont celles des relevés.`));
  if (state.params.r && !state.params._done) { state.params._done = true; const t = host.querySelector('#res-' + state.params.r.replace(/\W/g, '')); if (t) setTimeout(() => t.scrollIntoView({ block: 'center' }), 50); }
}
function bestWorst(m) {
  if (!m.best) return emptyState({ ic: 'trend', title: 'Pas encore de moyenne' });
  return hbars([...m.resources.filter((r) => r.stats.avg != null)].sort((a, b) => b.stats.avg - a.stats.avg).slice(0, 8).map((r) => ({ label: r.code, value: r.stats.avg })));
}

export function filterUE(ue) { ns.ue = ue; ns.q = ''; ns.filter = 'all'; }
