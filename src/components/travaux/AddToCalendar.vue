<script setup lang="ts">
import { computed, ref } from 'vue';
import { CalendarDaysIcon, ChevronDownIcon, ArrowDownTrayIcon } from '@heroicons/vue/24/outline';
import { WORK_TYPE_LABELS, type WorkView } from '../../../shared/travaux';
// Adds this work alone to a calendar; the most likely app for this device comes first.
const props = defineProps<{ work: WorkView }>();
const open = ref(false);
const end = computed(() => new Date(props.work.due));
const start = computed(() => new Date(end.value.getTime() - 30 * 60000));
const compact = (date: Date) => date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const title = computed(() => `${WORK_TYPE_LABELS[props.work.type]} · ${props.work.title}`);
const link = computed(() => `${location.origin}/?travail=${props.work.id}`);
const details = computed(() => [props.work.details.where && 'Où : ' + props.work.details.where, props.work.details.format && 'Format : ' + props.work.details.format, props.work.details.info, link.value].filter(Boolean).join('\n'));
const ics = computed(() => `/api/travaux/event/${props.work.id}.ics`);
const agent = navigator.userAgent;
const platform = /iPhone|iPad|Macintosh/.test(agent) ? 'apple' : /Android/.test(agent) ? 'google' : /Windows/.test(agent) ? 'outlook' : 'google';
const apps = computed(() => {
  const outlook = (host: string) => `https://${host}/calendar/0/deeplink/compose?path=/calendar/action/compose&rru=addevent&subject=${encodeURIComponent(title.value)}&startdt=${start.value.toISOString()}&enddt=${end.value.toISOString()}&body=${encodeURIComponent(details.value)}`;
  const list = [
    { id: 'apple', label: 'Apple Calendrier', hint: 'iPhone, iPad, Mac', href: ics.value, logo: 'logo-apple', external: false },
    { id: 'google', label: 'Google Agenda', hint: 'Android, Gmail', href: `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title.value)}&dates=${compact(start.value)}/${compact(end.value)}&details=${encodeURIComponent(details.value)}`, logo: 'logo-google', external: true },
    { id: 'outlook', label: 'Outlook 365', hint: 'Compte universitaire', href: outlook('outlook.office.com'), logo: 'logo-office', external: true },
    { id: 'outlook-live', label: 'Outlook.com', hint: 'Compte personnel', href: outlook('outlook.live.com'), logo: 'logo-outlook', external: true },
  ];
  const first = list.find(item => item.id === platform)!;
  return [first, ...list.filter(item => item !== first)];
});
</script>
<template><div class="subscribe add-to-calendar">
  <button class="subscribe-toggle" :aria-expanded="open" @click="open = !open"><CalendarDaysIcon aria-hidden="true" /><span>Ajouter à mon agenda</span><ChevronDownIcon class="chevron" aria-hidden="true" /></button>
  <div v-if="open" class="subscribe-buttons">
    <a v-for="(app, index) in apps" :key="app.id" class="app-button" :href="app.href" :target="app.external ? '_blank' : undefined" :rel="app.external ? 'noopener' : undefined"><span class="app-logo" :class="app.logo" aria-hidden="true">{{ app.logo === 'logo-google' ? 'G' : app.logo === 'logo-apple' ? '' : 'O' }}</span><span><strong>{{ app.label }}<span v-if="index === 0" class="recommended">pour cet appareil</span></strong><small>{{ app.hint }}</small></span></a>
    <a class="app-button" :href="ics" download><span class="app-logo" aria-hidden="true"><ArrowDownTrayIcon /></span><span><strong>Fichier .ics</strong><small>Autre application</small></span></a>
    <p class="field-hint">Rappel la veille. Pour recevoir automatiquement tous les travaux du groupe : Mon compte › Ajouter à mon agenda.</p>
  </div>
</div></template>
