import { test } from 'node:test';
import assert from 'node:assert/strict';
import { changeDetails } from '../shared/changePresentation.js';
import type { CourseDTO } from '../shared/courses.js';

const before: CourseDTO = { uid: 'lesson', summary: 'Cours', start: '2026-10-12T08:00:00Z', end: '2026-10-12T10:00:00Z', location: 'E57', teachers: ['Enseignant'], type: 'TP', module: 'R 3.13' };
test('a room change shows only changed rooms, including multiple rooms', () => {
  const details = changeDetails({ id: 'room', detectedAt: before.start, kind: 'changed', before, after: { ...before, rooms: ['I22', 'E58'], location: 'I22 / E58' }, fields: ['Salle'] });
  assert.deepEqual(details, [{ field: 'Salle', before: 'E57', after: 'I22 / E58' }]);
});
test('rescheduled classes include the changed date and Paris time in both values', () => {
  const details = changeDetails({ id: 'time', detectedAt: before.start, kind: 'changed', before, after: { ...before, start: '2026-10-13T14:00:00Z', end: '2026-10-13T16:00:00Z' }, fields: ['Horaires'] });
  assert.match(details[0]!.before, /12.*10:00–12:00/);
  assert.match(details[0]!.after, /13.*16:00–18:00/);
});
test('change badges separate new, moved and modified courses', async () => {
  const { changeBadge } = await import('../shared/changePresentation.js');
  const base = { id: 'x', detectedAt: before.start, before, after: before };
  assert.equal(changeBadge({ ...base, kind: 'added', fields: [] }), 'added');
  assert.equal(changeBadge({ ...base, kind: 'changed', fields: ['Horaires', 'Salle'] }), 'moved');
  assert.equal(changeBadge({ ...base, kind: 'changed', fields: ['Salle'] }), 'changed');
  assert.equal(changeBadge({ ...base, kind: 'removed', fields: [] }), undefined);
});
test('badges grow more visible at 7, 5, 3 and 1 days before the course', async () => {
  const { badgeLevel } = await import('../shared/changePresentation.js');
  const today = '2026-11-19';
  assert.deepEqual(['2026-11-18', '2026-11-19', '2026-11-20', '2026-11-22', '2026-11-24', '2026-11-26', '2026-11-27'].map(day => badgeLevel(day, today)), [undefined, 4, 4, 3, 2, 1, 0]);
});
