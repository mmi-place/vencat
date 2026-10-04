import { normalizedText } from './calendar.js';
import type { CourseDTO } from './courses.js';

export interface Snapshot { version: 1; groupId: string; start: string; end: string; source: 'post' | 'ical'; fetchedAt: string; courses: CourseDTO[] }
export interface CourseChange { id: string; detectedAt: string; kind: 'added' | 'removed' | 'changed'; before?: CourseDTO; after?: CourseDTO; fields: string[] }
const list = (items: string[] = []) => items.map(normalizedText).sort().join('|');
const fieldsChanged = (a: CourseDTO, b: CourseDTO) => [
  ['Horaires', a.start + a.end, b.start + b.end], ['Salle', list(a.rooms ?? [a.location]), list(b.rooms ?? [b.location])],
  ['Intitulé', normalizedText(a.summary), normalizedText(b.summary)], ['Enseignant', list(a.teachers), list(b.teachers)],
  ['Type', a.type, b.type], ['Groupe', a.group ?? '', b.group ?? ''], ['Module', a.module, b.module],
].filter(([, left, right]) => left !== right).map(([field]) => field!);
export function compareSnapshots(old: Snapshot | undefined, next: Snapshot): CourseChange[] {
  if (!old || old.groupId !== next.groupId || old.start !== next.start || old.end !== next.end || old.source !== next.source || old.version !== next.version) return [];
  const remaining = new Set(old.courses), changes: CourseChange[] = [];
  const emit = (kind: CourseChange['kind'], before?: CourseDTO, after?: CourseDTO, fields: string[] = []) => {
    const signature = JSON.stringify([kind, before, after]);
    let hash = 2166136261; for (const char of signature) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
    changes.push({ id: `${next.groupId}:${next.start}:${hash >>> 0}`, detectedAt: next.fetchedAt, kind, before, after, fields });
  };
  for (const after of next.courses) {
    const identity = [...remaining].filter(before => before.uid && before.uid === after.uid);
    let before = identity.find(candidate => candidate.start === after.start);
    // Only unique identities can establish a move. Repeated UIDs stay ambiguous.
    if (!before && identity.length === 1 && next.courses.filter(item => item.uid === after.uid).length === 1) before = identity[0];
    if (!before) {
      const candidates = [...remaining].filter(item => item.start === after.start && item.end === after.end && normalizedText(item.summary) === normalizedText(after.summary) && item.module === after.module);
      if (candidates.length === 1) before = candidates[0];
    }
    if (!before) emit('added', undefined, after);
    else { remaining.delete(before); const fields = fieldsChanged(before, after); if (fields.length) emit('changed', before, after, fields); }
  }
  for (const before of remaining) emit('removed', before);
  return changes;
}
