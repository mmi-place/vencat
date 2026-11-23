<script setup lang="ts">
import { computed } from 'vue';
import { WORK_TYPE_LABELS, WORK_STATE_LABELS, type WorkView } from '../../../shared/travaux';
import { frenchDate } from '../../../shared/calendar';
import { label, isDone, setDone, openedWork, marks } from '../../scripts/travaux';
const props = defineProps<{ work: WorkView; showDate?: boolean }>();
const left = computed(() => label(props.work));
const done = computed(() => isDone(props.work.id));
const when = computed(() => (props.showDate ? frenchDate(props.work.day, { weekday: 'short', day: 'numeric', month: 'short' }) + ' · ' : '') + (props.work.hasTime ? props.work.time : '23:59'));
const place = computed(() => props.work.details.where || (props.work.links[0] ? '↗ ' + props.work.links[0].domain : props.work.course ? 'lié au cours' : ''));
</script>
<template>
<article class="work-row" :class="['type-' + work.type, { done, late: left.late && !done }]">
  <input :id="'done-' + work.id" type="checkbox" class="work-check" :checked="done" :aria-label="(done ? 'Fait : ' : 'Marquer comme fait : ') + work.title" @change="setDone(work.id, ($event.target as HTMLInputElement).checked)">
  <button type="button" class="work-row-main" @click="openedWork = work.id">
    <span class="work-row-type">{{ WORK_TYPE_LABELS[work.type] }}<span v-if="work.ds"> · DS</span></span>
    <strong>{{ work.title }}</strong>
    <span class="muted">{{ when }}<template v-if="place"> · {{ place }}</template> · {{ work.scopeLabel }}<template v-if="marks.notes[work.id]"> · 📝</template></span>
  </button>
  <span v-if="left.late && !done" class="pill pill-late">en retard</span>
  <span v-else-if="work.state !== 'validated'" class="pill pill-wait" :class="'pill-' + work.state">{{ WORK_STATE_LABELS[work.state] }}</span>
  <span v-else-if="left.level >= 2 && !done" class="pill pill-soon">{{ left.label }}</span>
</article>
</template>
