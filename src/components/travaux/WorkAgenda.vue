<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { PlusIcon } from '@heroicons/vue/24/outline';
import WorkCard from './WorkCard.vue';
import WorkItem from './WorkItem.vue';
import { isDone, worksByDay, today, travauxDay, focusDay, agendaFocus, stripWeek, wide, lateWorks, form, requireAccount, openedWork, relativeDay, worksLoading } from '../../scripts/travaux';
import { preferences } from '../../scripts/calendarStore';
import { addDay, frenchDate, mondayOf } from '../../../shared/calendar';

// Continuous agenda from the current week: weeks are added while scrolling down (and up),
// the farthest ones are removed so the page stays light.
const MAX_WEEKS = 24, STEP = 4;
const scroller = ref<HTMLElement>(), top = ref<HTMLElement>(), bottom = ref<HTMLElement>();
const start = mondayOf(today.value);
const weeks = ref<string[]>(Array.from({ length: 6 }, (_, index) => addDay(start, index * 7)));
const dayCount = computed(() => preferences.value.weekend ? 7 : 5);
const daysOf = (week: string) => Array.from({ length: dayCount.value }, (_, index) => addDay(week, index));
const weekTitle = (week: string) => {
  const end = addDay(week, dayCount.value - 1), current = mondayOf(today.value);
  const range = frenchDate(week, { day: 'numeric', month: week.slice(5, 7) === end.slice(5, 7) ? undefined : 'short' }) + ' – ' + frenchDate(end, { day: 'numeric', month: 'long' });
  return { name: week === current ? 'Cette semaine' : week === addDay(current, 7) ? 'Semaine prochaine' : week === addDay(current, -7) ? 'Semaine dernière' : '', range };
};
const weekCount = (week: string) => daysOf(week).reduce((sum, day) => sum + (worksByDay.value.get(day)?.filter(work => !isDone(work.id)).length ?? 0), 0);

async function grow(direction: 1 | -1) {
  const element = scroller.value;
  if (direction > 0) {
    const last = weeks.value[weeks.value.length - 1]!;
    const added = Array.from({ length: STEP }, (_, index) => addDay(last, (index + 1) * 7));
    // Only weeks already scrolled out of sight above are removed, never the ones on screen.
    let removable = 0, removedHeight = 0;
    if (weeks.value.length + STEP > MAX_WEEKS && element) {
      const top = (week?: string) => week ? element.querySelector<HTMLElement>(`[data-week="${week}"]`)?.offsetTop : undefined;
      const origin = top(weeks.value[0]) ?? 0;
      // A week can go when the next one already starts above the visible area.
      while (removable < STEP) { const next = top(weeks.value[removable + 1]); if (next === undefined || next > element.scrollTop - 200) break; removable++; }
      if (removable) removedHeight = (top(weeks.value[removable]) ?? origin) - origin;
    }
    weeks.value = [...weeks.value.slice(removable), ...added];
    if (removable && element) { await nextTick(); element.scrollTop -= removedHeight; }
  } else {
    const first = weeks.value[0]!;
    const added = Array.from({ length: 2 }, (_, index) => addDay(first, -(2 - index) * 7));
    const before = element?.scrollHeight ?? 0;
    weeks.value = [...added, ...weeks.value].slice(0, MAX_WEEKS);
    await nextTick();
    if (element) element.scrollTop += element.scrollHeight - before;
  }
}
// Load more at both ends.
let edges: IntersectionObserver | undefined, sections: IntersectionObserver | undefined;
let growing = false, topArmed = false;
async function edge(direction: 1 | -1) { if (growing) return; growing = true; try { await grow(direction); } finally { setTimeout(() => { growing = false; }, 120); } }
// The week bar follows the week at the top of the agenda.
const visible = new Map<string, number>();
function observeSections() {
  sections?.disconnect();
  sections = new IntersectionObserver(entries => {
    for (const entry of entries) { const week = (entry.target as HTMLElement).dataset.week!; if (entry.isIntersecting) visible.set(week, entry.boundingClientRect.top); else visible.delete(week); }
    const first = [...visible.keys()].sort()[0];
    if (first) stripWeek.value = first;
  }, { root: scroller.value, rootMargin: '0px 0px -75% 0px' });
  scroller.value?.querySelectorAll('[data-week]').forEach(element => sections!.observe(element));
}
watch(weeks, () => nextTick(observeSections));
onMounted(() => {
  edges = new IntersectionObserver(entries => entries.forEach(entry => { if (entry.isIntersecting) void edge(entry.target === bottom.value ? 1 : -1); }), { root: scroller.value, rootMargin: '600px 0px' });
  if (bottom.value) edges.observe(bottom.value);
  // Earlier weeks load only once the person scrolls up by themselves: the agenda opens on the current week.
  const armTop = () => { if (top.value && !topArmed) { topArmed = true; edges?.observe(top.value); } };
  scroller.value?.addEventListener('wheel', armTop, { passive: true, once: true });
  scroller.value?.addEventListener('touchmove', armTop, { passive: true, once: true });
  observeSections();
  if (mondayOf(travauxDay.value) !== start) void scrollTo(travauxDay.value, false);
});
onBeforeUnmount(() => { edges?.disconnect(); sections?.disconnect(); });

// Go to a day asked by the week bar, the timetable or a link.
async function scrollTo(day: string, smooth = true) {
  const week = mondayOf(day);
  if (!weeks.value.includes(week)) {
    const first = weeks.value[0]!, last = weeks.value[weeks.value.length - 1]!;
    if (week > last && week <= addDay(last, 7 * STEP)) await grow(1);
    else if (week < first && week >= addDay(first, -14)) await grow(-1);
    else weeks.value = Array.from({ length: 6 }, (_, index) => addDay(week, (index - 1) * 7)).filter(item => item >= addDay(mondayOf(today.value), -52 * 7));
    await nextTick();
  }
  const target = scroller.value?.querySelector<HTMLElement>(`[data-week="${week}"]`);
  if (target && scroller.value) scroller.value.scrollTo({ top: target.offsetTop - 34, behavior: smooth && !matchMedia('(prefers-reduced-motion: reduce)').matches ? 'smooth' : 'auto' });
}
watch(() => agendaFocus.value.nonce, () => void scrollTo(agendaFocus.value.day));
const add = (day: string) => requireAccount(() => { form.value = { mode: 'create', day }; });
function selectDay(day: string) { focusDay(day, false); if (wide.value) openedWork.value = undefined; }
</script>
<template>
<div ref="scroller" class="work-agenda desktop" :aria-busy="worksLoading" tabindex="-1">
  <div ref="top" class="agenda-edge" aria-hidden="true"></div>
  <section v-if="lateWorks.length" class="agenda-late" aria-label="En retard">
    <h2>En retard <span class="count">{{ lateWorks.length }}</span></h2>
    <WorkItem v-for="work in lateWorks" :key="work.id" :work="work" show-date :selected="openedWork === work.id" />
  </section>
  <div class="agenda-table" :style="{ '--columns': dayCount }" role="grid" aria-label="Agenda des travaux">
    <div class="agenda-head" role="row"><span class="agenda-corner" aria-hidden="true"></span><span v-for="name in ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'].slice(0, dayCount)" :key="name" role="columnheader">{{ name }}</span></div>
    <div v-for="week in weeks" :key="week" class="agenda-row" :class="{ current: week === mondayOf(today) }" :data-week="week" role="row">
      <span class="agenda-week-label" role="rowheader"><span>{{ weekTitle(week).name || weekTitle(week).range }}</span><b v-if="weekCount(week)" class="count" :title="weekCount(week) + ' à faire'">{{ weekCount(week) }}</b></span>
      <div v-for="day in daysOf(week)" :key="day" role="gridcell" class="agenda-cell" :data-agenda-day="day" :class="{ today: day === today, past: day < today, selected: day === travauxDay, 'first-of-month': day.endsWith('-01') }" @click="selectDay(day)">
        <button class="agenda-date" :aria-pressed="day === travauxDay" :aria-label="frenchDate(day) + ((worksByDay.get(day)?.length ?? 0) ? `, ${worksByDay.get(day)!.length} travaux` : ', rien')" @click.stop="selectDay(day)">{{ day.endsWith('-01') || day === daysOf(week)[0] && week === weeks[0] ? frenchDate(day, { day: 'numeric', month: 'short' }) : frenchDate(day, { day: 'numeric' }) }}</button>
        <button class="agenda-add icon-button quiet" :aria-label="'Ajouter un travail le ' + frenchDate(day)" @click.stop="add(day)"><PlusIcon aria-hidden="true" /></button>
        <WorkCard v-for="work in worksByDay.get(day) ?? []" :key="work.id" :work="work" />
      </div>
    </div>
  </div>
  <div ref="bottom" class="agenda-edge agenda-more" aria-hidden="true">Chargement des semaines suivantes…</div>
</div>
</template>
