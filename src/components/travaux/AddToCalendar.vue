<script setup lang="ts">
import { computed } from 'vue';
import AddEvent from './AddEvent.vue';
import { WORK_TYPE_LABELS, type WorkView } from '../../../shared/travaux';
// One work in a calendar: an event ending at the deadline, reminder the day before (.ics).
const props = defineProps<{ work: WorkView }>();
const start = computed(() => new Date(Date.parse(props.work.due) - 30 * 60000).toISOString());
const details = computed(() => [props.work.details.where && 'Où : ' + props.work.details.where, props.work.details.format && 'Format : ' + props.work.details.format, props.work.details.info, `${location.origin}/?travail=${props.work.id}`].filter(Boolean).join('\n'));
</script>
<template><AddEvent :title="`${WORK_TYPE_LABELS[work.type]} · ${work.title}`" :start="start" :end="work.due" :location="work.details.where" :details="details" :ics="`/api/travaux/event/${work.id}.ics`" hint="Ce travail seul, avec un rappel la veille. Pour tous les travaux du groupe : S’abonner, dans la barre de Travaux." /></template>
