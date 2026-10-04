import { test } from 'node:test';
import assert from 'node:assert/strict';
import { repairText } from '../shared/text.js';
import { hydrateCourse } from '../shared/courses.js';
import { catalogueTitle } from '../shared/catalogue.js';
import { normalizedText } from '../shared/calendar.js';
import { postEventToCalendarEvent, icalEventToCalendarEvent } from '../backend/normalize.js';

const corrupted = 'Vérification et maintenance dâ€™un système électronique';
const correct = 'Vérification et maintenance d’un système électronique';
test('repair mixed, repeated and Latin-1 encoding errors without changing correct Unicode', () => {
  assert.equal(repairText(corrupted), correct);
  assert.equal(repairText('FranÃ§ais, Ã‰conomie â€“ 20 â‚¬'), 'Français, Économie – 20 €');
  assert.equal(repairText('FranÃƒÂ§ais'), 'Français');
  assert.equal(repairText('lâ\u0080\u0099entreprise'), 'l’entreprise');
  for (const text of ['Économie — œuvre, Français, Noël à 20 €', '👩‍💻 日本語 Ελληνικά', 'â côté, Ã seul, Â isolé', 'Texte � déjà perdu']) assert.equal(repairText(text), text);
  assert.equal(repairText(repairText(corrupted)), correct);
});
test('POST and iCalendar repair titles, teachers and rooms after entity decoding', () => {
  const post = postEventToCalendarEvent({ id: 'encoding', start: '2026-10-05T09:00:00', end: '2026-10-05T10:00:00', allDay: false, eventCategory: 'TD', modules: ['R301'], sites: [],
    description: `NOÃ‹L Alice<br>GEII2-A1<br>Salle Ã‰lectronique<br>R301 - ${corrupted.replace('â€™', '&acirc;&euro;&trade;')}` })!;
  assert.equal(post.course.summary, correct);
  assert.deepEqual(post.course.teachers, ['NOËL Alice']);
  assert.deepEqual(post.course.rooms, ['Salle Électronique']);
  const ical = icalEventToCalendarEvent({ type: 'VEVENT', uid: 'encoding', start: new Date(post.start), end: new Date(post.end), summary: `R301 - ${corrupted}; TD`, description: 'NOÃ‹L Alice; GEII2-A1', location: 'Salle Ã‰lectronique' })!;
  assert.equal(ical.course.summary, correct);
  assert.deepEqual(ical.course.teachers, post.course.teachers);
  assert.deepEqual(ical.course.rooms, post.course.rooms);
});
test('saved courses and catalogue/search comparisons repair without changing identifiers or dates', () => {
  const course = { uid: 'uidÃ©', start: '2026-10-05T07:00:00Z', end: '2026-10-05T08:00:00Z', type: 'TD', module: 'R3.01', summary: corrupted, teachers: ['NOÃ‹L Alice'], location: 'Salle Ã‰lectronique', rooms: ['Salle Ã‰lectronique'], source: 'post' as const };
  const hydrated = hydrateCourse(course);
  assert.equal(hydrated.summary, correct);
  assert.equal(hydrated.uid, course.uid);
  assert.equal(hydrated.start.toISOString(), '2026-10-05T07:00:00.000Z');
  assert.equal(course.summary, corrupted);
  assert.equal(catalogueTitle(corrupted), catalogueTitle(correct));
  assert.equal(normalizedText(corrupted), normalizedText(correct));
});
