<script setup lang="ts">
import { computed, ref } from 'vue';
import { LinkIcon, CheckIcon, CalendarDaysIcon, ChevronDownIcon } from '@heroicons/vue/24/outline';
import { selection } from '../../scripts/calendarStore';
// One button; once opened it lists the calendar apps, the most likely one for this device first.
const props = defineProps<{ open?: boolean }>();
const expanded = ref(!!props.open);
const https = computed(() => selection.value ? `${location.origin}/api/travaux/ics/${selection.value.id}.ics` : '');
const webcal = computed(() => https.value.replace(/^https?:/, 'webcal:'));
const name = computed(() => `Travaux ${selection.value?.promotion ?? ''} ${selection.value?.label ?? ''}`.trim());
const agent = navigator.userAgent;
const platform = /iPhone|iPad|Macintosh/.test(agent) ? 'apple' : /Android/.test(agent) ? 'google' : /Windows/.test(agent) ? 'outlook' : 'google';
const apps = computed(() => {
  const list = [
    { id: 'apple', label: 'Apple Calendrier', hint: 'iPhone, iPad, Mac', href: webcal.value, logo: 'logo-apple', external: false },
    { id: 'google', label: 'Google Agenda', hint: 'Android, Gmail', href: `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal.value)}`, logo: 'logo-google', external: true },
    { id: 'outlook', label: 'Outlook 365', hint: 'Compte universitaire', href: `https://outlook.office.com/calendar/0/addfromweb?url=${encodeURIComponent(https.value)}&name=${encodeURIComponent(name.value)}`, logo: 'logo-office', external: true },
    { id: 'outlook-live', label: 'Outlook.com', hint: 'Compte personnel', href: `https://outlook.live.com/calendar/0/addfromweb?url=${encodeURIComponent(https.value)}&name=${encodeURIComponent(name.value)}`, logo: 'logo-outlook', external: true },
  ];
  const first = list.find(item => item.id === platform)!;
  return [first, ...list.filter(item => item !== first)];
});
const copied = ref(false);
async function copy() { try { await navigator.clipboard.writeText(https.value); copied.value = true; setTimeout(() => { copied.value = false; }, 2000); } catch { prompt('Lien d’abonnement', https.value); } }
</script>
<template><div class="subscribe">
  <button class="subscribe-toggle" :aria-expanded="expanded" @click="expanded = !expanded"><CalendarDaysIcon aria-hidden="true" /><span>S’abonner aux travaux du groupe</span><ChevronDownIcon class="chevron" aria-hidden="true" /></button>
  <div v-if="expanded" class="subscribe-buttons">
    <a v-for="(app, index) in apps" :key="app.id" class="app-button" :href="app.href" :target="app.external ? '_blank' : undefined" :rel="app.external ? 'noopener' : undefined"><span class="app-logo" :class="app.logo" aria-hidden="true">{{ app.logo === 'logo-google' ? 'G' : app.logo === 'logo-apple' ? '' : 'O' }}</span><span><strong>{{ app.label }}<span v-if="index === 0" class="recommended">pour cet appareil</span></strong><small>{{ app.hint }}</small></span></a>
    <button class="app-button" @click="copy"><span class="app-logo" aria-hidden="true"><CheckIcon v-if="copied" /><LinkIcon v-else /></span><span><strong>{{ copied ? 'Lien copié' : 'Copier le lien' }}</strong><small>Autre application</small></span></button>
    <p class="field-hint">Un abonnement : chaque travail de {{ name.replace('Travaux ', '') }} apparaît dans ton agenda, avec un rappel la veille, et la liste se met à jour toute seule (toutes les quelques heures).</p>
  </div>
</div></template>
