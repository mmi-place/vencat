import { TIMETABLE_TIME_ZONE, type CourseDTO } from './courses.js';
import { repairText } from './text.js';

// Intl formatters are costly to build and layout code formats every course several times.
const formatters = new Map<string, Intl.DateTimeFormat>();
function formatter(locale: string, options: Intl.DateTimeFormatOptions) {
  const key = locale + JSON.stringify(options);
  let value = formatters.get(key);
  if (!value) { value = new Intl.DateTimeFormat(locale, options); formatters.set(key, value); }
  return value;
}
const campusDay = new Intl.DateTimeFormat('sv-SE', { timeZone: TIMETABLE_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' });
const campusClock = new Intl.DateTimeFormat('fr-FR', { timeZone: TIMETABLE_TIME_ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
export const campusDate = (value: Date | string) => campusDay.format(new Date(value));
export const campusTime = (value: Date | string) => campusClock.format(new Date(value));
export const validDay = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
export const addDay = (value: string, days: number) => { const date = new Date(value + 'T12:00:00Z'); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10); };
export const mondayOf = (value: string) => addDay(value, -((new Date(value + 'T12:00:00Z').getUTCDay() + 6) % 7));
export const frenchDate = (value: string, options: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) => formatter('fr-FR', { ...options, timeZone: 'UTC' }).format(new Date(value + 'T12:00:00Z'));
export const minuteOf = (value: string) => { const [h, m] = campusTime(value).split(':').map(Number); return h! * 60 + m!; };
export const normalizedText = (value: string) => repairText(value).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
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
// Weekends are hidden unless enabled; when enabled, only days with real courses extend the weekly grid.
export function calendarWeekDays(start: string, courses: CourseDTO[], showWeekend = true) {
  return Array.from({ length: 7 }, (_, index) => addDay(start, index)).filter((day, index) => index < 5 || showWeekend && courses.some(course => courseOccursOn(course, day)));
}
// An unknown weekend is not treated as an empty one; weekdays never skip ahead; hidden weekends always skip.
export function todayPlanningDate(today: string, courses?: CourseDTO[], showWeekend = true) {
  if (!isWeekend(today)) return today;
  const monday = addDay(mondayOf(today), 7);
  if (!showWeekend) return monday;
  return courses && !courses.some(course => courseOccursOn(course, today)) ? monday : today;
}

/** Visible hours of the timetable, in minutes since midnight (Paris time). */
export interface HourRange { start: number; end: number }
export const DEFAULT_HOURS: HourRange = { start: 480, end: 1080 };
// Whole-hour bounds covering every course. A course ending at midnight stays on its own day.
export function hourBounds(courses: CourseDTO[]): HourRange | undefined {
  let start = Infinity, end = -Infinity;
  for (const course of courses) {
    const first = campusDate(course.start), last = campusDate(course.end), endMinute = minuteOf(course.end);
    const endsAtMidnight = last === addDay(first, 1) && endMinute === 0;
    if (first === last || endsAtMidnight) {
      start = Math.min(start, minuteOf(course.start));
      end = Math.max(end, endsAtMidnight ? 1440 : endMinute);
    } else { start = 0; end = 1440; }
  }
  if (!Number.isFinite(start)) return undefined;
  const from = Math.floor(start / 60) * 60;
  return { start: from, end: Math.min(1440, Math.max(Math.ceil(end / 60) * 60, from + 60)) };
}
export function mergeHours(...ranges: (HourRange | undefined)[]): HourRange {
  const known = ranges.filter((range): range is HourRange => !!range);
  return known.length ? { start: Math.min(...known.map(range => range.start)), end: Math.max(...known.map(range => range.end)) } : DEFAULT_HOURS;
}
