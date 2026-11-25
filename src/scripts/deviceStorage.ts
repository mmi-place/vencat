import { readPreference, writePreference, freeLocalSpace, pruneSnapshots } from './storage';

// Care of the space kept on the device: persistent storage asked once (the browser then does not clear it when short of
// space), and when the quota is nearly reached the rebuildable copies are cleared first.
const ASKED = 'vencat:storage-asked';
async function care() {
  try {
    const storage = navigator.storage;
    if (!storage) return;
    if (!readPreference<boolean>(ASKED, false) && storage.persist && !(await storage.persisted?.())) { await storage.persist(); writePreference(ASKED, true); }
    const estimate = await storage.estimate?.();
    if (estimate?.quota && estimate.usage && estimate.usage / estimate.quota > 0.8) { freeLocalSpace(); await pruneSnapshots(14); }
  } catch { /* storage care is best effort */ }
}
setTimeout(() => void care(), 5000);
