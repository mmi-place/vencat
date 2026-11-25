import { computed, ref } from 'vue';
import { readPreference, writePreference } from '../storage';
import { me } from './session';

// Actions made offline (votes, "done" marks and notes, new works), kept per account until the network returns.
export interface OutboxItem { id: string; userId: string; kind: 'vote' | 'marks' | 'create'; path: string; method: 'POST' | 'PUT'; body: Record<string, unknown>; label: string; at: number; localId?: string; groupId?: string }
const KEY = 'vencat:outbox';
export const outbox = ref<OutboxItem[]>(readPreference<OutboxItem[]>(KEY, []).filter(item => item && item.userId && item.path));
const save = () => writePreference(KEY, outbox.value);
export const myOutbox = computed(() => outbox.value.filter(item => item.userId === me.value?.id));
export function enqueue(item: Omit<OutboxItem, 'id' | 'at' | 'userId'>) {
  const userId = me.value?.id;
  if (!userId) return;
  const entry: OutboxItem = { ...item, id: Math.random().toString(36).slice(2), at: Date.now(), userId };
  if (item.kind === 'vote') outbox.value = [...outbox.value.filter(other => !(other.userId === userId && other.path === item.path)), entry];
  else if (item.kind === 'marks') {
    // Consecutive changes of marks are merged into one request.
    const last = [...outbox.value].reverse().find(other => other.userId === userId && other.kind === 'marks');
    if (last) {
      const done = { ...(last.body.done as object ?? {}), ...(item.body.done as object ?? {}) }, notes = { ...(last.body.notes as object ?? {}), ...(item.body.notes as object ?? {}) };
      last.body = { done, notes }; last.at = Date.now();
    } else outbox.value = [...outbox.value, entry];
  } else outbox.value = [...outbox.value, entry];
  save();
}
export function dropOutbox(ids: string[]) { outbox.value = outbox.value.filter(item => !ids.includes(item.id)); save(); }
export function clearOutbox(userId: string) { outbox.value = outbox.value.filter(item => item.userId !== userId); save(); }
