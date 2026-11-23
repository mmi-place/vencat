import { computed, ref, watch } from 'vue';
import { readPreference, writePreference } from './storage';
import { selection, online } from './calendarStore';
import { api, errorText, isNetworkError, onUnauthorized, ApiError } from './travaux/api';
import { me, setMe, userKey, loadMe, canContribute, onSignedOut } from './travaux/session';
import { marks, loadMarks, marksKey, cancelNoteTimers } from './travaux/marks';
import { outbox, myOutbox, enqueue, dropOutbox, clearOutbox } from './travaux/outbox';
import { works, loadWorks, showCached, replaceWork, clearWorksCaches, loadCorrections } from './travaux/works';
import { ui, notify } from './travaux/ui';
import type { WorkInput, WorkView } from '../../shared/travaux';

// Travaux client store. The pieces live in ./travaux/*; this file wires them together:
// account changes, offline outbox, and what happens when signing in or out.
export * from './travaux/api';
export * from './travaux/ui';
export * from './travaux/session';
export * from './travaux/marks';
export * from './travaux/outbox';
export * from './travaux/works';

export function requireAccount(action: () => void) { if (canContribute.value) action(); else ui.value.login = true; }

// ---------------------------------------------------------------------------
// New works since the last visit, and proposals waiting for my opinion.
// ---------------------------------------------------------------------------
const lastVisit = ref(readPreference<string>('vencat:travaux-visit', new Date().toISOString()));
const seenWorks = ref<string[]>(readPreference<string[]>('vencat:travaux-seen', []));
export const unseenWorks = computed(() => { const now = new Date().toISOString(); return works.value.filter(work => work.createdAt > lastVisit.value && !work.mine && !seenWorks.value.includes(work.id) && work.state !== 'removed' && work.due > now); });
export function markWorkSeen(id: string) { if (!seenWorks.value.includes(id)) { seenWorks.value = [...seenWorks.value, id].slice(-500); writePreference('vencat:travaux-seen', seenWorks.value); } }
export function markTravauxVisited() { lastVisit.value = new Date().toISOString(); writePreference('vencat:travaux-visit', lastVisit.value); }
import type { CorrectionView } from './travaux/works';
export interface DeclarationView { id: string; name: string; title: string; electedOn?: string; note: string; group: string }
export const queue = ref<{ works: WorkView[]; corrections: CorrectionView[]; declarations: DeclarationView[] }>({ works: [], corrections: [], declarations: [] });
export async function loadQueue() {
  if (!me.value?.groupId || !online.value) { if (!me.value) queue.value = { works: [], corrections: [], declarations: [] }; return; }
  try { const value = await api<typeof queue.value>('/travaux/queue'); queue.value = { works: value.works ?? [], corrections: value.corrections ?? [], declarations: value.declarations ?? [] }; } catch { /* the badge simply stays as it was */ }
}
export const queueCount = computed(() => queue.value.works.length + queue.value.corrections.length + queue.value.declarations.length);
/** Red badge on the Travaux switch: new works plus proposals waiting for my validation. */
export const travauxBadge = computed(() => unseenWorks.value.length + queueCount.value);

// ---------------------------------------------------------------------------
// Actions that work offline: sent at once when possible, otherwise kept in the outbox.
// ---------------------------------------------------------------------------
export async function vote(path: string, body: { value: 1 | -1 | 0; reason?: string }): Promise<WorkView | undefined> {
  try {
    const view = await api<WorkView>(path, { body });
    if (view && 'type' in view) replaceWork(view);
    void loadQueue();
    return view;
  } catch (error) {
    if (!isNetworkError(error)) throw error;
    enqueue({ kind: 'vote', path, method: 'POST', body, label: 'vote' });
    return undefined;
  }
}
/** Creates a work; offline, a draft is shown and sent when the network returns. */
export async function createWork(input: WorkInput): Promise<WorkView> {
  // Same id on every attempt: a retry after a lost answer does not create the work twice.
  input = { ...input, clientId: input.clientId ?? (crypto.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36)) };
  try { const view = await api<WorkView>('/travaux/works', { body: input }); replaceWork(view); return view; }
  catch (error) {
    if (!isNetworkError(error) || !selection.value) throw error;
    const localId = 'local-' + Math.random().toString(36).slice(2);
    enqueue({ kind: 'create', path: '/travaux/works', method: 'POST', body: input as unknown as Record<string, unknown>, label: input.title, localId, groupId: selection.value.id });
    showCached(selection.value.id);
    notify('Hors ligne : le travail sera proposé au retour du réseau.');
    return works.value.find(work => work.id === localId)!;
  }
}
export const offlineVotes = computed(() => myOutbox.value.length);
let flushing = false;
export async function flushOutbox() {
  if (flushing || !online.value || !me.value) return;
  const items = [...myOutbox.value];
  if (!items.length) return;
  flushing = true;
  let sent = 0;
  const failed: string[] = [];
  try {
    for (const item of items) {
      try {
        const result = await api<unknown>(item.path, { method: item.method, body: item.body });
        if (item.kind === 'create' && item.localId && result && typeof result === 'object' && 'id' in result) replaceWork(result as WorkView, item.localId);
        if (item.kind === 'marks' && result && typeof result === 'object' && 'done' in result) marks.value = result as typeof marks.value;
        dropOutbox([item.id]); sent++;
      } catch (error) {
        if (isNetworkError(error)) break;
        // Refused by the server (rule, expired session…): it will not succeed later either.
        dropOutbox([item.id]); failed.push(`${item.label} : ${errorText(error)}`);
      }
    }
  } finally { flushing = false; }
  if (sent) notify(`${sent} action${sent > 1 ? 's' : ''} faite${sent > 1 ? 's' : ''} hors ligne envoyée${sent > 1 ? 's' : ''}.`);
  if (failed.length) notify(`Non envoyé : ${failed.join(' · ')}`, 8000);
  await loadWorks(); await loadQueue();
}
watch(online, value => { if (value) void flushOutbox(); });

// ---------------------------------------------------------------------------
// Signing in and out
// ---------------------------------------------------------------------------
/** Everything this device keeps for an account: removed when it signs out (shared computers). */
function forget(userId: string) {
  cancelNoteTimers();
  clearOutbox(userId);
  clearWorksCaches(userId);
  try { localStorage.removeItem(userKey(marksKey, userId)); } catch { /* storage blocked */ }
}
export async function logout() {
  const userId = me.value?.id;
  await api('/auth/logout', { body: {} }).catch(() => undefined);
  if (userId) forget(userId);
  setMe(null);
}
// The server no longer knows the session (revoked from another device, expired): back to reading, data forgotten.
onSignedOut(userId => { forget(userId); notify('Ta session a pris fin. Reconnecte-toi pour continuer.', 6000); });
onUnauthorized(() => {
  const userId = me.value?.id;
  if (!userId) return;
  forget(userId); setMe(null);
  notify('Ta session a pris fin. Reconnecte-toi pour continuer.', 6000);
});
watch(() => me.value?.id, (id, previous) => {
  if (id === previous) return;
  showCached(selection.value?.id);
  void loadMarks(); void loadQueue(); void loadWorks();
  if (id) void flushOutbox();
});
watch(() => selection.value?.id, id => { showCached(id); void loadWorks(); void loadCorrections(); });
export { ApiError, loadMe, outbox };
