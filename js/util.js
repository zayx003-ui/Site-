// Utilitaires : dates (fuseau Europe/Paris), formats français, stockage local protégé.
export const TZ = 'Europe/Paris';
export const pad = (n) => String(n).padStart(2, '0');

const partsFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});
export function parisParts(ms) {
  const o = {};
  for (const p of partsFmt.formatToParts(new Date(ms))) o[p.type] = p.value;
  return { y: +o.year, mo: +o.month, d: +o.day, h: +o.hour, mi: +o.minute, s: +o.second };
}
export const keyOf = (ms) => { const p = parisParts(ms); return `${p.y}-${pad(p.mo)}-${pad(p.d)}`; };
export const minOf = (ms) => { const p = parisParts(ms); return p.h * 60 + p.mi; };

// Horloge injectable (tests) : window.__BC_NOW = timestamp en ms.
export function getNow() {
  return (typeof window !== 'undefined' && typeof window.__BC_NOW === 'number') ? window.__BC_NOW : Date.now();
}
export const todayKey = () => keyOf(getNow());
export const nowMin = () => minOf(getNow());

const keyToUTC = (k) => { const [y, m, d] = k.split('-').map(Number); return Date.UTC(y, m - 1, d, 12); };
export const addDays = (k, n) => {
  const t = new Date(keyToUTC(k) + n * 864e5);
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
};
export const dayDiff = (a, b) => Math.round((keyToUTC(b) - keyToUTC(a)) / 864e5);
export const dow = (k) => (new Date(keyToUTC(k)).getUTCDay() + 6) % 7; // 0 = lundi
export const weekStart = (k) => addDays(k, -dow(k));
export const monthStart = (k) => k.slice(0, 8) + '01';
export const addMonths = (k, n) => {
  const [y, m] = k.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1 + n, 1, 12));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-01`;
};
export function isoWeek(k) {
  const d = new Date(keyToUTC(k));
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day + 3);
  const first = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  return 1 + Math.round(((d - first) / 864e5 - 3 + ((first.getUTCDay() + 6) % 7)) / 7);
}

const fmtCache = new Map();
function dtf(opts) {
  const id = JSON.stringify(opts);
  if (!fmtCache.has(id)) fmtCache.set(id, new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', ...opts }));
  return fmtCache.get(id);
}
export const fmtDate = (k, opts = { weekday: 'long', day: 'numeric', month: 'long' }) => dtf(opts).format(new Date(keyToUTC(k)));
export const fmtDateShort = (k) => fmtDate(k, { day: 'numeric', month: 'short' });
export const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

// Préférences d'affichage partagées (mises à jour par settings.js).
export const prefs = { timeFormat: '24', secondary: 'show', density: 'comfortable' };

export function fmtTime(min) {
  const h = Math.floor(min / 60) % 24, m = Math.round(min % 60);
  return prefs.timeFormat === 'fr' ? `${h} h ${pad(m)}` : `${pad(h)}:${pad(m)}`;
}
export function fmtDur(min) {
  min = Math.round(min);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60), m = min % 60;
  return m ? `${h} h ${pad(m)}` : `${h} h`;
}
export function fmtNum(n, dec = 2) {
  if (n == null || !Number.isFinite(n)) return '–';
  return n.toFixed(dec).replace('.', ',');
}
export const fmtSigned = (n, dec = 2) => (n == null ? '–' : (n >= 0 ? '+' : '−') + fmtNum(Math.abs(n), dec));
export function fmtDateTimeMs(ms) {
  const f = new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
  return f.format(new Date(ms));
}
export function fmtHM(ms) {
  return new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }).format(new Date(ms));
}

export const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const sum = (a) => a.reduce((s, x) => s + x, 0);

export function titleCase(s) {
  return s.toLowerCase().replace(/(^|[\s'’-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
}
export const plural = (n, one, many) => `${n} ${n > 1 ? (many || one + 's') : one}`;

// Stockage local protégé : si le navigateur le bloque, on retombe sur une mémoire volatile.
const mem = new Map();
let storageOk = null;
export function storageAvailable() {
  if (storageOk !== null) return storageOk;
  try { const k = '__bc_t'; localStorage.setItem(k, '1'); localStorage.removeItem(k); storageOk = true; }
  catch { storageOk = false; }
  return storageOk;
}
export const store = {
  get(k) { try { return storageAvailable() ? localStorage.getItem(k) : (mem.get(k) ?? null); } catch { return mem.get(k) ?? null; } },
  set(k, v) { try { if (storageAvailable()) { localStorage.setItem(k, v); return true; } } catch { /* quota */ } mem.set(k, v); return false; },
  del(k) { try { if (storageAvailable()) localStorage.removeItem(k); } catch { /* ignore */ } mem.delete(k); },
  json(k, fallback) { try { const v = this.get(k); return v ? JSON.parse(v) : fallback; } catch { return fallback; } },
  setJson(k, v) { return this.set(k, JSON.stringify(v)); },
  keys(prefix) {
    const out = [];
    try { if (storageAvailable()) for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith(prefix)) out.push(k); } } catch { /* ignore */ }
    return out;
  },
};
export const uid = () => Math.random().toString(36).slice(2, 10);

// Convertit une date-heure « murale » (AAAA-MM-JJ + minutes) d'un fuseau en timestamp UTC.
const tzFmtCache = new Map();
function tzParts(ms, tz) {
  let f = tzFmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
    tzFmtCache.set(tz, f);
  }
  const o = {};
  for (const p of f.formatToParts(new Date(ms))) o[p.type] = p.value;
  return Date.UTC(+o.year, +o.month - 1, +o.day, +o.hour, +o.minute, +o.second);
}
export function zonedToMs(key, min, tz = TZ) {
  const [y, m, d] = key.split('-').map(Number);
  const wall = Date.UTC(y, m - 1, d, Math.floor(min / 60), min % 60, 0);
  let guess = wall;
  for (let i = 0; i < 2; i++) guess = wall - (tzParts(guess, tz) - guess);
  return guess;
}
