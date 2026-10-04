import { test } from 'node:test';
import assert from 'node:assert/strict';
import { postEventToCalendarEvent, icalEventToCalendarEvent, prepareEvents, toUtc, parseType, type CelcatPostEvent } from '../backend/normalize.js';
import { normalizeModule, hydrateCourse } from '../shared/courses.js';
import { groups, GROUP_TO_FEDERATION } from '../shared/groups.js';
import { buildWeek, getMonday, dateKey } from '../shared/week.js';
import { TTLCache } from '../shared/cache.js';

const fixture: CelcatPostEvent = {
  id: 'course-1', start: '2026-10-05T09:00:00', end: '2026-10-05T11:00:00',
  allDay: false, eventCategory: 'Travaux Dirigés (TD)', modules: ['MM2R18'], sites: ['VEL'],
  description: 'DUPONT Alice<br>NO&Euml;L Bastian\r\n<br />MMI2-A1\r\n<br />E57 - VEL\r\nI22 - VEL\r\n<br />R218 - Économie &amp; droit - étude [MM2R18]',
};

test('multiple module labels remain readable and later group blocks never become rooms', () => {
  const event = postEventToCalendarEvent({ ...fixture, description: 'Alice<br />INF1-A<br />INF3-FA<br />512 - VEL<br />R1.06 - Mathématiques<br />R1.10 - Anglais', modules: ['IN1R06', 'IN1R10'] })!;
  assert.equal(event.course.summary, 'Mathématiques / Anglais');
  assert.equal(event.course.group, 'INF1-A; INF3-FA');
  assert.deepEqual(event.course.rooms, ['512 - VEL']);
});

test('POST parses all teachers and rooms once, decodes entities and keeps full title', () => {
  const event = postEventToCalendarEvent(fixture)!;
  assert.deepEqual(event.course.teachers, ['DUPONT Alice', 'NOËL Bastian']);
  assert.deepEqual(event.course.rooms, ['E57 - VEL', 'I22 - VEL']);
  assert.equal(event.course.module, 'R 2.18');
  assert.equal(event.course.moduleCode, 'MM2R18');
  assert.equal(event.course.summary, 'Économie & droit - étude');
  assert.equal(event.course.type, 'TD');
  assert.equal(event.start, '2026-10-05T07:00:00.000Z');
});

test('missing module and missing teachers remain usable', () => {
  const event = postEventToCalendarEvent({ ...fixture, modules: [], description: '<br />MMI2-A1<br />E57 - VEL', eventCategory: 'Réunion' })!;
  assert.deepEqual(event.course.teachers, []);
  assert.equal(event.course.location, 'E57 - VEL');
  assert.equal(event.course.module, 'Réunion');
  assert.equal(event.course.summary, 'Réunion');
  const empty = postEventToCalendarEvent({ ...fixture, modules: [], sites: [], description: '', eventCategory: 'projet tutoré' })!;
  assert.equal(empty.course.type, 'Projet Tutoré');
  assert.ok(empty.course.summary);
});

test('POST and iCalendar produce equivalent course fields', () => {
  const post = postEventToCalendarEvent({ ...fixture, description: 'Alice<br />MMI2-A1<br />E57<br />R218 - Économie', eventCategory: 'TD' })!;
  const ical = icalEventToCalendarEvent({
    type: 'VEVENT', uid: 'course-1', start: new Date(post.start), end: new Date(post.end),
    summary: 'R218 - Économie; TD', description: 'Alice; MMI2-A1\n\nEvent id: 1', location: 'E57',
  })!;
  for (const field of ['summary', 'type', 'module', 'start', 'end', 'location', 'group'] as const)
    assert.equal(post.course[field], ical.course[field]);
  assert.deepEqual(post.course.teachers, ical.course.teachers);
});

test('date conversion handles winter, summer and explicit offsets independently of server TZ', () => {
  assert.equal(toUtc('2026-01-12T09:00:00'), '2026-01-12T08:00:00.000Z');
  assert.equal(toUtc('2026-07-06T09:00:00'), '2026-07-06T07:00:00.000Z');
  assert.equal(toUtc('2026-07-06T09:00:00+02:00'), '2026-07-06T07:00:00.000Z');
  assert.equal(toUtc('2026-07-06T07:00:00Z'), '2026-07-06T07:00:00.000Z');
});

test('filtering uses Paris calendar dates, preserves recurring UID instances, removes duplicates', () => {
  const event = postEventToCalendarEvent({ ...fixture, start: '2026-10-05T00:30:00', end: '2026-10-05T01:00:00' })!;
  const another = postEventToCalendarEvent({ ...fixture, start: '2026-10-06T09:00:00', end: '2026-10-06T11:00:00' })!;
  assert.equal(prepareEvents([another, event, event], '2026-10-05', '2026-10-06').length, 2);
  assert.equal(prepareEvents([event], '2026-10-05', '2026-10-05').length, 1);
  assert.equal(postEventToCalendarEvent({ ...fixture, allDay: true }), null);
  assert.throws(() => postEventToCalendarEvent({ ...fixture, end: '2026-10-04T09:00:00' }));
});

test('module aliases and special categories match the catalog', () => {
  for (const value of ['R218', 'R2.18', 'R 2.18', 'MM2R18']) assert.equal(normalizeModule(value), 'R 2.18');
  for (const value of ['SAE201', 'SAE 2.01', 'MM2SA01']) assert.equal(normalizeModule(value), 'SAE 2.01');
  assert.equal(normalizeModule('MM4R05 CN'), 'R 4.05 CN');
  assert.equal(parseType('Réunion'), 'Réunion');
  assert.equal(parseType('DS'), 'DS');
  assert.equal(parseType('Cours Magistral (CM)'), 'CM');
  assert.equal(parseType('Entreprise'), 'Entreprise');
});

test('every selectable group has its backend federation in the shared catalog', () => {
  const ids = Object.values(groups).flatMap(promotions => Object.values(promotions).flatMap(entries => Object.values(entries)));
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) assert.ok(GROUP_TO_FEDERATION[id]);
});

test('Sunday requests the containing week and overlapping courses do not create false breaks', () => {
  const sunday = new Date(2026, 9, 11);
  assert.equal(dateKey(getMonday(sunday)), '2026-10-05');
  const course = hydrateCourse(postEventToCalendarEvent(fixture)!.course);
  const at = (hour: number) => new Date(2026, 9, 5, hour);
  const courses = [
    { ...course, uid: 'long', start: at(9), end: at(12) },
    { ...course, uid: 'overlap', start: at(10), end: at(11) },
    { ...course, uid: 'next', start: at(13), end: at(14) },
  ];
  const monday = buildWeek(courses, sunday, ['other'])[0]!;
  assert.deepEqual(monday.map(course => course.uid).filter(uid => !uid.startsWith('break')), ['long', 'overlap', 'next']);
  assert.equal(monday.filter(course => course.type === 'lunch').length, 1);
  assert.equal(monday.find(course => course.type === 'lunch')!.start.getHours(), 12);
  assert.ok(monday.filter(course => course.type !== 'lunch').every(course => course.hidden));
});

test('bounded cache expires in milliseconds and evicts without failing requests', () => {
  let now = 0;
  const cache = new TTLCache(600_000, 2, () => now);
  cache.set('a', [1]);
  now = 599_999;
  assert.deepEqual(cache.get('a'), [1]);
  now = 600_000;
  assert.equal(cache.get('a'), undefined);
  cache.set('b', 2); cache.set('c', 3); cache.set('d', 4);
  assert.equal(cache.get('b'), undefined);
  assert.equal(cache.get('d'), 4);
});
