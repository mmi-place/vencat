import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addDay, campusDate, campusTime, layoutDay, mondayOf, validDay, calendarWeekDays, todayPlanningDate } from '../shared/calendar.js';
import { groupOptions, groupByPath, groupById } from '../shared/selection.js';
import { compareSnapshots, type Snapshot } from '../shared/changes.js';
import type { CourseDTO } from '../shared/courses.js';
const course = (uid: string, start: string, end: string, overrides: Partial<CourseDTO> = {}): CourseDTO => ({ uid, start, end, summary: 'Programmation', module: 'R 1.01', type: 'TD', teachers: ['Dupont'], location: 'E57', rooms: ['E57'], source: 'post', ...overrides });
const snapshot = (courses: CourseDTO[], overrides: Partial<Snapshot> = {}): Snapshot => ({ version: 1, groupId: 'g', start: '2026-10-05', end: '2026-10-11', source: 'post', fetchedAt: '2026-10-04T12:00:00Z', courses, ...overrides });
test('every group has a unique readable path and invalid paths never select a default', () => {
  assert.equal(new Set(groupOptions.map(group => group.path)).size, groupOptions.length);
  for (const group of groupOptions) { assert.equal(groupByPath(group.path), group); assert.equal(groupById(group.id), group); assert.equal(group.path.split('/').length, 4); }
  assert.equal(groupByPath('/mmi/1/nope'), undefined); assert.equal(groupByPath('/'), undefined);
  assert.equal(groupByPath('/info/1/a')?.id, 'G1-BV1RUTBT5956');
});
test('campus dates and navigation remain stable across DST and month boundaries', () => {
  assert.equal(campusDate('2026-03-28T23:30:00Z'), '2026-03-29'); assert.equal(campusTime('2026-03-29T01:30:00Z'), '03:30');
  assert.equal(campusTime('2026-10-25T01:30:00Z'), '02:30'); assert.equal(addDay('2026-10-25', 7), '2026-11-01');
  assert.equal(mondayOf('2026-10-11'), '2026-10-05'); assert.equal(mondayOf(addDay('2026-10-11', 7)), '2026-10-12'); assert.equal(validDay('2026-02-30'), false);
});
test('overlap chains use separate columns while consecutive courses share one', () => {
  const data = [course('a', '2026-10-05T06:00:00Z', '2026-10-05T08:00:00Z'), course('b', '2026-10-05T07:00:00Z', '2026-10-05T09:00:00Z'), course('c', '2026-10-05T08:00:00Z', '2026-10-05T10:00:00Z'), course('d', '2026-10-05T10:00:00Z', '2026-10-05T11:00:00Z')];
  const layout = layoutDay(data);
  assert.deepEqual(layout.map(item => [item.column, item.columns]), [[0, 2], [1, 2], [0, 2], [0, 1]]);
  assert.equal(layout[0]!.start, 480); assert.equal(layout[0]!.end, 600);
});
test('changes require identical coverage, group and source', () => {
  const a = course('a', '2026-10-05T06:00:00Z', '2026-10-05T08:00:00Z');
  assert.deepEqual(compareSnapshots(undefined, snapshot([a])), []);
  for (const override of [{ source: 'ical' as const }, { groupId: 'other' }, { start: '2026-10-12' }]) assert.deepEqual(compareSnapshots(snapshot([a]), snapshot([], override)), []);
});
test('moves preserve simultaneous room and teacher changes and normalized order is ignored', () => {
  const a = course('a', '2026-10-05T06:00:00Z', '2026-10-05T08:00:00Z', { teachers: ['Dupont', 'Durand'] });
  const b = { ...a, start: '2026-10-06T07:00:00Z', end: '2026-10-06T09:00:00Z', location: 'E58', rooms: ['E58'], teachers: ['Martin'] };
  const changes = compareSnapshots(snapshot([a]), snapshot([b]));
  assert.equal(changes.length, 1); assert.deepEqual(changes[0]!.fields, ['Horaires', 'Salle', 'Enseignant']);
  assert.deepEqual(compareSnapshots(snapshot([a]), snapshot([{ ...a, teachers: ['Durand', 'Dupont'] }])), []);
});
test('recurring UID ambiguity produces additions and removals, never invented moves', () => {
  const a = course('series', '2026-10-05T06:00:00Z', '2026-10-05T08:00:00Z'), b = { ...a, start: '2026-10-06T06:00:00Z', end: '2026-10-06T08:00:00Z' };
  const moved = { ...b, start: '2026-10-07T06:00:00Z', end: '2026-10-07T08:00:00Z' };
  const changes = compareSnapshots(snapshot([a, b]), snapshot([a, moved]));
  assert.deepEqual(changes.map(item => item.kind), ['added', 'removed']);
});

test('weekly grid adds only weekend days containing courses, including overnight boundaries', () => {
  const weekdays = ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09'];
  const saturday = course('sat', '2026-10-10T06:00:00Z', '2026-10-10T08:00:00Z');
  const sunday = course('sun', '2026-10-11T06:00:00Z', '2026-10-11T08:00:00Z');
  assert.deepEqual(calendarWeekDays('2026-10-05', []), weekdays);
  assert.deepEqual(calendarWeekDays('2026-10-05', [saturday]), [...weekdays, '2026-10-10']);
  assert.deepEqual(calendarWeekDays('2026-10-05', [sunday]), [...weekdays, '2026-10-11']);
  assert.deepEqual(calendarWeekDays('2026-10-05', [saturday, sunday]), [...weekdays, '2026-10-10', '2026-10-11']);
  assert.deepEqual(calendarWeekDays('2026-10-05', [course('midnight', '2026-10-09T21:00:00Z', '2026-10-09T22:00:00Z')]), weekdays);
  assert.deepEqual(calendarWeekDays('2026-10-05', [course('overnight', '2026-10-09T21:00:00Z', '2026-10-09T23:00:00Z')]), [...weekdays, '2026-10-10']);
});

test('opening and Today advance empty weekends to Monday, including empty Mondays and unknown weeks', () => {
  const saturday = course('sat', '2026-10-10T06:00:00Z', '2026-10-10T08:00:00Z');
  assert.equal(todayPlanningDate('2026-10-10', []), '2026-10-12');
  assert.equal(todayPlanningDate('2026-10-11', []), '2026-10-12');
  assert.equal(todayPlanningDate('2026-10-10', [saturday]), '2026-10-10');
  assert.equal(todayPlanningDate('2026-10-11', [saturday]), '2026-10-12');
  assert.equal(todayPlanningDate('2026-10-12', []), '2026-10-12');
  assert.equal(todayPlanningDate('2026-10-10'), '2026-10-10');
  assert.equal(todayPlanningDate('2026-10-25', []), '2026-10-26');
  assert.equal(todayPlanningDate('2026-01-31', []), '2026-02-02');
});
