<script setup lang="ts">
import { computed } from 'vue';
import WorkTypeIcon from './WorkTypeIcon.vue';
import { WORK_TYPES, WORK_TYPE_LABELS, type WorkType } from '../../../shared/travaux';
import { filters } from '../../scripts/travaux';
// Always visible, one tap per filter.
function toggleType(type: WorkType) { filters.value.types = filters.value.types.includes(type) ? filters.value.types.filter(item => item !== type) : [...filters.value.types, type]; }
const scopes = [['', 'Tout'], ['group', 'Mon groupe'], ['wide', 'Groupe large'], ['promo', 'Promo']] as const;
const active = computed(() => filters.value.types.length || filters.value.scope || filters.value.pending || filters.value.hideDone);
function reset() { filters.value = { types: [], scope: '', pending: false, hideDone: false }; }
</script>
<template><div class="filter-bar" role="toolbar" aria-label="Filtres des travaux">
  <button v-for="type in WORK_TYPES" :key="type" class="chip" :class="'chip-' + type" :aria-pressed="filters.types.includes(type)" @click="toggleType(type)"><WorkTypeIcon :type="type" />{{ WORK_TYPE_LABELS[type] }}</button>
  <span class="chip-separator" aria-hidden="true"></span>
  <label class="chip chip-select"><span class="sr-only">Portée</span><select v-model="filters.scope"><option v-for="[value, text] in scopes" :key="value" :value="value">{{ text }}</option></select></label>
  <button class="chip" :aria-pressed="filters.pending" @click="filters.pending = !filters.pending">À confirmer</button>
  <button class="chip" :aria-pressed="filters.hideDone" @click="filters.hideDone = !filters.hideDone">Masquer les faits</button>
  <button v-if="active" class="chip chip-reset" @click="reset">Effacer</button>
</div></template>
