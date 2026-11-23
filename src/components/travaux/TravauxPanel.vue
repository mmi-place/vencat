<script setup lang="ts">
import { onMounted } from 'vue';
import { PlusIcon, CheckBadgeIcon, ArrowPathIcon, CalendarDaysIcon } from '@heroicons/vue/24/outline';
import WeekStrip from './WeekStrip.vue';
import FilterBar from './FilterBar.vue';
import WorkAgenda from './WorkAgenda.vue';
import WorkListView from './WorkListView.vue';
import DayPanel from './DayPanel.vue';
import InfoCard from './InfoCard.vue';
import AccountButton from './AccountButton.vue';
import { arrowNavigation as vArrowNavigation } from '../../scripts/keyboardNavigation';
import { travauxView, travauxDay, today, form, requireAccount, ui, queueCount, worksError, worksLoading, loadWorks, loadQueue, markTravauxVisited, offlineVotes, wide } from '../../scripts/travaux';
import { selection, online } from '../../scripts/calendarStore';
const add = () => requireAccount(() => { form.value = { mode: 'create', day: travauxDay.value >= today.value ? travauxDay.value : today.value }; });
onMounted(() => { markTravauxVisited(); void loadWorks(); void loadQueue(); });
</script>
<template>
<section class="travaux-panel" :class="{ wide }" aria-labelledby="travaux-title">
  <div class="travaux-main">
    <header class="travaux-toolbar">
      <div class="toolbar-row">
        <h1 id="travaux-title" class="travaux-title">Travaux<span class="sr-only"> de {{ selection?.promotion }} {{ selection?.label }}</span></h1>
        <div v-if="wide" v-arrow-navigation role="group" class="segmented" aria-label="Affichage"><button :aria-pressed="travauxView === 'planning'" @click="travauxView = 'planning'">Agenda</button><button :aria-pressed="travauxView === 'liste'" @click="travauxView = 'liste'">Liste</button></div>
        <span class="toolbar-spacer"></span>
        <button v-if="queueCount && !wide" class="chip chip-queue" :aria-label="queueCount + ' propositions à valider'" @click="ui.queue = true"><CheckBadgeIcon aria-hidden="true" />{{ queueCount }}</button>
        <button v-if="wide" class="icon-button quiet" :disabled="worksLoading || !online" aria-label="Actualiser les travaux" @click="loadWorks(); loadQueue()"><ArrowPathIcon aria-hidden="true" :class="{ refreshing: worksLoading }" /></button>
        <button class="icon-button quiet" aria-label="S’abonner aux travaux du groupe dans mon agenda" title="S’abonner dans mon agenda" @click="ui.ics = true"><CalendarDaysIcon aria-hidden="true" /></button>
        <AccountButton v-if="!wide" compact />
        <button class="primary-action add-work" aria-label="Ajouter un travail (N)" data-key="N" @click="add"><PlusIcon aria-hidden="true" /><span>Ajouter</span></button>
      </div>
      <WeekStrip v-if="wide && travauxView === 'planning'" />
      <FilterBar />
    </header>
    <p v-if="worksError" class="notice" role="alert">{{ worksError }} <button @click="loadWorks()">Réessayer</button></p>
    <p v-if="!online || offlineVotes" class="offline-bar" role="status"><span v-if="!online">Hors ligne · copie enregistrée sur l’appareil</span><span v-if="offlineVotes"> · {{ offlineVotes }} action{{ offlineVotes > 1 ? 's' : '' }} en attente d’envoi</span></p>
    <WorkAgenda v-if="wide && travauxView === 'planning'" />
    <div v-else class="work-list-scroll"><InfoCard v-if="!wide" class="in-scroll" /><WorkListView /></div>
  </div>
  <DayPanel v-if="wide" />
</section>
</template>
