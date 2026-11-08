// Calculs universitaires purs (aucun accès au DOM) : moyennes, objectifs, simulations.
// Séparés du reste pour pouvoir être testés sous Node (voir tests/).
export const EPS = 1e-9;

// Accepte « 15,25 », « 15.25 », « 15 % », espaces insécables. Retourne null si ce n'est pas un nombre.
export function parseNum(x) {
  if (x == null) return null;
  if (typeof x === 'number') return Number.isFinite(x) ? x : null;
  const s = String(x).trim().replace(/[\s  ]/g, '').replace('%', '').replace(',', '.');
  if (!/^[-+]?(\d+\.?\d*|\.\d+)$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const w0 = (e) => (Number.isFinite(e.w) && e.w > 0 ? e.w : 0);

// Moyenne d'une ressource : uniquement les évaluations notées, pondérées par leur poids.
export function resourceStats(evals) {
  let S = 0, Pg = 0, Pr = 0, Pt = 0, ng = 0;
  for (const e of evals) {
    const w = w0(e);
    Pt += w;
    if (e.v != null) { ng++; S += e.v * w; Pg += w; } else Pr += w;
  }
  return {
    avg: Pg > EPS ? S / Pg : null, S, Pg, Pr, Pt,
    nGraded: ng, nTotal: evals.length, nRemaining: evals.length - ng,
    weightless: ng > 0 && Pg <= EPS,
  };
}

// Moyenne d'une UE : moyenne des ressources notées, pondérée par les coefficients de l'UE.
export function ueStats(resources, ue) {
  let sum = 0, cov = 0, tot = 0, nRes = 0, nResGraded = 0, nEvalTotal = 0, nEvalGraded = 0;
  const parts = [];
  for (const r of resources) {
    const c = r.coef?.[ue];
    if (!(c > 0)) continue;
    tot += c; nRes++;
    nEvalTotal += r.stats.nTotal; nEvalGraded += r.stats.nGraded;
    if (r.stats.avg != null) { sum += r.stats.avg * c; cov += c; nResGraded++; }
    parts.push({ code: r.code, coef: c, avg: r.stats.avg, graded: r.stats.nGraded, total: r.stats.nTotal });
  }
  return {
    avg: cov > EPS ? sum / cov : null,
    coverage: tot > 0 ? cov / tot : 0, totalCoef: tot, coveredCoef: cov,
    nRes, nResGraded, nEvalTotal, nEvalGraded, parts,
  };
}

// Moyenne générale INDICATIVE : toutes les ressources notées, pondérées par la somme de leurs coefficients d'UE.
// (En BUT, chaque UE est jugée séparément : ce chiffre n'a pas de valeur officielle.)
export function generalStats(resources) {
  let s = 0, c = 0, tot = 0;
  for (const r of resources) {
    const k = Object.values(r.coef || {}).reduce((a, b) => a + b, 0);
    if (!(k > 0)) continue;
    tot += k;
    if (r.stats.avg != null) { s += r.stats.avg * k; c += k; }
  }
  return { avg: c > EPS ? s / c : null, coverage: tot > 0 ? c / tot : 0 };
}

// Même calcul que ci-dessus, mais en ne retenant que les notes datées au plus tard à `cutoff` (AAAA-MM-JJ).
export function generalStatsAt(resources, cutoff) {
  const sub = resources.map((r) => ({
    coef: r.coef,
    stats: resourceStats(r.evals.map((e) => ({ w: e.w, v: e.v != null && e.date && e.date <= cutoff ? e.v : null }))),
  }));
  return generalStats(sub);
}

// Note moyenne nécessaire sur les évaluations restantes (même note x sur chacune) pour atteindre `target`.
export function needed(evals, target) {
  if (!Number.isFinite(target) || target < 0 || target > 20) return { status: 'invalid' };
  if (!evals.length) return { status: 'nodata' };
  const st = resourceStats(evals);
  if (st.Pt <= EPS) return { status: 'noweight', ...st };
  if (st.Pr <= EPS) {
    const fin = st.avg;
    return { status: 'complete', final: fin, reached: fin != null && fin + EPS >= target, ...st };
  }
  const raw = (target * st.Pt - st.S) / st.Pr;
  let status;
  if (raw <= EPS) status = 'reached';
  else if (raw > 20 + EPS) status = 'impossible';
  else if (raw >= 15) status = 'hard';
  else status = 'feasible';
  return {
    status, raw, x: Math.max(0, raw), ...st,
    minFinal: st.S / st.Pt, maxFinal: (st.S + 20 * st.Pr) / st.Pt,
  };
}

// Moyenne obtenue si toutes les évaluations restantes valent `x`.
export function withUniform(evals, x) {
  return resourceStats(evals.map((e) => (e.v != null ? e : { ...e, v: x })));
}

// Simulation évaluation par évaluation. `hyp[i]` = note hypothétique (ou null) pour la i-ème évaluation.
export function simulate(evals, hyp) {
  const all = evals.map((e, i) => ({ w: e.w, v: e.v != null ? e.v : (hyp[i] != null ? hyp[i] : null), real: e.v != null }));
  const st = resourceStats(all);
  const impacts = all.map((e, i) => {
    if (e.real || e.v == null) return null;
    const without = resourceStats(all.map((x, j) => (j === i ? { ...x, v: null } : x)));
    return st.avg != null && without.avg != null ? st.avg - without.avg : null;
  });
  return { avg: st.avg, complete: all.every((e) => e.v != null), impacts, nHyp: all.filter((e) => !e.real && e.v != null).length, weightless: st.weightless };
}

// Trois hypothèses fondées sur les évaluations réellement restantes.
export function scenarioSet(evals) {
  const st = resourceStats(evals);
  const base = st.avg;
  const mk = (label, x) => {
    const c = Math.min(20, Math.max(0, x));
    const r = withUniform(evals, c);
    return { label, x: c, avg: r.avg };
  };
  return [
    mk('Hypothèse prudente', base == null ? 8 : base - 2),
    mk('Hypothèse moyenne', base == null ? 12 : base),
    mk('Hypothèse ambitieuse', base == null ? 16 : base + 2),
  ];
}

// Simulation par UE : même note x sur toutes les évaluations restantes de l'UE.
// Exact tant que la matrice de coefficients et les pondérations du Sheet sont complètes ; sinon « unreliable ».
export function neededForUE(resources, ue, target, expectedCodes = []) {
  if (!Number.isFinite(target) || target < 0 || target > 20) return { status: 'invalid' };
  const list = resources.filter((r) => r.coef?.[ue] > 0);
  if (!list.length) return { status: 'nodata' };
  const problems = [];
  for (const code of expectedCodes) if (!list.some((r) => r.code === code)) problems.push(`${code} est absente du Sheet`);
  let a = 0, b = 0, C = 0;
  const rows = [];
  for (const r of list) {
    const c = r.coef[ue], st = r.stats;
    if (st.Pt <= EPS) { problems.push(`${r.code} : pondération des évaluations absente`); continue; }
    C += c; a += (c * st.S) / st.Pt; b += (c * st.Pr) / st.Pt;
    rows.push({ code: r.code, name: r.name, coef: c, st });
  }
  if (problems.length) return { status: 'unreliable', problems };
  a /= C; b /= C;
  const rowsAt = (x) => rows.map((r) => ({ ...r, avgAt: (r.st.S + x * r.st.Pr) / r.st.Pt }));
  if (b <= EPS) return { status: 'complete', final: a, reached: a + EPS >= target, a, b, rows: rowsAt(0) };
  const raw = (target - a) / b;
  let status;
  if (raw <= EPS) status = 'reached';
  else if (raw > 20 + EPS) status = 'impossible';
  else if (raw >= 15) status = 'hard';
  else status = 'feasible';
  const x = Math.max(0, raw);
  return { status, raw, x, a, b, minFinal: a, maxFinal: a + 20 * b, rows: rowsAt(Math.min(20, x)) };
}

export function histogram(values, edges = [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20]) {
  const bins = edges.slice(0, -1).map((lo, i) => ({ lo, hi: edges[i + 1], n: 0 }));
  for (const v of values) {
    let i = bins.findIndex((b) => v >= b.lo && v < b.hi);
    if (i < 0 && v === edges[edges.length - 1]) i = bins.length - 1;
    if (i >= 0) bins[i].n++;
  }
  return bins;
}
