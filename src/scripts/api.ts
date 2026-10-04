import { hydrateCourse, type Course, type CourseDTO } from '../../shared/courses';
import { dateKey } from '../../shared/week';

export async function fetchCourses(groupId: string, start: Date, end: Date): Promise<Course[]> {
  const query = new URLSearchParams({ start: dateKey(start), end: dateKey(end), format: 'course' });
  const response = await fetch(`/api/edt/${encodeURIComponent(groupId)}?${query}`, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error || `Impossible de charger les cours (${response.status})`);
  }
  const data = await response.json() as CourseDTO[];
  if (!Array.isArray(data)) throw new Error('Invalid course response');
  return data.map(hydrateCourse);
}
