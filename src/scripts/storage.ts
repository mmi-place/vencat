/// <reference lib="dom" />
import type { Snapshot, CourseChange } from '../../shared/changes';

export function readPreference<T>(key: string, fallback: T): T { try { const value = localStorage.getItem(key); return value === null ? fallback : JSON.parse(value) as T; } catch { return fallback; } }
/** Frees what can be rebuilt (copies of works per group) when the browser says the storage is full. Marks and notes stay. */
export function freeLocalSpace() {
  try {
    for (const key of Object.keys(localStorage)) if (/^vencat:travaux:/.test(key) || key === 'vencat:push-token') localStorage.removeItem(key);
  } catch { /* storage blocked */ }
}
export function writePreference(key: string, value: unknown) {
  const text = JSON.stringify(value);
  try { localStorage.setItem(key, text); return true; }
  catch {
    // Quota reached: clear what is only a copy, then try once more.
    freeLocalSpace();
    try { localStorage.setItem(key, text); return true; } catch { return false; }
  }
}
let connection: Promise<IDBDatabase> | undefined;
function database() {
  return connection ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('vencat-calendar', 1);
    request.onupgradeneeded = () => { request.result.createObjectStore('snapshots'); request.result.createObjectStore('history'); };
    request.onsuccess = () => { request.result.onversionchange = () => { request.result.close(); connection = undefined; }; resolve(request.result); };
    request.onerror = () => { connection = undefined; reject(request.error); };
  });
}
export const snapshotKey = (group: string, week: string) => `${group}:${week}`;
export async function savedSnapshot(group: string, week: string, source?: Snapshot['source']): Promise<Snapshot | undefined> {
  const db = await database(); return new Promise((resolve, reject) => { const request = db.transaction('snapshots').objectStore('snapshots').get(snapshotKey(group, week) + (source ? ':' + source : '')); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
}
export async function savedHistory(group: string): Promise<CourseChange[]> {
  const db = await database(); return new Promise((resolve, reject) => { const request = db.transaction('history').objectStore('history').get(group); request.onsuccess = () => resolve(request.result ?? []); request.onerror = () => reject(request.error); });
}
export async function saveSnapshot(snapshot: Snapshot, changes: CourseChange[]) {
  const db = await database();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(['snapshots', 'history'], 'readwrite');
    const history = tx.objectStore('history'); const request = history.get(snapshot.groupId);
    request.onsuccess = () => {
      const entries = new Map<string, CourseChange>((request.result ?? []).map((item: CourseChange) => [item.id, item]));
      changes.forEach(item => entries.set(item.id, item));
      // Vue may wrap an old snapshot in a Proxy; IndexedDB cannot clone proxies.
      const persisted = [...entries.values()].filter(item => Date.parse(item.detectedAt) > Date.now() - 30 * 86400_000).sort((a, b) => b.detectedAt.localeCompare(a.detectedAt)).slice(0, 200);
      history.put(JSON.parse(JSON.stringify(persisted)), snapshot.groupId);
    };
    const store = tx.objectStore('snapshots'); const plain = JSON.parse(JSON.stringify(snapshot)); store.put(plain, snapshotKey(snapshot.groupId, snapshot.start)); store.put(plain, snapshotKey(snapshot.groupId, snapshot.start) + ':' + snapshot.source);
    const cursor = store.openCursor(); cursor.onsuccess = () => { const value = cursor.result; if (!value) return; const entry = value.value as Snapshot; if (Date.parse(entry.fetchedAt) < Date.now() - 45 * 86400_000) value.delete(); value.continue(); };
    tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
  });
}
/** Server history of a group, kept on the device for offline reading (replaces the previous copy). */
export async function saveHistory(group: string, changes: CourseChange[]) {
  const db = await database();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction('history', 'readwrite');
    tx.objectStore('history').put(JSON.parse(JSON.stringify(changes.slice(0, 300))), group);
    tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
  });
}
export async function clearCalendarStorage() { const db = await database(); return new Promise<void>((resolve, reject) => { const tx = db.transaction(['snapshots', 'history'], 'readwrite'); tx.objectStore('snapshots').clear(); tx.objectStore('history').clear(); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); }); }

/** Drops the timetable copies kept for offline reading that are older than `days` (they are fetched again when needed). */
export async function pruneSnapshots(days: number) {
  const db = await database();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction('snapshots', 'readwrite');
    const cursor = tx.objectStore('snapshots').openCursor();
    cursor.onsuccess = () => { const value = cursor.result; if (!value) return; const entry = value.value as Snapshot; if (Date.parse(entry.fetchedAt) < Date.now() - days * 86400_000) value.delete(); value.continue(); };
    tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
  });
}
