import { TIMETABLE_TIME_ZONE, type CourseDTO } from './courses.js';
import { repairText } from './text.js';

export const campusDate = (value: Date | string) => new Intl.DateTimeFormat('sv-SE', { timeZone: TIMETABLE_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));
export const campusTime = (value: Date | string) => new Intl.DateTimeFormat('fr-FR', { timeZone: TIMETABLE_TIME_ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(value));
export const validDay = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
export const addDay = (value: string, days: number) => { const date = new Date(value + 'T12:00:00Z'); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10); };
export const mondayOf = (value: string) => addDay(value, -((new Date(value + 'T12:00:00Z').getUTCDay() + 6) % 7));
export const frenchDate = (value: string, options: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) => new Intl.DateTimeFormat('fr-FR', { ...options, timeZone: 'UTC' }).format(new Date(value + 'T12:00:00Z'));
export const minuteOf = (value: string) => { const [h, m] = campusTime(value).split(':').map(Number); return h! * 60 + m!; };
export const normalizedText = (value: string) => repairText(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
export const courseKey = (course: CourseDTO) => `${course.source}:${course.uid}:${course.start}:${course.end}`;

export interface PositionedCourse { course: CourseDTO; start: number; end: number; column: number; columns: number }
// Connected overlap clusters share one column count. Touching endpoints are consecutive.
export function layoutDay(courses: CourseDTO[], day?: string): PositionedCourse[] {
  const result: PositionedCourse[] = [];
  let cluster: PositionedCourse[] = [], until = -1;
  const flush = () => { const count = Math.max(1, ...cluster.map(item => item.column + 1)); cluster.forEach(item => item.columns = count); result.push(...cluster); cluster = []; };
  for (const course of [...courses].sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end))) {
    const start = day && campusDate(course.start) < day ? 0 : minuteOf(course.start);
    const end = day && campusDate(course.end) > day ? 1440 : minuteOf(course.end);
    if (start >= until) flush();
    const busy = new Set(cluster.filter(item => item.end > start).map(item => item.column));
    let column = 0; while (busy.has(column)) column++;
    cluster.push({ course, start, end: Math.max(start + 1, end), column, columns: 1 }); until = Math.max(until, end);
  }
  flush(); return result;
}

export const isWeekend = (day: string) => day > addDay(mondayOf(day), 4);
export const courseOccursOn = (course: CourseDTO, day: string) => campusDate(course.start) <= day && campusDate(course.end) >= day && !(campusDate(course.end) === day && minuteOf(course.end) === 0);
// Only exceptional weekend days with real courses extend the weekly grid.
export function calendarWeekDays(start: string, courses: CourseDTO[]) {
  return Array.from({ length: 7 }, (_, index) => addDay(start, index)).filter((day, index) => index < 5 || courses.some(course => courseOccursOn(course, day)));
}
// An unknown weekend is not treated as an empty one; weekdays never skip ahead.
export function todayPlanningDate(today: string, courses?: CourseDTO[]) {
  return isWeekend(today) && courses && !courses.some(course => courseOccursOn(course, today)) ? addDay(mondayOf(today), 7) : today;
}
