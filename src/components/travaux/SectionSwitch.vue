<script setup lang="ts">
import { CalendarDaysIcon, ClipboardDocumentCheckIcon } from '@heroicons/vue/24/outline';
import { section, travauxBadge } from '../../scripts/travaux';
// Mobile: the same two sections in the centre of the bottom bar (option B).
</script>
<template><nav class="dock-tabs" aria-label="Sections"><button :aria-current="section === 'cours' ? 'page' : undefined" @click="section = 'cours'"><CalendarDaysIcon aria-hidden="true" /><span>Cours</span></button><button :aria-current="section === 'travaux' ? 'page' : undefined" :aria-label="travauxBadge ? `Travaux, ${travauxBadge} nouveautés` : undefined" @click="section = 'travaux'"><ClipboardDocumentCheckIcon aria-hidden="true" /><span>Travaux</span><span v-if="travauxBadge" class="count-badge" aria-hidden="true">{{ travauxBadge > 99 ? '99+' : travauxBadge }}</span></button></nav></template>
