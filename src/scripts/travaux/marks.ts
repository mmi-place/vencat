import { ref } from 'vue';
import { readPreference, writePreference } from '../storage';
import { api, isNetworkError } from './api';
import { me, userKey } from './session';
import { enqueue, outbox } from './outbox';

// Private marks: "done" and personal notes. Always mirrored on the device (per account), synced with the account.
// The sync only ADDS: what exists on the device and not yet on the account is brought to the account, what exists on the
// account and not on the device is brought to the device. Nothing is erased by a sync; a mark disappears only when
// the person unticks it (on any device).
export interface Marks { done: Record<string, string>; notes: Record<string, string> }
const BASE = 'vencat:travaux-marks';
const KEEP_MS = 200 * 86400_000;
const empty = (): Marks => ({ done: {}, notes: {} });
const read = (key: string) => { const value = readPreference<Marks>(key, empty()); return { done: value?.done ?? {}, notes: value?.notes ?? {} }; };
/** Marks older than the server keeps them are dropped from the device too (it also keeps the storage small). */
function pruned(value: Marks): Marks {
  const limit = Date.now() - KEEP_MS;
  return { done: Object.fromEntries(Object.entries(value.done).filter(([, at]) => Date.parse(at) > limit)), notes: value.notes };
}
export const marks = ref<Marks>(pruned(read(userKey(BASE))));
const mirror = () => writePreference(userKey(BASE), marks.value);
// Changes leave one after the other, in the order they were made (two quick taps never overtake each other).
let chain: Promise<void> = Promise.resolve();
const isEmpty = (value: Marks) => !Object.keys(value.done).length && !Object.keys(value.notes).length;
export async function loadMarks() {
  // Changes made here and still on their way go first, so that the account never answers with an older state.
  await chain;
  const local = pruned(read(userKey(BASE)));
  marks.value = local;
  if (!me.value) return;
  try {
    const server = await api<Marks>('/account/marks');
    // Added to the account: the marks of this device it does not have, and those made without an account on this device.
    const anonymous = pruned(read(BASE));
    const toAdd: Marks = { done: {}, notes: {} };
    for (const source of [anonymous, local]) {
      for (const [id, at] of Object.entries(source.done)) if (!server.done[id] && !toAdd.done[id]) toAdd.done[id] = at;
      for (const [id, text] of Object.entries(source.notes)) if (!server.notes[id] && !toAdd.notes[id]) toAdd.notes[id] = text;
    }
    // A change made offline and not sent yet (an untick, for example) still wins over what the account says.
    const pending = outbox.value.filter(item => item.userId === me.value?.id && item.kind === 'marks');
    for (const item of pending) {
      for (const [id, value] of Object.entries((item.body.done ?? {}) as Record<string, boolean>)) if (!value) { delete toAdd.done[id]; }
    }
    const merged = isEmpty(toAdd) ? server : await api<Marks>('/account/marks', { method: 'PUT', body: { merge: toAdd } });
    const result: Marks = { done: { ...merged.done }, notes: { ...merged.notes } };
    for (const item of pending) {
      for (const [id, value] of Object.entries((item.body.done ?? {}) as Record<string, boolean>)) { if (value) result.done[id] = new Date().toISOString(); else delete result.done[id]; }
      for (const [id, text] of Object.entries((item.body.notes ?? {}) as Record<string, string>)) { if (text) result.notes[id] = text; else delete result.notes[id]; }
    }
    marks.value = result;
    if (!isEmpty(anonymous)) writePreference(BASE, empty());
    mirror();
  } catch { /* the device copy stays shown */ }
}
function send(change: { done?: Record<string, boolean>; notes?: Record<string, string> }, userId = me.value?.id) {
  // The change belongs to the account it was made with: if that account signed out meanwhile, it is dropped.
  if (userId !== me.value?.id) return;
  mirror();
  if (!me.value) return;
  chain = chain.then(async () => {
    if (userId !== me.value?.id) return;
    // The answer is not applied: the screen already shows the change, and a later tap must not be overwritten.
    try { await api('/account/marks', { method: 'PUT', body: change }); }
    catch (error) { if (isNetworkError(error) || (error as { status?: number }).status === 429 || ((error as { status?: number }).status ?? 0) >= 500) enqueue({ kind: 'marks', path: '/account/marks', method: 'PUT', body: change, label: 'cases et notes' }); }
  });
}
export function setDone(id: string, done: boolean) {
  if (done) marks.value.done[id] = new Date().toISOString(); else delete marks.value.done[id];
  send({ done: { [id]: done } });
}
const noteTimers = new Map<string, ReturnType<typeof setTimeout>>();
export function setNote(id: string, text: string) {
  if (text) marks.value.notes[id] = text; else delete marks.value.notes[id];
  mirror();
  clearTimeout(noteTimers.get(id));
  const userId = me.value?.id;
  noteTimers.set(id, setTimeout(() => { noteTimers.delete(id); send({ notes: { [id]: text } }, userId); }, 600));
}
export function cancelNoteTimers() { for (const timer of noteTimers.values()) clearTimeout(timer); noteTimers.clear(); }
export const isDone = (id: string) => !!marks.value.done[id];
export const marksKey = BASE;

/** Marks made on another device show up here without restarting the app: asked again when the app comes back to the screen
 *  or the network returns, and every few minutes while it stays open (never more than once every 15 seconds). */
let lastRefresh = 0;
export function refreshMarks(force = false) {
  if (!me.value || document.hidden || (!force && Date.now() - lastRefresh < 15_000)) return;
  lastRefresh = Date.now();
  void loadMarks();
}
