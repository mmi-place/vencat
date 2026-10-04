import { catalogueDepartment, catalogueFiles, validCatalogue, type CatalogueDepartment, type CatalogueManifest, type CourseCatalogue } from '../../shared/catalogue';

// Isolated from calendar snapshots: catalogue releases cannot change their schema or contents.
const databaseName = 'vencat-catalogues';
function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('catalogues', { keyPath: 'department' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function localCatalogue(department: CatalogueDepartment): Promise<CourseCatalogue | undefined> {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction('catalogues', 'readonly');
      const request = transaction.objectStore('catalogues').get(department);
      request.onsuccess = () => resolve(validCatalogue(request.result, department) ? request.result : undefined);
      request.onerror = () => reject(request.error);
    });
  } finally { db.close(); }
}
async function persistCatalogue(catalogue: CourseCatalogue): Promise<void> {
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction('catalogues', 'readwrite');
      transaction.objectStore('catalogues').put(catalogue);
      transaction.oncomplete = () => resolve();
      transaction.onerror = transaction.onabort = () => reject(transaction.error);
    });
  } finally { db.close(); }
}
const pending = new Map<CatalogueDepartment, Promise<CourseCatalogue | undefined>>();
export async function loadCourseCatalogue(value: string, onAvailable?: (catalogue: CourseCatalogue) => void): Promise<CourseCatalogue | undefined> {
  const department = catalogueDepartment(value);
  if (!department) return undefined;
  if (onAvailable) {
    const cached = await localCatalogue(department).catch(() => undefined);
    if (cached) onAvailable(cached);
  }
  if (pending.has(department)) {
    const result = await pending.get(department);
    if (result) onAvailable?.(result);
    return result;
  }
  const request = refreshCatalogue(department);
  pending.set(department, request);
  try {
    const result = await request;
    if (result) onAvailable?.(result);
    return result;
  } finally { pending.delete(department); }
}
async function refreshCatalogue(department: CatalogueDepartment): Promise<CourseCatalogue | undefined> {
  // Storage may be denied/private/full: descriptions must still work over the network.
  const cached = await localCatalogue(department).catch(() => undefined);
  try {
    const manifestResponse = await fetch('/catalogues/manifest.json', { cache: 'no-store', signal: AbortSignal.timeout(8000) });
    if (!manifestResponse.ok) return cached;
    const manifest = await manifestResponse.json() as CatalogueManifest;
    if (!Number.isSafeInteger(manifest?.version) || manifest.version < 1) return cached;
    if (cached?.version === manifest.version) return cached;
    const response = await fetch(`/catalogues/${catalogueFiles[department]}.json?v=${manifest.version}`, { cache: 'no-store', signal: AbortSignal.timeout(8000) });
    if (!response.ok) return cached;
    const catalogue: unknown = await response.json();
    if (!validCatalogue(catalogue, department, manifest.version)) return cached;
    await persistCatalogue(catalogue).catch(() => undefined);
    return catalogue;
  } catch { return cached; }
}
