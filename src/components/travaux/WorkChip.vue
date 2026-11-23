<script setup lang="ts">
import { computed } from 'vue';
import type { WorkView } from '../../../shared/travaux';
import { WORK_TYPE_LABELS } from '../../../shared/travaux';
import { label, isDone, openedWork } from '../../scripts/travaux';
const props = defineProps<{ work: WorkView; countdown?: boolean }>();
const left = computed(() => label(props.work));
const text = computed(() => `${WORK_TYPE_LABELS[props.work.type]} · ${props.work.title}${props.work.state === 'pending' ? ' · à confirmer' : props.work.state === 'contested' ? ' · contesté' : ''} · ${left.value.label}`);
</script>
<template><button type="button" class="work-chip" :class="['type-' + work.type, 'state-' + work.state, 'level-' + left.level, { done: isDone(work.id) }]" :title="text" :aria-label="text" @click="openedWork = work.id"><span v-if="countdown && left.level >= 2 && !isDone(work.id)" class="chip-countdown">{{ left.label === 'aujourd’hui' ? 'Auj.' : left.label === 'demain' ? 'Demain' : left.label === 'en retard' ? 'Retard' : left.label }}</span><span class="chip-title">{{ work.title }}</span></button></template>
