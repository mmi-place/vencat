<script setup lang="ts">
import AccessibleDialog from '../AccessibleDialog.vue';
import WorkDetail from './WorkDetail.vue';
import { openedWork, works } from '../../scripts/travaux';
</script>
<template><AccessibleDialog v-if="openedWork" id="work-dialog" :title="works.find(work => work.id === openedWork)?.title ?? 'Travail'" @close="openedWork = undefined"><WorkDetail /></AccessibleDialog></template>
