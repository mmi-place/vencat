/// <reference lib="dom" />
import type { Snapshot, CourseChange } from '../../shared/changes';

export function readPreference<T>(key: string, fallback: T): T { try { const value = localStorage.getItem(key); return value === null ? fallback : JSON.parse(value) as T; } catch { return fallback; } }
export function writePreference(key: string, value: unknown) { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; } }
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
export async function clearCalendarStorage() { const db = await database(); return new Promise<void>((resolve, reject) => { const tx = db.transaction(['snapshots', 'history'], 'readwrite'); tx.objectStore('snapshots').clear(); tx.objectStore('history').clear(); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); }); }
