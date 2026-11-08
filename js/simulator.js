// Simulateur : note nécessaire pour un objectif, notes hypothétiques, scénarios, mode UE, objectifs enregistrés.
import { h, icon, clear, toast } from './dom.js';
import { state, setGoal } from './state.js';
import { APP } from './config.js';
import { UE_LIST } from './coefficients.js';
import { needed, simulate, scenarioSet, withUniform, neededForUE, parseNum, resourceStats, EPS } from './math.js';
import { fmtNum, fmtSigned, plural } from './util.js';
import { card, emptyState, errorState, pageHead, segmented, btn, gradeChip, dataNote, ueVar } from './components.js';
import { gauge, bigScore } from './charts.js';

const sim = { mode: 'res', res: '', ue: 'UE 3.1', target: 10, hyp: {} };
const TARGETS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18];
export function simFor(code) { sim.mode = 'res'; sim.res = code; }
let host, ctx;

const STATUS = {
  reached: { tone: 'ok', ic: 'check', title: 'Objectif déjà atteint', text: () => 'Quelles que soient les notes à venir, tu garderas au moins cette moyenne.' },
  feasible: { tone: 'ok', ic: 'target', title: 'Objectif réalisable' },
  hard: { tone: 'warn', ic: 'alert', title: 'Objectif difficile' },
  impossible: { tone: 'bad', ic: 'alert', title: 'Objectif impossible' },
  complete: { tone: 'info', ic: 'flag', title: 'Toutes les évaluations sont notées' },
  noweight: { tone: 'warn', ic: 'alert', title: 'Pondérations manquantes', text: () => 'Les poids des évaluations ne sont pas renseignés dans la feuille : le calcul serait faux.' },
  nodata: { tone: 'info', ic: 'info', title: 'Aucune évaluation', text: () => 'Cette ressource ne contient aucune évaluation.' },
  invalid: { tone: 'warn', ic: 'alert', title: 'Objectif invalide', text: () => 'Choisis un objectif compris entre 0 et 20.' },
  unreliable: { tone: 'warn', ic: 'alert', title: 'Calcul non fiable' },
};

function targetPicker() {
  const input = h('input', { type: 'text', inputmode: 'decimal', class: 'input target-in', value: String(sim.target).replace('.', ','), 'aria-label': 'Objectif libre, de 0 à 20' });
  input.addEventListener('input', () => { const v = parseNum(input.value); sim.target = v == null ? NaN : v; redrawResult(); });
  return h('div', { class: 'target' },
    h('div', { class: 'chips', role: 'group', 'aria-label': 'Objectifs rapides' }, TARGETS.map((t) => h('button', { type: 'button', class: 'chip' + (sim.target === t ? ' on' : ''), 'aria-pressed': String(sim.target === t), onclick: () => { sim.target = t; redraw(); } }, String(t)))),
    h('label', { class: 'field inline' }, h('span', null, 'Autre objectif'), input, h('span', { class: 'muted' }, '/20')));
}

function statusBlock(r, subject) {
  const meta = STATUS[r.status];
  const t = sim.target;
  let text = meta.text ? meta.text(r) : '';
  let headline = null;
  if (r.status === 'feasible' || r.status === 'hard') {
    headline = bigScore(r.x, { dec: 2, label: 'Note nécessaire', tone: 'none' });
    text = `Pour atteindre ${fmtNum(t, t % 1 ? 1 : 0)}/20 ${subject}, il te faut en moyenne ${fmtNum(r.x)}/20 sur ${r.nRemaining ? plural(r.nRemaining, 'évaluation') + ' restante' + (r.nRemaining > 1 ? 's' : '') : 'les évaluations restantes'}${r.Pr ? ` (${fmtNum(r.Pr, r.Pr % 1 ? 1 : 0)} % de la pondération)` : ''}. ${r.status === 'hard' ? 'C’est ambitieux : il faudra de très bons résultats.' : ''}`;
  } else if (r.status === 'impossible') text = `Même avec 20/20 partout sur ce qu’il reste, la moyenne maximale atteignable est de ${fmtNum(r.maxFinal)}/20 : ${fmtNum(t, t % 1 ? 1 : 0)} n’est plus accessible.`;
  else if (r.status === 'complete') text = `Moyenne finale : ${fmtNum(r.final)}/20. ${r.reached ? 'L’objectif est atteint.' : `L’objectif de ${fmtNum(t, t % 1 ? 1 : 0)}/20 n’est pas atteint.`}`;
  else if (r.status === 'unreliable') text = 'Certaines données nécessaires sont absentes, le résultat ne serait pas fiable : ' + (r.problems || []).join(' ; ') + '.';
  return h('div', { class: 'sim-status tone-' + meta.tone, role: 'status' },
    h('span', { class: 'sim-ic' }, icon(meta.ic, 22)), h('div', null, h('strong', null, meta.title), h('p', null, text)), headline);
}

/* ───────── Mode ressource ───────── */
function resourceMode(m) {
  const list = [...m.resources].sort((a, b) => a.code.localeCompare(b.code, 'fr', { numeric: true }));
  if (!sim.res || !m.byCode.has(sim.res)) sim.res = (list.find((r) => r.stats.nRemaining > 0) || list[0])?.code || '';
  const r = m.byCode.get(sim.res);
  const sel = h('select', { class: 'input', 'aria-label': 'Choisir une ressource', onchange: (e) => { sim.res = e.target.value; redraw(); } },
    list.map((x) => h('option', { value: x.code, selected: x.code === sim.res ? '' : null }, `${x.code} – ${x.name}${state.favs.includes(x.code) ? ' ★' : ''}`)));
  const out = h('div', { id: 'sim-out' });
  const wrap = h('div', null,
    card('1. Choisis une ressource', h('div', null, sel, r ? h('p', { class: 'muted small' }, `${r.stats.nGraded}/${r.stats.nTotal} évaluations notées · moyenne actuelle ${r.stats.avg == null ? '–' : fmtNum(r.stats.avg) + '/20'}`) : null), { ic: 'book' }),
    card('2. Fixe ton objectif', targetPicker(), { ic: 'target', sub: 'Moyenne finale visée dans cette ressource, sur 20.' }),
    out);
  sim._out = () => fillResult(out, m, r);
  fillResult(out, m, r);
  return wrap;
}
function fillResult(out, m, r) {
  clear(out);
  if (!r) { out.appendChild(emptyState({ ic: 'book', title: 'Aucune ressource disponible' })); return; }
  const res = needed(r.evals, sim.target);
  const saved = state.goals[r.code];
  out.appendChild(card('3. Résultat', h('div', null, statusBlock(res, `en ${r.code}`),
    res.status !== 'invalid' && res.status !== 'nodata' && res.status !== 'noweight' ? h('div', { class: 'sim-facts' },
      fact('Moyenne actuelle', r.stats.avg == null ? '–' : fmtNum(r.stats.avg)), fact('Poids restant', res.Pr == null ? '–' : fmtNum(res.Pr, res.Pr % 1 ? 1 : 0) + ' %'),
      fact('Minimum possible', res.minFinal == null ? '–' : fmtNum(res.minFinal)), fact('Maximum possible', res.maxFinal == null ? '–' : fmtNum(res.maxFinal))) : null,
    h('div', { class: 'sim-actions' },
      Number.isFinite(sim.target) && sim.target >= 0 && sim.target <= 20 ? btn(saved === sim.target ? 'Objectif enregistré' : 'Enregistrer comme objectif', { ic: 'flag', kind: saved === sim.target ? '' : 'primary', onClick: () => { setGoal(r.code, sim.target); toast(`Objectif ${fmtNum(sim.target, sim.target % 1 ? 1 : 0)}/20 enregistré pour ${r.code} (sur cet appareil).`, 'ok'); redraw(); } }) : null,
      saved != null ? btn('Retirer', { onClick: () => { setGoal(r.code, null); redraw(); } }) : null),
    ), { ic: 'trend' }));
  const remaining = r.evals.map((e, i) => ({ e, i })).filter((x) => x.e.v == null);
  if (remaining.length && res.status !== 'noweight') {
    out.appendChild(card('Et si j’obtenais…', hypotheses(r), { ic: 'sparkle', sub: 'Saisis des notes hypothétiques sur les évaluations à venir : la moyenne se recalcule. Rien n’est enregistré.' }));
    out.appendChild(card('Scénarios', scenarios(r), { ic: 'layers', sub: 'Même note sur toutes les évaluations restantes.' }));
  }
}
const fact = (k, v) => h('div', { class: 'fact' }, h('span', null, k), h('strong', { class: 'num' }, v));

function hypotheses(r) {
  const hy = sim.hyp[r.code] || (sim.hyp[r.code] = {});
  const result = h('div', { class: 'hyp-result', role: 'status' });
  const row = [];
  const rows = r.evals.map((e, i) => {
    if (e.v != null) return h('div', { class: 'hyp-row done' }, h('span', { class: 'hyp-name' }, e.name, h('small', null, `${fmtNum(e.w, e.w % 1 ? 1 : 0)} %`)), gradeChip(e.v, { small: true }), h('span', { class: 'muted small' }, 'déjà notée'));
    const inp = h('input', { type: 'text', inputmode: 'decimal', class: 'input hyp-in', placeholder: '—', value: hy[i] != null ? String(hy[i]).replace('.', ',') : '', 'aria-label': `Note hypothétique pour ${e.name}` });
    const impact = h('span', { class: 'hyp-impact num muted' });
    inp.addEventListener('input', () => { const v = parseNum(inp.value); if (v == null || v < 0 || v > 20) { delete hy[i]; inp.classList.toggle('bad', inp.value.trim() !== ''); } else { hy[i] = v; inp.classList.remove('bad'); } upd(); });
    row.push({ inp, impact, i });
    return h('div', { class: 'hyp-row' }, h('span', { class: 'hyp-name' }, e.name, h('small', null, `${fmtNum(e.w, e.w % 1 ? 1 : 0)} %`)), inp, impact);
  });
  function upd() {
    const arr = r.evals.map((e, i) => (e.v == null ? (hy[i] ?? null) : null));
    const s = simulate(r.evals, arr);
    const cur = r.stats.avg;
    row.forEach(({ impact, i }) => { const v = s.impacts[i]; impact.textContent = v == null ? '' : `${fmtSigned(v)} pt`; });
    clear(result);
    if (!s.nHyp) { result.appendChild(h('span', { class: 'muted' }, 'Saisis au moins une note pour voir la nouvelle moyenne.')); return; }
    const t = sim.target, ok = Number.isFinite(t) && s.avg != null && s.avg + EPS >= t;
    result.append(h('div', null, h('span', { class: 'mini-k' }, s.complete ? 'Moyenne finale simulée' : 'Moyenne provisoire simulée'), bigScore(s.avg), cur != null && s.avg != null ? h('span', { class: 'delta ' + (s.avg >= cur ? 'ok' : 'warn') }, `${fmtSigned(s.avg - cur)} vs aujourd’hui`) : null),
      h('p', { class: 'tone-' + (ok ? 'ok' : 'warn') + ' verdict' }, Number.isFinite(t) ? (ok ? `Avec ces notes, l’objectif de ${fmtNum(t, t % 1 ? 1 : 0)}/20 serait atteint${s.complete ? '' : ' (pour l’instant)'}.` : `Il manquerait ${fmtNum(t - s.avg)} point${t - s.avg >= 2 ? 's' : ''} pour atteindre ${fmtNum(t, t % 1 ? 1 : 0)}/20${s.complete ? '' : ' : continue la simulation avec les autres évaluations'}.`) : ''));
  }
  const wrap = h('div', { class: 'hyp' }, rows, result);
  upd();
  return wrap;
}

function scenarios(r) {
  const t = sim.target;
  const uni = [10, 12, 14, 16].map((x) => ({ x, avg: withUniform(r.evals, x).avg }));
  const set = scenarioSet(r.evals);
  const line = (lab, x, avg) => h('tr', null, h('th', { scope: 'row' }, lab), h('td', { class: 'num' }, fmtNum(x, 1) + '/20'), h('td', { class: 'num' }, h('strong', null, fmtNum(avg))), h('td', null, Number.isFinite(t) && avg != null ? h('span', { class: 'badge ' + (avg + EPS >= t ? 'ok' : 'warn') }, avg + EPS >= t ? 'Objectif atteint' : `−${fmtNum(t - avg)}`) : ''));
  return h('div', null,
    h('div', { class: 'tablewrap' }, h('table', { class: 'tbl' }, h('thead', null, h('tr', null, h('th', null, 'Scénario'), h('th', null, 'Note sur le reste'), h('th', null, 'Moyenne finale'), h('th', null, 'Objectif'))),
      h('tbody', null, uni.map((u) => line(`Si j’obtiens ${u.x}`, u.x, u.avg)), set.map((s) => line(s.label, s.x, s.avg))))),
    h('p', { class: 'muted small' }, 'Hypothèse prudente : ta moyenne actuelle − 2 points ; moyenne : ta moyenne actuelle ; ambitieuse : + 2 points (bornées entre 0 et 20).'));
}

/* ───────── Mode UE ───────── */
function ueMode(m) {
  const u = m.ues.find((x) => x.ue === sim.ue) || m.ues[0];
  const sel = h('div', { class: 'chips', role: 'group', 'aria-label': 'Choisir une UE' }, m.ues.map((x) => h('button', { type: 'button', class: 'chip' + (x.ue === sim.ue ? ' on' : ''), style: { '--c': ueVar(x.idx) }, 'aria-pressed': String(x.ue === sim.ue), onclick: () => { sim.ue = x.ue; redraw(); } }, x.ue)));
  const out = h('div', { id: 'sim-out' });
  sim._out = () => fillUE(out, m, u);
  fillUE(out, m, u);
  return h('div', null, card('1. Choisis une UE', h('div', null, sel, h('p', { class: 'muted small' }, u.avg == null ? 'Aucune note dans cette UE.' : `Moyenne provisoire actuelle : ${fmtNum(u.avg)}/20 (${Math.round(u.coverage * 100)} % des coefficients notés).`)), { ic: 'layers' }),
    card('2. Fixe ton objectif', targetPicker(), { ic: 'target' }), out);
}
function fillUE(out, m, u) {
  clear(out);
  const r = neededForUE(m.resources, u.ue, sim.target, u.expected);
  const body = h('div', null, statusBlock(r, `en ${u.ue}`));
  if (r.status === 'feasible' || r.status === 'hard' || r.status === 'impossible' || r.status === 'reached') {
    body.appendChild(h('div', { class: 'sim-facts' }, fact('Moyenne actuelle', u.avg == null ? '–' : fmtNum(u.avg)), fact('Minimum possible', fmtNum(r.minFinal)), fact('Maximum possible', fmtNum(r.maxFinal))));
    if (r.status !== 'impossible' && r.status !== 'reached') {
      body.appendChild(h('div', { class: 'tablewrap' }, h('table', { class: 'tbl' }, h('thead', null, h('tr', null, h('th', null, 'Ressource'), h('th', null, 'Coef.'), h('th', null, 'Moyenne visée'))),
        h('tbody', null, r.rows.map((x) => h('tr', null, h('th', { scope: 'row' }, x.code, h('small', null, ' ' + x.name)), h('td', { class: 'num' }, String(x.coef)), h('td', { class: 'num' }, gradeChip(Math.min(20, x.avgAt), { small: true }))))))));
      body.appendChild(dataNote('Calcul exact si tu obtiens la même note sur toutes les évaluations restantes de l’UE, et si les coefficients et pondérations sont ceux de la feuille.'));
    }
  }
  out.appendChild(card('3. Résultat', body, { ic: 'trend' }));
}

function goalsCard(m) {
  const entries = Object.entries(state.goals).filter(([k]) => m.byCode.has(k) || UE_LIST.includes(k));
  if (!entries.length) return null;
  return card('Mes objectifs enregistrés', h('ul', { class: 'goals' }, entries.map(([k, g]) => {
    const r = m.byCode.get(k); const res = r ? needed(r.evals, g) : null;
    const txt = !res ? '' : res.status === 'reached' ? 'atteint' : res.status === 'complete' ? (res.reached ? 'atteint' : 'non atteint') : res.status === 'impossible' ? 'impossible' : res.x != null ? `il faut ${fmtNum(res.x)}/20 sur le reste` : '';
    return h('li', null, h('button', { type: 'button', class: 'link-btn', onclick: () => { sim.mode = 'res'; sim.res = k; sim.target = g; redraw(); } }, `${k}${r ? ' ' + r.name : ''}`), h('span', { class: 'num' }, `objectif ${fmtNum(g, g % 1 ? 1 : 0)}/20`), h('span', { class: 'muted small' }, txt));
  })), { ic: 'flag', sub: 'Enregistrés uniquement sur cet appareil.' });
}

function redrawResult() { if (sim._out) sim._out(); }
function redraw() { if (host?.isConnected) { const y = window.scrollY; renderSimulator(host, ctx); window.scrollTo(0, y); } }

export function renderSimulator(el, c) {
  host = el; ctx = c || ctx;
  clear(host);
  host.appendChild(pageHead('Simulateur de résultats', 'Anticipe tes résultats et construis tes objectifs.'));
  const g = state.grades;
  if (g.status === 'loading' || g.status === 'idle') { host.appendChild(h('div', { class: 'skel-block', 'aria-busy': 'true' }, h('div', { class: 'skel tall' }), h('div', { class: 'skel tall' }))); return; }
  if (g.status === 'error') { host.appendChild(card(null, errorState(g.error, { retry: ctx.onRetry, what: 'Simulateur', extra: ctx.keyForm ? ctx.keyForm() : null }))); return; }
  const m = g.model;
  host.appendChild(segmented([{ value: 'res', label: 'Par ressource', icon: 'book' }, { value: 'ue', label: 'Par UE', icon: 'layers' }], sim.mode, (v) => { sim.mode = v; redraw(); }, 'Mode de simulation'));
  host.appendChild(sim.mode === 'res' ? resourceMode(m) : ueMode(m));
  const gc = goalsCard(m); if (gc) host.appendChild(gc);
  host.appendChild(dataNote('Les simulations sont des estimations fondées sur les notes et pondérations de la feuille. Les moyennes officielles sont calculées par l’IUT.'));
}
