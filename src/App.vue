<script setup lang="ts">
import { accessibility } from './scripts/accessibility';
import { watch } from 'vue';
import { RouterView } from 'vue-router';
import { preferences } from './scripts/calendarStore';
import { backgroundStyle } from './scripts/appearance';
import { customBackgroundUrl } from './scripts/customBackground';
import { effectiveTheme } from './scripts/theme';
watch([() => preferences.value.background, effectiveTheme, customBackgroundUrl, accessibility], ([background, theme, image, access]) => {
  document.documentElement.dataset.theme = theme;
  document.documentElement.dataset.contrast = access.highContrast ? 'high' : 'normal';
  document.documentElement.dataset.largeText = String(access.largeText);
  document.documentElement.dataset.reduceMotion = String(access.reduceMotion);
  document.documentElement.style.setProperty('--app-background', backgroundStyle(access.plainBackground || access.highContrast ? 'unified' : background, theme, image));
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'light' ? '#f4f5f8' : '#020618');
}, { immediate: true, deep: true });
</script>
<template><RouterView /></template>
