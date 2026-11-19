import { computed, ref, watch } from 'vue';
import { hydrateCourse, repairCourseText, type CourseDTO } from '../../shared/courses';
import { addDay, campusDate, mondayOf, normalizedText, validDay, isWeekend, todayPlanningDate, hourBounds, mergeHours, type HourRange } from '../../shared/calendar';
import { compareSnapshots, type Snapshot, type CourseChange } from '../../shared/changes';
import { groupById, type GroupOption } from '../../shared/selection';
import { readPreference, writePreference, savedSnapshot, savedHistory, saveSnapshot } from './storage';
import { resolveBackground, type Background, type Theme } from './appearance';
import { searchWindow } from '../../shared/search';

export type CalendarView = 'list' | 'day' | 'week';
export const calendarViews: readonly CalendarView[] = ['list', 'day', 'week'];
export const isCalendarView = (value: unknown): value is CalendarView => calendarViews.includes(value as CalendarView);
/** View shown when the app opens: the last one used, or a fixed one. */
export type StartView = 'last' | CalendarView;
export interface Preferences {
  density: 'compact' | 'full'; colorMode: 'type' | 'module'; colors: Record<string, string>; background: Background; theme: Theme; refresh: boolean;
  view: CalendarView; startView: StartView; weekend: boolean;
}
// Older saved preferences lack the newest fields: each one falls back to its default.
const initial = readPreference<Partial<Preferences>>('vencat:preferences', {});
export const preferences = ref<Preferences>({
  density: initial?.density === 'full' || String(initial?.density) === 'detailed' ? 'full' : 'compact',
  colorMode: initial?.colorMode === 'module' ? 'module' : 'type',
  colors: initial?.colors && typeof initial.colors === 'object' ? Object.fromEntries(Object.entries(initial.colors).filter(([, value]) => typeof value === 'string' && /^#[a-f0-9]{6}$/i.test(value))) : {},
  theme: ['dark', 'light', 'system'].includes(String(initial?.theme)) ? initial!.theme! : 'dark',
  background: resolveBackground(initial?.background), refresh: initial?.refresh !== false,
  view: isCalendarView(initial?.view) ? initial.view : 'list',
  startView: initial?.startView === 'last' || isCalendarView(initial?.startView) ? initial.startView : 'last',
  weekend: initial?.weekend === true,
});
watch(preferences, value => writePreference('vencat:preferences', value), { deep: true });
export const startupView = (): CalendarView => preferences.value.startView === 'last' ? preferences.value.view : preferences.value.startView;
export const selection = ref<GroupOption>();
export const date = ref(campusDate(new Date()));
export const clock = ref(new Date());
export const view = ref<CalendarView>(startupView());
// A view imposed by a shared link is shown without replacing the one the person last chose.
let skipRemember = false;
watch(view, value => { if (skipRemember) skipRemember = false; else preferences.value.view = value; });
export function showLinkedView(value: CalendarView) {
  if (value === view.value) return;
  skipRemember = true;
  view.value = value;
}
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
// A copy younger than this is shown without asking the server again (the refresh button bypasses it).
export const FRESH_MS = 5 * 60_000;
const stale = (snapshot?: Snapshot) => !snapshot || Date.now() - Date.parse(snapshot.fetchedAt) > FRESH_MS;
// Resolve opening / Today using unfiltered courses and the normal cache policy.
export async function resolveTodayDate(id: string, today = campusDate(new Date())) {
  if (!isWeekend(today) || !preferences.value.weekend) return todayPlanningDate(today, undefined, preferences.value.weekend);
  const start = mondayOf(today);
  let snapshot = await readSaved(id, start);
  if (navigator.onLine && stale(snapshot)) {
    try { snapshot = await updateSnapshot(id, start); } catch { /* Keep the saved week, or preserve today when unknown. */ }
  }
  return todayPlanningDate(today, snapshot?.courses);
}

// Earliest and latest hours of the school year, per group. Saved on the device and refreshed weekly.
interface SavedHours { hours: HourRange | null; savedAt: number; yearStart: string }
const HOURS_MAX_AGE = 7 * 86400_000, HOURS_RETRY = 30 * 60_000;
export const yearHours = ref<Record<string, HourRange | undefined>>({});
const hoursAttempts = new Map<string, number>();
function validHours(value: unknown): value is HourRange {
  if (!value || typeof value !== 'object') return false;
  const { start, end } = value as HourRange;
  return Number.isInteger(start) && Number.isInteger(end) && start >= 0 && end <= 1440 && start < end;
}
export async function loadYearHours(id: string) {
  const key = `vencat:hours:${id}`, saved = readPreference<SavedHours | null>(key, null);
  // Hours of a previous school year are dropped as soon as a new one starts.
  const yearStart = searchWindow('year', campusDate(new Date())).start;
  const current = saved?.yearStart === yearStart ? saved : undefined;
  if (current && validHours(current.hours)) yearHours.value[id] = current.hours;
  if (current && Date.now() - current.savedAt < HOURS_MAX_AGE || !navigator.onLine) return;
  // One attempt at a time, and a failure waits before trying again (no retry on every week change).
  if (Date.now() - (hoursAttempts.get(id) ?? 0) < HOURS_RETRY) return;
  hoursAttempts.set(id, Date.now());
  try {
    const response = await fetch(`/api/hours/${encodeURIComponent(id)}`, { signal: AbortSignal.timeout(60_000) });
    if (!response.ok) return;
    const data = await response.json() as { groupId: string; start: string; hours: HourRange | null };
    if (data.groupId !== id || data.hours !== null && !validHours(data.hours)) return;
    if (data.hours) yearHours.value[id] = data.hours;
    writePreference(key, { hours: data.hours, savedAt: Date.now(), yearStart: data.start } satisfies SavedHours);
  } catch { /* The loaded weeks still define a usable range. */ }
}
// Year bounds, widened by any loaded course outside them so nothing is ever cut.
export const visibleHours = computed(() => mergeHours(...selectedIds.value.map(id => yearHours.value[id]), hourBounds(savedCourses.value)));

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
    if (force || stale(snapshots.value[`${id}:${start}`])) await updateSnapshot(id, start);
  }));
  if (current !== generation) return;
  online.value = navigator.onLine;
  const failed = results.find(item => item.status === 'rejected');
  if (failed?.status === 'rejected') error.value = navigator.onLine ? (failed.reason instanceof Error && failed.reason.name !== 'TimeoutError' ? failed.reason.message : 'Le calendrier met trop de temps à répondre. Réessayez.') : 'Connexion interrompue. Les copies enregistrées restent disponibles.';
  loading.value = false;
  // Prefetch never blocks the visible week. Respect data saver / slow connections.
  const network = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  ids.forEach(id => void loadYearHours(id));
  if (!network?.saveData && !['slow-2g', '2g'].includes(network?.effectiveType ?? '')) {
    // Only weeks whose copy is missing or stale are requested again.
    const todayWeek = mondayOf(campusDate(new Date()));
    const weeks = [...new Set([addDay(start, 7), todayWeek, addDay(todayWeek, 7)])].filter(day => day !== start);
    const pairs = ids.flatMap(id => weeks.map(day => ({ id, day })));
    await Promise.all(pairs.map(({ id, day }) => readSaved(id, day)));
    if (current !== generation) return;
    await Promise.allSettled(pairs.filter(({ id, day }) => stale(snapshots.value[`${id}:${day}`])).map(({ id, day }) => updateSnapshot(id, day)));
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
