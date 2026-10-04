<script setup lang="ts">
import { MoonIcon, SunIcon, ComputerDesktopIcon } from '@heroicons/vue/24/outline';
import { themes } from '../scripts/appearance';
import { preferences } from '../scripts/calendarStore';
import { effectiveTheme } from '../scripts/theme';
</script>
<template><div class="theme-options" aria-label="Thème de l’application"><button v-for="item in themes" :key="item.id" :aria-pressed="preferences.theme === item.id" class="theme-option" @click="preferences.theme = item.id"><span class="theme-preview" :class="'preview-' + (item.id === 'system' ? effectiveTheme : item.id)" aria-hidden="true"><span class="preview-toolbar"><span>Vencat</span><MoonIcon v-if="item.id === 'dark'" /><SunIcon v-else-if="item.id === 'light'" /><ComputerDesktopIcon v-else /></span><span class="preview-event"><span>TD</span><span>09:00</span><strong>Exemple de cours</strong><span>Salle E57</span></span></span><strong>{{ item.label }}</strong><span class="muted">{{ item.description }}</span></button></div></template>
