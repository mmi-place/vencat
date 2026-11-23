<script setup lang="ts">
import { computed, ref } from 'vue';
import { CalendarDaysIcon, ChevronDownIcon, ArrowDownTrayIcon } from '@heroicons/vue/24/outline';
// Adds one event (a work or a course) to a calendar; the most likely app for this device comes first.
const props = defineProps<{ title: string; start: string; end: string; location?: string; details?: string; ics: string; label?: string; hint?: string }>();
const open = ref(false);
const compact = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const agent = navigator.userAgent;
const platform = /iPhone|iPad|Macintosh/.test(agent) ? 'apple' : /Android/.test(agent) ? 'google' : /Windows/.test(agent) ? 'outlook' : 'google';
const apps = computed(() => {
  const body = encodeURIComponent(props.details ?? ''), subject = encodeURIComponent(props.title), location = encodeURIComponent(props.location ?? '');
  const outlook = (host: string) => `https://${host}/calendar/0/deeplink/compose?path=/calendar/action/compose&rru=addevent&subject=${subject}&startdt=${new Date(props.start).toISOString()}&enddt=${new Date(props.end).toISOString()}&location=${location}&body=${body}`;
  const list = [
    { id: 'apple', label: 'Apple Calendrier', hint: 'iPhone, iPad, Mac', href: props.ics, logo: 'logo-apple', external: false },
    { id: 'google', label: 'Google Agenda', hint: 'Android, Gmail', href: `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${subject}&dates=${compact(props.start)}/${compact(props.end)}&location=${location}&details=${body}`, logo: 'logo-google', external: true },
    { id: 'outlook', label: 'Outlook 365', hint: 'Compte universitaire', href: outlook('outlook.office.com'), logo: 'logo-office', external: true },
    { id: 'outlook-live', label: 'Outlook.com', hint: 'Compte personnel', href: outlook('outlook.live.com'), logo: 'logo-outlook', external: true },
  ];
  const first = list.find(item => item.id === platform)!;
  return [first, ...list.filter(item => item !== first)];
});
</script>
<template><div class="subscribe add-event">
  <button type="button" class="subscribe-toggle" :aria-expanded="open" @click="open = !open"><CalendarDaysIcon aria-hidden="true" /><span>{{ label ?? 'Ajouter à mon agenda' }}</span><ChevronDownIcon class="chevron" aria-hidden="true" /></button>
  <div v-if="open" class="subscribe-buttons">
    <a v-for="(app, index) in apps" :key="app.id" class="app-button" :href="app.href" :target="app.external ? '_blank' : undefined" :rel="app.external ? 'noopener' : undefined"><span class="app-logo" :class="app.logo" aria-hidden="true">{{ app.logo === 'logo-google' ? 'G' : app.logo === 'logo-apple' ? '' : 'O' }}</span><span><strong>{{ app.label }}<span v-if="index === 0" class="recommended">pour cet appareil</span></strong><small>{{ app.hint }}</small></span></a>
    <a class="app-button" :href="ics" download><span class="app-logo" aria-hidden="true"><ArrowDownTrayIcon /></span><span><strong>Fichier .ics</strong><small>Autre application</small></span></a>
    <p v-if="hint" class="field-hint">{{ hint }}</p>
  </div>
</div></template>
