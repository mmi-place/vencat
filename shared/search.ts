import { addDay, mondayOf, validDay, normalizedText, courseOccursOn } from './calendar.js';
import type { CourseDTO } from './courses.js';

export const searchScopes = [
  { id: 'week', label: '1 semaine', ttl: 600 },
  { id: 'fortnight', label: '2 semaines', ttl: 600 },
  { id: 'month', label: '1 mois', ttl: 86400 },
  { id: 'quarter', label: '3 mois', ttl: 259200 },
  { id: 'semester', label: '6 mois', ttl: 604800 },
  { id: 'year', label: 'Année scolaire', ttl: 1209600 },
] as const;
export type SearchScope = typeof searchScopes[number]['id'];
export function searchWindow(scope: SearchScope, anchor: string) {
  if (!validDay(anchor)) throw new Error('Invalid search date');
  const option = searchScopes.find(item => item.id === scope);
  if (!option) throw new Error('Invalid search scope');
  let start: string, end: string;
  if (scope === 'week' || scope === 'fortnight') {
    start = mondayOf(anchor); end = addDay(start, scope === 'week' ? 6 : 13);
  } else if (scope === 'year') {
    const year = Number(anchor.slice(0, 4)) - (Number(anchor.slice(5, 7)) < 9 ? 1 : 0);
    start = `${year}-09-01`; end = `${year + 1}-08-31`;
  } else {
    start = anchor.slice(0, 7) + '-01';
    const months = scope === 'month' ? 1 : scope === 'quarter' ? 3 : 6;
    const boundary = new Date(start + 'T12:00:00Z'); boundary.setUTCMonth(boundary.getUTCMonth() + months);
    end = addDay(boundary.toISOString().slice(0, 10), -1);
  }
  return { start, end, ttl: option.ttl };
}
export interface SearchFilters { type?: string; module?: string; teacher?: string; room?: string; group?: string }
export const searchFields = ['type', 'module', 'teacher', 'room', 'group'] as const;
export type SearchField = typeof searchFields[number];
export interface SearchChoice { value: string; label: string; count: number }
export type SearchFacets = Record<SearchField, SearchChoice[]>;
export interface SearchCriterion { field: SearchField; value: string }
export function rangeTTL(start: string, end: string) {
  const days = (Date.parse(end) - Date.parse(start)) / 86400000 + 1;
  if (!validDay(start) || !validDay(end) || days < 1 || days > 366) throw new Error('Invalid search range');
  return days <= 14 ? 600 : days <= 31 ? 86400 : days <= 93 ? 259200 : days <= 184 ? 604800 : 1209600;
}
export function courseValues(course: CourseDTO, field: SearchField) {
  const values = field === 'teacher' ? course.teachers : field === 'room' ? course.rooms?.length ? course.rooms : [course.location] : field === 'group' ? (course.group ?? '').split('; ') : [course[field]];
  return [...new Set(values.filter((value): value is string => !!value))];
}
// Each menu contains choices compatible with the text and the other criteria.
export function searchFacets(courses: CourseDTO[], query = '', filters: SearchFilters = {}): SearchFacets {
  return Object.fromEntries(searchFields.map(field => {
    const others = { ...filters }; delete others[field];
    const choices = new Map<string, SearchChoice>();
    for (const course of courses.filter(course => matchesCourse(course, query, others))) for (const value of courseValues(course, field)) {
      const existing = choices.get(value);
      if (existing) existing.count++;
      else choices.set(value, { value, label: field === 'module' ? `${value} · ${course.summary}` : value, count: 1 });
    }
    return [field, [...choices.values()].sort((a, b) => a.label.localeCompare(b.label, 'fr'))];
  })) as SearchFacets;
}
export function matchesCourse(course: CourseDTO, query: string, filters: SearchFilters = {}) {
  const text = normalizedText([course.summary, course.module, course.moduleCode, course.location, course.group, ...course.teachers].join(' '));
  return normalizedText(query).split(' ').filter(Boolean).every(word => text.includes(word)) &&
    (!filters.type || course.type === filters.type) && (!filters.module || course.module === filters.module) &&
    (!filters.teacher || course.teachers.includes(filters.teacher)) && (!filters.room || courseValues(course, 'room').includes(filters.room) || course.location === filters.room) &&
    (!filters.group || courseValues(course, 'group').includes(filters.group));
}
export function coursesInWindow(courses: CourseDTO[], start: string, end: string) {
  return courses.filter(course => course.start.slice(0, 10) <= addDay(end, 1) && course.end.slice(0, 10) >= addDay(start, -1))
    .filter(course => courseOccursOn(course, start) || courseOccursOn(course, end) || course.start >= start && course.start < addDay(end, 1));
}
export function searchChunks(start: string, end: string) {
  const chunks: { start: string; end: string }[] = [];
  for (let day = start; day <= end; day = addDay(day, 60)) chunks.push({ start: day, end: addDay(day, 59) < end ? addDay(day, 59) : end });
  return chunks;
}
