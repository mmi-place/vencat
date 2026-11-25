import { ref } from 'vue';
import { readPreference, writePreference } from '../storage';
import { api, isNetworkError } from './api';
import { me, userKey } from './session';
import { enqueue } from './outbox';

// Private marks: "done" and personal notes. Always mirrored on the device (per account), synced with the account.
export interface Marks { done: Record<string, string>; notes: Record<string, string> }
const BASE = 'vencat:travaux-marks';
const empty = (): Marks => ({ done: {}, notes: {} });
const read = (key: string) => { const value = readPreference<Marks>(key, empty()); return { done: value?.done ?? {}, notes: value?.notes ?? {} }; };
export const marks = ref<Marks>(read(userKey(BASE)));
const mirror = () => writePreference(userKey(BASE), marks.value);
export async function loadMarks() {
  marks.value = read(userKey(BASE));
  if (!me.value) return;
  try {
    const server = await api<Marks>('/account/marks');
    // Marks made without an account on this device are brought to the account once.
    const anonymous = read(BASE);
    const missing = Object.keys(anonymous.done).filter(id => !server.done[id]), notes = Object.entries(anonymous.notes).filter(([id]) => !server.notes[id]);
    marks.value = missing.length || notes.length ? await api<Marks>('/account/marks', { method: 'PUT', body: { done: Object.fromEntries(missing.map(id => [id, true])), notes: Object.fromEntries(notes) } }) : server;
    if (missing.length || notes.length) writePreference(BASE, empty());
    mirror();
  } catch { /* the device copy stays shown */ }
}
async function send(change: { done?: Record<string, boolean>; notes?: Record<string, string> }, userId = me.value?.id) {
  // The change belongs to the account it was made with: if that account signed out meanwhile, it is dropped.
  if (userId !== me.value?.id) return;
  mirror();
  if (!me.value) return;
  try { marks.value = await api<Marks>('/account/marks', { method: 'PUT', body: change }); mirror(); }
  catch (error) { if (isNetworkError(error)) enqueue({ kind: 'marks', path: '/account/marks', method: 'PUT', body: change, label: 'cases et notes' }); }
}
export function setDone(id: string, done: boolean) {
  if (done) marks.value.done[id] = new Date().toISOString(); else delete marks.value.done[id];
  void send({ done: { [id]: done } });
}
const noteTimers = new Map<string, ReturnType<typeof setTimeout>>();
export function setNote(id: string, text: string) {
  if (text) marks.value.notes[id] = text; else delete marks.value.notes[id];
  mirror();
  clearTimeout(noteTimers.get(id));
  const userId = me.value?.id;
  noteTimers.set(id, setTimeout(() => { noteTimers.delete(id); void send({ notes: { [id]: text } }, userId); }, 600));
}
export function cancelNoteTimers() { for (const timer of noteTimers.values()) clearTimeout(timer); noteTimers.clear(); }
export const isDone = (id: string) => !!marks.value.done[id];
export const marksKey = BASE;
