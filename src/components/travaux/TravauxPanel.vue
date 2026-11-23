<script setup lang="ts">
import { onMounted } from 'vue';
import { PlusIcon, CalendarIcon, CheckBadgeIcon, ArrowPathIcon } from '@heroicons/vue/24/outline';
import WeekStrip from './WeekStrip.vue';
import FilterBar from './FilterBar.vue';
import WorkAgenda from './WorkAgenda.vue';
import WorkListView from './WorkListView.vue';
import DayPanel from './DayPanel.vue';
import InfoCard from './InfoCard.vue';
import AccountButton from './AccountButton.vue';
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
        <div role="group" class="segmented" aria-label="Affichage"><button :aria-pressed="travauxView === 'planning'" @click="travauxView = 'planning'">Agenda</button><button :aria-pressed="travauxView === 'liste'" @click="travauxView = 'liste'">Liste</button></div>
        <span class="toolbar-spacer"></span>
        <button v-if="queueCount && !wide" class="chip chip-queue" @click="ui.queue = true"><CheckBadgeIcon aria-hidden="true" />{{ queueCount }} à valider</button>
        <button class="icon-button quiet" :disabled="worksLoading || !online" aria-label="Actualiser les travaux" @click="loadWorks(); loadQueue()"><ArrowPathIcon aria-hidden="true" :class="{ refreshing: worksLoading }" /></button>
        <button v-if="!wide" class="icon-button quiet" aria-label="Ajouter à mon agenda" @click="ui.ics = true"><CalendarIcon aria-hidden="true" /></button>
        <AccountButton v-if="!wide" compact />
        <button class="primary-action add-work" @click="add"><PlusIcon aria-hidden="true" /><span>Ajouter</span></button>
      </div>
      <WeekStrip v-if="travauxView === 'planning'" />
      <FilterBar />
    </header>
    <p v-if="worksError" class="notice" role="alert">{{ worksError }} <button @click="loadWorks()">Réessayer</button></p>
    <p v-if="!online" class="notice" role="status">Hors ligne : copie enregistrée sur l’appareil.<span v-if="offlineVotes"> {{ offlineVotes }} vote(s) partiront au retour du réseau.</span></p>
    <WorkAgenda v-if="travauxView === 'planning'" />
    <div v-else class="work-list-scroll"><InfoCard v-if="!wide" class="in-scroll" /><WorkListView /></div>
  </div>
  <DayPanel v-if="wide" />
</section>
</template>
