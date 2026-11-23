<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { PlusIcon, ArrowLeftIcon, ArrowRightIcon } from '@heroicons/vue/24/outline';
import WorkChip from './WorkChip.vue';
import WorkRow from './WorkRow.vue';
import { worksByDay, travauxDay, today, form, requireAccount, visibleWorks } from '../../scripts/travaux';
import { preferences } from '../../scripts/calendarStore';
import { addDay, mondayOf, frenchDate, isWeekend } from '../../../shared/calendar';
// The whole month, one cell per working day (weekend follows the existing option). On mobile: dots under the days.
const narrowQuery = matchMedia('(max-width: 767px)');
const narrow = ref(narrowQuery.matches);
const resized = () => { narrow.value = narrowQuery.matches; };
onMounted(() => narrowQuery.addEventListener('change', resized));
onBeforeUnmount(() => narrowQuery.removeEventListener('change', resized));
const showWeekend = computed(() => preferences.value.weekend && visibleWorks.value.some(work => isWeekend(work.day)));
const columns = computed(() => showWeekend.value ? 7 : 5);
const weekdays = computed(() => ['Lun.', 'Mar.', 'Mer.', 'Jeu.', 'Ven.', 'Sam.', 'Dim.'].slice(0, columns.value));
const month = computed(() => travauxDay.value.slice(0, 7));
const days = computed(() => {
  const first = month.value + '-01';
  const last = (() => { const d = new Date(first + 'T12:00:00Z'); d.setUTCMonth(d.getUTCMonth() + 1); d.setUTCDate(0); return d.toISOString().slice(0, 10); })();
  const out: string[] = [];
  for (let day = mondayOf(first); day <= addDay(mondayOf(last), 6); day = addDay(day, 1)) if (showWeekend.value || !isWeekend(day)) out.push(day);
  return out;
});
const strip = computed(() => Array.from({ length: columns.value }, (_, index) => addDay(mondayOf(travauxDay.value), index)));
const selectedList = computed(() => worksByDay.value.get(travauxDay.value) ?? []);
const MAX = 3;
const addOn = (day: string) => requireAccount(() => { form.value = { mode: 'create', day }; });
function moveWeek(direction: number) { travauxDay.value = addDay(travauxDay.value, direction * 7); }
function keyCell(event: KeyboardEvent, day: string) {
  const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowDown' ? columns.value : event.key === 'ArrowUp' ? -columns.value : 0;
  if (!step) return;
  event.preventDefault();
  const index = days.value.indexOf(day) + step;
  const target = days.value[index];
  if (target) { travauxDay.value = target; requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-work-day="${target}"]`)?.focus()); }
}
</script>
<template>
<div v-if="!narrow" class="work-month" :style="{ '--columns': columns }" role="grid" :aria-label="'Travaux de ' + frenchDate(month + '-01', { month: 'long', year: 'numeric' })">
  <div class="work-month-row" role="row"><span v-for="name in weekdays" :key="name" role="columnheader" class="work-weekday">{{ name }}</span></div>
  <div class="work-month-grid" role="rowgroup">
    <div v-for="day in days" :key="day" role="gridcell" class="work-day" :class="{ 'other-month': day.slice(0, 7) !== month, today: day === today, selected: day === travauxDay, past: day < today }">
      <button class="work-day-number" :data-work-day="day" :tabindex="day === travauxDay ? 0 : -1" :aria-label="frenchDate(day) + ((worksByDay.get(day)?.length ?? 0) ? `, ${worksByDay.get(day)!.length} travaux` : ', aucun travail')" :aria-pressed="day === travauxDay" @click="travauxDay = day" @keydown="keyCell($event, day)">{{ frenchDate(day, { day: 'numeric' }) }}</button>
      <button class="work-day-add icon-button quiet" :aria-label="'Ajouter un travail le ' + frenchDate(day)" @click="addOn(day)"><PlusIcon aria-hidden="true" /></button>
      <WorkChip v-for="work in (worksByDay.get(day) ?? []).slice(0, MAX)" :key="work.id" :work="work" countdown />
      <button v-if="(worksByDay.get(day)?.length ?? 0) > MAX" class="work-more text-action" @click="travauxDay = day">+{{ worksByDay.get(day)!.length - MAX }}</button>
    </div>
  </div>
</div>
<div v-else class="work-strip-wrap">
  <div class="work-strip-nav"><button class="icon-button quiet" aria-label="Semaine précédente" @click="moveWeek(-1)"><ArrowLeftIcon aria-hidden="true" /></button><span>Semaine du {{ frenchDate(mondayOf(travauxDay), { day: 'numeric', month: 'short' }) }}</span><button class="icon-button quiet" aria-label="Semaine suivante" @click="moveWeek(1)"><ArrowRightIcon aria-hidden="true" /></button></div>
  <div class="work-strip" role="group" aria-label="Jours de la semaine" :style="{ '--columns': columns }">
    <button v-for="day in strip" :key="day" :aria-pressed="day === travauxDay" :class="{ today: day === today }" :aria-label="frenchDate(day) + ((worksByDay.get(day)?.length ?? 0) ? `, ${worksByDay.get(day)!.length} travaux` : '')" @click="travauxDay = day"><span>{{ frenchDate(day, { weekday: 'narrow' }) }}</span><strong>{{ frenchDate(day, { day: 'numeric' }) }}</strong><span class="dots" aria-hidden="true"><i v-for="work in (worksByDay.get(day) ?? []).slice(0, 4)" :key="work.id" :class="['dot-' + work.type, { pending: work.state !== 'validated' }]"></i></span></button>
  </div>
</div>
<section class="work-day-detail" :aria-label="'Travaux du ' + frenchDate(travauxDay)">
  <header><h2>{{ travauxDay === today ? 'Aujourd’hui' : travauxDay === addDay(today, 1) ? 'Demain' : frenchDate(travauxDay, { weekday: 'long', day: 'numeric', month: 'long' }) }}</h2><button class="text-action" @click="addOn(travauxDay)">+ Ajouter ce jour</button></header>
  <p v-if="!selectedList.length" class="muted">Aucun travail annoncé ce jour.</p>
  <WorkRow v-for="work in selectedList" :key="work.id" :work="work" />
</section>
</template>
