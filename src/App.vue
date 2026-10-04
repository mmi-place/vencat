<script setup lang="ts">
import { watch } from 'vue';
import { RouterView } from 'vue-router';
import { preferences } from './scripts/calendarStore';
import { backgroundStyle } from './scripts/appearance';
import { effectiveTheme } from './scripts/theme';
watch([() => preferences.value.background, effectiveTheme], ([background, theme]) => {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.setProperty('--app-background', backgroundStyle(background, theme));
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'light' ? '#f4f5f8' : '#020618');
}, { immediate: true });
</script>
<template><RouterView /></template>
