<script setup lang="ts">
import { computed, ref } from 'vue';
import { groupOptions, type GroupOption } from '../../shared/selection';
const props = defineProps<{ initial?: GroupOption }>();
const emit = defineEmits<{ select: [group: GroupOption] }>();
const department = ref(props.initial?.department ?? ''), promotion = ref(props.initial?.promotion ?? '');
const departments = [...new Set(groupOptions.map(item => item.department))];
const promotions = computed(() => [...new Set(groupOptions.filter(item => item.department === department.value).map(item => item.promotion))]);
const groups = computed(() => groupOptions.filter(item => item.department === department.value && item.promotion === promotion.value));
function promotionLabel(value: string) {
  const name = value.replace(new RegExp(`^${department.value}-`), '');
  const match = name.match(/^(\d+)(.*)$/);
  if (!match) return name;
  return `${match[1] === '1' ? '1re' : match[1] + 'e'} année${match[2] ? ' · ' + match[2].replace(/^[- ]+/, '') : ''}`;
}
</script>
<template><div class="group-picker">
<fieldset><legend><span class="picker-step">1</span> Votre filière</legend><div class="choices"><button v-for="item in departments" :key="item" :aria-pressed="department === item" :class="{ selected: department === item }" @click="department = item; promotion = ''">{{ item === 'INF' ? 'Informatique' : item === 'RT' ? 'Réseaux & télécoms' : item }}</button></div></fieldset>
<fieldset v-if="department"><legend><span class="picker-step">2</span> Votre promotion</legend><div class="choices"><button v-for="item in promotions" :key="item" :aria-pressed="promotion === item" :class="{ selected: promotion === item }" @click="promotion = item">{{ promotionLabel(item) }}</button></div></fieldset>
<fieldset v-if="promotion"><legend><span class="picker-step">3</span> Votre groupe</legend><div class="choices"><button v-for="item in groups" :key="item.id" :aria-pressed="initial?.id === item.id" @click="emit('select', item)">{{ item.label }}</button></div></fieldset>
<p v-if="!department" class="muted picker-help">Commencez par choisir votre filière.</p><p v-else-if="!promotion" class="muted picker-help">Choisissez ensuite votre année.</p></div></template>
