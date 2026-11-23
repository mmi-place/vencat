<script setup lang="ts">
import { computed } from 'vue';
import WorkTypeIcon from './WorkTypeIcon.vue';
import { WORK_TYPE_LABELS, WORK_STATE_LABELS, type WorkView } from '../../../shared/travaux';
import { label, isDone, openedWork } from '../../scripts/travaux';
// Compact card of the week agenda.
const props = defineProps<{ work: WorkView }>();
const left = computed(() => label(props.work));
const done = computed(() => isDone(props.work.id));
const text = computed(() => `${WORK_TYPE_LABELS[props.work.type]} : ${props.work.title}, ${props.work.hasTime ? props.work.time : 'avant 23:59'}, ${WORK_STATE_LABELS[props.work.state]}${done.value ? ', fait' : ''}`);
</script>
<template><button type="button" class="work-card" :class="['type-' + work.type, 'state-' + work.state, { personal: work.personal, done, active: openedWork === work.id, soon: !done && left.level >= 3 }]" :aria-label="text" @click.stop="openedWork = work.id"><span class="work-card-top"><WorkTypeIcon :type="work.type" /><span>{{ work.hasTime ? work.time : WORK_TYPE_LABELS[work.type] }}</span><span v-if="work.personal" class="card-state" aria-hidden="true">perso</span><span v-else-if="work.state !== 'validated'" class="card-state" aria-hidden="true">{{ work.state === 'contested' ? 'contesté' : 'à confirmer' }}</span></span><strong>{{ work.title }}</strong></button></template>
