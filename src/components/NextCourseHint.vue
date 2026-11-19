<script setup lang="ts">
import { computed, nextTick } from 'vue';
import { savedCourses, preferences, date } from '../scripts/calendarStore';
import { campusDate, campusTime, frenchDate, isWeekend } from '../../shared/calendar';
// Shown on an empty day or week: the first later course among the loaded weeks.
const props = defineProps<{ after: string }>();
const next = computed(() => savedCourses.value.find(course => {
  const day = campusDate(course.start);
  return day > props.after && (preferences.value.weekend || !isWeekend(day));
}));
const day = computed(() => next.value ? campusDate(next.value.start) : '');
const label = computed(() => day.value ? frenchDate(day.value, { weekday: 'long', day: 'numeric', month: 'long' }) : '');
// The button disappears with the empty day: keep keyboard focus on the planning, on the first course shown.
async function show() {
  const target = next.value?.start;
  date.value = day.value;
  await nextTick();
  (document.querySelector<HTMLElement>(`.course[data-course-start="${target}"]`) ?? document.getElementById('planning'))?.focus();
}
</script>
<template>
<p v-if="next" class="next-course">
  <span>Prochain cours : {{ label }} à {{ campusTime(next.start) }}</span>
  <button type="button" class="text-action" :aria-label="'Afficher le ' + label" @click="show">Afficher ce jour</button>
</p>
</template>
