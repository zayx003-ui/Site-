// Exports : notes en CSV, rapport imprimable (PDF via l'impression du navigateur).
import { h, download, toast, clear } from './dom.js';
import { state } from './state.js';
import { APP } from './config.js';
import { fmtNum, fmtDate, fmtDateTimeMs, getNow, todayKey } from './util.js';

const cell = (v) => {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+([.,]\d+)?$/.test(s)) s = "'" + s; // neutralise l'injection de formules dans un tableur
  return /[;"\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};
const num = (v) => (v == null ? '' : String(v).replace('.', ','));

export function exportGradesCSV() {
  const m = state.grades.model;
  if (!m) { toast('Aucune note à exporter.', 'error'); return; }
  const rows = [['Ressource', 'Évaluation', 'Poids (%)', 'Note /20', 'Meilleure note', 'Pire note', 'Moyenne promo', 'Date']];
  m.resources.forEach((r) => r.evals.forEach((e) => rows.push([`${r.code} ${r.name}`, e.name, num(e.w), num(e.v), num(e.best), num(e.worst), num(e.promo), e.date])));
  const csv = '﻿' + rows.map((r) => r.map(cell).join(';')).join('\r\n') + '\r\n';
  download(`notes-${APP.semester.toLowerCase().replace(/\s/g, '')}-${todayKey()}.csv`, csv, 'text/csv;charset=utf-8');
  toast('Notes exportées au format CSV.', 'ok');
}

export function printReport() {
  const m = state.grades.model;
  if (!m) { toast('Aucune note à imprimer.', 'error'); return; }
  const old = document.getElementById('print-root'); if (old) old.remove();
  const t = (head, rows) => h('table', null, h('thead', null, h('tr', null, head.map((x) => h('th', null, x)))), h('tbody', null, rows.map((r) => h('tr', null, r.map((c) => h('td', null, c))))));
  const root = h('div', { id: 'print-root' },
    h('h1', null, `${APP.brand} – Relevé de notes provisoire`),
    h('p', null, `${APP.formation} · ${APP.parcours} · ${APP.semester} · groupe ${APP.group}`),
    h('p', null, `Édité le ${fmtDateTimeMs(getNow())}. Document indicatif : les moyennes sont provisoires et non officielles.`),
    h('h2', null, 'Moyennes par UE (provisoires)'),
    t(['UE', 'Moyenne /20', 'Coefficients notés'], m.ues.map((u) => [u.ue, u.avg == null ? '–' : fmtNum(u.avg), `${Math.round(u.coverage * 100)} %`])),
    h('h2', null, 'Détail des évaluations'),
    t(['Ressource', 'Évaluation', 'Poids', 'Note', 'Meilleure', 'Pire', 'Promo', 'Date'],
      m.resources.flatMap((r) => r.evals.map((e) => [`${r.code} ${r.name}`, e.name, e.w ? fmtNum(e.w, e.w % 1 ? 1 : 0) + ' %' : '–', e.v == null ? '–' : fmtNum(e.v), e.best == null ? '' : fmtNum(e.best), e.worst == null ? '' : fmtNum(e.worst), e.promo == null ? '' : fmtNum(e.promo), e.date ? fmtDate(e.date, { day: 'numeric', month: 'short', year: 'numeric' }) : '']))));
  document.body.appendChild(root);
  document.documentElement.classList.add('printing');
  const done = () => { document.documentElement.classList.remove('printing'); root.remove(); window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  setTimeout(() => window.print(), 60);
}
