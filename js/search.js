// Recherche globale (Ctrl/Cmd + K) : cours, salles, ressources, UE, évaluations, notes.
import { h, icon, openModal, clear } from './dom.js';
import { state } from './state.js';
import { UE_LIST } from './coefficients.js';
import { norm, fmtDate, fmtNum, cap, getNow } from './util.js';
import { calEvents } from './calendar.js';
import { TYPE_META, VIEW_META } from './config.js';

function buildIndex() {
  const idx = [];
  const now = getNow();
  const evs = calEvents().filter((e) => e.type !== 'OFF');
  const seenRooms = new Set();
  evs.forEach((e) => {
    idx.push({ cat: 'Cours', text: [e.name, e.title, e.code, e.room, e.teachers.join(' '), TYPE_META[e.type]?.long].join(' '), title: e.name, sub: `${cap(fmtDate(e.day, { weekday: 'short', day: 'numeric', month: 'short' }))} · ${TYPE_META[e.type]?.label || ''}${e.room ? ' · ' + e.room : ''}`, ic: TYPE_META[e.type]?.icon || 'calendar', rank: e.end > now ? e.start - now : 1e13 + (now - e.start), act: { t: 'event', ev: e } });
    if (e.room && !seenRooms.has(e.room)) { seenRooms.add(e.room); idx.push({ cat: 'Salles', text: e.room, title: e.room, sub: 'Voir les séances dans cette salle', ic: 'door', rank: 0, act: { t: 'room', room: e.room } }); }
  });
  const m = state.grades.model;
  if (m) {
    m.resources.forEach((r) => idx.push({ cat: 'Ressources', text: `${r.code} ${r.name}`, title: `${r.code} ${r.name}`, sub: r.stats.avg == null ? 'Pas encore de note' : `Moyenne provisoire ${fmtNum(r.stats.avg)}/20`, ic: 'book', rank: 0, act: { t: 'res', code: r.code } }));
    UE_LIST.forEach((u, i) => idx.push({ cat: 'UE', text: u, title: u, sub: m.ues[i].avg == null ? 'Pas encore de note' : `Moyenne provisoire ${fmtNum(m.ues[i].avg)}/20`, ic: 'layers', rank: 0, act: { t: 'ue', ue: u } }));
    m.evals.forEach(({ res, ev }) => {
      idx.push({ cat: 'Évaluations', text: `${res.code} ${res.name} ${ev.name}`, title: `${res.code} · ${ev.name}`, sub: ev.v == null ? 'Note non publiée' : `Note ${fmtNum(ev.v)}/20`, ic: 'flag', rank: 0, act: { t: 'res', code: res.code } });
      if (ev.v != null) idx.push({ cat: 'Notes', text: `${res.code} ${res.name} ${ev.name} ${fmtNum(ev.v)} ${String(ev.v)}`, title: `${fmtNum(ev.v)}/20 · ${res.code} ${ev.name}`, sub: ev.date ? fmtDate(ev.date, { day: 'numeric', month: 'long' }) : '', ic: 'award', rank: 0, act: { t: 'res', code: res.code } });
    });
  }
  return idx;
}
const ORDER = ['Cours', 'Salles', 'Ressources', 'UE', 'Évaluations', 'Notes'];

export function openSearch(actions) {
  const idx = buildIndex();
  const input = h('input', { type: 'search', class: 'input big', placeholder: 'Rechercher un cours, une salle, une ressource, une note…', 'aria-label': 'Recherche globale', autofocus: '', role: 'combobox', 'aria-expanded': 'true', 'aria-controls': 'sr-list', autocomplete: 'off' });
  const list = h('div', { class: 'sr-list', id: 'sr-list', role: 'listbox', 'aria-label': 'Résultats' });
  let items = [], sel = 0, api;
  const run = (a) => {
    api.close();
    if (a.t === 'event') actions.openEvent(a.ev);
    else if (a.t === 'room') actions.room(a.room);
    else if (a.t === 'res') actions.resource(a.code);
    else if (a.t === 'ue') actions.ue(a.ue);
    else if (a.t === 'view') actions.go(a.view);
  };
  const paint = () => {
    clear(list); items = [];
    const q = norm(input.value).split(/\s+/).filter(Boolean);
    let groups;
    if (!q.length) groups = [['Aller à', Object.entries(VIEW_META).map(([v, mt]) => ({ title: mt.label, sub: '', ic: mt.icon, act: { t: 'view', view: v } }))]];
    else {
      const hits = idx.filter((x) => { const t = norm(x.text); return q.every((w) => t.includes(w)); });
      groups = ORDER.map((c) => [c, hits.filter((x) => x.cat === c).sort((a, b) => a.rank - b.rank).slice(0, c === 'Cours' ? 6 : 5)]).filter(([, a]) => a.length);
    }
    if (q.length && !groups.length) { list.appendChild(h('div', { class: 'empty small' }, icon('search', 22), h('p', null, `Aucun résultat pour « ${input.value.trim()} ».`), h('p', { class: 'muted small' }, 'Essaie un code (R3.12), une salle (E200) ou un nom d’enseignant.'))); return; }
    groups.forEach(([cat, arr]) => {
      list.appendChild(h('div', { class: 'sr-cat', role: 'presentation' }, cat));
      arr.forEach((x) => {
        const i = items.length;
        const b = h('button', { type: 'button', role: 'option', id: 'sr-' + i, 'aria-selected': String(i === sel), class: 'sr-item' + (i === sel ? ' on' : ''), onclick: () => run(x.act), onmousemove: () => { if (sel !== i) { sel = i; mark(); } } }, h('span', { class: 'sr-ic' }, icon(x.ic, 18)), h('span', { class: 'sr-t' }, h('strong', null, x.title), x.sub ? h('small', null, x.sub) : null));
        items.push({ b, x }); list.appendChild(b);
      });
    });
  };
  const mark = () => { items.forEach((it, i) => { it.b.classList.toggle('on', i === sel); it.b.setAttribute('aria-selected', String(i === sel)); }); if (items[sel]) { input.setAttribute('aria-activedescendant', items[sel].b.id); items[sel].b.scrollIntoView({ block: 'nearest' }); } };
  input.addEventListener('input', () => { sel = 0; paint(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { sel = Math.min(items.length - 1, sel + 1); mark(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { sel = Math.max(0, sel - 1); mark(); e.preventDefault(); }
    else if (e.key === 'Enter' && items[sel]) { run(items[sel].x.act); e.preventDefault(); }
  });
  api = openModal({ title: 'Rechercher', wide: true, content: h('div', { class: 'search-box' }, h('div', { class: 'searchbox' }, icon('search', 20), input), list, h('p', { class: 'muted small kbd-hint' }, '↑ ↓ pour naviguer · Entrée pour ouvrir · Échap pour fermer')) });
  api.el.classList.add('search-modal');
  paint();
  return api;
}
