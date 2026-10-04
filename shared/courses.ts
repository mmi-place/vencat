import { repairText } from './text.js';
export const TIMETABLE_TIME_ZONE = 'Europe/Paris';

export interface CourseData<TDate = string> {
  uid: string;
  type: string;
  summary: string;
  start: TDate;
  end: TDate;
  teachers: string[];
  location: string;
  module: string;
  moduleCode?: string;
  group?: string;
  rooms?: string[];
  source?: 'post' | 'ical';
}

export type CourseDTO = CourseData<string>;
export type Course = CourseData<Date>;

export function repairCourseText<TDate>(course: CourseData<TDate>): CourseData<TDate> {
  return { ...course, summary: repairText(course.summary), type: repairText(course.type),
    module: repairText(course.module), location: repairText(course.location),
    group: typeof course.group === 'string' ? repairText(course.group) : course.group,
    teachers: course.teachers.map(repairText), rooms: course.rooms?.map(repairText) };
}

// The same identifier is used for API results, catalog lookup and UI filters.
export function normalizeModule(value: string): string {
  const text = repairText(value).trim().replace(/\s+/g, ' ');
  const code = text.match(/^MM(\d+)(R|SA)(\d+)(.*)$/i);
  const resource = text.match(/^(R|SAE)\s*(\d)[.\s]?(\d{2})(.*)$/i);
  if (code) return `${code[2]!.toUpperCase() === 'R' ? 'R' : 'SAE'} ${code[1]}.${code[3]!.padStart(2, '0')}${code[4]}`;
  if (resource) return `${resource[1]!.toUpperCase()} ${resource[2]}.${resource[3]}${resource[4]}`;
  if (/^r[eé]union$/i.test(text)) return 'Réunion';
  return text || 'inconnu';
}

export function hydrateCourse(course: CourseDTO): Course {
  if (!course || ['uid', 'type', 'summary', 'module', 'location', 'start', 'end'].some(field => typeof course[field as keyof CourseDTO] !== 'string') || !Array.isArray(course.teachers) || course.teachers.some(value => typeof value !== 'string') || course.rooms !== undefined && (!Array.isArray(course.rooms) || course.rooms.some(value => typeof value !== 'string')))
    throw new Error('Données de cours invalides. La copie précédente est conservée.');
  const start = new Date(course.start);
  const end = new Date(course.end);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end < start)
    throw new Error('Invalid course dates received from API');
  return { ...repairCourseText(course), start, end };
}
