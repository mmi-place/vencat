<script setup lang="ts">
import { computed } from 'vue';
import WorkRow from './WorkRow.vue';
import { visibleWorks, lateWorks, isDone, today } from '../../scripts/travaux';
import { addDay, mondayOf, frenchDate } from '../../../shared/calendar';
// In due order, grouped by week. Late works (past, not done) come first in red; done works sink to the end of their week.
const groups = computed(() => {
  const late = new Set(lateWorks.value.map(work => work.id));
  const thisWeek = mondayOf(today.value), nextWeek = addDay(thisWeek, 7);
  const list: { key: string; title: string; works: typeof visibleWorks.value }[] = [];
  if (late.size) list.push({ key: 'late', title: 'En retard', works: lateWorks.value });
  for (const work of visibleWorks.value) {
    if (late.has(work.id) || work.day < thisWeek) continue;
    const week = mondayOf(work.day);
    const title = week === thisWeek ? 'Cette semaine' : week === nextWeek ? 'Semaine prochaine' : 'Semaine du ' + frenchDate(week, { day: 'numeric', month: 'long' });
    let group = list.find(item => item.key === week);
    if (!group) list.push(group = { key: week, title, works: [] });
    group.works.push(work);
  }
  for (const group of list) group.works.sort((a, b) => Number(isDone(a.id)) - Number(isDone(b.id)) || a.due.localeCompare(b.due));
  return list;
});
</script>
<template>
<div class="work-list">
  <p v-if="!groups.length" class="travaux-empty">Aucun travail à venir. Un rendu ou une éval annoncés en cours ? Ajoute-les pour toute la promo.</p>
  <section v-for="group in groups" :key="group.key" class="work-week" :class="{ 'late-group': group.key === 'late' }" :aria-label="group.title">
    <h2>{{ group.title }}<span class="muted"> · {{ group.works.filter(work => isDone(work.id)).length }} / {{ group.works.length }} fait</span></h2>
    <WorkRow v-for="work in group.works" :key="work.id" :work="work" show-date />
  </section>
</div>
</template>
