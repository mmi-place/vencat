<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { PlusIcon } from '@heroicons/vue/24/outline';
import WorkCard from './WorkCard.vue';
import { isDone, worksByDay, today, travauxDay, focusDay, agendaFocus, stripWeek, wide, form, requireAccount, openedWork, worksLoading } from '../../scripts/travaux';
import { addDay, frenchDate, mondayOf } from '../../../shared/calendar';

// Continuous agenda from the current week: weeks are added while scrolling down (and up),
// the farthest ones are removed once the scroll is idle so the page stays light.
const MAX_WEEKS = 30, STEP = 4;
const scroller = ref<HTMLElement>(), top = ref<HTMLElement>(), bottom = ref<HTMLElement>();
const start = mondayOf(today.value);
const weeks = ref<string[]>(Array.from({ length: 6 }, (_, index) => addDay(start, index * 7)));
// Five weekday columns and one « Week-end » column holding Saturday above Sunday: always the same six columns, so every
// week lines up with the header and nothing jumps while weeks load.
const COLUMNS = 6;
const daysOf = (week: string) => Array.from({ length: 7 }, (_, index) => addDay(week, index));
const columnsOf = (week: string) => { const days = daysOf(week); return [...days.slice(0, 5).map(day => [day]), days.slice(5)]; };
const dayLabel = (day: string, column: string[]) => column.length > 1 ? frenchDate(day, { weekday: 'short', day: 'numeric' }) : day.endsWith('-01') || day === daysOf(mondayOf(day))[0] && mondayOf(day) === weeks.value[0] ? frenchDate(day, { day: 'numeric', month: 'short' }) : frenchDate(day, { day: 'numeric' });
const weekTitle = (week: string) => {
  const end = addDay(week, 6), current = mondayOf(today.value);
  const range = frenchDate(week, { day: 'numeric', month: week.slice(5, 7) === end.slice(5, 7) ? undefined : 'short' }) + ' – ' + frenchDate(end, { day: 'numeric', month: 'long' });
  return { name: week === current ? 'Cette semaine' : week === addDay(current, 7) ? 'Semaine prochaine' : week === addDay(current, -7) ? 'Semaine dernière' : '', range };
};
const weekCount = (week: string) => daysOf(week).reduce((sum, day) => sum + (worksByDay.value.get(day)?.filter(work => !isDone(work.id)).length ?? 0), 0);

// Changing the weeks keeps the row on screen exactly where it was (the browser's own scroll anchoring is off,
// otherwise both corrections add up and the agenda jumps back).
function anchor(element: HTMLElement) {
  const rows = [...element.querySelectorAll<HTMLElement>('[data-week]')];
  const row = rows.find(item => item.offsetTop + item.offsetHeight > element.scrollTop + 1);
  return row ? { week: row.dataset.week!, delta: row.offsetTop - element.scrollTop } : undefined;
}
async function keep(element: HTMLElement | undefined, change: () => void) {
  const before = element ? anchor(element) : undefined;
  change();
  await nextTick();
  const row = before && element?.querySelector<HTMLElement>(`[data-week="${before.week}"]`);
  if (element && row && before) element.scrollTop = row.offsetTop - before.delta;
}
// iPad/iPhone: changing scrollTop (or the content above the screen) while a finger or the momentum is still
// scrolling makes the agenda jump and cuts the inertia. So nothing above the screen is touched until the scroll
// has stopped; adding weeks at the bottom never moves what is shown and can happen at any time.
let touching = false, lastScroll = 0;
const isIdle = () => !touching && Date.now() - lastScroll >= 160;
const idle = () => new Promise<void>(resolve => { const check = () => isIdle() ? resolve() : setTimeout(check, 60); check(); });
async function grow(direction: 1 | -1) {
  const element = scroller.value;
  if (direction > 0) {
    const last = weeks.value[weeks.value.length - 1]!;
    weeks.value = [...weeks.value, ...Array.from({ length: STEP }, (_, index) => addDay(last, (index + 1) * 7))];
  } else {
    // Only called once the scroll is idle (see checkEdges).
    if (!element || element.scrollTop >= 400) return;
    const first = weeks.value[0]!;
    const added = Array.from({ length: 2 }, (_, index) => addDay(first, -(2 - index) * 7));
    await keep(element, () => { weeks.value = [...added, ...weeks.value]; });
  }
}
/** Keeps the page light once the scroll is idle: weeks far above or far below the screen are removed. */
let pruning = false;
async function prune() {
  const element = scroller.value;
  if (!element || pruning || weeks.value.length <= MAX_WEEKS) return;
  pruning = true;
  try { await idle(); } finally { pruning = false; }
  if (weeks.value.length <= MAX_WEEKS) return;
  const offset = (week?: string) => week ? element.querySelector<HTMLElement>(`[data-week="${week}"]`)?.offsetTop : undefined;
  let above = 0, below = weeks.value.length;
  while (weeks.value.length - above > MAX_WEEKS - 4) { const next = offset(weeks.value[above + 1]); if (next === undefined || next > element.scrollTop - 1500) break; above++; }
  while (below - above > MAX_WEEKS - 4) { const row = offset(weeks.value[below - 1]); if (row === undefined || row < element.scrollTop + element.clientHeight + 2500) break; below--; }
  if (above || below < weeks.value.length) await keep(element, () => { weeks.value = weeks.value.slice(above, below); });
}
// Load more at both ends, checked on every scroll (and again after each load, in case the end is still close).
let sections: IntersectionObserver | undefined;
let growing = false, topArmed = false, topWaiting = false, frame = 0;
async function checkEdges() {
  const element = scroller.value;
  if (!element || growing) return;
  const nearBottom = element.scrollTop + element.clientHeight > element.scrollHeight - 1200;
  const nearTop = topArmed && element.scrollTop < 400;
  if (!nearBottom && !nearTop) { void prune(); return; }
  // Earlier weeks are added once the scroll is idle; waiting for that never blocks loading at the bottom.
  if (!nearBottom) {
    if (topWaiting) return;
    topWaiting = true;
    try { await idle(); } finally { topWaiting = false; }
  }
  growing = true;
  try { await grow(nearBottom ? 1 : -1); } finally { growing = false; }
  requestAnimationFrame(() => void checkEdges());
}
const onScroll = () => { lastScroll = Date.now(); cancelAnimationFrame(frame); frame = requestAnimationFrame(() => void checkEdges()); };
const touchStart = () => { touching = true; }, touchEnd = () => { touching = false; lastScroll = Date.now(); };
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
  scroller.value?.addEventListener('scroll', onScroll, { passive: true });
  scroller.value?.addEventListener('touchstart', touchStart, { passive: true });
  scroller.value?.addEventListener('touchend', touchEnd, { passive: true });
  scroller.value?.addEventListener('touchcancel', touchEnd, { passive: true });
  // Earlier weeks load only once the person scrolls up by themselves: the agenda opens on the current week.
  const armTop = () => { topArmed = true; };
  scroller.value?.addEventListener('wheel', armTop, { passive: true, once: true });
  scroller.value?.addEventListener('touchmove', armTop, { passive: true, once: true });
  observeSections();
  void checkEdges();
  if (mondayOf(travauxDay.value) !== start) void scrollTo(travauxDay.value, false);
});
onBeforeUnmount(() => { scroller.value?.removeEventListener('scroll', onScroll); scroller.value?.removeEventListener('touchstart', touchStart); scroller.value?.removeEventListener('touchend', touchEnd); scroller.value?.removeEventListener('touchcancel', touchEnd); cancelAnimationFrame(frame); sections?.disconnect(); });

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
// Keyboard: ←/→ one day, ↑/↓ one week, Début/Fin the ends of the week; the focus follows (roving tabindex).
async function dateKey(event: KeyboardEvent, day: string) {
  if (event.altKey || event.ctrlKey || event.metaKey) return;
  const weekStart = mondayOf(day), last = 6;
  const step: Record<string, () => string> = {
    ArrowLeft: () => { let target = addDay(day, -1); while (target < weekStart) target = addDay(weekStart, -7 + last); return target; },
    ArrowRight: () => { const index = (Date.parse(day) - Date.parse(weekStart)) / 86400000; return index >= last ? addDay(weekStart, 7) : addDay(day, 1); },
    ArrowUp: () => addDay(day, -7), ArrowDown: () => addDay(day, 7), Home: () => weekStart, End: () => addDay(weekStart, last),
  };
  const move = step[event.key];
  if (!move) return;
  event.preventDefault();
  const target = move();
  const rendered = !!scroller.value?.querySelector(`[data-agenda-day="${target}"]`);
  focusDay(target, !rendered);
  if (!rendered) await scrollTo(target, false);
  await nextTick();
  const button = scroller.value?.querySelector<HTMLElement>(`[data-agenda-day="${target}"] .agenda-date`);
  button?.focus(); button?.scrollIntoView({ block: 'nearest' });
}
function selectDay(day: string) { focusDay(day, false); if (wide.value) openedWork.value = undefined; }
</script>
<template>
<div ref="scroller" class="work-agenda desktop" :aria-busy="worksLoading" tabindex="-1">
  <div ref="top" class="agenda-edge" aria-hidden="true"></div>
  <div class="agenda-table" :style="{ '--columns': COLUMNS }" role="grid" aria-label="Agenda des travaux">
    <div class="agenda-head" role="row"><span class="agenda-corner" aria-hidden="true"></span><span v-for="name in ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Week-end']" :key="name" role="columnheader">{{ name }}</span></div>
    <div v-for="week in weeks" :key="week" class="agenda-row" :class="{ current: week === mondayOf(today) }" :data-week="week" role="row">
      <span class="agenda-week-label" role="rowheader"><span>{{ weekTitle(week).name || weekTitle(week).range }}</span><b v-if="weekCount(week)" class="count" :title="weekCount(week) + ' à faire'">{{ weekCount(week) }}</b></span>
      <div v-for="column in columnsOf(week)" :key="column[0]" class="agenda-col" :class="{ we: column.length > 1 }" role="presentation">
        <div v-for="day in column" :key="day" role="gridcell" class="agenda-cell" :data-agenda-day="day" :class="{ today: day === today, past: day < today, selected: day === travauxDay, 'first-of-month': day.endsWith('-01') }" @click="selectDay(day)">
          <button class="agenda-date" :tabindex="day === travauxDay ? 0 : -1" :aria-pressed="day === travauxDay" @keydown="dateKey($event, day)" :aria-label="frenchDate(day) + ((worksByDay.get(day)?.length ?? 0) ? `, ${worksByDay.get(day)!.length} travaux` : ', rien')" @click.stop="selectDay(day)">{{ dayLabel(day, column) }}</button>
          <button class="agenda-add icon-button quiet" :aria-label="'Ajouter un travail le ' + frenchDate(day)" @click.stop="add(day)"><PlusIcon aria-hidden="true" /></button>
          <WorkCard v-for="work in worksByDay.get(day) ?? []" :key="work.id" :work="work" />
        </div>
      </div>
    </div>
  </div>
  <div ref="bottom" class="agenda-edge agenda-more" aria-hidden="true">Chargement des semaines suivantes…</div>
</div>
</template>
