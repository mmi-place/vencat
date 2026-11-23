<script setup lang="ts">
import { computed, ref } from 'vue';
import { LinkIcon, CheckIcon } from '@heroicons/vue/24/outline';
import { selection } from '../../scripts/calendarStore';
// One button per calendar app: the subscription is added in one step, with a reminder the day before.
const https = computed(() => selection.value ? `${location.origin}/api/travaux/ics/${selection.value.id}.ics` : '');
const webcal = computed(() => https.value.replace(/^https?:/, 'webcal:'));
const name = computed(() => `Travaux ${selection.value?.promotion ?? ''} ${selection.value?.label ?? ''}`.trim());
const google = computed(() => `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal.value)}`);
const outlook = computed(() => `https://outlook.live.com/calendar/0/addfromweb?url=${encodeURIComponent(https.value)}&name=${encodeURIComponent(name.value)}`);
const office = computed(() => `https://outlook.office.com/calendar/0/addfromweb?url=${encodeURIComponent(https.value)}&name=${encodeURIComponent(name.value)}`);
const copied = ref(false);
async function copy() { try { await navigator.clipboard.writeText(https.value); copied.value = true; setTimeout(() => { copied.value = false; }, 2000); } catch { prompt('Lien d’abonnement', https.value); } }
</script>
<template><div class="subscribe-buttons">
  <a class="app-button" :href="google" target="_blank" rel="noopener"><span class="app-logo logo-google" aria-hidden="true">G</span><span><strong>Google Agenda</strong><small>Android, Gmail</small></span></a>
  <a class="app-button" :href="webcal"><span class="app-logo logo-apple" aria-hidden="true"></span><span><strong>Apple Calendrier</strong><small>iPhone, iPad, Mac</small></span></a>
  <a class="app-button" :href="outlook" target="_blank" rel="noopener"><span class="app-logo logo-outlook" aria-hidden="true">O</span><span><strong>Outlook.com</strong><small>Compte personnel</small></span></a>
  <a class="app-button" :href="office" target="_blank" rel="noopener"><span class="app-logo logo-office" aria-hidden="true">O</span><span><strong>Outlook 365</strong><small>Compte universitaire</small></span></a>
  <button class="app-button" @click="copy"><span class="app-logo" aria-hidden="true"><CheckIcon v-if="copied" /><LinkIcon v-else /></span><span><strong>{{ copied ? 'Lien copié' : 'Copier le lien' }}</strong><small>Autre application</small></span></button>
</div></template>
