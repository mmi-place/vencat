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
