<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { ArrowLeftIcon, ArrowRightIcon, PlusIcon, FunnelIcon, UserCircleIcon, CalendarIcon, ArrowPathIcon } from '@heroicons/vue/24/outline';
import { arrowNavigation as vArrowNavigation } from '../../scripts/keyboardNavigation';
import SectionSwitch from './SectionSwitch.vue';
import WorkPlanning from './WorkPlanning.vue';
import WorkList from './WorkList.vue';
import { travauxView, travauxDay, filters, weekSummary, queueCount, me, ui, form, requireAccount, worksLoading, worksError, loadWorks, loadQueue, markTravauxVisited, offlineVotes, config, today } from '../../scripts/travaux';
import { selection, online } from '../../scripts/calendarStore';
import { addDay, frenchDate } from '../../../shared/calendar';
import { WORK_TYPES, WORK_TYPE_LABELS, type WorkType } from '../../../shared/travaux';
const filtersOpen = ref(false);
const month = computed(() => travauxDay.value.slice(0, 7));
function moveMonth(direction: number) {
  const date = new Date(month.value + '-01T12:00:00Z');
  date.setUTCMonth(date.getUTCMonth() + direction);
  travauxDay.value = date.toISOString().slice(0, 10);
}
const activeFilters = computed(() => filters.value.types.length + (filters.value.scope ? 1 : 0) + (filters.value.pending ? 1 : 0) + (filters.value.hideDone ? 1 : 0));
function toggleType(type: WorkType) { filters.value.types = filters.value.types.includes(type) ? filters.value.types.filter(item => item !== type) : [...filters.value.types, type]; }
const summaryText = computed(() => {
  const s = weekSummary.value;
  const parts = [s.rendu && `${s.rendu} rendu${s.rendu > 1 ? 's' : ''}`, s.eval && `${s.eval} éval${s.eval > 1 ? 's' : ''}`, s.devoir && `${s.devoir} devoir${s.devoir > 1 ? 's' : ''}`, s.projet && `${s.projet} projet${s.projet > 1 ? 's' : ''}`].filter(Boolean);
  return parts.length ? parts.join(' · ') : 'Rien d’annoncé cette semaine';
});
const add = () => requireAccount(() => { form.value = { mode: 'create', day: travauxDay.value >= today.value ? travauxDay.value : today.value }; });
onMounted(() => { markTravauxVisited(); void loadWorks(); void loadQueue(); });
</script>
<template>
<section class="travaux-panel" aria-labelledby="travaux-title">
  <header class="travaux-header">
    <h1 id="travaux-title" class="sr-only">Travaux de {{ selection?.promotion }} {{ selection?.label }}</h1>
    <div class="travaux-controls"><SectionSwitch class="desktop-only" /><div v-arrow-navigation role="group" class="view-switch" aria-label="Vue des travaux"><button :aria-pressed="travauxView === 'planning'" @click="travauxView = 'planning'">Planning</button><button :aria-pressed="travauxView === 'liste'" @click="travauxView = 'liste'">Liste</button></div></div>
    <div v-if="travauxView === 'planning'" class="month-navigation"><button class="icon-button quiet" aria-label="Mois précédent" @click="moveMonth(-1)"><ArrowLeftIcon aria-hidden="true" /></button><strong class="month-label">{{ frenchDate(month + '-01', { month: 'long', year: 'numeric' }) }}</strong><button class="icon-button quiet" aria-label="Mois suivant" @click="moveMonth(1)"><ArrowRightIcon aria-hidden="true" /></button><button class="text-action" :disabled="travauxDay === today" @click="travauxDay = today">Aujourd’hui</button></div>
    <div class="travaux-actions">
      <button class="icon-button quiet" :disabled="worksLoading || !online" aria-label="Actualiser les travaux" @click="loadWorks(); loadQueue()"><ArrowPathIcon aria-hidden="true" :class="{ refreshing: worksLoading }" /></button>
      <button class="icon-button quiet" :aria-expanded="filtersOpen" aria-controls="travaux-filters" :aria-label="activeFilters ? `Filtres, ${activeFilters} actifs` : 'Filtres'" @click="filtersOpen = !filtersOpen"><FunnelIcon aria-hidden="true" /><span v-if="activeFilters" class="count-badge small" aria-hidden="true">{{ activeFilters }}</span></button>
      <button class="icon-button quiet" aria-label="Abonnement agenda" @click="ui.ics = true"><CalendarIcon aria-hidden="true" /></button>
      <button class="icon-button quiet" :aria-label="me ? 'Mon compte, ' + me.firstName : 'Se connecter'" @click="me ? ui.account = true : ui.login = true"><UserCircleIcon aria-hidden="true" /></button>
      <button class="primary-action add-work" @click="add"><PlusIcon aria-hidden="true" /><span>Ajouter</span></button>
    </div>
  </header>
  <div v-if="filtersOpen" id="travaux-filters" class="travaux-filters" role="region" aria-label="Filtres des travaux">
    <div role="group" aria-label="Types" class="filter-chips"><button v-for="type in WORK_TYPES" :key="type" :class="'filter-' + type" :aria-pressed="filters.types.includes(type)" @click="toggleType(type)">{{ WORK_TYPE_LABELS[type] }}</button></div>
    <label>Portée<select v-model="filters.scope"><option value="">Toutes</option><option value="group">Mon sous-groupe</option><option value="wide">Groupe large</option><option value="promo">Promotion</option></select></label>
    <label class="check-label"><input v-model="filters.pending" type="checkbox"> À confirmer seulement</label>
    <label class="check-label"><input v-model="filters.hideDone" type="checkbox"> Masquer les travaux faits</label>
  </div>
  <button v-if="queueCount" class="queue-banner" @click="ui.queue = true"><strong>{{ queueCount }} proposition{{ queueCount > 1 ? 's attendent' : ' attend' }} ta validation</strong><span aria-hidden="true">›</span></button>
  <p v-else-if="!me" class="travaux-hint">Les travaux sont déclarés par les étudiants et vérifiés ensemble. <button class="text-action" @click="ui.login = true">Se connecter avec son mail .uvsq.fr</button> pour en ajouter ou voter.</p>
  <p class="week-summary"><span>Cette semaine : {{ summaryText }}</span><span v-if="weekSummary.total"> — {{ weekSummary.done }} sur {{ weekSummary.total }} fait{{ weekSummary.done > 1 ? 's' : '' }}</span><span v-if="weekSummary.late" class="late-count"> · {{ weekSummary.late }} en retard</span><progress v-if="weekSummary.total" :value="weekSummary.done" :max="weekSummary.total" aria-label="Progression de la semaine"></progress></p>
  <p v-if="worksError" class="notice" role="alert">{{ worksError }} <button @click="loadWorks()">Réessayer</button></p>
  <p v-if="!online" class="notice" role="status">Hors ligne : copie enregistrée sur l’appareil.<span v-if="offlineVotes"> {{ offlineVotes }} vote(s) partiront au retour du réseau.</span></p>
  <p v-if="!config.persistent && me?.role === 'admin'" class="notice">Stockage de développement : configurez la base Postgres (Neon) avant la mise en ligne.</p>
  <WorkPlanning v-if="travauxView === 'planning'" />
  <WorkList v-else />
</section>
</template>
