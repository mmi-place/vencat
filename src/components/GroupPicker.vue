<script setup lang="ts">
import { computed, ref } from 'vue';
import { groupOptions, type GroupOption } from '../../shared/selection';
const props = defineProps<{ initial?: GroupOption }>();
const emit = defineEmits<{ select: [group: GroupOption] }>();
const department = ref(props.initial?.department ?? ''), promotion = ref(props.initial?.promotion ?? '');
const departments = [...new Set(groupOptions.map(item => item.department))];
const promotions = computed(() => [...new Set(groupOptions.filter(item => item.department === department.value).map(item => item.promotion))]);
const groups = computed(() => groupOptions.filter(item => item.department === department.value && item.promotion === promotion.value));
</script>
<template><div class="group-picker">
<fieldset><legend>Filière</legend><div class="choices"><button v-for="item in departments" :key="item" :aria-pressed="department === item" :class="{ selected: department === item }" @click="department = item; promotion = ''">{{ item === 'INF' ? 'Informatique' : item === 'RT' ? 'Réseaux & télécoms' : item }}</button></div></fieldset>
<fieldset v-if="department"><legend>Promotion</legend><div class="choices"><button v-for="item in promotions" :key="item" :aria-pressed="promotion === item" :class="{ selected: promotion === item }" @click="promotion = item">{{ item }}</button></div></fieldset>
<fieldset v-if="promotion"><legend>Groupe</legend><div class="choices"><button v-for="item in groups" :key="item.id" :aria-pressed="initial?.id === item.id" @click="emit('select', item)">{{ item.label }}</button></div></fieldset>
</div></template>
