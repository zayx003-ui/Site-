// Lecture et validation des données : CSV Google Sheets (notes) et ICS ADE (emploi du temps).
import { COEF, SAE_NAMES } from './coefficients.js';
import { resourceStats, parseNum } from './math.js';
import { zonedToMs, keyOf, minOf, addDays, dayDiff, dow, titleCase, TZ } from './util.js';

export const GID = 371376160;
export const FETCH_TIMEOUT = 12000;

// Erreur typée : kind ∈ nokey | network | timeout | http | notpublished | format | invalid | missing
export class DataError extends Error {
  constructor(kind, message, detail) { super(message); this.name = 'DataError'; this.kind = kind; this.detail = detail; }
}

export const gradesUrl = (key) => `https://docs.google.com/spreadsheets/d/e/${encodeURIComponent(key)}/pub?gid=${GID}&single=true&output=csv`;

export async function fetchText(url, { timeout = FETCH_TIMEOUT, what = 'la source' } = {}) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeout);
  let res;
  try {
    res = await fetch(url, { signal: ctl.signal, cache: 'no-cache', credentials: 'omit' });
  } catch (e) {
    if (e && e.name === 'AbortError') throw new DataError('timeout', `Le chargement de ${what} a pris trop de temps.`);
    throw new DataError('network', `Impossible de joindre ${what}. Vérifiez la connexion Internet.`);
  } finally { clearTimeout(timer); }
  if (!res.ok) {
    if (res.status === 404 || res.status === 400 || res.status === 401 || res.status === 403) throw new DataError('notpublished', `${what[0].toUpperCase() + what.slice(1)} est inaccessible (erreur ${res.status}).`, res.status);
    throw new DataError('http', `${what[0].toUpperCase() + what.slice(1)} a répondu par une erreur ${res.status}.`, res.status);
  }
  let text;
  try { text = await res.text(); } catch { throw new DataError('network', `La réponse de ${what} a été interrompue.`); }
  return { text, headers: res.headers };
}

/* ───────── CSV ───────── */
export function parseCSV(t) {
  if (t.charCodeAt(0) === 0xFEFF) t = t.slice(1);
  const R = []; let r = [], c = '', q = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (q) { if (ch === '"') { if (t[i + 1] === '"') { c += '"'; i++; } else q = false; } else c += ch; }
    else if (ch === '"') q = true;
    else if (ch === ',') { r.push(c); c = ''; }
    else if (ch === '\n') { r.push(c); R.push(r); r = []; c = ''; }
    else if (ch !== '\r') c += ch;
  }
  if (c !== '' || r.length) { r.push(c); R.push(r); }
  return R;
}

export function parseDateStr(x) {
  x = String(x ?? '').trim();
  let m = x.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  let y, mo, d;
  if (m) { y = +m[1]; mo = +m[2]; d = +m[3]; }
  else if ((m = x.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/))) { d = +m[1]; mo = +m[2]; y = +m[3]; }
  else return '';
  const t = new Date(Date.UTC(y, mo - 1, d));
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== mo - 1 || t.getUTCDate() !== d) return '';
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

const CODE_RE = /^(R\s?\d\.\d{2}|SAE\s?\d\.\d{1,2})/i;
export function normCode(raw) {
  const m = String(raw).trim().match(CODE_RE);
  if (!m) return '';
  let c = m[1].toUpperCase().replace(/\s+/g, '');
  const s = c.match(/^SAE(\d)\.(\d{1,2})$/);
  if (s) return `SAE ${s[1]}.${+s[2]}`;
  return c;
}

// Colonnes attendues : Ressource | Évaluation | Poids | Note | Meilleure | Pire | Moyenne promo | Date
export function parseGrades(text) {
  if (typeof text !== 'string' || !text.trim()) throw new DataError('format', 'Le fichier de notes est vide.');
  if (/^\s*<(!doctype|html|\?xml)/i.test(text)) throw new DataError('notpublished', 'Google a renvoyé une page web au lieu des données : la feuille n’est pas publiée au format CSV, ou la clé est incorrecte.');
  const rows = parseCSV(text).filter((r) => r.some((c) => String(c).trim() !== ''));
  if (rows.length < 2) throw new DataError('format', 'Le fichier de notes ne contient aucune ligne.');
  if (rows[0].length < 4) throw new DataError('format', 'Le format du fichier de notes n’est pas celui attendu (colonnes manquantes).');
  const warnings = [];
  const map = new Map();
  let idx = 0, bad = 0;
  for (let li = 1; li < rows.length; li++) {
    const r = Array.from({ length: 8 }, (_, i) => String(rows[li][i] ?? '').trim()); // lignes courtes : colonnes manquantes = vides
    if (!r[0] || !r[1]) { if (r[0] || r[1]) warnings.push(`Ligne ${li + 1} ignorée : ressource ou évaluation manquante.`); continue; }
    let o = map.get(r[0]);
    if (!o) {
      const code = normCode(r[0]);
      if (!code) warnings.push(`« ${r[0]} » n’a pas de code reconnu (R3.xx / SAE 3.x) : exclue des moyennes d’UE.`);
      const title = code ? r[0].replace(CODE_RE, '').replace(/^[\s\-–:·]+/, '').trim() : r[0];
      o = { id: r[0], code: code || r[0], name: title || SAE_NAMES[code] || r[0], full: r[0], isSAE: /^SAE/.test(code), coef: code ? (COEF[code] || {}) : {}, evals: [], provisional: null, known: !!COEF[code] };
      if (code && !COEF[code]) warnings.push(`Aucun coefficient connu pour ${code} : cette ressource n’entre dans aucune moyenne d’UE.`);
      map.set(r[0], o);
    }
    const rawV = r[3], v = parseNum(rawV);
    const stats = [parseNum(r[4]), parseNum(r[5]), parseNum(r[6])];
    const okStats = stats.every((x) => x != null && x >= 0 && x <= 20) ? { best: stats[0], worst: stats[1], promo: stats[2] } : null;
    if (/^moyenne provisoire$/i.test(r[1])) { o.provisional = okStats; continue; }
    let w = parseNum(r[2]);
    let invalid = null;
    if (w == null) { w = 0; if (r[2] !== '') invalid = 'poids illisible'; }
    else if (w < 0) { invalid = 'poids négatif'; w = 0; }
    let val = v;
    if (rawV !== '' && v == null) { invalid = invalid || 'note illisible'; val = null; }
    if (val != null && (val < 0 || val > 20)) { invalid = 'note hors de 0–20'; val = null; }
    if (r[7] !== '' && !parseDateStr(r[7])) warnings.push(`${r[0]} – ${r[1]} : date illisible (« ${r[7]} »), la note n’apparaîtra pas dans les courbes d’évolution.`);
    if (invalid) { bad++; warnings.push(`${r[0]} – ${r[1]} : ${invalid} (ligne ignorée pour les calculs de note).`); }
    o.evals.push({ id: `e${++idx}`, idx, name: r[1], w, v: val, best: okStats && val != null ? okStats.best : null, worst: okStats && val != null ? okStats.worst : null, promo: okStats && val != null ? okStats.promo : null, hasPromo: !!okStats && val != null, date: parseDateStr(r[7]), invalid });
  }
  const resources = [...map.values()].filter((o) => o.evals.length);
  if (!resources.length) throw new DataError('invalid', 'Aucune évaluation valide n’a été trouvée dans le fichier de notes.');
  for (const o of resources) {
    o.stats = resourceStats(o.evals);
    const sumW = o.evals.reduce((s, e) => s + e.w, 0);
    if (sumW > 0 && Math.abs(sumW - 100) > 0.5) warnings.push(`${o.code} : les poids des évaluations totalisent ${Math.round(sumW * 10) / 10} % au lieu de 100 %.`);
  }
  const dates = resources.flatMap((o) => o.evals.filter((e) => e.v != null && e.date).map((e) => e.date)).sort();
  return { resources, warnings, lastGradeDate: dates.length ? dates[dates.length - 1] : '', invalidCount: bad };
}

export async function loadGrades(key) {
  if (!key) throw new DataError('nokey', 'Aucune clé de publication n’a été fournie.');
  const { text, headers } = await fetchText(gradesUrl(key), { what: 'la feuille de notes' });
  const data = parseGrades(text);
  const lm = headers.get('last-modified');
  data.serverDate = lm ? Date.parse(lm) || null : null;
  return { data, raw: text };
}

/* ───────── ICS ───────── */
const unescICS = (s) => s.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1');
const GROUP_RE = /^(C\d|CD\d|BUT\s?GB\d|[A-Z]{1,3}\d|GB\d|TP\d|TD\d)$/i;

export function classify(title) {
  const t = title || '';
  if (/tiers[\s-]?temps/i.test(t)) return 'TT';
  if (/(vacances|f[ée]ri[ée]|pont\b|fermeture)/i.test(t)) return 'OFF';
  if (/(\bec?rit\b|\bécrit\b|examen|\boral\b|rattrapage|\bDS\b|contr[ôo]le|soutenance)/i.test(t)) return 'EX';
  if (/(^|[\s\-.])CM\d*(\s|$)/i.test(t)) return 'CM';
  if (/(^|[\s\-.])TD\d*(\s|$)/i.test(t)) return 'TD';
  if (/(^|[\s\-.])TP\d*(\s|$)/i.test(t)) return 'TP';
  if (/autonomie/i.test(t)) return 'AUTO';
  return 'OTHER';
}
export const TYPE_LABEL = { CM: 'Cours magistral', TD: 'Travaux dirigés', TP: 'Travaux pratiques', EX: 'Examen', AUTO: 'Autonomie', OTHER: 'Autre', OFF: 'Congé', TT: 'Tiers temps' };

function cleanTitle(title, type, code) {
  let s = title.trim();
  s = s.replace(/^(R\s?\d\.\d{2,3}|SAE\s?\d\.\d{1,2})\s*[-–:]?\s*/i, '');
  const auto = s.match(/(autonomie)\s*(\d+)?/i);
  s = s.replace(/^(CM|TD|TP)\s?\d*\s*(J\d\s*)?[-–:]?\s*/i, '').replace(/^(Ecrit|Écrit|Oral)\s*/i, '');
  if (type === 'AUTO') {
    const n = auto && auto[2] ? ` ${auto[2]}` : '';
    const ref = SAE_NAMES[code] ? ` · ${SAE_NAMES[code]}` : '';
    return `Séance en autonomie${n}${ref}`;
  }
  s = s.replace(/^S[ée]ance en autonomie\s*\d*\s*[-–:]?\s*/i, '').trim();
  return s || title.trim();
}

function parseICSDate(value, params) {
  const v = value.trim();
  let m = v.match(/^(\d{4})(\d\d)(\d\d)T(\d\d)(\d\d)(\d\d)?(Z?)$/);
  if (m) {
    const key = `${m[1]}-${m[2]}-${m[3]}`, min = +m[4] * 60 + +m[5];
    if (m[7]) return { ms: Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)), allDay: false };
    const tz = (params.match(/TZID=([^;:]+)/i) || [])[1] || TZ;
    try { return { ms: zonedToMs(key, min, tz), allDay: false }; } catch { return { ms: zonedToMs(key, min, TZ), allDay: false }; }
  }
  m = v.match(/^(\d{4})(\d\d)(\d\d)$/);
  if (m) return { ms: zonedToMs(`${m[1]}-${m[2]}-${m[3]}`, 0, TZ), allDay: true };
  return null;
}

function parseRRule(s) {
  const o = {};
  for (const part of s.split(';')) { const [k, v] = part.split('='); if (k && v) o[k.toUpperCase()] = v; }
  return o;
}
const BYDAY = { MO: 0, TU: 1, WE: 2, TH: 3, FR: 4, SA: 5, SU: 6 };

function expand(base, rule, exdates, horizonKey) {
  // Retourne les dates (clés) des occurrences ; le premier jour est toujours inclus.
  const freq = rule.FREQ, interval = Math.max(1, +rule.INTERVAL || 1);
  const first = keyOf(base.start);
  const until = rule.UNTIL ? parseICSDate(rule.UNTIL.length === 8 ? rule.UNTIL : rule.UNTIL, '')?.ms : null;
  const untilKey = until ? keyOf(until) : horizonKey;
  const limitKey = untilKey < horizonKey ? untilKey : horizonKey;
  const count = rule.COUNT ? +rule.COUNT : Infinity;
  const days = rule.BYDAY ? rule.BYDAY.split(',').map((d) => BYDAY[d.replace(/^[-+]?\d+/, '')]).filter((x) => x != null) : null;
  const out = [];
  if (freq === 'DAILY') {
    for (let k = first, n = 0; k <= limitKey && out.length < count && n < 800; k = addDays(k, interval), n++) out.push(k);
  } else if (freq === 'WEEKLY') {
    const wd = days && days.length ? days : [dow(first)];
    const w0 = addDays(first, -dow(first));
    for (let w = w0, n = 0; w <= limitKey && out.length < count && n < 200; w = addDays(w, 7 * interval), n++) {
      for (const d of [...wd].sort((a, b) => a - b)) {
        const k = addDays(w, d);
        if (k < first || k > limitKey) continue;
        if (out.length >= count) break;
        out.push(k);
      }
    }
  } else out.push(first);
  return out.filter((k) => !exdates.has(k));
}

export function parseICS(text, { horizonDays = 800 } = {}) {
  if (typeof text !== 'string' || !text.trim()) throw new DataError('format', 'Le fichier d’emploi du temps est vide.');
  if (!/BEGIN:VCALENDAR/i.test(text)) throw new DataError('format', 'Ce fichier n’est pas un calendrier ICS valide.');
  const unfolded = text.replace(/\r?\n[ \t]/g, '');
  const blocks = unfolded.split(/BEGIN:VEVENT/i).slice(1).map((b) => b.split(/END:VEVENT/i)[0]);
  const events = [], warnings = [];
  let exportedAt = null, lastMod = 0, skipped = 0, cancelled = 0;
  const horizonKey = addDays(keyOf(Date.now()), horizonDays);
  blocks.forEach((b, bi) => {
    const props = {};
    const multi = { EXDATE: [] };
    for (const line of b.split(/\r?\n/)) {
      const m = line.match(/^([A-Za-z-]+)((?:;[^:]*)?):(.*)$/);
      if (!m) continue;
      const name = m[1].toUpperCase();
      if (name === 'EXDATE') multi.EXDATE.push({ params: m[2], value: m[3] });
      else if (!(name in props)) props[name] = { params: m[2], value: m[3] };
    }
    const ds = props.DTSTART && parseICSDate(props.DTSTART.value, props.DTSTART.params);
    if (!ds) { skipped++; return; }
    let de = props.DTEND && parseICSDate(props.DTEND.value, props.DTEND.params);
    if (!de && props.DURATION) {
      const d = props.DURATION.value.match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?$/);
      if (d) de = { ms: ds.ms + ((+d[1] || 0) * 1440 + (+d[2] || 0) * 60 + (+d[3] || 0)) * 60000, allDay: ds.allDay };
    }
    if (!de) de = { ms: ds.allDay ? ds.ms + 864e5 : ds.ms + 3600000, allDay: ds.allDay };
    if (de.ms < ds.ms) { skipped++; return; }
    if (/CANCELLED/i.test(props.STATUS?.value || '')) { cancelled++; return; }
    const lm = props['LAST-MODIFIED'] ? parseICSDate(props['LAST-MODIFIED'].value, '') : null;
    if (lm && lm.ms > lastMod) lastMod = lm.ms;
    const title = unescICS(props.SUMMARY?.value || '').trim() || 'Sans titre';
    const desc = unescICS(props.DESCRIPTION?.value || '');
    const ex = desc.match(/Exported\s*:\s*(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})/i);
    if (ex) { const ms = zonedToMs(`${ex[3]}-${ex[2].padStart(2, '0')}-${ex[1].padStart(2, '0')}`, +ex[4] * 60 + +ex[5]); if (!exportedAt || ms > exportedAt) exportedAt = ms; }
    const groups = [], teachers = [], notes = [];
    for (const l of desc.split('\n').map((x) => x.trim()).filter(Boolean)) {
      if (/^\(?Exported/i.test(l)) continue;
      if (GROUP_RE.test(l)) groups.push(l.replace(/^BUT\s?GB/i, 'BUT GB'));
      else if (/^[A-ZÀ-ÖØ-Þ'’\- ]{3,}$/.test(l) || /^[A-ZÀ-ÖØ-Þ'’\-]{2,}( [A-Za-zÀ-ÿ'’\-]+)+$/.test(l)) teachers.push(titleCase(l));
      else notes.push(l);
    }
    const type = classify(title);
    const code = normCode(title);
    const room = unescICS(props.LOCATION?.value || '').trim();
    const uid = props.UID?.value || `ev${bi}`;
    const durMs = de.ms - ds.ms;
    let starts = [ds.ms];
    const rule = props.RRULE ? parseRRule(props.RRULE.value) : null;
    if (rule && (rule.FREQ === 'DAILY' || rule.FREQ === 'WEEKLY')) {
      const exset = new Set();
      for (const x of multi.EXDATE) for (const v of x.value.split(',')) { const d = parseICSDate(v, x.params); if (d) exset.add(keyOf(d.ms)); }
      const startMin = minOf(ds.ms);
      starts = expand({ start: ds.ms }, rule, exset, horizonKey).map((k) => (ds.allDay ? zonedToMs(k, 0, TZ) : zonedToMs(k, startMin, TZ)));
    } else if (rule) warnings.push(`Récurrence « ${rule.FREQ} » non gérée pour « ${title} » (seule la première occurrence est affichée).`);
    starts.forEach((s, i) => {
      const e = s + durMs;
      const day = keyOf(s);
      // Un événement « toute la journée » se termine à minuit : on retire 1 s pour sa dernière journée
      const endDay = ds.allDay ? keyOf(e - 1000) : keyOf(e);
      events.push({
        id: starts.length > 1 ? `${uid}#${i}` : uid, uid, start: s, end: e, allDay: ds.allDay, day, endDay,
        startMin: ds.allDay ? 0 : minOf(s), endMin: ds.allDay ? 1440 : (endDay === day ? minOf(e) : 1440),
        title, name: cleanTitle(title, type, code), type, code, room, teachers, groups, notes, desc,
        online: /distan|visio|en ligne/i.test(room), sem: (code.match(/^(?:R|SAE )(\d)/) || [])[1] ? +code.match(/^(?:R|SAE )(\d)/)[1] : null,
      });
    });
  });
  events.sort((a, b) => a.start - b.start || a.end - b.end);
  if (!events.length) throw new DataError('invalid', 'Le calendrier ne contient aucun événement exploitable.');
  if (skipped) warnings.push(`${skipped} événement(s) illisible(s) ignoré(s).`);
  return { events, warnings, exportedAt, lastModified: lastMod || null, cancelled, total: blocks.length };
}

export async function loadCalendar(url = 'ADECal.ics') {
  const { text, headers } = await fetchText(url, { what: 'l’emploi du temps' });
  if (/^\s*<(!doctype|html)/i.test(text)) throw new DataError('missing', 'Le fichier d’emploi du temps est introuvable sur le site (ADECal.ics).');
  const data = parseICS(text);
  const lm = headers.get('last-modified');
  data.serverDate = lm ? Date.parse(lm) || null : null;
  return { data, raw: text };
}

export { dayDiff };
