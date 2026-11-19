import type { CourseChange } from './changes.js';
import type { CourseDTO } from './courses.js';
import { campusDate, campusTime, frenchDate } from './calendar.js';
import { repairText } from './text.js';

export function changeValue(course: CourseDTO | undefined, field: string): string {
  if (!course) return '—';
  const values: Record<string, string> = {
    Horaires: `${frenchDate(campusDate(course.start), { day: 'numeric', month: 'short' })} · ${campusTime(course.start)}–${campusTime(course.end)}`,
    Salle: (course.rooms?.length ? course.rooms.join(' / ') : course.location) || 'Non renseignée',
    Intitulé: course.summary, Enseignant: course.teachers?.join(', ') || 'Non renseigné',
    Type: course.type, Groupe: course.group || 'Non renseigné', Module: course.module,
  };
  return repairText(values[field] || 'Non renseigné');
}
export const changeDetails = (change: CourseChange) => (change.kind === 'changed' ? change.fields : ['Horaires', 'Salle']).map(field => ({
  field: field === 'Module' ? 'Matière' : field,
  before: changeValue(change.before, field), after: changeValue(change.after, field),
}));

/** What a change means for a course still in the timetable. */
export type ChangeBadge = 'added' | 'moved' | 'changed';
export const changeBadge = (change: CourseChange): ChangeBadge | undefined =>
  change.kind === 'added' ? 'added' : change.kind === 'changed' ? (change.fields.includes('Horaires') ? 'moved' : 'changed') : undefined;
export const badgeLabels: Record<ChangeBadge, string> = { added: 'Nouveau', moved: 'Déplacé', changed: 'Modifié' };
/**
 * Prominence of a change badge as the course approaches: 0 beyond a week (discreet label),
 * then 1 (7 days), 2 (5 days), 3 (3 days) and 4 (the day before or the day itself). Past courses get none.
 */
export function badgeLevel(courseDay: string, today: string): 0 | 1 | 2 | 3 | 4 | undefined {
  const days = Math.round((Date.parse(courseDay + 'T12:00:00Z') - Date.parse(today + 'T12:00:00Z')) / 86_400_000);
  if (days < 0) return undefined;
  return days <= 1 ? 4 : days <= 3 ? 3 : days <= 5 ? 2 : days <= 7 ? 1 : 0;
}
/** One short line per change, for notification cards. */
const headlines: Record<ChangeBadge, string> = { added: 'Nouveau cours', moved: 'Cours déplacé', changed: 'Cours modifié' };
export const changeHeadline = (change: CourseChange) => change.kind === 'removed' ? 'Cours retiré' : headlines[changeBadge(change)!];
