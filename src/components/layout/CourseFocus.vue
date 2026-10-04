<script setup lang="ts">
import { computed, shallowRef, watch } from 'vue';
import { CalendarDaysIcon, ClockIcon, BookOpenIcon, TagIcon, MapPinIcon, UserIcon, UserGroupIcon, MagnifyingGlassIcon } from '@heroicons/vue/24/outline';
import AccessibleDialog from '../AccessibleDialog.vue';
import { focused, selection } from '../../scripts/calendarStore';
import { campusDate, campusTime, frenchDate } from '../../../shared/calendar';
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
const rows = computed(() => focused.value ? [
  { field: 'module' as const, label: 'Matière', icon: BookOpenIcon, values: focused.value.module ? [focused.value.module] : [] },
  { field: 'type' as const, label: 'Type de cours', icon: TagIcon, values: courseValues(focused.value, 'type') },
  { field: 'room' as const, label: 'Salle', icon: MapPinIcon, values: courseValues(focused.value, 'room') },
  { field: 'teacher' as const, label: 'Enseignant', icon: UserIcon, values: courseValues(focused.value, 'teacher') },
  { field: 'group' as const, label: 'Groupe du cours', icon: UserGroupIcon, values: courseValues(focused.value, 'group') },
] : []);
</script>
<template><AccessibleDialog v-if="focused" :title="focused.summary" @close="emit('close')"><div class="course-detail">
  <p v-if="description" class="module-description">{{ description }}</p>
  <div class="course-when"><p><CalendarDaysIcon aria-hidden="true" />{{ frenchDate(campusDate(focused.start)) }}</p><p><ClockIcon aria-hidden="true" />{{ campusTime(focused.start) }}–{{ campusTime(focused.end) }}</p></div>
  <dl class="course-detail-fields"><template v-for="row in rows" :key="row.field"><dt><component :is="row.icon" aria-hidden="true" />{{ row.label }}</dt><dd><button v-for="value in row.values" :key="value" class="detail-search-action" :aria-label="`Rechercher les cours : ${value}`" @click="find(row.field, value)"><span>{{ value }}</span><MagnifyingGlassIcon aria-hidden="true" /></button><span v-if="!row.values.length" class="muted">Non renseigné</span></dd></template></dl>
</div></AccessibleDialog></template>
