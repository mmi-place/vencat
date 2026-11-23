<script setup lang="ts">
import { computed, ref, watch, onMounted, onBeforeUnmount, nextTick, useId } from 'vue';
import { MagnifyingGlassIcon, CalendarDaysIcon, ChevronRightIcon, UserIcon, MapPinIcon, UserGroupIcon, TagIcon, BookOpenIcon, FunnelIcon, XMarkIcon, EyeIcon } from '@heroicons/vue/24/outline';
import AccessibleDialog from './AccessibleDialog.vue';
import { works as allWorks, openedWork, section as appSection, travauxDay, travauxView } from '../scripts/travaux';
import { WORK_TYPES, WORK_TYPE_LABELS, type WorkType } from '../../shared/travaux';
import { normalizedText } from '../../shared/calendar';
import { savedCourses, selection, online, preferences } from '../scripts/calendarStore';
import { cachedSearchDataset, loadSearchDataset, planningSearch, type PlanningSearch } from '../scripts/searchStore';
import { searchWindow, rangeTTL, matchesCourse, coursesInWindow, searchFacets, type SearchCriterion, type SearchField, type SearchFilters } from '../../shared/search';
import type { CourseDTO } from '../../shared/courses';
import { addDay, campusDate, campusTime, frenchDate, courseKey, isWeekend } from '../../shared/calendar';

const props = defineProps<{ initial?: SearchCriterion }>();
const emit = defineEmits<{ close: []; open: [course: CourseDTO]; show: [search: PlanningSearch] }>();
const datesId = useId(), rangeErrorId = useId(), filtersId = useId();
const today = campusDate(new Date());
const academic = searchWindow('year', today);
const emptyCriteria = (): SearchFilters => ({ teacher: '', room: '', group: '', type: '', module: '' });
const query = ref(''), typed = ref(''), criteria = ref<SearchFilters>(emptyCriteria()), input = ref<HTMLInputElement>();
const includePast = ref(false), filtersOpen = ref(false);
const calendarOpen = ref(false), customDates = ref(false), start = ref(academic.start), end = ref(academic.end);
const busy = ref(false), error = ref(''), limit = ref(100);
const fields = [
  { id: 'teacher', label: 'Enseignant', short: 'Profs', icon: UserIcon },
  { id: 'room', label: 'Salle', short: 'Salles', icon: MapPinIcon },
  { id: 'group', label: 'Groupe', short: 'Groupes', icon: UserGroupIcon },
  { id: 'type', label: 'Type', short: 'Types', icon: TagIcon },
  { id: 'module', label: 'Matière', short: 'Matières', icon: BookOpenIcon },
] as const;

// Source: the downloaded school year (or the custom period), else the weeks saved on this device.
const range = computed(() => customDates.value && (start.value < academic.start || end.value > academic.end) ? { start: start.value, end: end.value } : undefined);
const dataset = ref(selection.value ? cachedSearchDataset(selection.value.id, range.value) : undefined);
const complete = computed(() => !!dataset.value);
const rangeError = computed(() => { try { rangeTTL(start.value, end.value); return ''; } catch { return 'Choisissez une date de début et de fin, sur 366 jours au maximum.'; } });
// By default: from the first course of today; past courses on request or with chosen dates.
const from = computed(() => customDates.value ? start.value : includePast.value ? academic.start : today);
const to = computed(() => customDates.value ? end.value : academic.end);
const scope = computed(() => rangeError.value ? [] : coursesInWindow(dataset.value?.courses ?? savedCourses.value, from.value, to.value)
  .filter(course => campusDate(course.start) >= from.value && (preferences.value.weekend || !isWeekend(campusDate(course.start)))));
const results = computed(() => scope.value.filter(course => matchesCourse(course, query.value, criteria.value)));
const options = computed(() => searchFacets(scope.value, query.value, criteria.value));
const hasCriteria = computed(() => !!query.value.trim() || Object.values(criteria.value).some(Boolean));
const chosen = computed(() => fields.filter(field => criteria.value[field.id]));
const groups = computed(() => {
  const list: { day: string; label: string; courses: CourseDTO[] }[] = [];
  for (const course of results.value.slice(0, limit.value)) {
    const day = campusDate(course.start);
    let group = list[list.length - 1];
    if (group?.day !== day) {
      const relative = day === today ? 'Aujourd’hui · ' : day === addDay(today, 1) ? 'Demain · ' : '';
      group = { day, label: relative + frenchDate(day, { weekday: 'long', day: 'numeric', month: 'long', ...(day.slice(0, 4) !== today.slice(0, 4) ? { year: 'numeric' } : {}) }), courses: [] };
      list.push(group);
    }
    group.courses.push(course);
  }
  return list;
});
const summary = computed(() => {
  const count = results.value.length, plural = count === 1 ? '' : 's';
  const when = customDates.value ? '' : includePast.value ? ' sur l’année' : ' à venir';
  return `${count} résultat${plural}${when}${complete.value ? '' : ' enregistré' + plural}`;
});

// Works appear in the same search, with a filter by type; "Voir sur le planning" opens their day in Travaux.
const workType = ref<WorkType | ''>('');
const workResults = computed(() => {
  const text = normalizedText(query.value);
  if (!text && !workType.value) return [];
  return allWorks.value.filter(work => work.state !== 'removed' && (!workType.value || work.type === workType.value) && (includePast.value || work.day >= today)
    && (!text || normalizedText([work.title, work.details.where, work.details.info, work.course?.summary ?? '', work.course?.module ?? ''].join(' ')).includes(text))).sort((a, b) => a.due.localeCompare(b.due)).slice(0, 20);
});
function showWork(id: string, day: string, open: boolean) { travauxDay.value = day; travauxView.value = 'planning'; appSection.value = 'travaux'; if (open) openedWork.value = id; emit('close'); }
async function load() {
  if (!selection.value || rangeError.value || !online.value) return;
  const id = selection.value.id, wanted = range.value;
  busy.value = !dataset.value; error.value = '';
  try {
    const loaded = await loadSearchDataset(id, today, wanted);
    if (selection.value?.id === id && JSON.stringify(range.value) === JSON.stringify(wanted)) dataset.value = loaded;
  } catch (reason) { error.value = reason instanceof Error ? reason.message : 'Impossible de rechercher pour le moment.'; }
  finally { busy.value = false; }
}
function applyCriterion(criterion?: SearchCriterion) {
  if (criterion) { typed.value = query.value = ''; criteria.value = { ...emptyCriteria(), [criterion.field]: criterion.value }; }
}
applyCriterion(props.initial);
// Reopened from the planning: the search shown there is restored.
if (!props.initial && planningSearch.value) { typed.value = query.value = planningSearch.value.query; criteria.value = { ...emptyCriteria(), ...planningSearch.value.filters }; }
watch(() => props.initial, value => { applyCriterion(value); nextTick(() => input.value?.focus()); });
// Typing is debounced only to keep filtering smooth; nothing is sent to the server.
let delay: ReturnType<typeof setTimeout> | undefined;
watch(typed, value => { if (delay) clearTimeout(delay); delay = setTimeout(() => { query.value = value; }, 120); });
watch([query, criteria, from, to], () => { limit.value = 100; }, { deep: true });
watch(() => JSON.stringify(range.value), () => { dataset.value = selection.value ? cachedSearchDataset(selection.value.id, range.value) : undefined; void load(); });
function resetDates() { customDates.value = false; start.value = academic.start; end.value = academic.end; calendarOpen.value = false; }
function clear() { typed.value = query.value = ''; criteria.value = emptyCriteria(); resetDates(); input.value?.focus(); }
function removeCriterion(field: SearchField) { criteria.value[field] = ''; input.value?.focus(); }
function missingOption(field: SearchField) { return criteria.value[field] && !options.value[field].some(item => item.value === criteria.value[field]); }
function showOnPlanning() {
  const label = [query.value.trim() && `« ${query.value.trim()} »`, ...chosen.value.map(field => criteria.value[field.id])].filter(Boolean).join(' · ');
  emit('show', { label, query: query.value, filters: { ...criteria.value }, days: [...new Set(results.value.map(course => campusDate(course.start)))], count: results.value.length });
}
function retry() { if (selection.value) void load(); }
onMounted(() => { nextTick(() => input.value?.focus()); void load(); window.addEventListener('online', retry); });
onBeforeUnmount(() => { if (delay) clearTimeout(delay); window.removeEventListener('online', retry); });
</script>
<template>
<AccessibleDialog id="search-dialog" title="Recherche" wide kind="search" @close="emit('close')">
  <div class="search-dialog-layout">
    <form class="search-dialog-tools" role="search" @submit.prevent="hasCriteria && results.length && showOnPlanning()">
      <div class="search-dialog-bar">
        <label class="search-field"><MagnifyingGlassIcon aria-hidden="true" /><span class="sr-only">Rechercher un cours</span><input ref="input" v-model="typed" autofocus type="search" enterkeyhint="search" placeholder="Matière, prof, salle, module…" autocomplete="off" /></label>
        <button type="button" class="icon-button quiet search-filters-toggle" :aria-expanded="filtersOpen" :aria-controls="filtersId" :aria-label="'Filtres' + (chosen.length ? ', ' + chosen.length + ' actifs' : '')" @click="filtersOpen = !filtersOpen"><FunnelIcon aria-hidden="true" /><span v-if="chosen.length" class="filter-count" aria-hidden="true">{{ chosen.length }}</span></button>
        <button type="button" class="icon-button quiet" aria-label="Choisir les dates de recherche" :aria-expanded="calendarOpen" :aria-controls="calendarOpen ? datesId : undefined" :aria-pressed="customDates" @click="calendarOpen = !calendarOpen"><CalendarDaysIcon aria-hidden="true" /></button>
      </div>
      <fieldset v-if="calendarOpen" :id="datesId" class="search-date-picker"><legend>Dates de recherche</legend><label>Du<input v-model="start" type="date" :aria-invalid="!!rangeError" :aria-describedby="rangeError ? rangeErrorId : undefined" @change="customDates = true" /></label><label>Au<input v-model="end" type="date" :aria-invalid="!!rangeError" :aria-describedby="rangeError ? rangeErrorId : undefined" @change="customDates = true" /></label><button type="button" class="text-action" @click="resetDates">Revenir à l’année scolaire</button></fieldset>
      <p v-if="rangeError" :id="rangeErrorId" role="alert" class="notice">{{ rangeError }}</p>
      <p v-else-if="customDates" class="search-chosen-dates muted">{{ frenchDate(start, { day: 'numeric', month: 'short', year: 'numeric' }) }} – {{ frenchDate(end, { day: 'numeric', month: 'short', year: 'numeric' }) }}</p>
      <div :id="filtersId" class="search-filters" :class="{ open: filtersOpen }">
        <div class="search-facet-bar" role="group" aria-label="Critères de recherche"><label v-for="field in fields" :key="field.id" class="search-facet" :class="{ chosen: criteria[field.id] }"><component :is="field.icon" aria-hidden="true" /><select v-model="criteria[field.id]" :aria-label="field.label"><option value="">{{ field.short }}</option><option v-if="missingOption(field.id)" :value="criteria[field.id]">{{ criteria[field.id] }}</option><option v-for="option in options[field.id]" :key="option.value" :value="option.value">{{ option.label }} ({{ option.count }})</option></select></label></div>
        <label v-if="!customDates" class="check-label search-past"><input v-model="includePast" type="checkbox">Inclure les cours passés</label>
      </div>
      <ul v-if="chosen.length" class="search-chips" aria-label="Filtres actifs"><li v-for="field in chosen" :key="field.id"><button type="button" class="search-chip" :aria-label="`Retirer le filtre ${field.label} : ${criteria[field.id]}`" @click="removeCriterion(field.id)"><component :is="field.icon" aria-hidden="true" /><span>{{ criteria[field.id] }}</span><XMarkIcon aria-hidden="true" /></button></li></ul>
      <div class="search-result-summary"><p role="status" class="muted">{{ summary }}{{ busy ? ' · Chargement de l’année…' : '' }}</p><div class="search-actions"><button v-if="hasCriteria || customDates" type="button" class="text-action" @click="clear">Effacer</button><button v-if="hasCriteria && results.length" type="submit" class="show-on-planning"><EyeIcon aria-hidden="true" />Voir sur le planning</button></div></div>
    </form>
    <div class="compact-search-results" :aria-busy="busy">
      <p v-if="!online" class="muted search-message">Hors ligne : recherche dans les semaines enregistrées.</p>
      <p v-if="error" role="alert" class="notice">{{ error }} <button @click="retry">Réessayer</button></p>
      <div v-if="busy && !results.length" class="search-skeleton" role="status"><span class="sr-only">Chargement des cours de l’année…</span><div v-for="n in 5" :key="n" class="search-skeleton-row"><span></span><span></span></div></div>
      <section v-if="allWorks.length && (query.trim() || workType)" class="search-day search-works" aria-label="Travaux">
        <h3 class="search-day-heading">Travaux · {{ workResults.length }}</h3>
        <div class="filter-chips" role="group" aria-label="Type de travail"><button v-for="type in WORK_TYPES" :key="type" type="button" :class="'filter-' + type" :aria-pressed="workType === type" @click="workType = workType === type ? '' : type">{{ WORK_TYPE_LABELS[type] }}</button></div>
        <ol class="compact-result-list"><li v-for="work in workResults" :key="work.id" class="work-search-result"><button class="compact-search-result" :class="'type-' + work.type" @click="showWork(work.id, work.day, true)"><span class="result-kind">{{ WORK_TYPE_LABELS[work.type] }}</span><strong>{{ work.title }}</strong><span class="muted">{{ frenchDate(work.day, { weekday: 'short', day: 'numeric', month: 'short' }) }} · {{ work.time }} · {{ work.scopeLabel }}</span></button><button class="text-action" type="button" @click="showWork(work.id, work.day, false)">Voir sur le planning</button></li></ol>
      </section>
      <section v-for="group in groups" :key="group.day" class="search-day" :aria-label="group.label">
        <h3 class="search-day-heading" :class="{ today: group.day === today }">{{ group.label }}</h3>
        <ol class="compact-result-list"><li v-for="course in group.courses" :key="courseKey(course)"><button class="compact-search-result" aria-haspopup="dialog" :aria-label="`${course.summary}, ${course.type}, ${campusTime(course.start)} à ${campusTime(course.end)}, ${course.location || 'salle non renseignée'}`" @click="emit('open', course)"><span class="result-kind">{{ course.type === 'inconnu' ? 'Cours' : course.type }}</span><strong class="result-title">{{ course.summary }}</strong><span class="result-room">{{ course.location || '—' }}</span><ChevronRightIcon aria-hidden="true" /><span class="result-date">{{ campusTime(course.start) }}–{{ campusTime(course.end) }}</span></button></li></ol>
      </section>
      <p v-if="!results.length && !busy && !rangeError" class="muted search-message">{{ includePast || customDates ? 'Aucun cours ne correspond.' : 'Aucun cours à venir ne correspond. Essayez d’inclure les cours passés.' }}</p>
      <button v-if="results.length > limit" class="more-results" @click="limit += 100">Afficher la suite</button>
    </div>
  </div>
</AccessibleDialog>
</template>
