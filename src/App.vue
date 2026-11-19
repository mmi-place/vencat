<script setup lang="ts">
import { accessibility } from './scripts/accessibility';
import { ref, watch } from 'vue';
import { RouterView } from 'vue-router';
import { preferences } from './scripts/calendarStore';
import { backgroundStyle } from './scripts/appearance';
import { customBackgroundUrl } from './scripts/customBackground';
import { effectiveTheme } from './scripts/theme';
// A system request for more contrast applies the same reinforced styles as the in-app setting.
const contrastQuery = matchMedia('(prefers-contrast: more)');
const systemContrast = ref(contrastQuery.matches);
contrastQuery.addEventListener('change', event => { systemContrast.value = event.matches; });
watch([() => preferences.value.background, effectiveTheme, customBackgroundUrl, accessibility, systemContrast], ([background, theme, image, access, moreContrast]) => {
  const highContrast = access.highContrast || moreContrast;
  document.documentElement.dataset.theme = theme;
  document.documentElement.dataset.contrast = highContrast ? 'high' : 'normal';
  document.documentElement.dataset.largeText = String(access.largeText);
  document.documentElement.dataset.reduceMotion = String(access.reduceMotion);
  document.documentElement.style.setProperty('--app-background', backgroundStyle(access.plainBackground || highContrast ? 'unified' : background, theme, image));
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'light' ? '#f4f5f8' : '#020618');
}, { immediate: true, deep: true });
</script>
<template><RouterView /></template>
