// Construction DOM sûre (aucune injection HTML : tout passe par textContent) + icônes + fenêtres + notifications.
const NS = 'http://www.w3.org/2000/svg';

function applyAttrs(el, attrs, isSvg) {
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.setAttribute('class', v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'dataset') for (const [dk, dv] of Object.entries(v)) { if (dv != null) el.dataset[dk] = dv; }
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'text') el.textContent = v;
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, String(v));
  }
}
function append(el, children) {
  for (const c of children) {
    if (c == null || c === false || c === true) continue;
    if (Array.isArray(c)) append(el, c);
    else if (c instanceof Node) el.appendChild(c);
    else el.appendChild(document.createTextNode(String(c)));
  }
}
export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  if (attrs && (typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs))) { children.unshift(attrs); attrs = null; }
  applyAttrs(el, attrs);
  append(el, children);
  return el;
}
export function s(tag, attrs, ...children) {
  const el = document.createElementNS(NS, tag);
  applyAttrs(el, attrs, true);
  append(el, children);
  return el;
}
export const clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); return el; };
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const ICONS = {
  home: 'M3 11l9-8 9 8M5 10v10h14V10M10 20v-6h4v6',
  calendar: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
  award: 'M12 15a6 6 0 100-12 6 6 0 000 12zM8.5 14l-1.5 7 5-3 5 3-1.5-7',
  chart: 'M4 20V4M4 20h16M8 16v-5M12 16V8M16 16v-8',
  calc: 'M6 3h12v18H6zM9 7h6M9 12h.01M12 12h.01M15 12h.01M9 16h.01M12 16h.01M15 16h.01',
  sliders: 'M4 7h10M18 7h2M4 17h2M10 17h10M14 4v6M6 14v6',
  search: 'M11 18a7 7 0 100-14 7 7 0 000 14zM21 21l-5-5',
  sun: 'M12 16a4 4 0 100-8 4 4 0 000 8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  moon: 'M20 14.5A8 8 0 019.5 4 8 8 0 1020 14.5z',
  refresh: 'M20 11a8 8 0 00-14.5-3.5M4 4v4h4M4 13a8 8 0 0014.5 3.5M20 20v-4h-4',
  clock: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 7v5l3 2',
  pin: 'M12 21s-7-6.2-7-11a7 7 0 0114 0c0 4.8-7 11-7 11zM12 12a2.5 2.5 0 100-5 2.5 2.5 0 000 5z',
  user: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0',
  users: 'M9 11a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM2 20a7 7 0 0114 0M17 4.5a3.5 3.5 0 010 6.5M22 20a7 7 0 00-4-6.3',
  book: 'M4 5a2 2 0 012-2h13v16H6a2 2 0 00-2 2zM4 19V5M8 7h7',
  flask: 'M9 3h6M10 3v6L5 19a1.5 1.5 0 001.3 2h11.4A1.5 1.5 0 0019 19l-5-10V3M7.5 15h9',
  alert: 'M12 3l10 18H2zM12 10v5M12 18h.01',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  x: 'M6 6l12 12M18 6L6 18',
  chevL: 'M15 5l-7 7 7 7',
  chevR: 'M9 5l7 7-7 7',
  chevD: 'M5 9l7 7 7-7',
  chevU: 'M5 15l7-7 7 7',
  download: 'M12 4v11M7 11l5 5 5-5M5 20h14',
  print: 'M7 8V3h10v5M7 17H4v-7h16v7h-3M7 14h10v7H7z',
  plus: 'M12 5v14M5 12h14',
  star: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z',
  target: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 16a4 4 0 100-8 4 4 0 000 8zM12 12h.01',
  filter: 'M4 5h16l-6 8v6l-4-2v-4z',
  list: 'M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01',
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  info: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 11v5M12 8h.01',
  trend: 'M3 17l6-6 4 4 8-8M15 7h6v6',
  layers: 'M12 3l9 5-9 5-9-5zM3 13l9 5 9-5',
  external: 'M14 4h6v6M20 4l-9 9M18 14v6H4V6h6',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14',
  edit: 'M4 20l4-1L19 8l-3-3L5 16zM14 7l3 3',
  dots: 'M5 12h.01M12 12h.01M19 12h.01',
  bolt: 'M13 2L4 14h7l-1 8 9-12h-7z',
  flag: 'M5 21V4M5 4h12l-2 4 2 4H5',
  door: 'M6 21V4h12v17M4 21h16M14 12h.01',
  sparkle: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z',
  bookmark: 'M6 3h12v18l-6-4-6 4z',
  wifiOff: 'M3 3l18 18M8.5 16.4a5 5 0 017 0M5 12.9a10 10 0 015-2.6M19 12.9a10 10 0 00-2.5-1.8M2 8.8a15 15 0 015.2-2.9M22 8.8A15 15 0 0012 5.2M12 20h.01',
  lock: 'M6 11h12v10H6zM8 11V7a4 4 0 018 0v4',
  cal_add: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4M12 13v5M9.5 15.5h5',
  sort: 'M7 4v16M7 20l-3-3M7 20l3-3M17 20V4M17 4l-3 3M17 4l3 3',
};
export function icon(name, size = 20, cls = '') {
  const svg = s('svg', { viewBox: '0 0 24 24', width: size, height: size, fill: 'none', stroke: 'currentColor', 'stroke-width': name === 'dots' ? 2.6 : 1.8, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', focusable: 'false', class: 'ic ' + cls });
  svg.appendChild(s('path', { d: ICONS[name] || ICONS.info }));
  return svg;
}

/* ───── Annonces pour lecteurs d'écran ───── */
let live;
export function announce(msg) {
  if (!live) { live = h('div', { class: 'sr-only', role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' }); document.body.appendChild(live); }
  live.textContent = '';
  setTimeout(() => { live.textContent = msg; }, 30);
}

/* ───── Notifications ───── */
let toastHost;
export function toast(msg, kind = 'info', ms = 3600) {
  if (!toastHost) { toastHost = h('div', { class: 'toasts', role: 'region', 'aria-label': 'Notifications' }); document.body.appendChild(toastHost); }
  const t = h('div', { class: 'toast toast-' + kind }, icon(kind === 'error' ? 'alert' : kind === 'ok' ? 'check' : 'info', 18), h('span', null, msg));
  toastHost.appendChild(t);
  announce(msg);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 250); }, ms);
}

/* ───── Fenêtre modale / feuille du bas (mobile) ───── */
const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
const stack = [];
export function openModal({ title, content, wide = false, onClose, label }) {
  const prev = document.activeElement;
  const id = 'dlg-' + Math.random().toString(36).slice(2, 7);
  const body = h('div', { class: 'modal-body' }, content);
  const closeBtn = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Fermer' }, icon('x', 20));
  const box = h('div', { class: 'modal' + (wide ? ' modal-wide' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': id, tabindex: '-1' },
    h('div', { class: 'modal-grip', 'aria-hidden': 'true' }),
    h('div', { class: 'modal-head' }, h('h2', { id, class: 'modal-title' }, title || label || ''), closeBtn),
    body);
  const back = h('div', { class: 'modal-back' }, box);
  let closed = false;
  const close = () => {
    if (closed) return; closed = true;
    box.classList.add('out'); back.classList.add('out');
    const done = () => { back.remove(); stack.splice(stack.indexOf(api), 1); if (!stack.length) document.documentElement.classList.remove('modal-open'); if (prev && prev.focus && document.contains(prev)) prev.focus(); onClose && onClose(); };
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) done(); else setTimeout(done, 180);
  };
  const keyHandler = (e) => {
    if (stack[stack.length - 1] !== api) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
    else if (e.key === 'Tab') {
      const f = [...box.querySelectorAll(FOCUSABLE)].filter((x) => x.offsetParent !== null);
      if (!f.length) { e.preventDefault(); box.focus(); return; }
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === box)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  };
  const api = { el: box, body, close };
  closeBtn.addEventListener('click', close);
  back.addEventListener('mousedown', (e) => { if (e.target === back) close(); });
  document.addEventListener('keydown', keyHandler, true);
  const origClose = close;
  api.close = () => { document.removeEventListener('keydown', keyHandler, true); origClose(); };
  closeBtn.onclick = api.close;
  stack.push(api);
  document.body.appendChild(back);
  document.documentElement.classList.add('modal-open');
  requestAnimationFrame(() => { (box.querySelector('[autofocus]') || closeBtn).focus(); });
  return api;
}
export const modalOpen = () => stack.length > 0;

/* ───── Utilitaires de rendu ───── */
export function debounce(fn, ms = 160) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
export function download(filename, text, mime = 'text/plain;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = h('a', { href: url, download: filename });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
export function skeleton(lines = 3, cls = '') {
  return h('div', { class: 'skel-wrap ' + cls, 'aria-hidden': 'true' }, Array.from({ length: lines }, (_, i) => h('div', { class: 'skel', style: { width: (100 - (i % 3) * 14) + '%' } })));
}
