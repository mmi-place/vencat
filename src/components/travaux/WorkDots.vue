<script setup lang="ts">
import { computed } from 'vue';
import { WORK_TYPES, WORK_TYPE_LABELS } from '../../../shared/travaux';
import { worksOn, isDone } from '../../scripts/travaux';
// Works of a day as a small pill (coloured dots + number still to do), placed in a corner of the header:
// it never changes its height and stays visible with it while scrolling.
const props = defineProps<{ day: string; inline?: boolean }>();
const list = computed(() => worksOn(props.day));
const left = computed(() => list.value.filter(work => !isDone(work.id)));
const text = computed(() => WORK_TYPES.map(type => ({ type, count: list.value.filter(work => work.type === type).length })).filter(part => part.count).map(part => `${WORK_TYPE_LABELS[part.type]} ×${part.count}`).join(', '));
</script>
<template><span v-if="list.length" class="work-pill" :class="{ inline, 'all-done': !left.length }" :title="text"><i v-for="work in list.slice(0, 3)" :key="work.id" :class="['dot-' + work.type, { pending: work.state !== 'validated', done: isDone(work.id) }]" aria-hidden="true"></i><b aria-hidden="true">{{ left.length || '✓' }}</b><span class="sr-only">, {{ left.length ? left.length + ' travaux à faire' : 'travaux faits' }} : {{ text }}</span></span></template>
