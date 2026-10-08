<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, useId, nextTick, watch } from 'vue';
import { ArrowLeftIcon, XMarkIcon } from '@heroicons/vue/24/outline';
const props = defineProps<{ id?: string; title: string; subtitle?: string; back?: boolean; wide?: boolean; kind?: 'search' }>();
const emit = defineEmits<{ close: []; back: [] }>();
const element = ref<HTMLDialogElement>();
const titleId = useId(), subtitleId = useId();
watch(() => props.title, () => nextTick(() => element.value?.querySelector<HTMLElement>('.dialog-heading h2')?.focus()));
let previous: HTMLElement | null = null;
const startedOutside = ref(false);
function trapFocus(event: KeyboardEvent) {
  if (event.key !== 'Tab' || event.altKey || event.ctrlKey || event.metaKey) return;
  const dialog = element.value;
  if (!dialog) return;
  const controls = [...dialog.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')].filter(control => control.getClientRects().length > 0 && !control.closest('[inert]'));
  const first = controls[0], last = controls[controls.length - 1], active = document.activeElement;
  if (!first) { event.preventDefault(); dialog.querySelector<HTMLElement>('.dialog-heading h2')?.focus(); }
  else if (event.shiftKey && (active === first || active?.getAttribute('tabindex') === '-1')) { event.preventDefault(); last?.focus(); }
  else if (!event.shiftKey && active === last) { event.preventDefault(); first.focus(); }
}
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
onMounted(() => { previous = document.activeElement as HTMLElement; position(); element.value?.showModal(); if (!element.value?.querySelector('[autofocus]')) element.value?.querySelector<HTMLElement>('.dialog-heading h2')?.focus(); window.visualViewport?.addEventListener('resize', position); window.visualViewport?.addEventListener('scroll', position); window.addEventListener('resize', position); });
onBeforeUnmount(() => {
  window.visualViewport?.removeEventListener('resize', position); window.visualViewport?.removeEventListener('scroll', position); window.removeEventListener('resize', position);
  element.value?.close(); nextTick(() => { const dialogs = [...document.querySelectorAll('dialog[open]')]; if (previous?.isConnected && (!dialogs.length || previous.closest('dialog') === dialogs[dialogs.length - 1])) previous.focus({ preventScroll: true }); else if (!dialogs.length) document.getElementById('planning')?.focus({ preventScroll: true }); });
});
</script>
<template><Teleport to="body"><dialog :id="id ?? titleId + '-dialog'" ref="element" class="app-dialog" :class="{ 'wide-dialog': wide, 'search-dialog': kind === 'search' }" :aria-labelledby="titleId" :aria-describedby="subtitle ? subtitleId : undefined" aria-modal="true" @keydown="trapFocus" @cancel.prevent="emit('close')" @pointerdown="event => startedOutside = outside(event)" @click="event => { if (startedOutside && outside(event)) emit('close'); }"><header class="dialog-header"><button v-if="back" class="icon-button quiet" aria-label="Revenir aux réglages" @click="emit('back')"><ArrowLeftIcon aria-hidden="true" /></button><div class="dialog-heading"><h2 :id="titleId" tabindex="-1">{{ title }}</h2><p v-if="subtitle" :id="subtitleId" class="muted">{{ subtitle }}</p></div><button class="icon-button quiet" aria-label="Fermer" @click="emit('close')"><XMarkIcon aria-hidden="true" /></button></header><div class="dialog-content"><slot /></div><footer v-if="$slots.footer" class="dialog-footer"><slot name="footer" /></footer></dialog></Teleport></template>
