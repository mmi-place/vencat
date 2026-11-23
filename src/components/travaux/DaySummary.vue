<script setup lang="ts">
import { computed } from 'vue';
import { WORK_TYPES, WORK_TYPE_LABELS } from '../../../shared/travaux';
import { worksOn, section, travauxDay, travauxView } from '../../scripts/travaux';
import { frenchDate } from '../../../shared/calendar';
// Summary at the top of a timetable day: "Rendu ×1 · Éval ×2", which opens the day in Travaux.
const props = defineProps<{ day: string; dot?: boolean }>();
const list = computed(() => worksOn(props.day));
const parts = computed(() => WORK_TYPES.map(type => ({ type, count: list.value.filter(work => work.type === type).length })).filter(part => part.count));
const text = computed(() => parts.value.map(part => `${WORK_TYPE_LABELS[part.type]} ×${part.count}`).join(' · '));
function open() { travauxDay.value = props.day; travauxView.value = 'planning'; section.value = 'travaux'; }
</script>
<template><span v-if="parts.length && dot" class="day-work-dots" :title="text"><i v-for="part in parts" :key="part.type" :class="'dot-' + part.type" aria-hidden="true"></i><span class="sr-only">, travaux : {{ text }}</span></span><button v-else-if="parts.length" type="button" class="day-work-summary" :aria-label="`Travaux du ${frenchDate(day)} : ${text}. Ouvrir dans Travaux`" @click.stop="open"><span v-for="part in parts" :key="part.type" :class="'summary-' + part.type">{{ WORK_TYPE_LABELS[part.type] }} ×{{ part.count }}</span><span aria-hidden="true">›</span></button></template>
