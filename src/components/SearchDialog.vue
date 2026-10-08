<script setup lang="ts">
import { computed, ref, watch, onMounted, onBeforeUnmount, nextTick, useId } from 'vue';
import { MagnifyingGlassIcon, CalendarDaysIcon, ChevronRightIcon, UserIcon, MapPinIcon, UserGroupIcon, TagIcon, BookOpenIcon } from '@heroicons/vue/24/outline';
import AccessibleDialog from './AccessibleDialog.vue';
import { savedCourses, selection, online, date } from '../scripts/calendarStore';
import { searchWindow, rangeTTL, matchesCourse, coursesInWindow, searchFacets, type SearchCriterion, type SearchFacets, type SearchField, type SearchFilters } from '../../shared/search';
import { hydrateCourse, repairCourseText, type CourseDTO } from '../../shared/courses';
import { campusDate, campusTime, frenchDate, courseKey } from '../../shared/calendar';

const props = defineProps<{ initial?: SearchCriterion }>();
const emit = defineEmits<{ close: []; open: [course: CourseDTO] }>();
const datesId = useId(), rangeErrorId = useId();
const academic = searchWindow('year', date.value);
const emptyCriteria = (): SearchFilters => ({ teacher: '', room: '', group: '', type: '', module: '' });
const query = ref(''), criteria = ref<SearchFilters>(emptyCriteria()), input = ref<HTMLInputElement>();
const calendarOpen = ref(false), customDates = ref(false), start = ref(academic.start), end = ref(academic.end);
const busy = ref(false), complete = ref(false), error = ref(''), remote = ref<CourseDTO[]>([]), limit = ref(100);
const indexVersion = ref(''), facetsVersion = ref('');
const options = ref<SearchFacets>(searchFacets(coursesInWindow(savedCourses.value, start.value, end.value)));
const fields = [
  { id: 'teacher', label: 'Enseignants', short: 'Profs', icon: UserIcon },
  { id: 'room', label: 'Salles', short: 'Salles', icon: MapPinIcon },
  { id: 'group', label: 'Groupes du cours', short: 'Groupes', icon: UserGroupIcon },
  { id: 'type', label: 'Types de cours', short: 'Types', icon: TagIcon },
  { id: 'module', label: 'Matières', short: 'Matières', icon: BookOpenIcon },
] as const;
const rangeError = computed(() => { try { rangeTTL(start.value, end.value); return ''; } catch { return 'Choisissez une date de début et de fin, sur 366 jours au maximum.'; } });
const local = computed(() => rangeError.value ? [] : coursesInWindow(savedCourses.value, start.value, end.value).filter(course => matchesCourse(course, query.value, criteria.value)));
const results = computed(() => complete.value ? remote.value : local.value);
const visible = computed(() => results.value.slice(0, limit.value));
const hasCriteria = computed(() => !!query.value || Object.values(criteria.value).some(Boolean) || customDates.value);
let request: AbortController | undefined, delay: ReturnType<typeof setTimeout> | undefined, poll: ReturnType<typeof setInterval>;
function applyCriterion(criterion?: SearchCriterion) {
  if (criterion) { query.value = ''; criteria.value = { ...emptyCriteria(), [criterion.field]: criterion.value }; }
}
applyCriterion(props.initial);
watch(() => props.initial, value => { applyCriterion(value); nextTick(() => input.value?.focus()); });
function resetDates() { customDates.value = false; start.value = academic.start; end.value = academic.end; calendarOpen.value = false; }
function clear() { query.value = ''; criteria.value = emptyCriteria(); resetDates(); input.value?.focus(); }
function missingOption(field: SearchField) { return criteria.value[field] && !options.value[field].some(item => item.value === criteria.value[field]); }
async function perform() {
  if (delay) clearTimeout(delay);
  request?.abort();
  if (!selection.value || rangeError.value || !online.value) { busy.value = false; complete.value = false; return; }
  const active = new AbortController(); request = active;
  busy.value = true; error.value = '';
  const id = selection.value.id;
  const params = new URLSearchParams({ q: query.value.trim(), date: date.value, ...criteria.value });
  if (customDates.value) { params.set('start', start.value); params.set('end', end.value); }
  try {
    const response = await fetch(`/api/search/${id}?${params}`, { signal: AbortSignal.any([active.signal, AbortSignal.timeout(120000)]), cache: 'no-cache' });
    if (!response.ok) throw new Error(response.status === 429 ? 'Trop de recherches. Réessayez dans quelques minutes.' : 'La recherche est indisponible. Les cours enregistrés restent accessibles.');
    const data = await response.json() as { groupId: string; start: string; end: string; version: string; facetsVersion: string; facets: SearchFacets; courses: CourseDTO[] };
    if (data.groupId !== id || data.start !== start.value || data.end !== end.value || !Array.isArray(data.courses) || typeof data.version !== 'string' || typeof data.facetsVersion !== 'string' || !fields.every(field => Array.isArray(data.facets?.[field.id]))) throw new Error('La réponse de recherche est incomplète.');
    data.courses.forEach(hydrateCourse);
    data.courses = data.courses.map(repairCourseText);
    if (active.signal.aborted) return;
    if (facetsVersion.value !== data.facetsVersion || indexVersion.value !== data.version) {
      options.value = data.facets; facetsVersion.value = data.facetsVersion; indexVersion.value = data.version;
    }
    remote.value = data.courses; complete.value = true;
  } catch (reason) { if (!active.signal.aborted) error.value = reason instanceof Error ? reason.message : 'Impossible de rechercher pour le moment.'; }
  finally { if (request === active) busy.value = false; }
}
watch([query, criteria, start, end, customDates], () => {
  request?.abort(); busy.value = false; complete.value = false; remote.value = []; limit.value = 100; error.value = '';
  if (delay) clearTimeout(delay);
  delay = setTimeout(perform, 350);
}, { deep: true });
function refresh() { if (!document.hidden && !busy.value) perform(); }
onMounted(() => { nextTick(() => input.value?.focus()); perform(); poll = setInterval(refresh, 60000); document.addEventListener('visibilitychange', refresh); window.addEventListener('online', refresh); });
onBeforeUnmount(() => { request?.abort(); if (delay) clearTimeout(delay); clearInterval(poll); document.removeEventListener('visibilitychange', refresh); window.removeEventListener('online', refresh); });
</script>
<template>
<AccessibleDialog id="search-dialog" title="Recherche" wide kind="search" @close="emit('close')">
  <div class="search-dialog-layout">
    <form class="search-dialog-tools" role="search" @submit.prevent="perform">
      <div class="search-dialog-bar"><label class="search-field"><MagnifyingGlassIcon aria-hidden="true" /><span class="sr-only">Rechercher un cours</span><input ref="input" autofocus v-model="query" type="search" placeholder="Matière, prof, salle, module…" autocomplete="off" /></label><button type="button" class="icon-button quiet" aria-label="Choisir les dates de recherche" :aria-expanded="calendarOpen" :aria-controls="calendarOpen ? datesId : undefined" :aria-pressed="customDates" @click="calendarOpen = !calendarOpen"><CalendarDaysIcon aria-hidden="true" /></button></div>
      <fieldset v-if="calendarOpen" :id="datesId" class="search-date-picker"><legend>Dates de recherche</legend><label>Du<input v-model="start" type="date" :aria-invalid="!!rangeError" :aria-describedby="rangeError ? rangeErrorId : undefined" @change="customDates = true" /></label><label>Au<input v-model="end" type="date" :aria-invalid="!!rangeError" :aria-describedby="rangeError ? rangeErrorId : undefined" @change="customDates = true" /></label><button type="button" class="text-action" @click="resetDates">Toute l’année scolaire</button></fieldset>
      <p v-if="rangeError" :id="rangeErrorId" role="alert" class="notice">{{ rangeError }}</p>
      <p v-else-if="customDates" class="search-chosen-dates muted">{{ frenchDate(start, { day: 'numeric', month: 'short', year: 'numeric' }) }} – {{ frenchDate(end, { day: 'numeric', month: 'short', year: 'numeric' }) }}</p>
      <div class="search-facet-bar" role="group" aria-label="Critères de recherche"><label v-for="field in fields" :key="field.id" class="search-facet" :class="{ chosen: criteria[field.id] }"><component :is="field.icon" aria-hidden="true" /><span class="sr-only">{{ field.label }}</span><select v-model="criteria[field.id]" :aria-label="field.label"><option value="">{{ field.short }}</option><option v-if="missingOption(field.id)" :value="criteria[field.id]">{{ criteria[field.id] }}</option><option v-for="option in options[field.id]" :key="option.value" :value="option.value">{{ option.label }} ({{ option.count }})</option></select></label></div>
      <div class="search-result-summary"><p role="status" class="muted">{{ results.length }} résultat{{ results.length === 1 ? '' : 's' }}{{ !complete && results.length ? ' locaux' : '' }}{{ busy ? ' · Recherche…' : '' }}</p><button v-if="hasCriteria" type="button" class="text-action" @click="clear">Effacer</button></div>
    </form>
    <div class="compact-search-results" :aria-busy="busy">
      <p v-if="!online" class="muted search-message">Hors ligne : recherche dans les semaines enregistrées.</p>
      <p v-if="error" role="alert" class="notice">{{ error }} <button @click="perform">Réessayer</button></p>
      <div v-if="busy && !visible.length" class="search-skeleton" role="status"><span class="sr-only">Recherche des cours…</span><div v-for="n in 5" :key="n" class="search-skeleton-row"><span></span><span></span></div></div>
      <ol v-if="visible.length" class="compact-result-list"><li v-for="course in visible" :key="courseKey(course)"><button class="compact-search-result" aria-haspopup="dialog" :aria-label="`${course.summary}, ${frenchDate(campusDate(course.start))}, ${campusTime(course.start)}, ${course.location}`" @click="emit('open', course)"><span class="result-kind">{{ course.type }}</span><strong class="result-title">{{ course.summary }}</strong><span class="result-room">{{ course.location || '—' }}</span><ChevronRightIcon aria-hidden="true" /><span class="result-date">{{ frenchDate(campusDate(course.start), { weekday: 'short', day: 'numeric', month: 'short' }) }} · {{ campusTime(course.start) }}–{{ campusTime(course.end) }}</span></button></li></ol>
      <p v-if="!visible.length && !busy && !rangeError" class="muted search-message">Aucun cours ne correspond. Essayez une autre matière, un autre critère ou d’autres dates.</p>
      <button v-if="results.length > limit" class="more-results" @click="limit += 100">Afficher la suite</button>
    </div>
  </div>
</AccessibleDialog>
</template>
