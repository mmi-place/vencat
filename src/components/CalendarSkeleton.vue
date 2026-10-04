<script setup lang="ts">
defineProps<{ daily?: boolean; list?: boolean }>();
</script>
<template><div class="calendar-skeleton" :class="{ 'daily-skeleton': daily, 'list-skeleton': list }" role="status" aria-label="Chargement des cours"><span class="sr-only">Chargement des cours…</span><div v-for="day in daily ? 1 : 5" :key="day" class="skeleton-day" aria-hidden="true"><div class="skeleton-heading"></div><div v-for="item in 3" :key="item" class="skeleton-course"><span></span><strong></strong><span></span></div></div></div></template>
