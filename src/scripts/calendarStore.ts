import { computed, ref, watch } from 'vue';
import { hydrateCourse, repairCourseText, type CourseDTO } from '../../shared/courses';
import { addDay, campusDate, mondayOf, normalizedText, validDay, isWeekend, todayPlanningDate } from '../../shared/calendar';
import { compareSnapshots, type Snapshot, type CourseChange } from '../../shared/changes';
import { groupById, type GroupOption } from '../../shared/selection';
import { readPreference, writePreference, savedSnapshot, savedHistory, saveSnapshot } from './storage';
import { resolveBackground, type Background, type Theme } from './appearance';

export interface Preferences { density: 'compact' | 'full'; colorMode: 'type' | 'module'; colors: Record<string, string>; background: Background; theme: Theme; refresh: boolean }
const initial = readPreference<Partial<Preferences>>('vencat:preferences', {});
export const preferences = ref<Preferences>({
  density: initial?.density === 'full' || String(initial?.density) === 'detailed' ? 'full' : 'compact',
  colorMode: initial?.colorMode === 'module' ? 'module' : 'type',
  colors: initial?.colors && typeof initial.colors === 'object' ? Object.fromEntries(Object.entries(initial.colors).filter(([, value]) => typeof value === 'string' && /^#[a-f0-9]{6}$/i.test(value))) : {},
  theme: ['dark', 'light', 'system'].includes(String(initial?.theme)) ? initial!.theme! : 'dark',
  background: resolveBackground(initial?.background), refresh: initial?.refresh !== false,
});
watch(preferences, value => writePreference('vencat:preferences', value), { deep: true });
export const selection = ref<GroupOption>();
export const date = ref(campusDate(new Date()));
export const clock = ref(new Date());
export type CalendarView = 'list' | 'day' | 'week';
export const view = ref<CalendarView>('list');
export const selectedIds = computed(() => selection.value ? [selection.value.id] : []);
export const week = computed(() => mondayOf(date.value));
export const snapshots = ref<Record<string, Snapshot>>({});
export const history = ref<CourseChange[]>([]);
export const online = ref(navigator.onLine);
export const loading = ref(false);
export const error = ref('');
export const storageError = ref('');
export const hasData = computed(() => selectedIds.value.length > 0 && selectedIds.value.every(id => snapshots.value[`${id}:${week.value}`]));
export const missingGroups = computed(() => selectedIds.value.filter(id => !snapshots.value[`${id}:${week.value}`]).map(id => groupById(id)!));
export const displayedSnapshots = computed(() => selectedIds.value.map(id => snapshots.value[`${id}:${week.value}`]).filter((item): item is Snapshot => !!item));
export const lastFetched = computed(() => displayedSnapshots.value.map(item => item.fetchedAt).sort()[0]);
export const fallback = computed(() => displayedSnapshots.value.some(item => item.source === 'ical'));
export const focused = ref<CourseDTO>();
export const savedCourses = computed(() => {
  const map = new Map<string, CourseDTO>();
  for (const id of selectedIds.value) for (const start of [week.value, addDay(week.value, 7)]) {
    const snapshot = snapshots.value[`${id}:${start}`];
    for (const course of snapshot?.courses ?? []) {
      const key = [course.start, course.end, normalizedText(course.summary), course.module, course.type, course.location, [...course.teachers].sort().join('|')].join(':');
      const existing = map.get(key);
      if (existing) existing.group = [...new Set([...(existing.group ?? '').split('; '), ...(course.group ?? groupById(id)?.label ?? '').split('; ')])].filter(Boolean).join('; ');
      else map.set(key, { ...course, group: course.group || `${groupById(id)?.promotion} ${groupById(id)?.label}` });
    }
  }
  return [...map.values()].sort((a, b) => a.start.localeCompare(b.start));
});
export const weekCourses = computed(() => savedCourses.value.filter(course => campusDate(course.start) <= addDay(week.value, 6) && campusDate(course.end) >= week.value));
const storedDismissals = readPreference<unknown>('vencat:changes-dismissed', []);
const dismissedChanges = ref<string[]>(Array.isArray(storedDismissals) ? storedDismissals.filter(id => typeof id === 'string') : []);
const changesSeenAt = ref(readPreference<number>('vencat:changes-seen', 0));
const storedReadIds = readPreference<unknown>('vencat:changes-read', []);
const readChangeIds = ref<string[]>(Array.isArray(storedReadIds) ? storedReadIds.filter(id => typeof id === 'string') : []);
export const visibleChanges = computed(() => history.value.filter(change => !dismissedChanges.value.includes(change.id)));
export const unseenChanges = computed(() => visibleChanges.value.filter(change => Date.parse(change.detectedAt) > changesSeenAt.value && !readChangeIds.value.includes(change.id)));
export function markChangeSeen(id: string) { readChangeIds.value = [...new Set([...readChangeIds.value, id])].slice(-6000); writePreference('vencat:changes-read', readChangeIds.value); }
export function markChangesSeen() { changesSeenAt.value = Date.now(); writePreference('vencat:changes-seen', changesSeenAt.value); }
export function dismissChanges(ids: string[]) {
  dismissedChanges.value = [...new Set([...dismissedChanges.value, ...ids])].slice(-6000);
  return writePreference('vencat:changes-dismissed', dismissedChanges.value);
}

const inFlight = new Map<string, Promise<Snapshot>>();
export async function fetchSnapshot(id: string, start: string): Promise<Snapshot> {
  const key = `${id}:${start}`;
  if (inFlight.has(key)) return inFlight.get(key)!;
  const promise = (async () => {
    const response = await fetch(`/api/edt/${encodeURIComponent(id)}?` + new URLSearchParams({ start, end: addDay(start, 6), format: 'snapshot' }), { signal: AbortSignal.timeout(30_000), cache: 'no-cache' });
    if (!response.ok) throw new Error('Le calendrier de l’établissement est indisponible. Réessayez dans quelques instants.');
    const result = await response.json() as Snapshot;
    if (result.version !== 1 || result.groupId !== id || result.start !== start || result.end !== addDay(start, 6) || !Array.isArray(result.courses) || !['post', 'ical'].includes(result.source) || !Number.isFinite(Date.parse(result.fetchedAt))) throw new Error('La réponse du calendrier est incomplète. La copie précédente est conservée.');
    result.courses.forEach(course => { if (course.source !== result.source) throw new Error('La provenance des cours est incohérente.'); hydrateCourse(course); });
    result.courses = result.courses.map(repairCourseText);
    return result;
  })();
  inFlight.set(key, promise); try { return await promise; } finally { inFlight.delete(key); }
}
async function readSaved(id: string, start: string) {
  const key = `${id}:${start}`; if (snapshots.value[key]) return snapshots.value[key];
  try { const saved = await savedSnapshot(id, start); if (saved?.version === 1 && saved.groupId === id && validDay(saved.start) && saved.start === start && saved.end === addDay(start, 6) && Array.isArray(saved.courses)) { saved.courses.forEach(hydrateCourse); saved.courses = saved.courses.map(repairCourseText); snapshots.value[key] = saved; return saved; } }
  catch { storageError.value = 'Le stockage local est indisponible. Les cours restent consultables en ligne.'; }
}
async function updateSnapshot(id: string, start: string) {
  let before = await readSaved(id, start);
  const next = await fetchSnapshot(id, start);
  if (before?.source !== next.source) before = await savedSnapshot(id, start, next.source).catch(() => undefined);
  const changes = compareSnapshots(before, next);
  snapshots.value[`${id}:${start}`] = next;
  if (changes.length && selectedIds.value.includes(id)) history.value = [...new Map([...changes, ...history.value].map(item => [item.id, item])).values()].slice(0, 200);
  try { await saveSnapshot(next, changes); } catch { storageError.value = 'La copie hors ligne n’a pas pu être enregistrée. Libérez de l’espace puis actualisez.'; }
  return next;
}
// Resolve opening / Today using unfiltered courses and the normal cache policy.
export async function resolveTodayDate(id: string, today = campusDate(new Date())) {
  if (!isWeekend(today)) return today;
  const start = mondayOf(today);
  let snapshot = await readSaved(id, start);
  if (navigator.onLine && (!snapshot || Date.now() - Date.parse(snapshot.fetchedAt) > 60_000)) {
    try { snapshot = await updateSnapshot(id, start); } catch { /* Keep the saved week, or preserve today when unknown. */ }
  }
  return todayPlanningDate(today, snapshot?.courses);
}
let generation = 0;
export async function loadCalendar(force = false) {
  const current = ++generation, ids = [...selectedIds.value], start = week.value;
  if (!ids.length) return;
  loading.value = true; error.value = '';
  await Promise.all(ids.flatMap(id => [start, addDay(start, 7)].map(day => readSaved(id, day))));
  const localHistory = await Promise.all(ids.map(id => savedHistory(id).catch(() => [])));
  if (current !== generation) return;
  history.value = [...new Map([...history.value, ...localHistory.flat()].filter(item => ids.some(id => item.id.startsWith(id + ':'))).map(item => [item.id, item])).values()].sort((a, b) => b.detectedAt.localeCompare(a.detectedAt));
  if (!navigator.onLine) { online.value = false; loading.value = false; return; }
  const results = await Promise.allSettled(ids.map(async id => {
    const cached = snapshots.value[`${id}:${start}`];
    if (force || !cached || Date.now() - Date.parse(cached.fetchedAt) > 60_000) await updateSnapshot(id, start);
  }));
  if (current !== generation) return;
  online.value = navigator.onLine;
  const failed = results.find(item => item.status === 'rejected');
  if (failed?.status === 'rejected') error.value = navigator.onLine ? (failed.reason instanceof Error && failed.reason.name !== 'TimeoutError' ? failed.reason.message : 'Le calendrier met trop de temps à répondre. Réessayez.') : 'Connexion interrompue. Les copies enregistrées restent disponibles.';
  loading.value = false;
  // Prefetch never blocks the visible week. Respect data saver / slow connections.
  const network = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  if (!network?.saveData && !['slow-2g', '2g'].includes(network?.effectiveType ?? '')) {
    await Promise.allSettled(ids.map(id => updateSnapshot(id, addDay(start, 7))));
    const todayWeek = mondayOf(campusDate(new Date()));
    if (todayWeek !== start && todayWeek !== addDay(start, 7)) await Promise.allSettled(ids.flatMap(id => [todayWeek, addDay(todayWeek, 7)].map(day => updateSnapshot(id, day))));
  }
}
export const typeColors: Record<string, string> = { CM: '#b72c48', TD: '#24789d', TP: '#622fb5', DS: '#a32996', 'Projet Tutoré': '#08774f', Réunion: '#865d22', Entreprise: '#995008', inconnu: '#334155' };
const modulePalette = ['#622fb5', '#24789d', '#08774f', '#b72c48', '#865d22', '#a32996', '#334c83'];
export function courseColor(course: CourseDTO) {
  const key = preferences.value.colorMode === 'type' ? course.type : course.module;
  let hash = 0; for (const char of key) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return preferences.value.colors[`${preferences.value.colorMode}:${key}`] || (preferences.value.colorMode === 'type' ? typeColors[key] ?? typeColors.inconnu! : modulePalette[hash % modulePalette.length]!);
}
export function colorText(color: string) {
  const rgb = color.match(/[a-f0-9]{2}/gi)!.map(hex => { const v = parseInt(hex, 16) / 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; });
  const luminance = rgb[0]! * .2126 + rgb[1]! * .7152 + rgb[2]! * .0722;
  return (luminance + .05) / .05 > 1.05 / (luminance + .05) ? '#000000' : '#ffffff';
}
