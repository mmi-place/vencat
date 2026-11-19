import { ref } from 'vue';
import { hydrateCourse, repairCourseText, type CourseDTO } from '../../shared/courses';
import { matchesCourse, type SearchFilters } from '../../shared/search';

// The school year of a group is downloaded once and then filtered on the device:
// typing, filters and dates no longer call the server.
export interface SearchDataset { groupId: string; start: string; end: string; courses: CourseDTO[]; loadedAt: number }
const FRESH_MS = 10 * 60_000;
const datasets = new Map<string, SearchDataset>();
const pending = new Map<string, Promise<SearchDataset>>();
const datasetKey = (id: string, range?: { start: string; end: string }) => range ? `${id}:${range.start}:${range.end}` : `${id}:year`;

/** Cached copy, even if old: shown at once while a fresher one loads. */
export const cachedSearchDataset = (id: string, range?: { start: string; end: string }) => datasets.get(datasetKey(id, range));

export async function loadSearchDataset(id: string, anchor: string, range?: { start: string; end: string }): Promise<SearchDataset> {
  const key = datasetKey(id, range), cached = datasets.get(key);
  if (cached && Date.now() - cached.loadedAt < FRESH_MS) return cached;
  if (pending.has(key)) return pending.get(key)!;
  const work = (async () => {
    const params = new URLSearchParams({ q: '', date: anchor });
    if (range) { params.set('start', range.start); params.set('end', range.end); }
    const response = await fetch(`/api/search/${encodeURIComponent(id)}?${params}`, { signal: AbortSignal.timeout(120_000), cache: 'no-cache' });
    if (!response.ok) throw new Error(response.status === 429 ? 'Trop de recherches. Réessayez dans quelques minutes.' : 'La recherche est indisponible. Les cours enregistrés restent accessibles.');
    const data = await response.json() as { groupId: string; start: string; end: string; courses: CourseDTO[] };
    if (data.groupId !== id || !Array.isArray(data.courses) || typeof data.start !== 'string' || typeof data.end !== 'string' || range && (data.start !== range.start || data.end !== range.end)) throw new Error('La réponse de recherche est incomplète.');
    data.courses.forEach(hydrateCourse);
    const dataset: SearchDataset = { groupId: id, start: data.start, end: data.end, courses: data.courses.map(repairCourseText), loadedAt: Date.now() };
    datasets.set(key, dataset);
    return dataset;
  })();
  pending.set(key, work);
  try { return await work; } finally { pending.delete(key); }
}

/** Search shown on the planning: matching courses stand out, navigation jumps between days with results. */
export interface PlanningSearch { label: string; query: string; filters: SearchFilters; days: string[]; count: number }
export const planningSearch = ref<PlanningSearch>();
export const isSearchMatch = (course: CourseDTO) => !!planningSearch.value && matchesCourse(course, planningSearch.value.query, planningSearch.value.filters);
