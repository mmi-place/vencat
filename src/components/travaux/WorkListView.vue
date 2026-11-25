<script setup lang="ts">
import { computed } from 'vue';
import WorkItem from './WorkItem.vue';
import { visibleWorks, isDone, today, openedWork } from '../../scripts/travaux';
import { addDay, mondayOf } from '../../../shared/calendar';
// Everything to come, in the style of a reminders list.
const sections = computed(() => {
  const tomorrow = addDay(today.value, 1), weekEnd = addDay(mondayOf(today.value), 6), nextEnd = addDay(weekEnd, 7);
  const buckets: { key: string; title: string; tone?: string; works: typeof visibleWorks.value }[] = [
    { key: 'today', title: 'Aujourd’hui', tone: 'today', works: [] }, { key: 'tomorrow', title: 'Demain', works: [] },
    { key: 'week', title: 'Cette semaine', works: [] }, { key: 'next', title: 'Semaine prochaine', works: [] }, { key: 'later', title: 'Plus tard', works: [] },
  ];
  for (const work of visibleWorks.value) {
    if (work.day < today.value) continue;
    const key = work.day === today.value ? 'today' : work.day === tomorrow ? 'tomorrow' : work.day <= weekEnd ? 'week' : work.day <= nextEnd ? 'next' : 'later';
    buckets.find(bucket => bucket.key === key)!.works.push(work);
  }
  for (const bucket of buckets) bucket.works.sort((a, b) => Number(isDone(a.id)) - Number(isDone(b.id)) || a.due.localeCompare(b.due));
  return buckets.filter(bucket => bucket.works.length);
});
</script>
<template><div class="work-list-view">
  <p v-if="!sections.length" class="empty-state"><strong>Rien à venir</strong><span>Un rendu ou une éval annoncés en cours ? Ajoute-les pour toute la promo.</span></p>
  <section v-for="section in sections" :key="section.key" class="list-section" :class="section.tone" :aria-label="section.title">
    <h2>{{ section.title }} <span class="count">{{ section.works.filter(work => !isDone(work.id)).length }}</span></h2>
    <WorkItem v-for="work in section.works" :key="work.id" :work="work" :show-date="section.key !== 'today' && section.key !== 'tomorrow'" :selected="openedWork === work.id" />
  </section>
</div></template>
