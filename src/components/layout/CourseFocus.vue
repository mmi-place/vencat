<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, shallowRef, watch } from 'vue';
import { CalendarDaysIcon, ClockIcon, BookOpenIcon, TagIcon, MapPinIcon, UserIcon, UserGroupIcon, MagnifyingGlassIcon, ChevronLeftIcon, ChevronRightIcon, ArrowRightIcon } from '@heroicons/vue/24/outline';
import AccessibleDialog from '../AccessibleDialog.vue';
import { focused, selection, savedCourses, preferences, courseChanges, courseIdentity } from '../../scripts/calendarStore';
import { changeBadge, changeDetails, changeHeadline } from '../../../shared/changePresentation';
import { campusDate, campusTime, frenchDate, courseKey, isWeekend } from '../../../shared/calendar';
import type { CourseDTO } from '../../../shared/courses';
import { courseValues, type SearchCriterion, type SearchField } from '../../../shared/search';
import { courseDescription, type CourseCatalogue } from '../../../shared/catalogue';
import { loadCourseCatalogue } from '../../scripts/catalogue';
const emit = defineEmits<{ close: []; search: [criterion: SearchCriterion] }>();
const catalog = shallowRef<CourseCatalogue>();
watch(() => selection.value?.department, (department, _previous, onCleanup) => {
  let current = true;
  onCleanup(() => { current = false; });
  catalog.value = undefined;
  if (department) void loadCourseCatalogue(department, value => { if (current) catalog.value = value; });
}, { immediate: true });
const description = computed(() => focused.value ? courseDescription(catalog.value, focused.value) : '');
function find(field: SearchField, value: string) { emit('search', { field, value }); }
// A changed course says what changed, at the top of its window: old value → new value.
const change = computed(() => focused.value ? courseChanges.value.get(courseIdentity(focused.value)) : undefined);
const changeKind = computed(() => change.value ? changeBadge(change.value) : undefined);
const changeLines = computed(() => change.value && change.value.kind === 'changed' ? changeDetails(change.value) : []);
const detectedOn = computed(() => change.value ? new Date(change.value.detectedAt).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) : '');
// Previous / next course among the loaded weeks (buttons, or ← / → inside the window).
const ordered = computed(() => savedCourses.value.filter(course => preferences.value.weekend || !isWeekend(campusDate(course.start))));
const index = computed(() => focused.value ? ordered.value.findIndex(course => courseKey(course) === courseKey(focused.value!)) : -1);
const previous = computed(() => index.value > 0 ? ordered.value[index.value - 1] : undefined);
const next = computed(() => index.value >= 0 ? ordered.value[index.value + 1] : undefined);
const shortLabel = (course: CourseDTO) => frenchDate(campusDate(course.start), { weekday: 'short', day: 'numeric' }) + ' ' + campusTime(course.start) + ', ' + course.summary;
function keydown(event: KeyboardEvent) {
  const target = event.target as HTMLElement;
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || !target.closest?.('#course-dialog') || target.closest('input, select, textarea, [role="group"]')) return;
  const course = event.key === 'ArrowLeft' ? previous.value : event.key === 'ArrowRight' ? next.value : undefined;
  if (course) { event.preventDefault(); focused.value = course; }
}
onMounted(() => window.addEventListener('keydown', keydown));
onBeforeUnmount(() => window.removeEventListener('keydown', keydown));
const rows = computed(() => focused.value ? [
  { field: 'teacher' as const, label: 'Enseignant(s)', icon: UserIcon, values: courseValues(focused.value, 'teacher') },
  { field: 'room' as const, label: 'Salle', icon: MapPinIcon, values: courseValues(focused.value, 'room') },
  { field: 'group' as const, label: 'Groupe du cours', icon: UserGroupIcon, values: courseValues(focused.value, 'group') },
  { field: 'type' as const, label: 'Type de cours', icon: TagIcon, values: courseValues(focused.value, 'type') },
{ field: 'module' as const, label: 'Matière', icon: BookOpenIcon, values: focused.value.module ? [focused.value.module] : [] },
] : []);
</script>
<template><AccessibleDialog v-if="focused" id="course-dialog" :title="focused.summary" @close="emit('close')"><div class="course-detail">
  <div v-if="change" class="course-change" :class="'course-change-' + changeKind"><p class="course-change-title"><strong>{{ changeHeadline(change) }}</strong><span>le {{ detectedOn }}</span></p><ul v-if="changeLines.length"><li v-for="line in changeLines" :key="line.field"><span class="course-change-field">{{ line.field }}</span><del>{{ line.before }}</del><ArrowRightIcon aria-hidden="true" /><span class="sr-only">devient</span><strong>{{ line.after }}</strong></li></ul><p v-else class="course-change-note">Ce cours a été ajouté au planning.</p></div>
  <p v-if="description" class="module-description">{{ description }}</p>
  <div class="course-when"><p><CalendarDaysIcon aria-hidden="true" />{{ frenchDate(campusDate(focused.start)) }}</p><p><ClockIcon aria-hidden="true" />{{ campusTime(focused.start) }}–{{ campusTime(focused.end) }}</p></div>
  <dl class="course-detail-fields"><template v-for="row in rows" :key="row.field"><dt><component :is="row.icon" aria-hidden="true" />{{ row.label }}</dt><dd><button v-for="value in row.values" :key="value" class="detail-search-action" :aria-label="`Rechercher les cours : ${value}`" @click="find(row.field, value)"><span>{{ value }}</span><MagnifyingGlassIcon aria-hidden="true" /></button><span v-if="!row.values.length" class="muted">Non renseigné</span></dd></template></dl>
  <nav v-if="previous || next" class="course-stepper" aria-label="Autres cours"><button :disabled="!previous" :aria-label="previous ? 'Cours précédent : ' + shortLabel(previous) : 'Pas de cours précédent'" @click="focused = previous"><ChevronLeftIcon aria-hidden="true" />Précédent</button><button :disabled="!next" :aria-label="next ? 'Cours suivant : ' + shortLabel(next) : 'Pas de cours suivant'" @click="focused = next"><span>Suivant</span><ChevronRightIcon aria-hidden="true" /></button></nav>
</div></AccessibleDialog></template>
