import { ref } from 'vue';

export const customBackgroundUrl = ref('');
async function imageStore(mode: IDBTransactionMode, value?: Blob | null): Promise<Blob | undefined> {
  return new Promise((resolve, reject) => {
    const opening = indexedDB.open('vencat-appearance', 1);
    opening.onupgradeneeded = () => opening.result.createObjectStore('images');
    opening.onerror = () => reject(opening.error);
    opening.onsuccess = () => {
      const db = opening.result, tx = db.transaction('images', mode), store = tx.objectStore('images');
      let result: Blob | undefined;
      const request = value === undefined ? store.get('background') : value === null ? store.delete('background') : store.put(value, 'background');
      request.onsuccess = () => { if (value === undefined) result = request.result; };
      tx.oncomplete = () => { db.close(); resolve(result); };
      tx.onerror = tx.onabort = () => { db.close(); reject(tx.error); };
    };
  });
}
function showImage(blob?: Blob) {
  if (customBackgroundUrl.value) URL.revokeObjectURL(customBackgroundUrl.value);
  customBackgroundUrl.value = blob ? URL.createObjectURL(blob) : '';
}
export const restoreCustomBackground = imageStore('readonly').then(showImage).catch(() => {});
export async function importBackground(file: File) {
  if (!['image/jpeg', 'image/png', 'image/webp', 'image/avif'].includes(file.type)) throw new Error('Choisissez une image JPG, PNG, WebP ou AVIF.');
  if (file.size > 10 * 1024 * 1024) throw new Error('Choisissez une image de moins de 10 Mo.');
  const url = URL.createObjectURL(file);
  try {
    const image = new Image(); image.src = url; await image.decode();
    const scale = Math.min(1, 1600 / Math.max(image.width, image.height));
    const canvas = document.createElement('canvas'); canvas.width = Math.round(image.width * scale); canvas.height = Math.round(image.height * scale);
    canvas.getContext('2d')!.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('Cette image ne peut pas être utilisée.')), 'image/jpeg', .85));
    await restoreCustomBackground; await imageStore('readwrite', blob); showImage(blob);
  } finally { URL.revokeObjectURL(url); }
}
export async function removeBackground() { await restoreCustomBackground; await imageStore('readwrite', null); showImage(); }
