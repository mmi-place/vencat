<script setup lang="ts">
import { ref } from 'vue';
import AccessibleDialog from '../AccessibleDialog.vue';
import { queue, ui, vote, errorText, openedWork, loadQueue, type CorrectionView } from '../../scripts/travaux';
import { WORK_TYPE_LABELS, CONTEST_REASONS, type WorkView } from '../../../shared/travaux';
import { frenchDate, campusDate, campusTime } from '../../../shared/calendar';
// Queue: one gesture per proposal (👍, 👎 with a reason, skip). Only proposals of my scope appear.
const skipped = ref<string[]>([]), contesting = ref<string>(), status = ref(''), busy = ref(false);
async function answer(path: string, id: string, value: 1 | -1, reason?: string) {
  busy.value = true; status.value = '';
  try { await vote(path, { value, reason }); skipped.value.push(id); contesting.value = undefined; await loadQueue(); }
  catch (error) { status.value = errorText(error); } finally { busy.value = false; }
}
const workPath = (work: WorkView) => work.proposal && work.proposal.myVote === undefined && !work.proposal.mine && work.myVote !== undefined ? `/travaux/proposal/${work.proposal.id}/vote` : `/travaux/work/${work.id}/vote`;
const correctionText = (item: CorrectionView) => item.field === 'cancelled' ? 'Cours annulé' : item.field === 'room' ? `Salle ${item.course.location || '?'} → ${item.value}` : `Horaire → ${item.value}`;
</script>
<template><AccessibleDialog id="queue-dialog" title="À valider" :subtitle="`${queue.works.length + queue.corrections.length} proposition(s) de ta portée`" @close="ui.queue = false">
  <p v-if="!queue.works.filter(work => !skipped.includes(work.id)).length && !queue.corrections.filter(item => !skipped.includes(item.id)).length" class="muted">Tout est à jour. Merci !</p>
  <article v-for="work in queue.works.filter(item => !skipped.includes(item.id))" :key="work.id" class="queue-card" :class="'type-' + work.type">
    <button class="text-action queue-title" @click="openedWork = work.id"><b>{{ WORK_TYPE_LABELS[work.type] }} · {{ work.title }}</b></button>
    <p class="muted">{{ frenchDate(work.day, { weekday: 'short', day: 'numeric', month: 'short' }) }} · {{ work.time }} · {{ work.scopeLabel }} · {{ work.author }} · {{ Math.floor(work.up) }} 👍<template v-if="work.down"> · {{ Math.floor(work.down) }} 👎</template></p>
    <p v-if="work.proposal && workPath(work).includes('proposal')" class="muted">{{ work.proposal.kind === 'delete' ? 'Suppression proposée : ' + work.proposal.reason : 'Modification : ' + work.proposal.changes.map(change => `${change.label} ${change.before} → ${change.after}`).join(' · ') }}</p>
    <div class="button-row"><button class="primary-action" :disabled="busy" @click="answer(workPath(work), work.id, 1)">👍</button><button :disabled="busy" :aria-expanded="contesting === work.id" @click="contesting = contesting === work.id ? undefined : work.id">👎</button><button :disabled="busy" @click="skipped.push(work.id)">Passer</button></div>
    <div v-if="contesting === work.id" class="filter-chips" role="group" aria-label="Contester : motif"><button v-for="reason in CONTEST_REASONS" :key="reason" :disabled="busy" @click="answer(workPath(work), work.id, -1, reason)">{{ reason }}</button></div>
  </article>
  <article v-for="item in queue.corrections.filter(entry => !skipped.includes(entry.id))" :key="item.id" class="queue-card">
    <b>Correction d’emploi du temps · {{ item.course.summary }}</b>
    <p class="muted">{{ frenchDate(campusDate(item.course.start), { weekday: 'short', day: 'numeric', month: 'short' }) }} {{ campusTime(item.course.start) }} · {{ correctionText(item) }} · certifié sur l’honneur par {{ item.author }}</p>
    <div class="button-row"><button class="primary-action" :disabled="busy" @click="answer(`/travaux/correction/${item.id}/vote`, item.id, 1)">👍</button><button :disabled="busy" @click="answer(`/travaux/correction/${item.id}/vote`, item.id, -1, 'Information inexacte')">👎</button><button :disabled="busy" @click="skipped.push(item.id)">Passer</button></div>
  </article>
  <p v-if="status" class="form-error" role="alert">{{ status }}</p>
</AccessibleDialog></template>
