<script setup lang="ts">
import { computed } from 'vue';
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/vue/24/outline';
import { arrowNavigation as vArrowNavigation } from '../../scripts/keyboardNavigation';
import { stripWeek, travauxDay, today, focusDay, worksByDay } from '../../scripts/travaux';
import { addDay, frenchDate, mondayOf } from '../../../shared/calendar';
// Week bar: the days of the week in view, dots where works are due; arrows jump a week.
const days = computed(() => Array.from({ length: 7 }, (_, index) => addDay(stripWeek.value, index)));
const title = computed(() => { const end = addDay(stripWeek.value, 6); const sameMonth = stripWeek.value.slice(5, 7) === end.slice(5, 7); return frenchDate(stripWeek.value, sameMonth ? { day: 'numeric' } : { day: 'numeric', month: 'short' }) + ' – ' + frenchDate(end, { day: 'numeric', month: 'long', year: 'numeric' }); });
function jump(weeks: number) { const target = addDay(stripWeek.value, weeks * 7); stripWeek.value = target; focusDay(target); }
const thisWeek = computed(() => mondayOf(today.value) === stripWeek.value);
</script>
<template><div class="week-strip">
  <div class="week-strip-head"><strong class="week-title">{{ thisWeek ? 'Cette semaine' : title }}</strong><span v-if="thisWeek" class="muted week-range">{{ title }}</span><span class="week-strip-nav"><button class="icon-button quiet" aria-label="Semaine précédente" @click="jump(-1)"><ChevronLeftIcon aria-hidden="true" /></button><button class="today-chip" :disabled="travauxDay === today && thisWeek" @click="stripWeek = mondayOf(today); focusDay(today)">Aujourd’hui</button><button class="icon-button quiet" aria-label="Semaine suivante" @click="jump(1)"><ChevronRightIcon aria-hidden="true" /></button></span></div>
  <div v-arrow-navigation class="week-strip-days" role="group" aria-label="Jours de la semaine">
    <button v-for="day in days" :key="day" :aria-pressed="day === travauxDay" :class="{ today: day === today, past: day < today }" :aria-label="frenchDate(day) + ((worksByDay.get(day)?.length ?? 0) ? `, ${worksByDay.get(day)!.length} travaux` : '')" @click="focusDay(day)"><span class="strip-weekday">{{ frenchDate(day, { weekday: 'short' }).replace('.', '') }}</span><span class="strip-number">{{ frenchDate(day, { day: 'numeric' }) }}</span><span class="dots" aria-hidden="true"><i v-for="work in (worksByDay.get(day) ?? []).slice(0, 4)" :key="work.id" :class="['dot-' + work.type, { pending: work.state !== 'validated' }]"></i></span></button>
  </div>
</div></template>
