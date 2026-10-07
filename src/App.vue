<script setup lang="ts">
import { watch } from 'vue';
import { RouterView } from 'vue-router';
import { preferences } from './scripts/calendarStore';
import { backgroundStyle } from './scripts/appearance';
import { customBackgroundUrl } from './scripts/customBackground';
import { effectiveTheme } from './scripts/theme';
watch([() => preferences.value.background, effectiveTheme, customBackgroundUrl], ([background, theme, image]) => {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.setProperty('--app-background', backgroundStyle(background, theme, image));
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'light' ? '#f4f5f8' : '#020618');
}, { immediate: true });
</script>
<template><RouterView /></template>
