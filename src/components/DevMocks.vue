<script setup lang="ts">
// Development only (never built into production): fake changes on upcoming courses,
// to try the badges at every level and the notification centre.
import { ref, watch } from 'vue';
import { history, savedCourses, selection, preferences } from '../scripts/calendarStore';
import { addDay, campusDate, isWeekend } from '../../shared/calendar';
import type { CourseChange } from '../../shared/changes';
import type { CourseDTO } from '../../shared/courses';

const KEY = 'vencat:dev-mocks';
const enabled = ref(localStorage.getItem(KEY) === '1');
const isMock = (change: CourseChange) => change.id.includes(':mock:');
const shift = (value: string, hours: number) => new Date(Date.parse(value) + hours * 3600_000).toISOString();

function mocks(): CourseChange[] {
  const id = selection.value?.id, today = campusDate(new Date());
  if (!id) return [];
  // One course on or after today, +1, +3, +5, +7 and +9 days: one per badge level.
  const plan = [[0, 'moved'], [1, 'changed'], [3, 'added'], [5, 'changed'], [7, 'moved'], [9, 'added']] as const;
  const used = new Set<CourseDTO>(), result: CourseChange[] = [];
  plan.forEach(([offset, kind], index) => {
    const after = savedCourses.value.find(course => campusDate(course.start) >= addDay(today, offset) && Date.parse(course.end) > Date.now() && (preferences.value.weekend || !isWeekend(campusDate(course.start))) && !used.has(course));
    if (!after) return;
    used.add(after);
    const before = kind === 'moved' ? { ...after, start: shift(after.start, -24), end: shift(after.end, -24) }
      : kind === 'changed' ? { ...after, location: 'E57 - VEL', rooms: ['E57 - VEL'], teachers: ['Ancien enseignant'] } : undefined;
    result.push({ id: `${id}:mock:${index}`, detectedAt: new Date(Date.now() - index * 3600_000).toISOString(), kind: kind === 'added' ? 'added' : 'changed', before, after, fields: kind === 'moved' ? ['Horaires'] : kind === 'changed' ? ['Salle', 'Enseignant'] : [] });
  });
  return result;
}
function apply() {
  const others = history.value.filter(change => !isMock(change));
  history.value = enabled.value ? [...mocks(), ...others] : others;
}
function toggle() { enabled.value = !enabled.value; localStorage.setItem(KEY, enabled.value ? '1' : '0'); apply(); }
// Mocks follow the loaded weeks and survive reloads while enabled.
watch([savedCourses, selection], () => { if (enabled.value && !history.value.some(isMock)) apply(); });
</script>
<template>
<button class="dev-mocks" type="button" :aria-pressed="enabled" @click="toggle">{{ enabled ? 'Retirer les changements de test' : 'Simuler des changements (dev)' }}</button>
</template>
<style scoped>
.dev-mocks { position: fixed; left: 12px; bottom: 12px; z-index: 50; min-height: 36px; padding: 6px 12px; font-size: .75rem; border: 1px dashed #f59e0b; background: #451a03e6; color: #fde68a; border-radius: 10px; }
@media (max-width: 767px) { .dev-mocks { bottom: auto; top: 70px; } }
</style>
