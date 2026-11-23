import { ref, watch } from 'vue';
import { readPreference, writePreference } from '../storage';
import { campusDate, mondayOf } from '../../../shared/calendar';
import type { CourseDTO } from '../../../shared/courses';
import type { WorkType, WorkView, ScopeKind } from '../../../shared/travaux';

// Links opened from outside (ICS, mails, QR codes) are read before the router rewrites the address.
const launch = new URLSearchParams(location.search);
export const launchLinks: { work?: string; qr?: { id: string; number: number }; connexion?: string; magic?: { r: string; t: string } } = { magic: launch.get('lien') && launch.get('t') ? { r: launch.get('lien')!, t: launch.get('t')! } : undefined, work: launch.get('travail') ?? undefined, qr: launch.get('qr') ? { id: launch.get('qr')!, number: Number(launch.get('n')) } : undefined, connexion: launch.get('connexion') ?? undefined };
/** QR code of another device to approve (opened from its link or scanned in the app). */
export const qrRequest = ref(launchLinks.qr);

// Section shown (Cours | Travaux) and Travaux view, remembered like the timetable view.
export type Section = 'cours' | 'travaux';
export const section = ref<Section>(readPreference<Section>('vencat:section', 'cours') === 'travaux' ? 'travaux' : 'cours');
watch(section, value => writePreference('vencat:section', value));
export type TravauxView = 'planning' | 'liste';
export const travauxView = ref<TravauxView>(readPreference<TravauxView>('vencat:travaux-view', 'planning') === 'liste' ? 'liste' : 'planning');
watch(travauxView, value => writePreference('vencat:travaux-view', value));
export const toggleSection = () => { section.value = section.value === 'cours' ? 'travaux' : 'cours'; };
export interface TravauxFilters { types: WorkType[]; scope: '' | ScopeKind; pending: boolean; hideDone: boolean }
const savedFilters = readPreference<Partial<TravauxFilters>>('vencat:travaux-filters', {});
export const filters = ref<TravauxFilters>({ types: Array.isArray(savedFilters.types) ? savedFilters.types : [], scope: savedFilters.scope ?? '', pending: !!savedFilters.pending, hideDone: !!savedFilters.hideDone });
watch(filters, value => writePreference('vencat:travaux-filters', value), { deep: true });

// Dialogs of the section, opened from several places.
export const ui = ref({ login: false, account: false, queue: false, delegates: false, moderation: false, cgu: false, ics: false });
export const openedWork = ref<string>();
export interface FormRequest { mode: 'create' | 'edit' | 'ds'; work?: WorkView; day?: string; course?: CourseDTO; type?: WorkType }
export const form = ref<FormRequest>();
/** Short message at the bottom of the screen (sync results, session changes). */
export const toast = ref('');
let toastTimer: ReturnType<typeof setTimeout> | undefined;
export function notify(message: string, duration = 4500) { toast.value = message; clearTimeout(toastTimer); toastTimer = setTimeout(() => { toast.value = ''; }, duration); }

// Layout: on wide screens Travaux shows the agenda (70 %) and the selected day (30 %), where works open.
const wideQuery = matchMedia('(min-width: 1024px)');
export const wide = ref(wideQuery.matches);
wideQuery.addEventListener('change', event => { wide.value = event.matches; });
/** Day selected in Travaux. */
export const travauxDay = ref(campusDate(new Date()));
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
