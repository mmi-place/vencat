<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, useId, nextTick } from 'vue';
import { ArrowLeftIcon, XMarkIcon } from '@heroicons/vue/24/outline';
defineProps<{ title: string; subtitle?: string; back?: boolean; wide?: boolean; kind?: 'search' }>();
const emit = defineEmits<{ close: []; back: [] }>();
const element = ref<HTMLDialogElement>();
const titleId = useId();
let previous: HTMLElement | null = null;
const startedOutside = ref(false);
function outside(event: MouseEvent) {
  const bounds = element.value?.getBoundingClientRect();
  return !!bounds && (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom);
}
function position() {
  const viewport = window.visualViewport;
  const height = viewport?.height ?? window.innerHeight;
  element.value?.style.setProperty('--dialog-center', `${(viewport?.offsetTop ?? 0) + height / 2}px`);
  element.value?.style.setProperty('--dialog-viewport-height', `${height}px`);
}
onMounted(() => { previous = document.activeElement as HTMLElement; position(); element.value?.showModal(); window.visualViewport?.addEventListener('resize', position); window.visualViewport?.addEventListener('scroll', position); window.addEventListener('resize', position); });
onBeforeUnmount(() => {
  window.visualViewport?.removeEventListener('resize', position); window.visualViewport?.removeEventListener('scroll', position); window.removeEventListener('resize', position);
  element.value?.close(); nextTick(() => { const dialogs = [...document.querySelectorAll('dialog[open]')]; if (previous?.isConnected && (!dialogs.length || previous.closest('dialog') === dialogs[dialogs.length - 1])) previous.focus(); });
});
</script>
<template><Teleport to="body"><dialog ref="element" class="app-dialog" :class="{ 'wide-dialog': wide, 'search-dialog': kind === 'search' }" :aria-labelledby="titleId" @cancel.prevent="emit('close')" @pointerdown="event => startedOutside = outside(event)" @click="event => { if (startedOutside && outside(event)) emit('close'); }"><header class="dialog-header"><button v-if="back" class="icon-button quiet" aria-label="Revenir aux réglages" @click="emit('back')"><ArrowLeftIcon /></button><div class="dialog-heading"><h2 :id="titleId">{{ title }}</h2><p v-if="subtitle" class="muted">{{ subtitle }}</p></div><button class="icon-button quiet" aria-label="Fermer" @click="emit('close')"><XMarkIcon /></button></header><div class="dialog-content"><slot /></div><footer v-if="$slots.footer" class="dialog-footer"><slot name="footer" /></footer></dialog></Teleport></template>
