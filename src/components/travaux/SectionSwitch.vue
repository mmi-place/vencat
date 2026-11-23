<script setup lang="ts">
import { arrowNavigation as vArrowNavigation } from '../../scripts/keyboardNavigation';
import { section, travauxBadge } from '../../scripts/travaux';
defineProps<{ dock?: boolean }>();
</script>
<template><div v-arrow-navigation role="group" class="view-switch section-switch" :class="{ 'dock-section': dock }" aria-label="Section affichée"><button data-key="W" :aria-pressed="section === 'cours'" @click="section = 'cours'">Cours</button><button data-key="W" :aria-pressed="section === 'travaux'" :aria-label="travauxBadge ? `Travaux, ${travauxBadge} nouveautés` : 'Travaux'" @click="section = 'travaux'">Travaux<span v-if="travauxBadge" class="count-badge" aria-hidden="true">{{ travauxBadge > 99 ? '99+' : travauxBadge }}</span></button></div></template>
