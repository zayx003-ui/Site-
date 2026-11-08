// Tests unitaires des calculs : `node --test tests/`
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseNum, resourceStats, ueStats, generalStats, needed, simulate, scenarioSet, neededForUE, withUniform, histogram, generalStatsAt } from '../js/math.js';
import { COEF } from '../js/coefficients.js';

const close = (a, b, e = 1e-9) => assert.ok(Math.abs(a - b) < e, `${a} ≠ ${b}`);
const ev = (w, v = null) => ({ w, v });

test('parseNum : virgule française, espaces, valeurs invalides', () => {
  assert.equal(parseNum('15,25'), 15.25);
  assert.equal(parseNum(' 7 '), 7);
  assert.equal(parseNum('1 2,5'), 12.5);
  assert.equal(parseNum('30 %'), 30);
  assert.equal(parseNum('0'), 0);
  assert.equal(parseNum(''), null);
  assert.equal(parseNum('abc'), null);
  assert.equal(parseNum('1,2,3'), null);
  assert.equal(parseNum(NaN), null);
  assert.equal(parseNum(null), null);
});

test('moyenne de ressource : aucune note → null (pas 0)', () => {
  const s = resourceStats([ev(70), ev(30)]);
  assert.equal(s.avg, null);
  assert.equal(s.nGraded, 0);
  assert.equal(s.nRemaining, 2);
});

test('moyenne de ressource : un 0/20 est une vraie note', () => {
  const s = resourceStats([ev(70), ev(30, 0)]);
  assert.equal(s.avg, 0);
  assert.equal(s.nGraded, 1);
});

test('moyenne de ressource : pondérations (R3.08 = 7,44 ; SAE 3.3 = 12,2875)', () => {
  close(resourceStats([ev(70), ev(6, 12), ev(6, 13.2), ev(18, 4)]).avg, 7.44);
  close(resourceStats([ev(10, 13.4), ev(10, 13.25), ev(20, 11.25), ev(20), ev(8), ev(16), ev(16)]).avg, 12.2875);
});

test('pondérations nulles ou manquantes ne produisent ni NaN ni Infinity', () => {
  const s = resourceStats([{ w: 0, v: 12 }, { w: undefined, v: 14 }, { w: NaN, v: 10 }]);
  assert.equal(s.avg, null);
  assert.equal(s.weightless, true);
  assert.equal(needed([{ w: 0, v: null }], 10).status, 'noweight');
  assert.equal(needed([], 10).status, 'nodata');
});

test('objectif : cas limites', () => {
  // aucune note : il faut exactement l'objectif
  let r = needed([ev(70), ev(30)], 10);
  assert.equal(r.status, 'feasible'); close(r.x, 10);
  // objectif 0 : toujours atteint
  assert.equal(needed([ev(70, 5), ev(30)], 0).status, 'reached');
  // objectif 20 avec une note < 20 : impossible
  assert.equal(needed([ev(70, 15), ev(30)], 20).status, 'impossible');
  // objectif 20 sans aucune note : il faut 20 partout → difficile mais possible
  r = needed([ev(70), ev(30)], 20);
  assert.equal(r.status, 'hard'); close(r.x, 20);
  // déjà atteint quelle que soit la suite (5 pts déjà acquis sur 100 → objectif 5)
  r = needed([ev(50, 10), ev(50)], 5);
  assert.equal(r.status, 'reached'); assert.equal(r.x, 0);
  // une seule évaluation restante, calcul exact : 10×0,7 + x×0,3 = 12 → x = 16,666…
  r = needed([ev(70, 10), ev(30)], 12);
  assert.equal(r.status, 'hard'); close(r.x, (12 * 100 - 700) / 30);
  // impossible : 14×0,7 + 20×0,3 = 15,8 < 16
  r = needed([ev(70, 14), ev(30)], 16);
  assert.equal(r.status, 'impossible'); assert.ok(r.raw > 20);
  close(r.maxFinal, 15.8);
  // toutes notées
  r = needed([ev(70, 12), ev(30, 8)], 10);
  assert.equal(r.status, 'complete'); assert.equal(r.reached, true); close(r.final, 10.8);
  r = needed([ev(70, 8), ev(30, 8)], 10);
  assert.equal(r.reached, false);
  // objectif invalide
  assert.equal(needed([ev(100)], 21).status, 'invalid');
  assert.equal(needed([ev(100)], NaN).status, 'invalid');
  assert.equal(needed([ev(100)], -1).status, 'invalid');
});

test('objectif : plusieurs évaluations restantes, pondérations différentes', () => {
  const evals = [ev(20, 14), ev(30), ev(50)];
  const r = needed(evals, 12);
  close(r.x, (12 * 100 - 14 * 20) / 80);
  // vérification croisée : avec x partout, on obtient bien l'objectif
  close(withUniform(evals, r.x).avg, 12);
});

test('simulation par évaluation + impact', () => {
  const evals = [ev(50, 10), ev(50)];
  const s = simulate(evals, [null, 16]);
  close(s.avg, 13); assert.equal(s.complete, true); close(s.impacts[1], 3);
  const s2 = simulate(evals, [null, null]);
  close(s2.avg, 10); assert.equal(s2.complete, false); assert.equal(s2.nHyp, 0);
  const s3 = simulate([ev(50), ev(50)], [12, null]);
  close(s3.avg, 12); assert.equal(s3.impacts[0], null); // sans l'hypothèse il n'y a plus de donnée
  // une note réelle n'est jamais remplacée par une hypothèse
  close(simulate([ev(100, 9)], [20]).avg, 9);
});

test('scénarios : fondés sur les évaluations restantes', () => {
  const sc = scenarioSet([ev(50, 12), ev(50)]);
  assert.equal(sc.length, 3);
  close(sc[0].avg, (12 + 10) / 2); close(sc[1].avg, 12); close(sc[2].avg, 13);
  // sans aucune note : hypothèses fixes 8 / 12 / 16
  const sc2 = scenarioSet([ev(100)]);
  close(sc2[0].avg, 8); close(sc2[2].avg, 16);
  // bornes 0..20
  const sc3 = scenarioSet([ev(50, 19.5), ev(50)]);
  close(sc3[2].x, 20);
});

// --- Données réelles du semestre 3 (au 08/11/2026) ---
const R = (code, evals) => ({ code, name: code, coef: COEF[code] || {}, evals, stats: resourceStats(evals) });
const real = [
  R('R3.01', [ev(70), ev(30, 15.25)]),
  R('R3.02', [ev(70), ev(22.5, 14), ev(7.5)]),
  R('R3.05', [ev(20, 7), ev(30), ev(50)]),
  R('R3.07', [ev(70, 9), ev(30)]),
  R('R3.08', [ev(70), ev(6, 12), ev(6, 13.2), ev(18, 4)]),
  R('R3.10', [ev(60), ev(40, 13.7)]),
  R('SAE 3.3', [ev(10, 13.4), ev(10, 13.25), ev(20, 11.25), ev(20), ev(8), ev(16), ev(16)]),
];
test('moyennes d\'UE avec la vraie matrice de coefficients', () => {
  close(ueStats(real, 'UE 3.1').avg, (15.25 * 7 + 14 * 12 + 7 * 2 + 9 * 1) / 22);
  close(ueStats(real, 'UE 3.3').avg, (7 * 3 + 9 * 1 + 7.44 * 11 + 13.7 * 10) / 25);
  close(ueStats(real, 'UE 3.4').avg, (7 * 3 + 9 * 1 + 12.2875 * 24) / 28);
  close(ueStats(real, 'UE 3.2').avg, (7 * 2 + 9 * 1) / 3);
  assert.equal(ueStats(real, 'UE 3.5').avg, (7 * 3 + 9 * 1) / 4);
  const g = generalStats([...real, R('R3.03', [ev(100)])]);
  assert.ok(g.avg > 0 && g.avg < 20 && g.coverage > 0 && g.coverage < 1);
  assert.equal(generalStats([R('R3.03', [ev(100)])]).avg, null);
});

test('moyenne générale à une date donnée : exclut les notes sans date', () => {
  const dated = [
    { coef: { 'UE 3.1': 1 }, evals: [{ w: 100, v: 10, date: '2026-10-01' }] },
    { coef: { 'UE 3.1': 1 }, evals: [{ w: 100, v: 16, date: '2026-11-01' }] },
    { coef: { 'UE 3.1': 1 }, evals: [{ w: 100, v: 20, date: '' }] },
  ];
  close(generalStatsAt(dated, '2026-10-15').avg, 10);
  close(generalStatsAt(dated, '2026-11-02').avg, 13);
});

test('simulation par UE : exacte avec une note uniforme sur le reste', () => {
  // UE 3.4 : R3.05(3), R3.06(3), R3.07(1), R3.11(8), R3.12(8), R3.13(8), R3.14(5), SAE 3.3(24)
  const all = Object.keys(COEF).map((code) => {
    const found = real.find((r) => r.code === code);
    return found || R(code, [ev(70), ev(30)]);
  });
  const expected = Object.keys(COEF).filter((c) => COEF[c]['UE 3.4']);
  const r = neededForUE(all, 'UE 3.4', 10, expected);
  assert.ok(['feasible', 'hard', 'reached'].includes(r.status), r.status);
  // contre-vérification : en appliquant x partout, l'UE vaut bien l'objectif
  const proj = all.map((x) => ({ ...x, stats: withUniform(x.evals, r.x) }));
  // moyenne finale de l'UE avec toutes les évaluations à x ou réelles
  let s = 0, c = 0;
  for (const x of all) if (x.coef['UE 3.4']) { s += x.coef['UE 3.4'] * withUniform(x.evals, r.x).avg; c += x.coef['UE 3.4']; }
  close(s / c, 10, 1e-9);
  assert.equal(proj.length, all.length);
  // une ressource attendue absente rend le résultat non fiable
  const u = neededForUE(all.filter((x) => x.code !== 'R3.13'), 'UE 3.4', 10, expected);
  assert.equal(u.status, 'unreliable');
  // objectif impossible
  const imp = neededForUE(all, 'UE 3.4', 20, expected);
  assert.ok(['impossible', 'hard'].includes(imp.status));
  assert.equal(neededForUE(all, 'UE 9.9', 10).status, 'nodata');
  assert.equal(neededForUE(all, 'UE 3.4', 25).status, 'invalid');
  // pondération absente → non fiable
  const noW = [{ code: 'R3.01', name: '', coef: { 'UE 3.1': 7 }, evals: [{ w: 0, v: null }], stats: resourceStats([{ w: 0, v: null }]) }];
  assert.equal(neededForUE(noW, 'UE 3.1', 10).status, 'unreliable');
});

test('simulation par UE : tout est noté → complete', () => {
  const rs = [R('R3.01', [ev(100, 12)])];
  const r = neededForUE(rs, 'UE 3.1', 10, []);
  assert.equal(r.status, 'complete'); assert.equal(r.reached, true); close(r.final, 12);
});

test('histogramme', () => {
  const h = histogram([0, 3.9, 4, 10, 19.99, 20]);
  assert.equal(h[0].n, 1); assert.equal(h[1].n, 1); assert.equal(h[2].n, 1); assert.equal(h[5].n, 1); assert.equal(h[9].n, 2);
  assert.equal(h.reduce((a, b) => a + b.n, 0), 6);
});

test('aucun résultat NaN / Infinity dans les cas dégénérés', () => {
  const cases = [[], [ev(0)], [ev(0, 5)], [ev(100)], [ev(100, 0)]];
  for (const c of cases) for (const t of [0, 10, 20]) {
    const r = needed(c, t);
    for (const k of ['x', 'raw', 'final', 'minFinal', 'maxFinal']) if (k in r) assert.ok(Number.isFinite(r[k]), `${JSON.stringify(c)} ${t} ${k}`);
  }
});
