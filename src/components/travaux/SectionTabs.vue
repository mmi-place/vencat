<script setup lang="ts">
import { CalendarDaysIcon, ClipboardDocumentCheckIcon } from '@heroicons/vue/24/outline';
import { section, travauxBadge } from '../../scripts/travaux';
// Main sections of the app, centred in the top bar: a place to go, not a display option.
</script>
<template><nav class="section-tabs" aria-label="Sections"><button data-key="W" :aria-current="section === 'cours' ? 'page' : undefined" @click="section = 'cours'"><CalendarDaysIcon aria-hidden="true" /><span>Cours</span></button><button data-key="W" :aria-current="section === 'travaux' ? 'page' : undefined" :aria-label="travauxBadge ? `Travaux, ${travauxBadge} nouveautés` : undefined" @click="section = 'travaux'"><ClipboardDocumentCheckIcon aria-hidden="true" /><span>Travaux</span><span v-if="travauxBadge" class="count-badge" aria-hidden="true">{{ travauxBadge > 99 ? '99+' : travauxBadge }}</span></button></nav></template>
