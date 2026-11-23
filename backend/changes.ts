import { store } from './travaux/store.js';
import { compareSnapshots, type Snapshot, type CourseChange } from '../shared/changes.js';
import { addDay, campusDate, mondayOf } from '../shared/calendar.js';

// Change detection, on the server only: every real read of CELCAT for a week is compared with the
// last one kept for that group and week; the differences go into the group's history, the same for everyone.
// Kept in the document store (file in development, Postgres in production): no Redis needed.
const RETENTION_MS = 30 * 86400_000, MAX_ENTRIES = 300;
interface Baseline { snapshot: Snapshot; emptySeenAt?: string }
interface Changelog { groupId: string; changes: CourseChange[] }
const isWeek = (snapshot: Snapshot) => snapshot.start === mondayOf(snapshot.start) && snapshot.end === addDay(snapshot.start, 6);

/** Compares a fresh snapshot with the kept one and records the differences. Returns the new changes. */
export async function recordSnapshot(snapshot: Snapshot): Promise<CourseChange[]> {
  // The fallback calendar has other identifiers: it never produces changes.
  if (snapshot.source !== 'post' || !isWeek(snapshot)) return [];
  const id = `${snapshot.groupId}:${snapshot.start}`;
  const baseline = await store().get<Baseline>('baselines', id);
  const old = baseline?.snapshot;
  // Same or older read (cache): nothing new to compare.
  if (old && Date.parse(old.fetchedAt) >= Date.parse(snapshot.fetchedAt)) return [];
  // A week that suddenly empties is only believed when seen twice (CELCAT sometimes answers empty).
  if (old?.courses.length && !snapshot.courses.length && !baseline?.emptySeenAt) {
    await store().put<Baseline>('baselines', id, { snapshot: old, emptySeenAt: snapshot.fetchedAt });
    return [];
  }
  const changes = compareSnapshots(old, snapshot);
  await store().put<Baseline>('baselines', id, { snapshot });
  if (changes.length) {
    const log = await store().get<Changelog>('changelog', snapshot.groupId) ?? { groupId: snapshot.groupId, changes: [] };
    const merged = new Map(log.changes.map(change => [change.id, change]));
    changes.forEach(change => merged.set(change.id, change));
    log.changes = [...merged.values()].filter(change => Date.parse(change.detectedAt) > Date.now() - RETENTION_MS).sort((a, b) => b.detectedAt.localeCompare(a.detectedAt)).slice(0, MAX_ENTRIES);
    await store().put('changelog', snapshot.groupId, log);
  }
  return changes;
}
export async function changesFor(groupId: string): Promise<CourseChange[]> {
  return (await store().get<Changelog>('changelog', groupId))?.changes.filter(change => Date.parse(change.detectedAt) > Date.now() - RETENTION_MS) ?? [];
}
/** Reads the current and next week of a group from CELCAT (fresh) and records their changes. */
export async function detectGroup(groupId: string) {
  const { getCalendar } = await import('./app.js');
  const start = mondayOf(campusDate(new Date()));
  let count = 0;
  for (const week of [start, addDay(start, 7)]) count += (await recordSnapshot((await getCalendar(groupId, week, addDay(week, 6), true)).snapshot)).length;
  return count;
}
/** Every group, a few at a time, under a time budget (Vercel functions stop after 300 s). */
export async function detectAll(groups: string[], budget = 200_000, concurrency = 4) {
  const started = Date.now();
  let index = 0, changes = 0;
  const failed: string[] = [];
  while (index < groups.length && Date.now() - started < budget) {
    const batch = groups.slice(index, index + concurrency);
    const results = await Promise.allSettled(batch.map(detectGroup));
    results.forEach((result, offset) => { if (result.status === 'fulfilled') changes += result.value; else failed.push(batch[offset]!); });
    index += batch.length;
  }
  return { groups: index, changes, failed, ms: Date.now() - started, next: index < groups.length ? index : undefined };
}
