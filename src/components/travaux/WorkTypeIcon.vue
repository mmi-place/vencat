<script setup lang="ts">
import { ArrowUpTrayIcon, AcademicCapIcon, BookOpenIcon, RectangleGroupIcon } from '@heroicons/vue/24/outline';
import type { WorkType } from '../../../shared/travaux';
// One icon per type, so the type never relies on colour alone.
defineProps<{ type: WorkType }>();
const icons = { rendu: ArrowUpTrayIcon, eval: AcademicCapIcon, devoir: BookOpenIcon, projet: RectangleGroupIcon };
</script>
<template><component :is="icons[type]" class="work-type-icon" :class="'type-' + type" aria-hidden="true" /></template>
