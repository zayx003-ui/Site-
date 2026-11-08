// Graphiques SVG sans bibliothèque. Aucun camembert : toutes les notes se lisent sur une échelle 0–20.
import { h, s } from './dom.js';
import { fmtNum, dayDiff, fmtDateShort, addDays } from './util.js';

const W = (n) => Math.round(n * 100) / 100;

/* ── Jauge linéaire 0–20 avec repère à 10 ── */
export function gauge(value, { max = 20, label = '', size = 'md', tone } = {}) {
  const pct = value == null ? 0 : Math.max(0, Math.min(1, value / max));
  const t = tone || (value == null ? 'none' : value >= 10 ? 'ok' : 'warn');
  return h('div', { class: `gauge gauge-${size} tone-${t}`, role: 'img', 'aria-label': value == null ? `${label} : pas de note` : `${label} ${fmtNum(value)} sur ${max}` },
    h('i', { style: { width: (pct * 100) + '%' } }),
    h('b', { class: 'gauge-mark', style: { left: (10 / max * 100) + '%' }, title: '10/20' }));
}

/* ── Barres horizontales (moyennes par UE / ressource) ── */
export function hbars(items, { max = 20, mark = 10, valueDec = 2 } = {}) {
  return h('ul', { class: 'hbars' }, items.map((it) => h('li', { class: 'hbar' + (it.onClick ? ' is-link' : '') },
    it.onClick
      ? h('button', { type: 'button', class: 'hbar-label link-btn', onclick: it.onClick }, it.label)
      : h('span', { class: 'hbar-label' }, it.label),
    h('span', { class: 'hbar-track', style: it.color ? { '--bar': it.color } : null },
      h('i', { style: { width: it.value == null ? '0%' : Math.max(0, Math.min(100, it.value / max * 100)) + '%' } }),
      mark != null ? h('b', { class: 'hbar-mark', style: { left: (mark / max * 100) + '%' } }) : null),
    h('span', { class: 'hbar-val num' + (it.value == null ? ' muted' : it.value >= mark ? ' ok' : ' warn') }, it.value == null ? '–' : fmtNum(it.value, valueDec)),
    it.sub ? h('span', { class: 'hbar-sub' }, it.sub) : null)));
}

/* ── Ligne de comparaison à la promo : plage pire→meilleure, repères promo et note personnelle ── */
export function rangeRow({ label, sub, v, best, worst, promo, onClick }) {
  const pos = (x) => (Math.max(0, Math.min(20, x)) / 20 * 100) + '%';
  const track = h('div', { class: 'range-track', role: 'img', 'aria-label': `${label} : ta note ${fmtNum(v)}, moyenne de la promo ${fmtNum(promo)}, meilleure ${fmtNum(best)}, pire ${fmtNum(worst)}` },
    h('b', { class: 'range-ten', style: { left: '50%' } }),
    h('i', { class: 'range-span', style: { left: pos(worst), width: `calc(${pos(best)} - ${pos(worst)})` } }),
    h('u', { class: 'range-promo', style: { left: pos(promo) }, title: `Moyenne de la promo : ${fmtNum(promo)}` }),
    h('span', { class: 'range-me', style: { left: pos(v) }, title: `Ta note : ${fmtNum(v)}` }));
  const head = onClick ? h('button', { type: 'button', class: 'range-label link-btn', onclick: onClick }, label) : h('span', { class: 'range-label' }, label);
  return h('div', { class: 'range-row' }, head, sub ? h('span', { class: 'range-sub' }, sub) : null, track,
    h('span', { class: 'range-val num' }, fmtNum(v)));
}
export function rangeLegend() {
  return h('div', { class: 'range-legend', 'aria-hidden': 'true' },
    h('span', null, h('i', { class: 'leg-me' }), 'Ta note'),
    h('span', null, h('i', { class: 'leg-promo' }), 'Moyenne de la promo'),
    h('span', null, h('i', { class: 'leg-span' }), 'De la pire à la meilleure note'));
}

/* ── Histogramme ── */
export function histogramChart(bins, { width = 520, height = 200, onBar } = {}) {
  const m = { l: 28, r: 8, t: 12, b: 28 }, iw = width - m.l - m.r, ih = height - m.t - m.b;
  const maxN = Math.max(1, ...bins.map((b) => b.n));
  const top = Math.max(2, maxN % 2 ? maxN + 1 : maxN);
  const bw = iw / bins.length;
  const svg = s('svg', { viewBox: `0 0 ${width} ${height}`, class: 'chart', role: 'img', 'aria-label': 'Répartition de mes notes par tranche de 2 points : ' + bins.filter((b) => b.n).map((b) => `${b.n} entre ${b.lo} et ${b.hi}`).join(', ') });
  for (let i = 0; i <= 2; i++) {
    const y = m.t + ih - (ih * i) / 2;
    svg.appendChild(s('line', { x1: m.l, x2: width - m.r, y1: y, y2: y, class: 'ch-grid' }));
    svg.appendChild(s('text', { x: m.l - 6, y: y + 4, class: 'ch-tick', 'text-anchor': 'end' }, String(Math.round((top * i) / 2))));
  }
  bins.forEach((b, i) => {
    const bh = (b.n / top) * ih, x = m.l + i * bw + 3, y = m.t + ih - bh;
    const g = s('g', { class: 'ch-bar' + (b.lo >= 10 ? ' ok' : b.hi <= 10 ? ' warn' : ''), tabindex: b.n ? 0 : null, 'aria-label': `${b.lo} à ${b.hi} : ${b.n} note${b.n > 1 ? 's' : ''}` },
      s('rect', { x: W(x), y: W(y), width: W(bw - 6), height: W(Math.max(bh, b.n ? 2 : 0)), rx: 4 }),
      b.n ? s('text', { x: W(x + (bw - 6) / 2), y: W(y - 4), class: 'ch-val', 'text-anchor': 'middle' }, String(b.n)) : null);
    svg.appendChild(g);
    if (i % 1 === 0) svg.appendChild(s('text', { x: W(m.l + i * bw), y: height - 8, class: 'ch-tick', 'text-anchor': 'middle' }, String(b.lo)));
  });
  svg.appendChild(s('text', { x: W(m.l + iw), y: height - 8, class: 'ch-tick', 'text-anchor': 'middle' }, '20'));
  // repère 10/20
  const x10 = m.l + iw / 2;
  svg.appendChild(s('line', { x1: x10, x2: x10, y1: m.t, y2: m.t + ih, class: 'ch-ten' }));
  return svg;
}

/* ── Courbe d'évolution (axe 0–20, repère 10/20, info-bulles accessibles) ── */
export function lineChart(series, { width = 640, height = 260, yMin = 0, yMax = 20, ref = 10 } = {}) {
  const pts = series.flatMap((se) => se.points);
  const wrap = h('div', { class: 'chart-wrap' });
  if (!pts.length) return wrap;
  const dates = pts.map((p) => p.date).sort();
  let d0 = dates[0], d1 = dates[dates.length - 1];
  if (d0 === d1) { d0 = addDays(d0, -3); d1 = addDays(d1, 3); }
  const span = Math.max(1, dayDiff(d0, d1));
  const m = { l: 34, r: 14, t: 14, b: 32 }, iw = width - m.l - m.r, ih = height - m.t - m.b;
  const X = (d) => m.l + (dayDiff(d0, d) / span) * iw;
  const Y = (v) => m.t + ih - ((v - yMin) / (yMax - yMin)) * ih;
  const svg = s('svg', { viewBox: `0 0 ${width} ${height}`, class: 'chart', role: 'group', 'aria-label': 'Évolution des notes dans le temps, échelle de 0 à 20' });
  for (let v = yMin; v <= yMax; v += 5) {
    svg.appendChild(s('line', { x1: m.l, x2: width - m.r, y1: W(Y(v)), y2: W(Y(v)), class: 'ch-grid' }));
    svg.appendChild(s('text', { x: m.l - 7, y: W(Y(v) + 4), class: 'ch-tick', 'text-anchor': 'end' }, String(v)));
  }
  if (ref != null) {
    svg.appendChild(s('line', { x1: m.l, x2: width - m.r, y1: W(Y(ref)), y2: W(Y(ref)), class: 'ch-ten' }));
    svg.appendChild(s('text', { x: width - m.r, y: W(Y(ref) - 5), class: 'ch-ten-label', 'text-anchor': 'end' }, '10/20'));
  }
  const nT = Math.min(5, span + 1);
  for (let i = 0; i < nT; i++) {
    const d = addDays(d0, Math.round((span * i) / Math.max(1, nT - 1)));
    svg.appendChild(s('text', { x: W(X(d)), y: height - 10, class: 'ch-tick', 'text-anchor': i === 0 ? 'start' : i === nT - 1 ? 'end' : 'middle' }, fmtDateShort(d)));
  }
  const tip = h('div', { class: 'chart-tip', role: 'status', hidden: true });
  const show = (p, se, cx, cy) => {
    tip.hidden = false;
    tip.textContent = '';
    tip.append(h('b', null, p.title), h('span', null, `${fmtNum(p.y)}/20 · ${fmtDateShort(p.date)}`), p.sub ? h('span', { class: 'muted' }, p.sub) : null);
    const px = (cx / width) * 100, py = (cy / height) * 100;
    tip.style.left = px + '%'; tip.style.top = py + '%';
    tip.classList.toggle('flip', px > 62);
  };
  series.forEach((se) => {
    const sorted = [...se.points].sort((a, b) => a.date.localeCompare(b.date));
    if (sorted.length > 1) svg.appendChild(s('path', { d: sorted.map((p, i) => `${i ? 'L' : 'M'}${W(X(p.date))},${W(Y(p.y))}`).join(' '), class: 'ch-line', style: `stroke:${se.color}` }));
    sorted.forEach((p) => {
      const cx = X(p.date), cy = Y(p.y);
      const c = s('circle', { cx: W(cx), cy: W(cy), r: 5, class: 'ch-dot', style: `fill:${se.color}`, tabindex: 0, 'aria-label': `${se.name} – ${p.title} : ${fmtNum(p.y)} sur 20 le ${fmtDateShort(p.date)}` });
      c.addEventListener('pointerenter', () => show(p, se, cx, cy));
      c.addEventListener('focus', () => show(p, se, cx, cy));
      c.addEventListener('pointerleave', () => { tip.hidden = true; });
      c.addEventListener('blur', () => { tip.hidden = true; });
      svg.appendChild(c);
    });
  });
  wrap.append(svg, tip);
  return wrap;
}

/* ── Matrice de progression : une case par évaluation (remplie si notée) ── */
export function progressMatrix(total, done) {
  return h('div', { class: 'pmatrix', role: 'img', 'aria-label': `${done} évaluations notées sur ${total}` },
    Array.from({ length: total }, (_, i) => h('i', { class: i < done ? 'on' : '' })));
}

/* ── Grande jauge numérique « x / 20 » ── */
export function bigScore(v, { dec = 2, label = '', tone: forced } = {}) {
  const tone = forced || (v == null ? 'none' : v >= 10 ? 'ok' : 'warn');
  return h('div', { class: 'bigscore tone-' + tone, 'aria-label': label },
    h('span', { class: 'bigscore-v num' }, v == null ? '–' : fmtNum(v, dec)),
    h('span', { class: 'bigscore-d' }, '/20'));
}
