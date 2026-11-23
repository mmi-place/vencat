import { computed, ref, watch } from 'vue';
import { readPreference, writePreference } from './storage';
import { selection, clock, online } from './calendarStore';
import { addDay, campusDate, mondayOf, normalizedText } from '../../shared/calendar';
import type { CourseDTO } from '../../shared/courses';
import { countdown, type Me, type WorkView, type WorkType, type WorkInput, type ScopeKind, type CourseLink, type WorkScope } from '../../shared/travaux';

// ---------------------------------------------------------------------------
// Links opened from outside (ICS, mails, QR codes) are read before the router rewrites the address.
// ---------------------------------------------------------------------------
const launch = new URLSearchParams(location.search);
export const launchLinks: { work?: string; qr?: { id: string; number: number }; connexion?: string } = { work: launch.get('travail') ?? undefined, qr: launch.get('qr') ? { id: launch.get('qr')!, number: Number(launch.get('n')) } : undefined, connexion: launch.get('connexion') ?? undefined };

/** QR code of another device to approve (opened from its link or scanned in the app). */
export const qrRequest = ref(launchLinks.qr);

// ---------------------------------------------------------------------------
// API: same-origin calls with the session cookie and the anti-forgery header.
// ---------------------------------------------------------------------------
export class ApiError extends Error { constructor(public status: number, message: string) { super(message); } }
export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch('/api' + path, { method: init.method ?? (init.body !== undefined ? 'POST' : 'GET'), credentials: 'same-origin', headers: { 'content-type': 'application/json', 'x-requested-with': 'vencat' }, body: init.body !== undefined ? JSON.stringify(init.body) : undefined, signal: AbortSignal.timeout(20_000) });
  } catch { throw new ApiError(0, online.value ? 'Le serveur ne répond pas. Réessaie dans un instant.' : 'Hors ligne : réessaie une fois reconnecté.'); }
  const data = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new ApiError(response.status, data.error || `Erreur ${response.status}`);
  return data;
}
export const errorText = (error: unknown) => error instanceof Error ? error.message : 'Une erreur est survenue.';

// ---------------------------------------------------------------------------
// Section shown (Cours | Travaux) and Travaux view, remembered like the timetable view.
// ---------------------------------------------------------------------------
export type Section = 'cours' | 'travaux';
export const section = ref<Section>(readPreference<Section>('vencat:section', 'cours') === 'travaux' ? 'travaux' : 'cours');
watch(section, value => writePreference('vencat:section', value));
export type TravauxView = 'planning' | 'liste';
export const travauxView = ref<TravauxView>(readPreference<TravauxView>('vencat:travaux-view', 'planning') === 'liste' ? 'liste' : 'planning');
watch(travauxView, value => writePreference('vencat:travaux-view', value));
export const toggleSection = () => { section.value = section.value === 'cours' ? 'travaux' : 'cours'; };
/** Day shown in Travaux (month of the planning, chosen day on mobile). */
export const travauxDay = ref(campusDate(new Date()));
export interface TravauxFilters { types: WorkType[]; scope: '' | ScopeKind; pending: boolean; hideDone: boolean }
export const filters = ref<TravauxFilters>(readPreference<TravauxFilters>('vencat:travaux-filters', { types: [], scope: '', pending: false, hideDone: false }));
watch(filters, value => writePreference('vencat:travaux-filters', value), { deep: true });

// ---------------------------------------------------------------------------
// Account
// ---------------------------------------------------------------------------
export const me = ref<Me | null>(null);
export const meLoaded = ref(false);
export const config = ref({ mail: true, persistent: false, contact: '', teacherAccounts: false });
export async function loadMe() {
  try { me.value = (await api<{ me: Me | null }>('/auth/me')).me; } catch { /* Reading stays available. */ }
  meLoaded.value = true;
  api<typeof config.value>('/travaux/config').then(value => { config.value = value; }).catch(() => undefined);
}
export const needsOnboarding = computed(() => !!me.value && (!me.value.cguAccepted || (!me.value.groupId && me.value.role !== 'teacher')));
export const canContribute = computed(() => !!me.value && !needsOnboarding.value && !me.value.banned && !me.value.readOnlyUntil);
export async function logout() { await api('/auth/logout', { body: {} }).catch(() => undefined); me.value = null; marks.value = localMarks(); }

// Dialogs of the section, opened from several places.
export const ui = ref({ login: false, account: false, queue: false, delegates: false, moderation: false, cgu: false, ics: false });
export const openedWork = ref<string>();
export interface FormRequest { mode: 'create' | 'edit' | 'ds'; work?: WorkView; day?: string; course?: CourseDTO; type?: WorkType }
export const form = ref<FormRequest>();
export function requireAccount(action: () => void) { if (canContribute.value) action(); else ui.value.login = true; }

// ---------------------------------------------------------------------------
// Works of the selected group, kept on the device for offline reading.
// ---------------------------------------------------------------------------
export const works = ref<WorkView[]>([]);
export const worksLoading = ref(false);
export const worksError = ref('');
const cacheKey = (groupId: string) => `vencat:travaux:${groupId}`;
let generation = 0;
export async function loadWorks() {
  const group = selection.value?.id;
  if (!group) { works.value = []; return; }
  const current = ++generation;
  if (!works.value.length) works.value = readPreference<WorkView[]>(cacheKey(group), []);
  if (!online.value) return;
  worksLoading.value = true; worksError.value = '';
  try {
    const data = await api<WorkView[]>(`/travaux/group/${encodeURIComponent(group)}`);
    if (current !== generation) return;
    works.value = data;
    writePreference(cacheKey(group), data.filter(work => work.day >= addDay(campusDate(new Date()), -45)));
  } catch (error) { if (current === generation) worksError.value = errorText(error); }
  finally { if (current === generation) worksLoading.value = false; }
}
watch(() => selection.value?.id, id => { works.value = id ? readPreference<WorkView[]>(cacheKey(id), []) : []; void loadWorks(); void loadCorrections(); });
export function replaceWork(view: WorkView) {
  const index = works.value.findIndex(work => work.id === view.id);
  if (index >= 0) works.value.splice(index, 1, view); else works.value.push(view);
}

// ---------------------------------------------------------------------------
// Private marks: "done" and personal notes. On the account when signed in, on the device otherwise.
// ---------------------------------------------------------------------------
interface Marks { done: Record<string, string>; notes: Record<string, string> }
const localMarks = () => readPreference<Marks>('vencat:travaux-marks', { done: {}, notes: {} });
export const marks = ref<Marks>(localMarks());
export async function loadMarks() {
  if (!me.value) { marks.value = localMarks(); return; }
  try {
    const server = await api<Marks>('/account/marks');
    // Marks made before signing in are brought to the account once.
    const local = localMarks();
    const missing = Object.keys(local.done).filter(id => !server.done[id]), notes = Object.entries(local.notes).filter(([id]) => !server.notes[id]);
    marks.value = missing.length || notes.length ? await api<Marks>('/account/marks', { method: 'PUT', body: { done: Object.fromEntries(missing.map(id => [id, true])), notes: Object.fromEntries(notes) } }) : server;
    if (missing.length || notes.length) writePreference('vencat:travaux-marks', { done: {}, notes: {} });
  } catch { marks.value = localMarks(); }
}
watch(me, (value, previous) => { if (value?.id !== previous?.id) { void loadMarks(); void loadQueue(); void loadWorks(); } });
async function saveMarks(change: { done?: Record<string, boolean>; notes?: Record<string, string> }) {
  if (me.value) { try { marks.value = await api<Marks>('/account/marks', { method: 'PUT', body: change }); return; } catch { /* kept locally below */ } }
  writePreference('vencat:travaux-marks', marks.value);
}
export function setDone(id: string, done: boolean) {
  if (done) marks.value.done[id] = new Date().toISOString(); else delete marks.value.done[id];
  void saveMarks({ done: { [id]: done } });
}
let noteTimer: ReturnType<typeof setTimeout> | undefined;
export function setNote(id: string, text: string) {
  if (text) marks.value.notes[id] = text; else delete marks.value.notes[id];
  clearTimeout(noteTimer); noteTimer = setTimeout(() => void saveMarks({ notes: { [id]: text } }), 600);
}
export const isDone = (id: string) => !!marks.value.done[id];

// ---------------------------------------------------------------------------
// New works since the last visit, and proposals waiting for my opinion.
// ---------------------------------------------------------------------------
const lastVisit = ref(readPreference<string>('vencat:travaux-visit', new Date().toISOString()));
const seenWorks = ref<string[]>(readPreference<string[]>('vencat:travaux-seen', []));
export const unseenWorks = computed(() => works.value.filter(work => work.createdAt > lastVisit.value && !work.mine && !seenWorks.value.includes(work.id) && work.state !== 'removed' && work.due > new Date().toISOString()));
export function markWorkSeen(id: string) { if (!seenWorks.value.includes(id)) { seenWorks.value = [...seenWorks.value, id].slice(-500); writePreference('vencat:travaux-seen', seenWorks.value); } }
export function markTravauxVisited() { lastVisit.value = new Date().toISOString(); writePreference('vencat:travaux-visit', lastVisit.value); }
export const queue = ref<{ works: WorkView[]; corrections: CorrectionView[] }>({ works: [], corrections: [] });
export async function loadQueue() {
  if (!me.value || !me.value.groupId) { queue.value = { works: [], corrections: [] }; return; }
  try { queue.value = await api('/travaux/queue'); } catch { /* the badge simply stays as it was */ }
}
export const queueCount = computed(() => queue.value.works.length + queue.value.corrections.length);
/** Red badge on the Travaux switch: new works plus proposals waiting for my validation. */
export const travauxBadge = computed(() => unseenWorks.value.length + queueCount.value);

// ---------------------------------------------------------------------------
// Votes, kept on the device while offline and sent back when the network returns.
// ---------------------------------------------------------------------------
interface PendingVote { path: string; body: unknown }
const pendingVotes = ref<PendingVote[]>(readPreference<PendingVote[]>('vencat:travaux-pending-votes', []));
export async function vote(path: string, body: { value: 1 | -1 | 0; reason?: string }): Promise<WorkView | undefined> {
  if (!online.value) {
    pendingVotes.value = [...pendingVotes.value.filter(item => item.path !== path), { path, body }];
    writePreference('vencat:travaux-pending-votes', pendingVotes.value);
    return undefined;
  }
  const view = await api<WorkView>(path, { body });
  if ('type' in view) replaceWork(view);
  void loadQueue();
  return view;
}
export const offlineVotes = computed(() => pendingVotes.value.length);
async function flushVotes() {
  if (!online.value || !pendingVotes.value.length || !me.value) return;
  const waiting = [...pendingVotes.value];
  pendingVotes.value = []; writePreference('vencat:travaux-pending-votes', []);
  for (const item of waiting) await api(item.path, { body: item.body }).catch(() => undefined);
  await loadWorks(); await loadQueue();
}
watch([online, me], () => void flushVotes());

// ---------------------------------------------------------------------------
// Views of the works
// ---------------------------------------------------------------------------
export const today = computed(() => campusDate(clock.value));
export const visibleWorks = computed(() => works.value.filter(work => {
  const f = filters.value;
  if (work.state === 'removed') return false;
  if (f.types.length && !f.types.includes(work.type)) return false;
  if (f.scope && work.scope.kind !== f.scope) return false;
  if (f.pending && work.state === 'validated') return false;
  if (f.hideDone && isDone(work.id)) return false;
  return true;
}).sort((a, b) => a.due.localeCompare(b.due)));
export const worksByDay = computed(() => {
  const map = new Map<string, WorkView[]>();
  for (const work of visibleWorks.value) { const list = map.get(work.day) ?? []; list.push(work); map.set(work.day, list); }
  return map;
});
/** All works of a day, whatever the filters (used in the timetable). */
export const worksOn = (day: string) => works.value.filter(work => work.day === day && work.state !== 'removed');
export const lateWorks = computed(() => visibleWorks.value.filter(work => work.due < clock.value.toISOString() && !isDone(work.id) && work.day >= addDay(today.value, -30)));
export const weekSummary = computed(() => {
  const start = mondayOf(today.value), end = addDay(start, 6);
  const list = works.value.filter(work => work.state !== 'removed' && work.day >= start && work.day <= end);
  const count = (type: WorkType) => list.filter(work => work.type === type).length;
  return { rendu: count('rendu'), eval: count('eval'), devoir: count('devoir'), projet: count('projet'), total: list.length, done: list.filter(work => isDone(work.id)).length, late: lateWorks.value.length };
});
export const label = (work: WorkView) => countdown(work.day, today.value);

/** Works linked to a course: same CELCAT identifier and start, else same subject on the same day ("cours modifié"). */
export function worksForCourse(course: CourseDTO): { work: WorkView; moved: boolean }[] {
  const day = campusDate(course.start);
  return works.value.filter(work => work.course && work.state !== 'removed').flatMap((work): { work: WorkView; moved: boolean }[] => {
    const link = work.course!;
    if (link.uid === course.uid && link.start === course.start) return [{ work, moved: false }];
    if (campusDate(link.start) === day && link.uid !== course.uid && normalizedText(link.module) === normalizedText(course.module) && normalizedText(link.summary) === normalizedText(course.summary)) return [{ work, moved: true }];
    return [];
  });
}
export const isDs = (course: CourseDTO) => /\b(ds|devoir surveill|contr[ôo]le|examen|partiel|évaluation|evaluation)\b/i.test(`${course.type} ${course.summary}`);
export const courseLink = (course: CourseDTO): CourseLink => ({ uid: course.uid, start: course.start, module: course.module, summary: course.summary, type: course.type, location: course.location });

// ---------------------------------------------------------------------------
// Timetable corrections (shown over CELCAT, closed when CELCAT changes the course)
// ---------------------------------------------------------------------------
export interface CorrectionView { id: string; groupId: string; course: CourseLink & { end: string }; field: 'room' | 'time' | 'cancelled'; value: string; start?: string; end?: string; author: string; state: string; up: number; down: number; myVote?: 1 | -1; mine: boolean; status: string; createdAt: string }
export const corrections = ref<CorrectionView[]>([]);
export async function loadCorrections() {
  const group = selection.value?.id;
  if (!group || !online.value) return;
  try { corrections.value = await api<CorrectionView[]>(`/travaux/corrections/${encodeURIComponent(group)}`); } catch { /* optional overlay */ }
}
export function correctionFor(course: CourseDTO) {
  return corrections.value.find(item => item.course.uid === course.uid && item.course.start === course.start && item.status !== 'rejected');
}
/** The course no longer matches what was corrected (CELCAT changed it): the correction closes. */
export function checkCorrection(course: CourseDTO) {
  const item = correctionFor(course);
  if (item && (item.course.end !== course.end || (item.course.location ?? '') !== course.location)) {
    corrections.value = corrections.value.filter(other => other.id !== item.id);
    void api(`/travaux/correction/${item.id}/close`, { body: { reason: 'celcat' } }).catch(() => undefined);
    return undefined;
  }
  return item;
}

export const emptyInput = (scope: WorkScope, day: string): WorkInput => ({ type: 'rendu', title: '', day, time: '', scope, details: { where: '', format: '', mode: '', info: '' }, links: [] });

// ---------------------------------------------------------------------------
// Layout: on wide screens Travaux shows the agenda (70 %) and the selected day (30 %), where works open.
// ---------------------------------------------------------------------------
const wideQuery = matchMedia('(min-width: 1024px)');
export const wide = ref(wideQuery.matches);
wideQuery.addEventListener('change', event => { wide.value = event.matches; });
/** Ask the agenda to scroll to a day (the nonce repeats the request for the same day). */
export const agendaFocus = ref<{ day: string; nonce: number }>({ day: campusDate(new Date()), nonce: 0 });
export function focusDay(day: string, scroll = true) { travauxDay.value = day; if (scroll) agendaFocus.value = { day, nonce: agendaFocus.value.nonce + 1 }; }
/** Week shown in the week bar: follows the scrolling of the agenda. */
export const stripWeek = ref(mondayOf(campusDate(new Date())));
export const infoDismissed = ref(readPreference<boolean>('vencat:travaux-info-dismissed', false));
watch(infoDismissed, value => writePreference('vencat:travaux-info-dismissed', value));
export const relativeDay = (day: string, from: string) => {
  const days = Math.round((Date.parse(day + 'T12:00:00Z') - Date.parse(from + 'T12:00:00Z')) / 86400000);
  return days === 0 ? 'Aujourd’hui' : days === 1 ? 'Demain' : days === -1 ? 'Hier' : days > 1 ? `Dans ${days} jours` : `Il y a ${-days} jours`;
};

// Sign-in in progress, kept on the device: switching to the mail app may reload the page.
interface PendingLogin { email: string; request: { requestId: string; poll: string; number: number; devices?: number; mailSent?: boolean; expiresAt?: string }; savedAt: number }
const PENDING_KEY = 'vencat:pending-login';
export function savePendingLogin(email: string, request: PendingLogin['request']) { writePreference(PENDING_KEY, { email, request, savedAt: Date.now() }); }
export function readPendingLogin(): PendingLogin | undefined {
  const saved = readPreference<PendingLogin | null>(PENDING_KEY, null);
  if (!saved?.request?.requestId) return undefined;
  // The code lives 10 minutes, and 3 more minutes after a first use.
  if (Date.now() - saved.savedAt > 13 * 60000) { clearPendingLogin(); return undefined; }
  return saved;
}
export function clearPendingLogin() { try { localStorage.removeItem(PENDING_KEY); } catch { /* storage blocked */ } }
