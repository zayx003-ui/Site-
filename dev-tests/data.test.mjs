// Tests des lecteurs CSV et ICS : `node --test tests/*.test.mjs`
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseCSV, parseGrades, parseICS, parseDateStr, normCode, classify, DataError } from '../js/data.js';
import { buildModel } from '../js/model.js';

const csv = fs.readFileSync(new URL('./fixtures/grades.csv', import.meta.url), 'utf8');
const ics = fs.readFileSync(new URL('./fixtures/ADECal.ics', import.meta.url), 'utf8');
const close = (a, b, e = 1e-6) => assert.ok(Math.abs(a - b) < e, `${a} ≠ ${b}`);

test('CSV : guillemets, virgules et retours à la ligne internes', () => {
  const r = parseCSV('a,"b,c","d ""e"""\r\n"x\ny",2,\n');
  assert.deepEqual(r, [['a', 'b,c', 'd "e"'], ['x\ny', '2', '']]);
  assert.deepEqual(parseCSV('﻿a,b'), [['a', 'b']]);
});
test('dates : formats ISO et français, dates impossibles', () => {
  assert.equal(parseDateStr('2026-11-02'), '2026-11-02');
  assert.equal(parseDateStr('2/11/2026'), '2026-11-02');
  assert.equal(parseDateStr('31/02/2026'), '');
  assert.equal(parseDateStr('n’importe quoi'), '');
});
test('codes de ressource', () => {
  assert.equal(normCode('R3.12 Biochimie'), 'R3.12');
  assert.equal(normCode('SAE3.01- TD'), 'SAE 3.1');
  assert.equal(normCode('SAE 3.02-TD'), 'SAE 3.2');
  assert.equal(normCode('Tiers temps'), '');
});

test('notes réelles : 46 évaluations, 11 notées, valeurs correctes', () => {
  const d = parseGrades(csv);
  const m = buildModel(d);
  assert.equal(m.totals.nEval, 46);
  assert.equal(m.totals.nGraded, 11);
  assert.equal(d.resources.length, 21);
  assert.deepEqual(d.warnings, []);
  close(m.byCode.get('R3.08').stats.avg, 7.44);
  close(m.byCode.get('SAE 3.3').stats.avg, 12.2875);
  close(m.ues[0].avg, 13.534, 1e-3);
  close(m.ues[2].avg, 9.9536, 1e-3);
  assert.equal(m.lastGrades[0].res.code, 'R3.05');
  assert.equal(d.lastGradeDate, '2026-11-05');
  const r8 = m.byCode.get('R3.08');
  assert.equal(r8.evals.length, 4);                 // la ligne « Moyenne provisoire » n'est pas une évaluation
  assert.deepEqual(r8.provisional, { best: 17.38, worst: 6.88, promo: 10.74 });
  const ev = r8.evals.find((e) => e.name.includes('Inclusion'));
  assert.equal(ev.v, 12); assert.equal(ev.best, 19.6); assert.equal(ev.worst, 0); assert.equal(ev.promo, 16.29);
});
test('notes : un 0 est une note, une cellule vide n’en est pas une', () => {
  const d = parseGrades('Ressource,Évaluation,Poids,Note,Meilleure,Pire,Promo,Date\nR3.01 X,A,50,0,,,,\nR3.01 X,B,50,,,,,\n');
  assert.equal(d.resources[0].evals[0].v, 0); assert.equal(d.resources[0].evals[1].v, null);
  assert.equal(d.resources[0].stats.avg, 0);
});
test('notes : valeurs invalides signalées sans planter', () => {
  const d = parseGrades('R,E,P,N,B,W,M,D\nR3.01 X,A,50,abc,,,,\nR3.01 X,B,-5,12,,,,\nR3.01 X,C,50,25,,,,\nR3.99 Inconnue,D,100,10,,,,\n');
  assert.ok(d.warnings.length >= 4, d.warnings.join('|'));
  const r = d.resources[0];
  assert.equal(r.evals[0].v, null); assert.equal(r.evals[1].w, 0); assert.equal(r.evals[2].v, null);
  assert.equal(d.resources[1].known, false);
});
test('notes : erreurs typées', () => {
  const kind = (fn) => { try { fn(); } catch (e) { return e instanceof DataError ? e.kind : 'autre:' + e.message; } return 'aucune'; };
  assert.equal(kind(() => parseGrades('')), 'format');
  assert.equal(kind(() => parseGrades('<!DOCTYPE html><html>')), 'notpublished');
  assert.equal(kind(() => parseGrades('a,b\n1,2\n')), 'format');
  assert.equal(kind(() => parseGrades('A,B,C,D\n,,,\n')), 'format');
  assert.equal(kind(() => parseGrades('R,E,P,N\nR3.01 X,,,\n')), 'invalid');
});

test('ICS réel : 152 événements, types et heures de Paris', () => {
  const r = parseICS(ics);
  assert.equal(r.events.length, 152);
  assert.deepEqual(r.warnings, []);
  assert.equal(new Date(r.exportedAt).toISOString(), '2026-11-06T07:48:00.000Z');
  const e = r.events.find((x) => x.day === '2026-11-06' && x.code === 'R3.12');
  assert.equal(e.type, 'CM'); assert.equal(e.startMin, 8 * 60 + 15); assert.equal(e.endMin, 9 * 60 + 45);
  assert.equal(e.room, 'Amphi 3'); assert.deepEqual(e.teachers, ['Ulmann Lionel']); assert.deepEqual(e.groups, ['BUT GB2']);
  assert.equal(e.name, 'Biochimie médicale');
  const c = (t) => r.events.filter((x) => x.type === t).length;
  assert.equal(c('TT'), 13); assert.equal(c('OFF') > 0, true);
});
test('ICS : heure d’été (UTC+2) et classification', () => {
  const r = parseICS(ics);
  const ex = r.events.find((x) => x.type === 'EX' && x.day > '2027-04-01');
  assert.ok(ex);
  const s = r.events.find((x) => x.day === '2027-04-02' && x.code === 'R4.07');
  assert.equal(new Date(s.start).toISOString().slice(11, 16), '11:30');
  assert.equal(s.startMin, 13 * 60 + 30); // UTC+2 après le passage à l'heure d'été (28 mars 2027)
  assert.equal(classify('R4.10-Ecrit Hémostase'), 'EX');
  assert.equal(classify('SAE3.01- Séance en autonomie 9'), 'AUTO');
  assert.equal(classify('R3.17- TD Génie génétique'), 'TD');
  assert.equal(classify('Réunion information alternance'), 'OTHER');
  assert.equal(classify('Vacances printemps'), 'OFF');
});
test('ICS : fuseaux, flottants, journée entière, récurrence, annulation', () => {
  const body = [
    'BEGIN:VCALENDAR', 'VERSION:2.0',
    'BEGIN:VEVENT', 'UID:a', 'DTSTART;TZID=Europe/Paris:20270105T090000', 'DTEND;TZID=Europe/Paris:20270105T103000', 'SUMMARY:R3.01- CM Test', 'END:VEVENT',
    'BEGIN:VEVENT', 'UID:b', 'DTSTART:20270106T090000', 'DTEND:20270106T100000', 'SUMMARY:Flottant', 'END:VEVENT',
    'BEGIN:VEVENT', 'UID:c', 'DTSTART;VALUE=DATE:20270107', 'DTEND;VALUE=DATE:20270108', 'SUMMARY:Férié', 'END:VEVENT',
    'BEGIN:VEVENT', 'UID:d', 'DTSTART:20270111T080000Z', 'DTEND:20270111T090000Z', 'RRULE:FREQ=WEEKLY;COUNT=3', 'EXDATE:20270118T080000Z', 'SUMMARY:R3.02- TD Hebdo', 'END:VEVENT',
    'BEGIN:VEVENT', 'UID:e', 'DTSTART:20270112T080000Z', 'DTEND:20270112T090000Z', 'STATUS:CANCELLED', 'SUMMARY:Annulé', 'END:VEVENT',
    'BEGIN:VEVENT', 'UID:f', 'DTSTART:xx', 'SUMMARY:Cassé', 'END:VEVENT',
    'BEGIN:VEVENT', 'UID:g', 'DTSTART:20270113T100000Z', 'DTEND:20270113T090000Z', 'SUMMARY:Fin avant début', 'END:VEVENT',
    'END:VCALENDAR'].join('\r\n');
  const r = parseICS(body);
  const by = (u) => r.events.filter((e) => e.uid === u);
  assert.equal(by('a')[0].startMin, 540);                         // 09:00 Paris
  assert.equal(by('b')[0].startMin, 540);                         // flottant = heure locale
  assert.equal(by('c')[0].allDay, true); assert.equal(by('c')[0].day, '2027-01-07'); assert.equal(by('c')[0].endDay, '2027-01-07');
  assert.deepEqual(by('d').map((e) => e.day), ['2027-01-11', '2027-01-25']);   // 18/01 exclu
  assert.equal(by('d')[0].startMin, 9 * 60);                      // 08:00Z = 09:00 Paris en hiver
  assert.equal(by('e').length, 0); assert.equal(r.cancelled, 1);
  assert.equal(r.warnings.length, 1);                              // « f » et « g » ignorés
});
test('ICS : fichier invalide', () => {
  assert.throws(() => parseICS(''), (e) => e.kind === 'format');
  assert.throws(() => parseICS('<html>'), (e) => e.kind === 'format');
  assert.throws(() => parseICS('BEGIN:VCALENDAR\nEND:VCALENDAR'), (e) => e.kind === 'invalid');
});
