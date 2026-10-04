import { test } from 'node:test';
import assert from 'node:assert/strict';
import { searchWindow, searchChunks, matchesCourse, coursesInWindow, rangeTTL, searchFacets } from '../shared/search.js';
import { addDay } from '../shared/calendar.js';
import type { CourseDTO } from '../shared/courses.js';
const course: CourseDTO = { uid: 'one', start: '2026-10-05T06:00:00Z', end: '2026-10-05T08:00:00Z', summary: 'Développement web', module: 'R101', type: 'TD', teachers: ['Noël'], location: 'E57', rooms: ['E57'], group: 'MMI1-B1', source: 'post' };

test('custom search dates choose server TTL automatically and reject invalid coverage', () => {
  assert.equal(rangeTTL('2026-10-01', '2026-10-14'), 600);
  assert.equal(rangeTTL('2026-10-01', '2026-10-31'), 86400);
  assert.equal(rangeTTL('2026-10-01', '2026-12-31'), 259200);
  assert.equal(rangeTTL('2026-10-01', '2027-03-31'), 604800);
  assert.equal(rangeTTL('2026-09-01', '2027-08-31'), 1209600);
  assert.throws(() => rangeTTL('2026-02-30', '2026-03-01'));
  assert.throws(() => rangeTTL('2026-10-02', '2026-10-01'));
  assert.throws(() => rangeTTL('2026-01-01', '2028-01-01'));
});
test('facets represent possible results, exclude their own criterion and preserve separate rooms', () => {
  const courses = [course, { ...course, uid: 'two', type: 'CM', teachers: ['Martin'], rooms: ['E58', 'I03'], location: 'E58 / I03' }];
  const facets = searchFacets(courses, 'web', { type: 'TD' });
  assert.deepEqual(facets.teacher.map(item => item.value), ['Noël']);
  assert.deepEqual(facets.type.map(item => item.value), ['CM', 'TD']);
  assert.deepEqual(searchFacets(courses, '', { teacher: 'Martin' }).room.map(item => item.value), ['E58', 'I03']);
  assert.equal(matchesCourse(courses[1]!, '', { room: 'I03' }), true);
  assert.equal(matchesCourse(course, '', { group: 'MMI1' }), false);
  assert.equal(matchesCourse({ ...course, group: 'MMI1-B1; MMI1-B2' }, '', { group: 'MMI1-B2' }), true);
  assert.equal(searchFacets(courses, 'absent').teacher.length, 0);
});

test('search periods follow calendar boundaries and requested cache lifetimes', () => {
  assert.deepEqual(searchWindow('week', '2026-10-11'), { start: '2026-10-05', end: '2026-10-11', ttl: 600 });
  assert.deepEqual(searchWindow('fortnight', '2026-10-11'), { start: '2026-10-05', end: '2026-10-18', ttl: 600 });
  assert.deepEqual(searchWindow('month', '2028-02-15'), { start: '2028-02-01', end: '2028-02-29', ttl: 86400 });
  assert.deepEqual(searchWindow('quarter', '2026-11-15'), { start: '2026-11-01', end: '2027-01-31', ttl: 259200 });
  assert.deepEqual(searchWindow('semester', '2026-11-15'), { start: '2026-11-01', end: '2027-04-30', ttl: 604800 });
  assert.deepEqual(searchWindow('year', '2027-08-31'), { start: '2026-09-01', end: '2027-08-31', ttl: 1209600 });
  assert.equal(searchWindow('year', '2027-09-01').start, '2027-09-01');
  assert.throws(() => searchWindow('month', '2026-02-30'));
});
test('annual fetch chunks have complete coverage without gaps or overlaps', () => {
  const chunks = searchChunks('2026-09-01', '2027-08-31');
  assert.equal(chunks.length, 7);
  assert.equal(chunks[0]!.start, '2026-09-01');
  assert.equal(chunks.at(-1)!.end, '2027-08-31');
  chunks.forEach((chunk, index) => {
    assert.ok(chunk.end <= addDay(chunk.start, 59));
    if (index) assert.equal(chunk.start, addDay(chunks[index - 1]!.end, 1));
  });
});
test('server and local search share accent-insensitive matching and exact filters', () => {
  assert.equal(matchesCourse(course, 'developpement noel', { type: 'TD', group: 'MMI1-B1' }), true);
  assert.equal(matchesCourse(course, 'web', { room: 'E58' }), false);
  assert.equal(matchesCourse(course, 'web', { teacher: 'Autre' }), false);
  assert.equal(matchesCourse(course, 'web absent'), false);
});
test('date coverage uses Paris dates and excludes a course ending at midnight', () => {
  const before = { ...course, start: '2026-10-04T20:00:00Z', end: '2026-10-04T22:00:00Z' };
  const overnight = { ...course, start: '2026-10-04T21:30:00Z', end: '2026-10-04T22:30:00Z' };
  assert.deepEqual(coursesInWindow([before, overnight, course], '2026-10-05', '2026-10-05'), [overnight, course]);
});
