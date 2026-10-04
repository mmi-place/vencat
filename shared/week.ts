import type { Course } from './courses.js';

export type UICourse = Course & { hidden: boolean };
export function getMonday(date: Date): Date {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  result.setDate(result.getDate() - (result.getDay() + 6) % 7);
  return result;
}

export const dateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

// Breaks are display-only. Preserve overlapping courses without inventing gaps.
export function buildWeek(courses: Course[], reference: Date, modules?: string[]): UICourse[][] {
  const days: UICourse[][] = Array.from({ length: 7 }, () => []);
  const monday = getMonday(reference);
  const sunday = new Date(monday); sunday.setDate(sunday.getDate() + 6);
  for (const course of [...courses].sort((a, b) => a.start.getTime() - b.start.getTime())) {
    if (dateKey(course.start) < dateKey(monday) || dateKey(course.start) > dateKey(sunday)) continue;
    days[(course.start.getDay() + 6) % 7]!.push({ ...course, hidden: !!modules && !modules.includes(course.module) });
  }
  return days.map(day => {
    const result: UICourse[] = [];
    let busyUntil: Date | undefined;
    for (const course of day) {
      if (busyUntil && course.start.getTime() - busyUntil.getTime() > 15 * 60_000) {
        const lunch = busyUntil.getHours() >= 11 && busyUntil.getHours() < 14 && course.start.getHours() <= 14;
        result.push({
          uid: `break-${busyUntil.toISOString()}-${course.start.toISOString()}`,
          type: lunch ? 'lunch' : 'pause', summary: lunch ? 'Déjeuner' : 'Pause',
          start: new Date(busyUntil), end: new Date(course.start), teachers: [], location: '',
          module: lunch ? 'lunch' : 'pause', hidden: false,
        });
      }
      result.push(course);
      if (!busyUntil || course.end > busyUntil) busyUntil = course.end;
    }
    return result;
  });
}
