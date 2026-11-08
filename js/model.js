// Modèle dérivé des notes : agrégats utilisés par toutes les pages.
import { UE_LIST, COEF } from './coefficients.js';
import { ueStats, generalStats } from './math.js';

export function buildModel(data) {
  const resources = data.resources;
  const ues = UE_LIST.map((ue, i) => {
    const st = ueStats(resources, ue);
    const expected = Object.keys(COEF).filter((c) => COEF[c][ue]);
    const missing = expected.filter((c) => !resources.some((r) => r.code === c));
    return { ue, idx: i + 1, expected, missing, ...st };
  });
  const evals = [];
  resources.forEach((r) => r.evals.forEach((e) => evals.push({ res: r, ev: e })));
  const graded = evals.filter((x) => x.ev.v != null);
  const byDate = (a, b) => (b.ev.date || '').localeCompare(a.ev.date || '') || b.ev.idx - a.ev.idx;
  const lastGrades = [...graded].sort((a, b) => {
    if (!!a.ev.date !== !!b.ev.date) return a.ev.date ? -1 : 1;
    return byDate(a, b);
  });
  const withGrade = resources.filter((r) => r.stats.nGraded > 0);
  const ranked = withGrade.filter((r) => r.stats.avg != null).sort((a, b) => b.stats.avg - a.stats.avg);
  const gradedWithPromo = graded.filter((x) => x.ev.hasPromo);
  return {
    resources, ues, evals, graded, lastGrades,
    general: generalStats(resources),
    totals: {
      nEval: evals.length, nGraded: graded.length, nRemaining: evals.length - graded.length,
      nRes: resources.length, nResGraded: withGrade.length, nResWithout: resources.length - withGrade.length,
      progress: evals.length ? graded.length / evals.length : 0,
    },
    best: ranked[0] || null, worst: ranked[ranked.length - 1] || null,
    gradedWithPromo,
    byCode: new Map(resources.map((r) => [r.code, r])),
    lastDate: data.lastGradeDate || '',
  };
}
export const ueIndexOf = (ue) => UE_LIST.indexOf(ue) + 1;
// Résumé lisible des UE d'une ressource : « UE 3.1, UE 3.2 »
export const ueOf = (r) => Object.keys(r.coef || {});
