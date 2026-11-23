import { computed, ref } from 'vue';
import { readPreference, writePreference } from '../storage';
import { selection, clock, online } from '../calendarStore';
import { api, errorText } from './api';
import { me, userKey } from './session';
import { isDone } from './marks';
import { myOutbox } from './outbox';
import { filters } from './ui';
import { addDay, campusDate, mondayOf, normalizedText } from '../../../shared/calendar';
import type { CourseDTO } from '../../../shared/courses';
import { countdown, scopeLabel, parisInstant, DEFAULT_DUE_TIME, type WorkView, type WorkType, type WorkInput, type CourseLink, type WorkScope } from '../../../shared/travaux';

// Works of the selected group, kept on the device (per account: personal works stay private) for offline reading.
export const works = ref<WorkView[]>([]);
export const worksLoading = ref(false);
export const worksError = ref('');
const CACHE = 'vencat:travaux';
const cacheKey = (groupId: string) => userKey(`${CACHE}:${groupId}`);
/** Works created offline, shown as drafts until they are sent. */
function drafts(groupId: string): WorkView[] {
  return myOutbox.value.filter(item => item.kind === 'create' && item.groupId === groupId).map(item => {
    const input = item.body as unknown as WorkInput;
    const time = input.time || DEFAULT_DUE_TIME;
    return { id: item.localId!, type: input.type, title: input.title, day: input.day, time, hasTime: !!input.time, due: parisInstant(input.day, time), scope: input.scope, scopeLabel: scopeLabel(input.scope), course: input.course, details: input.details, links: input.links.map(url => ({ url, domain: url, active: false })), ds: input.ds, author: `${me.value?.firstName ?? ''} ${me.value?.lastName ?? ''}`.trim(), createdAt: new Date(item.at).toISOString(), updatedAt: new Date(item.at).toISOString(), state: 'pending', up: 0, down: 0, required: 3, mine: true, reasons: [], personal: input.personal, local: true };
  });
}
export function showCached(groupId?: string) { works.value = groupId ? [...readPreference<WorkView[]>(cacheKey(groupId), []), ...drafts(groupId)] : []; }
let generation = 0;
export async function loadWorks() {
  const group = selection.value?.id;
  if (!group) { works.value = []; return; }
  const current = ++generation;
  if (!works.value.length) showCached(group);
  if (!online.value) return;
  worksLoading.value = true; worksError.value = '';
  try {
    const data = await api<WorkView[]>(`/travaux/group/${encodeURIComponent(group)}`);
    if (current !== generation) return;
    works.value = [...data, ...drafts(group)];
    writePreference(cacheKey(group), data.filter(work => work.day >= addDay(campusDate(new Date()), -45)));
  } catch (error) { if (current === generation) worksError.value = errorText(error); }
  finally { if (current === generation) worksLoading.value = false; }
}
export function replaceWork(view: WorkView, replacing = view.id) {
  const index = works.value.findIndex(work => work.id === replacing);
  if (index >= 0) works.value.splice(index, 1, view); else works.value.push(view);
}
/** Every device copy of works for an account (removed when it signs out). */
export function clearWorksCaches(userId: string) {
  try { for (const key of Object.keys(localStorage)) if (key.startsWith(CACHE + ':G') && key.endsWith(':' + userId)) localStorage.removeItem(key); } catch { /* storage blocked */ }
}

// Views
export const today = computed(() => campusDate(clock.value));
export const visibleWorks = computed(() => works.value.filter(work => {
  const f = filters.value;
  if (work.state === 'removed') return false;
  if (f.types.length && !f.types.includes(work.type)) return false;
  if (f.scope && (work.personal || work.scope.kind !== f.scope)) return false;
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
export const courseLink = (course: CourseDTO): CourseLink => ({ uid: course.uid, start: course.start, module: course.module, summary: course.summary, type: course.type, location: course.location, audience: course.group });
export const emptyInput = (scope: WorkScope, day: string): WorkInput => ({ type: 'rendu', title: '', day, time: '', scope, details: { where: '', format: '', mode: '', info: '' }, links: [] });

// Timetable corrections (shown over CELCAT, closed when CELCAT changes the course)
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
