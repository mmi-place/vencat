<script setup lang="ts">
import { computed } from 'vue';
import { WORK_TYPES, WORK_TYPE_LABELS } from '../../../shared/travaux';
import { worksOn } from '../../scripts/travaux';
// Works of a day as coloured dots and a count, on the date line of a header: no extra height, sticky with it.
const props = defineProps<{ day: string; label?: boolean }>();
const list = computed(() => worksOn(props.day));
const text = computed(() => WORK_TYPES.map(type => ({ type, count: list.value.filter(work => work.type === type).length })).filter(part => part.count).map(part => `${WORK_TYPE_LABELS[part.type]} ×${part.count}`).join(', '));
</script>
<template><span v-if="list.length" class="work-dots" :title="text"><i v-for="work in list.slice(0, 4)" :key="work.id" :class="['dot-' + work.type, { pending: work.state !== 'validated' }]" aria-hidden="true"></i><span v-if="label" class="work-dots-count" aria-hidden="true">{{ list.length }}</span><span class="sr-only">, travaux : {{ text }}</span></span></template>
