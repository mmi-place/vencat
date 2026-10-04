import { Router } from 'express';
import { createHash } from 'node:crypto';
import { configured, redis } from './storage.js';
import { courseKey, campusDate, validDay, mondayOf, addDay } from '../shared/calendar.js';
import { groupById } from '../shared/selection.js';
import { hydrateCourse, repairCourseText, type CourseDTO } from '../shared/courses.js';
import { searchWindow, searchScopes, searchChunks, coursesInWindow, matchesCourse, searchFacets, searchFields, rangeTTL, type SearchScope, type SearchFilters, type SearchFacets } from '../shared/search.js';

export interface SearchDataset { version: 1; groupId: string; start: string; end: string; fetchedAt: string; courses: CourseDTO[]; index?: { version: string; facets: SearchFacets } }
const contentVersion = (courses: CourseDTO[]) => createHash('sha256').update(JSON.stringify(courses)).digest('hex');
function indexDataset(dataset: SearchDataset) {
  dataset.courses = dataset.courses.map(repairCourseText);
  const version = contentVersion(dataset.courses);
  if (dataset.index?.version !== version) dataset.index = { version, facets: searchFacets(dataset.courses) };
  return dataset;
}
const memory = new Map<string, { dataset: SearchDataset; expires: number }>();
const pending = new Map<string, Promise<SearchDataset>>();
const cacheKey = (id: string, start: string, end: string) => `vencat:search:${id}:${start}:${end}`;
function usable(dataset: SearchDataset | undefined, id: string, start: string, end: string, ttl: number) {
  return dataset?.version === 1 && dataset.groupId === id && dataset.start === start && dataset.end === end && Array.isArray(dataset.courses) && Date.now() - Date.parse(dataset.fetchedAt) < ttl * 1000;
}
async function stored(id: string, start: string, end: string, ttl: number): Promise<SearchDataset | undefined> {
  const key = cacheKey(id, start, end), local = memory.get(key);
  if (local && local.expires > Date.now() && usable(local.dataset, id, start, end, ttl)) return indexDataset(local.dataset);
  memory.delete(key);
  if (configured()) {
    try { const raw = await redis<string | null>('GET', key); const dataset = raw ? JSON.parse(raw) as SearchDataset : undefined;
      if (usable(dataset, id, start, end, ttl)) {
        dataset!.courses.forEach(hydrateCourse);
        const missingIndex = !dataset!.index;
        indexDataset(dataset!);
        const expires = Date.parse(dataset!.fetchedAt) + ttl * 1000;
        if (memory.size >= 64) memory.delete(memory.keys().next().value!);
        memory.set(key, { dataset: dataset!, expires });
        if (missingIndex) { try { await redis('SET', key, JSON.stringify(dataset), 'EX', Math.max(1, Math.floor((expires - Date.now()) / 1000))); } catch { /* Keep the index in memory without refreshing its data. */ } }
        return dataset;
      }
    } catch { /* A Redis outage does not prevent online search. */ }
  }
}
export async function searchDataset(id: string, scope: SearchScope, anchor: string, seed?: SearchDataset): Promise<SearchDataset> {
  const { start, end, ttl } = searchWindow(scope, anchor);
  return searchDatasetRange(id, start, end, ttl, seed);
}
export async function searchDatasetRange(id: string, start: string, end: string, ttl: number, seed?: SearchDataset): Promise<SearchDataset> {
  const key = cacheKey(id, start, end);
  const saved = await stored(id, start, end, ttl); if (saved) return saved;
  if (pending.has(key)) return pending.get(key)!;
  const work = (async () => {
    let dataset: SearchDataset;
    if (seed && seed.groupId === id && seed.start <= start && seed.end >= end && Date.now() - Date.parse(seed.fetchedAt) < ttl * 1000) {
      dataset = { ...seed, index: undefined, start, end, courses: coursesInWindow(seed.courses, start, end) };
    } else {
      const { getCalendar } = await import('./app.js');
      const chunks = searchChunks(start, end), snapshots = [];
      for (let i = 0; i < chunks.length; i += 3) snapshots.push(...await Promise.all(chunks.slice(i, i + 3).map(async chunk => (await getCalendar(id, chunk.start, chunk.end)).snapshot)));
      dataset = { version: 1, groupId: id, start, end, fetchedAt: snapshots.map(item => item.fetchedAt).sort()[0]!, courses: [...new Map(snapshots.flatMap(item => item.courses).map(course => [courseKey(course), course])).values()].sort((a, b) => a.start.localeCompare(b.start)) };
    }
    indexDataset(dataset);
    const expires = Date.parse(dataset.fetchedAt) + ttl * 1000;
    if (memory.size >= 64) memory.delete(memory.keys().next().value!);
    memory.set(key, { dataset, expires });
    if (configured()) {
      try { await redis('SET', key, JSON.stringify(dataset), 'EX', Math.max(1, Math.floor((expires - Date.now()) / 1000))); } catch { /* Per-instance cache remains available. */ }
    }
    return dataset;
  })();
  pending.set(key, work); try { return await work; } finally { pending.delete(key); }
}
export async function warmSearchCaches(id: string, anchor: string) {
  const seed = await searchDataset(id, 'year', anchor);
  for (const scope of ['semester', 'quarter', 'month', 'fortnight', 'week'] as const) await searchDataset(id, scope, anchor, seed);
}
export const searchRouter = Router();
searchRouter.get('/search/:groupId', async (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  const id = String(req.params.groupId), scope = req.query.scope ?? 'year', anchor = req.query.date ?? campusDate(new Date()), query = req.query.q;
  if (!groupById(id) || typeof query !== 'string' || query.length > 200 || !searchScopes.some(item => item.id === scope) || !validDay(anchor) || Number(anchor.slice(0, 4)) < 2020 || Number(anchor.slice(0, 4)) > 2100) return res.status(400).json({ error: 'Groupe, recherche ou période invalide.' });
  let range = searchWindow(scope as SearchScope, anchor);
  if (req.query.start !== undefined || req.query.end !== undefined) {
    if (!validDay(req.query.start) || !validDay(req.query.end) || Number(req.query.start.slice(0, 4)) < 2020 || Number(req.query.end.slice(0, 4)) > 2100) return res.status(400).json({ error: 'Dates de recherche invalides.' });
    try { range = { start: req.query.start, end: req.query.end, ttl: rangeTTL(req.query.start, req.query.end) }; }
    catch { return res.status(400).json({ error: 'Choisissez une période de 1 à 366 jours.' }); }
  }
  const filters: SearchFilters = {};
  for (const field of searchFields) {
    const value = req.query[field]; if (value !== undefined && (typeof value !== 'string' || value.length > 200)) return res.status(400).json({ error: 'Filtre invalide.' });
    if (typeof value === 'string') filters[field] = value;
  }
  try {
    if (configured()) {
      const ip = String(req.headers['x-vercel-forwarded-for'] ?? req.ip ?? 'unknown');
      const key = `vencat:search-rate:${createHash('sha256').update(ip).digest('hex')}:${Math.floor(Date.now() / 600000)}`;
      const count = await redis<number>('INCR', key); if (count === 1) await redis('EXPIRE', key, 600);
      if (count > 180) return res.status(429).json({ error: 'Trop de recherches. Réessayez dans quelques minutes.' });
      await redis('SADD', 'vencat:monitored', id);
    }
    const dataset = await searchDatasetRange(id, range.start, range.end, range.ttl);
    let courses = dataset.courses;
    // Keep the current two weeks fresh without resetting the lifetime of the annual archive.
    const recentStart = mondayOf(campusDate(new Date())), recentEnd = addDay(recentStart, 13);
    if (range.start <= recentEnd && range.end >= recentStart && range.ttl > 600) {
      try {
        const recent = await searchDataset(id, 'fortnight', recentStart, dataset);
        const replaced = new Set(coursesInWindow(courses, recentStart, recentEnd));
        courses = [...courses.filter(course => !replaced.has(course)), ...coursesInWindow(recent.courses, range.start, range.end)].sort((a, b) => a.start.localeCompare(b.start));
      } catch { /* Preserve the annual results if the recent update fails. */ }
    }
    const version = courses === dataset.courses ? dataset.index!.version : contentVersion(courses);
    const facets = !query.trim() && !Object.values(filters).some(Boolean) && courses === dataset.courses ? dataset.index!.facets : searchFacets(courses, query, filters);
    const facetsVersion = createHash('sha256').update(JSON.stringify(facets)).digest('hex');
    res.json({ groupId: id, ...range, fetchedAt: dataset.fetchedAt, version, facetsVersion, facets, courses: courses.filter(course => matchesCourse(course, query, filters)) });
  } catch (error) { next(error); }
});
