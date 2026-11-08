// État global de l'application, préférences persistantes et chargement des données.
import { store, prefs as shared, getNow } from './util.js';
import { loadGrades, loadCalendar, parseGrades, parseICS, DataError } from './data.js';
import { buildModel } from './model.js';

/* ───── Bus d'événements minimal ───── */
const subs = new Map();
export const on = (evt, fn) => { if (!subs.has(evt)) subs.set(evt, new Set()); subs.get(evt).add(fn); return () => subs.get(evt).delete(fn); };
export const emit = (evt, payload) => { (subs.get(evt) || []).forEach((fn) => { try { fn(payload); } catch (e) { console.error('[bus]', evt, e); } }); };

export const ACCENTS = {
  petrol: { name: 'Pétrole', light: '#0B6E7F', dark: '#3CB6C8' },
  ocean: { name: 'Océan', light: '#1F5FBF', dark: '#6AA2F5' },
  indigo: { name: 'Indigo', light: '#4C4FC4', dark: '#9A9CF2' },
  forest: { name: 'Forêt', light: '#236B43', dark: '#5CCB93' },
  plum: { name: 'Prune', light: '#8A3E86', dark: '#D58BD0' },
};
export const DEFAULT_PREFS = {
  theme: 'auto', start: 'dashboard', calView: 'week', timeFormat: '24', secondary: 'show',
  density: 'comfortable', accent: 'petrol', showPromo: true, showTT: false, offline: false, semStart: '', name: '',
};
export const VIEWS = ['dashboard', 'planning', 'notes', 'stats', 'sim', 'settings'];

export const state = {
  key: '',
  grades: { status: 'idle', data: null, model: null, error: null, at: null, stale: false },
  cal: { status: 'idle', data: null, error: null, at: null, stale: false },
  prefs: { ...DEFAULT_PREFS },
  view: 'dashboard',
  params: {},
  favs: [], goals: {}, notes: {},
};

/* ───── Préférences ───── */
export function loadPrefs() {
  const saved = store.json('bc.prefs', {});
  const p = { ...DEFAULT_PREFS };
  for (const k of Object.keys(DEFAULT_PREFS)) if (k in saved && typeof saved[k] === typeof DEFAULT_PREFS[k]) p[k] = saved[k];
  if (!VIEWS.includes(p.start)) p.start = 'dashboard';
  if (!ACCENTS[p.accent]) p.accent = 'petrol';
  state.prefs = p;
  const f = store.json('bc.favs', []); state.favs = Array.isArray(f) ? f.filter((x) => typeof x === 'string') : [];
  const g = store.json('bc.goals', {}); state.goals = g && typeof g === 'object' && !Array.isArray(g) ? g : {};
  const n = store.json('bc.notes', {}); state.notes = n && typeof n === 'object' && !Array.isArray(n) ? n : {};
  applyPrefs();
}
export function applyPrefs() {
  const p = state.prefs, r = document.documentElement;
  if (p.theme === 'auto') r.removeAttribute('data-theme'); else r.setAttribute('data-theme', p.theme);
  r.dataset.density = p.density;
  r.dataset.secondary = p.secondary;
  const a = ACCENTS[p.accent] || ACCENTS.petrol;
  r.style.setProperty('--accent-l', a.light);
  r.style.setProperty('--accent-d', a.dark);
  shared.timeFormat = p.timeFormat; shared.secondary = p.secondary; shared.density = p.density;
  const dark = p.theme === 'dark' || (p.theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', dark ? '#0B1220' : '#F6F8FB');
}
export function setPref(k, v) {
  state.prefs[k] = v;
  store.setJson('bc.prefs', state.prefs);
  applyPrefs();
  emit('prefs', { k, v });
}
export function resetPrefs() {
  state.prefs = { ...DEFAULT_PREFS };
  store.del('bc.prefs');
  applyPrefs();
  emit('prefs', { k: '*', v: null });
}
export function toggleFav(code) {
  const i = state.favs.indexOf(code);
  if (i >= 0) state.favs.splice(i, 1); else state.favs.push(code);
  store.setJson('bc.favs', state.favs); emit('favs');
  return i < 0;
}
export function setGoal(id, v) {
  if (v == null) delete state.goals[id]; else state.goals[id] = v;
  store.setJson('bc.goals', state.goals); emit('goals');
}
export function setNote(id, text) {
  if (!text) delete state.notes[id]; else state.notes[id] = text.slice(0, 2000);
  store.setJson('bc.notes', state.notes); emit('notes');
}
export function purgeLocal() {
  for (const k of store.keys('bc.')) store.del(k);
  state.favs = []; state.goals = {}; state.notes = {};
  emit('favs'); emit('goals'); emit('notes');
}

/* ───── Clé de publication ───── */
export function resolveKey() {
  const fromHash = decodeURIComponent((location.hash || '').replace(/^#/, '')).trim();
  if (fromHash) { store.set('k', fromHash); state.key = fromHash; }
  else state.key = (store.get('k') || '').trim();
  return state.key;
}
export function forgetKey() { store.del('k'); state.key = ''; }

/* ───── Chargement ───── */
let inflight = null;
function cacheGet(name) { const c = store.json('bc.cache.' + name, null); return c && typeof c.text === 'string' ? c : null; }
function cachePut(name, text) { if (state.prefs.offline) store.setJson('bc.cache.' + name, { t: Date.now(), text }); }
export function clearCaches() { store.del('bc.cache.grades'); store.del('bc.cache.cal'); }

async function loadOne(slot, loader, parser, cacheName) {
  const s = state[slot];
  s.status = 'loading'; s.error = null; emit('data', slot);
  try {
    const { data, raw } = await loader();
    s.data = data; s.stale = false; s.at = getNow(); s.status = 'ok'; s.error = null;
    if (slot === 'grades') s.model = buildModel(data);
    cachePut(cacheName, raw);
  } catch (e) {
    const err = e instanceof DataError ? e : new DataError('invalid', 'Une erreur inattendue est survenue pendant la lecture des données.', String(e && e.message));
    const cached = state.prefs.offline && (err.kind === 'network' || err.kind === 'timeout' || err.kind === 'http') ? cacheGet(cacheName) : null;
    if (cached) {
      try {
        const data = parser(cached.text); s.data = data; s.stale = true; s.at = cached.t; s.status = 'ok'; s.error = err;
        if (slot === 'grades') s.model = buildModel(data);
      } catch { s.status = 'error'; s.error = err; }
    } else if (s.data && (err.kind === 'network' || err.kind === 'timeout')) {
      s.status = 'ok'; s.stale = true; s.error = err; // on garde les dernières données chargées
    } else { s.status = 'error'; s.error = err; s.data = null; if (slot === 'grades') s.model = null; }
    if (err.kind !== 'nokey') console.warn('[data]', slot, err.kind, err.detail || err.message);
  }
  emit('data', slot);
}

export function loadAll({ force = false } = {}) {
  if (inflight) return inflight;
  const tasks = [];
  if (force || state.grades.status === 'idle' || state.grades.status === 'error') {
    tasks.push(state.key ? loadOne('grades', () => loadGrades(state.key), parseGrades, 'grades')
      : Promise.resolve().then(() => { state.grades.status = 'error'; state.grades.error = new DataError('nokey', 'Aucune clé de publication.'); emit('data', 'grades'); }));
  }
  if (force || state.cal.status === 'idle' || state.cal.status === 'error') tasks.push(loadOne('cal', () => loadCalendar('ADECal.ics'), parseICS, 'cal'));
  inflight = Promise.all(tasks).finally(() => { inflight = null; });
  return inflight;
}
export const reload = () => loadAll({ force: true });

// Exposition pour les tests (lecture seule).
if (typeof window !== 'undefined') window.__BC = { state };
