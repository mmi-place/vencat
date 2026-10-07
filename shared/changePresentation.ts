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
