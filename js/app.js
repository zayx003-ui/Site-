// Point d'entrée : coque de l'application, navigation, rafraîchissement, recherche, accessibilité.
import { h, icon, clear, toast, openModal, modalOpen, announce, $ } from './dom.js';
import { state, on, emit, loadPrefs, setPref, resolveKey, loadAll, reload, VIEWS } from './state.js';
import { store, fmtDateTimeMs, fmtHM, getNow, fmtDate, todayKey, cap } from './util.js';
import { APP, VIEW_META } from './config.js';
import { renderDashboard } from './dashboard.js';
import { renderPlanning, openEvent, jumpToDay, resetPlanning, setPlanningSearch } from './calendar.js';
import { renderNotes, openResource, filterUE } from './grades.js';
import { renderStats } from './statistics.js';
import { renderSimulator, simFor } from './simulator.js';
import { renderSettings } from './settings.js';
import { openSearch } from './search.js';
import { exportGradesCSV, printReport } from './exports.js';
import { btn } from './components.js';

const PAGES = { dashboard: renderDashboard, planning: renderPlanning, notes: renderNotes, stats: renderStats, sim: renderSimulator, settings: renderSettings };
let cleanup = null, refreshing = false;

/* ───────── Navigation ───────── */
function urlFor(view) { return `${location.pathname}?v=${view}${location.hash}`; }
function viewFromURL() {
  const v = new URLSearchParams(location.search).get('v');
  return VIEWS.includes(v) ? v : null;
}
export function go(view, { push = true, scroll = true } = {}) {
  if (!VIEWS.includes(view)) view = 'dashboard';
  const changed = view !== state.view;
  state.view = view;
  if (push) { try { if (changed || !viewFromURL()) history.pushState({ v: view }, '', urlFor(view)); } catch { /* file:// ou contexte restreint */ } }
  render();
  if (scroll && changed) { window.scrollTo(0, 0); const m = $('#main'); if (m) m.focus({ preventScroll: true }); announce(VIEW_META[view].label); }
}
function goNotes(code) { if (code) openResource(code); go('notes'); }
function goSim(code) { if (code) simFor(code); go('sim'); }

function keyForm() {
  const input = h('input', { type: 'text', class: 'input', placeholder: 'Colle ici la clé de publication', 'aria-label': 'Clé de publication', autocomplete: 'off', spellcheck: 'false' });
  const submit = () => {
    const k = input.value.trim().replace(/^.*#/, '');
    if (!k) { toast('Saisis une clé.', 'error'); return; }
    store.set('k', k); state.key = k; state.grades.status = 'idle'; reload();
  };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
  return h('div', { class: 'keyform' }, input, btn('Enregistrer', { kind: 'primary', onClick: submit }));
}

const ctx = {
  go, goNotes, goSim, keyForm,
  openSearch: () => openSearchDialog(),
  onRetry: () => doRefresh(),
  refresh: () => doRefresh(),
  rerender: () => render(),
};

function openSearchDialog() {
  if (modalOpen()) return;
  openSearch({
    openEvent: (ev) => openEvent(ev, { goNotes }),
    room: (room) => { resetPlanning(); setPlanningSearch(room); jumpToDay(todayStr(), 'list'); go('planning'); },
    resource: (code) => goNotes(code),
    ue: (ue) => { filterUE(ue); go('notes'); },
    go,
  });
}
const todayStr = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date(getNow()));

/* ───────── Rendu ───────── */
function render() {
  const host = $('#main');
  if (!host) return;
  if (cleanup) { try { cleanup(); } catch (e) { console.error(e); } cleanup = null; }
  const y = window.scrollY;
  const view = state.view;
  try {
    const ret = PAGES[view](host, ctx);
    if (typeof ret === 'function') cleanup = ret;
    host.appendChild(syncFooter());
  } catch (e) {
    console.error('[render]', view, e);
    clear(host);
    host.appendChild(h('div', { class: 'empty error', role: 'alert' }, icon('alert', 28), h('h3', null, 'Une erreur est survenue'), h('p', null, 'Cette page n’a pas pu s’afficher. Le reste du site fonctionne : tu peux réessayer ou changer de section.'), btn('Réessayer', { kind: 'primary', onClick: () => render() })));
  }
  document.title = `${VIEW_META[view].label} · ${APP.brand}`;
  updateNav();
  updateSync();
  window.scrollTo(0, y);
}

function syncFooter() {
  const g = state.grades, c = state.cal;
  const bits = [];
  if (g.at && g.status === 'ok') bits.push(`Notes consultées le ${fmtDateTimeMs(g.at)}${g.stale ? ' (copie enregistrée)' : ''}`);
  if (g.data?.lastGradeDate) bits.push(`dernière note datée du ${fmtDate(g.data.lastGradeDate, { day: 'numeric', month: 'long' })}`);
  if (c.data?.exportedAt) bits.push(`planning exporté d’ADE le ${fmtDateTimeMs(c.data.exportedAt)}`);
  return h('footer', { class: 'sync' }, icon('clock', 14), h('span', null, bits.length ? bits.join(' · ') : 'Données en cours de chargement…'));
}
function updateSync() {
  const el = $('#sync-time');
  if (!el) return;
  const at = Math.max(state.grades.at || 0, state.cal.at || 0);
  const today = cap(fmtDate(todayKey(), { weekday: 'short', day: 'numeric', month: 'short' }));
  el.textContent = state.grades.status === 'loading' || state.cal.status === 'loading' ? `${today} · actualisation…` : at ? `${today} · actualisé à ${fmtHM(at)}` : today;
  el.title = at ? `Dernière consultation : ${fmtDateTimeMs(at)}` : '';
  const b = $('#btn-refresh');
  if (b) { b.classList.toggle('spin', state.grades.status === 'loading' || state.cal.status === 'loading'); b.disabled = false; }
}

/* ───────── Coque ───────── */
const NAV_MOBILE = ['dashboard', 'planning', 'notes', 'sim'];
function buildShell() {
  $('#brand-name').textContent = APP.brand;
  $('#brand-sub').textContent = `${APP.formation} · ${APP.parcours} · ${APP.semester} · groupe ${APP.group}`;
  const side = $('#sidenav'); clear(side);
  VIEWS.forEach((v) => {
    const m = VIEW_META[v];
    side.appendChild(h('a', { href: urlFor(v), class: 'nav-item', 'data-view': v, onclick: (e) => { if (e.metaKey || e.ctrlKey) return; e.preventDefault(); go(v); } }, icon(m.icon, 20), h('span', null, m.label)));
  });
  const tab = $('#tabbar'); clear(tab);
  NAV_MOBILE.forEach((v) => {
    const m = VIEW_META[v];
    tab.appendChild(h('a', { href: urlFor(v), class: 'tab', 'data-view': v, onclick: (e) => { e.preventDefault(); go(v); } }, icon(m.icon, 22), h('span', null, m.short)));
  });
  tab.appendChild(h('button', { type: 'button', class: 'tab', id: 'tab-more', onclick: openMore, 'aria-haspopup': 'dialog' }, icon('dots', 22), h('span', null, 'Plus')));
  $('#btn-search').addEventListener('click', () => openSearchDialog());
  $('#btn-refresh').addEventListener('click', () => doRefresh());
  $('#btn-theme').addEventListener('click', toggleTheme);
  $('#btn-settings').addEventListener('click', () => go('settings'));
  updateThemeIcon();
}
function updateNav() {
  document.querySelectorAll('[data-view]').forEach((a) => { const on_ = a.dataset.view === state.view; a.classList.toggle('on', on_); if (on_) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  const more = $('#tab-more'); if (more) more.classList.toggle('on', state.view === 'stats' || state.view === 'settings');
  updateThemeIcon();
}
function isDark() { const t = state.prefs.theme; return t === 'dark' || (t === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches); }
function updateThemeIcon() {
  const b = $('#btn-theme'); if (!b) return;
  clear(b); b.appendChild(icon(isDark() ? 'sun' : 'moon', 20));
  b.setAttribute('aria-label', isDark() ? 'Passer au thème clair' : 'Passer au thème sombre');
  b.title = b.getAttribute('aria-label');
}
function toggleTheme() { setPref('theme', isDark() ? 'light' : 'dark'); }

function openMore() {
  const row = (ic, label, fn) => h('button', { type: 'button', class: 'more-item', onclick: () => { api.close(); fn(); } }, icon(ic, 20), h('span', null, label), icon('chevR', 16));
  const api = openModal({
    title: 'Plus', content: h('div', { class: 'more-list' },
      row('chart', 'Statistiques', () => go('stats')), row('search', 'Rechercher', () => openSearchDialog()), row('refresh', 'Actualiser les données', () => doRefresh()),
      row('download', 'Exporter mes notes (CSV)', exportGradesCSV), row('print', 'Imprimer le relevé (PDF)', printReport), row('sliders', 'Paramètres', () => go('settings'))),
  });
}

/* ───────── Actualisation ───────── */
async function doRefresh() {
  if (refreshing) return;
  refreshing = true; updateSync();
  await reload();
  refreshing = false; updateSync();
  const ok = state.grades.status === 'ok' && state.cal.status === 'ok' && !state.grades.stale && !state.cal.stale;
  if (ok) toast('Données actualisées.', 'ok');
  else if (state.grades.status === 'error' && state.grades.error?.kind !== 'nokey') toast('Actualisation impossible : voir le détail à l’écran.', 'error');
  else if (state.grades.stale || state.cal.stale) toast('Connexion indisponible : dernières données enregistrées affichées.', 'error');
}

/* ───────── Démarrage ───────── */
function boot() {
  loadPrefs();
  resolveKey();
  buildShell();
  state.view = viewFromURL() || state.prefs.start;
  if (!viewFromURL()) { try { history.replaceState({ v: state.view }, '', urlFor(state.view)); } catch { /* ignore */ } }
  render();

  let raf = 0;
  on('data', () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { if (!modalOpen()) render(); else updateSync(); }); });
  on('prefs', () => { render(); });
  on('favs', () => {}); on('goals', () => {}); on('notes', () => {});
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => { if (state.prefs.theme === 'auto') { updateThemeIcon(); emit('prefs', { k: 'theme' }); } });
  window.addEventListener('popstate', () => { state.view = viewFromURL() || state.prefs.start; render(); });
  window.addEventListener('hashchange', () => { resolveKey(); if (state.key) { state.grades.status = 'idle'; reload(); } });
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openSearchDialog(); }
    else if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '') && !modalOpen()) { e.preventDefault(); openSearchDialog(); }
  });
  let lastMin = -1;
  setInterval(() => {
    emit('tick');
    const m = Math.floor(getNow() / 60000);
    if (m !== lastMin) { lastMin = m; if (state.view === 'dashboard' && !modalOpen() && !document.hidden) render(); }
  }, 30000);
  let hiddenAt = 0;
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) hiddenAt = Date.now();
    else if (hiddenAt && Date.now() - hiddenAt > 10 * 60000) { hiddenAt = 0; reload(); }
  });
  loadAll();
  if ('serviceWorker' in navigator && window.isSecureContext) {
    navigator.serviceWorker.register('sw.js').catch((e) => console.warn('[sw]', e.message));
  }
}
window.addEventListener('error', (e) => console.error('[global]', e.message));
window.addEventListener('unhandledrejection', (e) => console.error('[promise]', e.reason));
boot();
