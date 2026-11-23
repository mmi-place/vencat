<script setup lang="ts">
import { computed } from 'vue';
import WorkTypeIcon from './WorkTypeIcon.vue';
import { WORK_TYPE_LABELS, WORK_STATE_LABELS, scopeTag, type WorkView } from '../../../shared/travaux';
import { frenchDate } from '../../../shared/calendar';
import { label, isDone, setDone, openedWork, marks } from '../../scripts/travaux';
// A row in the style of a reminders list: round check, title, coloured details on one line.
const props = defineProps<{ work: WorkView; showDate?: boolean; selected?: boolean }>();
const left = computed(() => label(props.work));
const done = computed(() => isDone(props.work.id));
const when = computed(() => (props.showDate ? frenchDate(props.work.day, { weekday: 'short', day: 'numeric', month: 'short' }) + (props.work.hasTime ? ', ' : '') : '') + (props.work.hasTime ? props.work.time : props.showDate ? '' : 'avant 23:59'));
const urgency = computed(() => done.value ? '' : left.value.late ? 'late' : left.value.level >= 3 ? 'soon' : '');
const where = computed(() => props.work.details.where || (props.work.links[0] ? props.work.links[0].domain : ''));
</script>
<template>
<div class="work-item" :class="['type-' + work.type, { done, selected }]">
  <label class="round-check"><input type="checkbox" :checked="done" @change="setDone(work.id, ($event.target as HTMLInputElement).checked)"><span aria-hidden="true"></span><span class="sr-only">{{ done ? 'Fait' : 'Marquer comme fait' }} : {{ work.title }}</span></label>
  <button type="button" class="work-item-main" :aria-current="selected ? 'true' : undefined" @click="openedWork = work.id">
    <span class="work-item-title"><span v-if="urgency === 'late'" class="urgency" aria-hidden="true">!!!</span><span v-else-if="urgency === 'soon'" class="urgency" aria-hidden="true">!!</span>{{ work.title }}</span>
    <span class="work-item-meta"><span class="meta-type"><WorkTypeIcon :type="work.type" />{{ WORK_TYPE_LABELS[work.type] }}{{ work.ds ? ' · DS' : '' }}</span><span :class="['meta-when', urgency]">{{ left.late && !done ? 'En retard · ' : '' }}{{ when }}</span><span v-if="where" class="meta-where">{{ where }}</span><span v-if="!work.personal" class="meta-tag">#{{ scopeTag(work.scope) }}</span><span v-if="marks.notes[work.id]" class="meta-note">note</span></span>
  </button>
  <span v-if="work.local" class="state-mark state-local" title="Sera envoyé au retour du réseau">À envoyer</span>
  <span v-else-if="work.personal" class="state-mark state-personal" title="Visible par toi seul">Perso</span>
  <span v-else-if="work.state !== 'validated'" class="state-mark" :class="'state-' + work.state" :title="WORK_STATE_LABELS[work.state]">{{ work.state === 'contested' ? 'Contesté' : work.state === 'probable' ? 'Probable' : 'À confirmer' }}</span>
</div>
</template>
