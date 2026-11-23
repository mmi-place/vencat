<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { CheckIcon, XMarkIcon, ForwardIcon, ArrowRightIcon, ShieldCheckIcon, QuestionMarkCircleIcon } from '@heroicons/vue/24/outline';
import AccessibleDialog from '../AccessibleDialog.vue';
import WorkTypeIcon from './WorkTypeIcon.vue';
import { api, queue, ui, vote, errorText, openedWork, loadQueue, type CorrectionView, type DeclarationView } from '../../scripts/travaux';
import { WORK_TYPE_LABELS, CONTEST_REASONS, type WorkView } from '../../../shared/travaux';
import { frenchDate, campusDate, campusTime } from '../../../shared/calendar';

// One proposal at a time: swipe right to confirm, left to contest (a reason is then asked), or use the buttons / ← →.
// Delegate declarations: the group says whether they are right (yes / don't know / no), the administration decides.
type Item = { key: string; path: string; work?: WorkView; proposal?: boolean; correction?: CorrectionView; declaration?: DeclarationView };
const items = computed<Item[]>(() => [
  ...queue.value.works.map(work => {
    // The work itself first if it still needs my vote; otherwise its open proposal.
    const workNeedsVote = work.state !== 'validated' && work.myVote === undefined && !work.mine;
    const proposal = !workNeedsVote && !!work.proposal && work.proposal.myVote === undefined && !work.proposal.mine;
    return { key: work.id, work, proposal, path: proposal ? `/travaux/proposal/${work.proposal!.id}/vote` : `/travaux/work/${work.id}/vote` };
  }),
  ...queue.value.declarations.map(declaration => ({ key: declaration.id, declaration, path: `/travaux/delegates/${declaration.id}/answer` })),
  ...queue.value.corrections.map(correction => ({ key: correction.id, correction, path: `/travaux/correction/${correction.id}/vote` })),
]);
const handled = ref<string[]>([]);
const remaining = computed(() => items.value.filter(item => !handled.value.includes(item.key)));
const current = computed(() => remaining.value[0]);
const total = computed(() => remaining.value.length + handled.value.length);
const status = ref(''), busy = ref(false), reasons = ref(false);

async function answer(value: 1 | -1 | 0, reason?: string) {
  const item = current.value;
  if (!item || busy.value) return;
  busy.value = true; status.value = '';
  try {
    if (item.declaration) await api(item.path, { body: { value: value > 0 ? 'yes' : value < 0 ? 'no' : 'unknown' } });
    else await vote(item.path, { value, reason }); handled.value.push(item.key); reasons.value = false; fly.value = value === 0 ? 1 : value; setTimeout(() => { fly.value = 0; dx.value = 0; }, 220); }
  catch (error) { status.value = errorText(error); dx.value = 0; }
  finally { busy.value = false; }
}
function skip() { if (current.value) { handled.value.push(current.value.key); dx.value = 0; reasons.value = false; } }
// A declaration needs no reason: « Non » is enough. A work or a correction asks why.
function contest() { if (current.value?.declaration) { void answer(-1); return; } reasons.value = true; dx.value = 0; }

// Swipe
const dx = ref(0), fly = ref<0 | 1 | -1>(0), dragging = ref(false);
let startX = 0, pointer: number | undefined;
function down(event: PointerEvent) { if (busy.value || reasons.value || (event.target as HTMLElement).closest('button, a')) return; pointer = event.pointerId; startX = event.clientX; dragging.value = true; (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId); }
function move(event: PointerEvent) { if (dragging.value && event.pointerId === pointer) dx.value = event.clientX - startX; }
function up() { if (!dragging.value) return; dragging.value = false; if (dx.value > 110) void answer(1); else if (dx.value < -110) contest(); else dx.value = 0; }
const cardStyle = computed(() => ({ transform: fly.value ? `translateX(${fly.value * 140}%) rotate(${fly.value * 18}deg)` : `translateX(${dx.value}px) rotate(${dx.value / 22}deg)`, transition: dragging.value ? 'none' : undefined }));
const hint = computed(() => Math.min(1, Math.abs(dx.value) / 110));

function keydown(event: KeyboardEvent) {
  if (!(event.target as HTMLElement).closest?.('#queue-dialog') || (event.target as HTMLElement).closest('input, textarea')) return;
  if (event.key === 'ArrowRight') { event.preventDefault(); void answer(1); }
  else if (event.key === 'ArrowLeft') { event.preventDefault(); contest(); }
  else if (event.key === 'ArrowDown') { event.preventDefault(); if (current.value?.declaration) void answer(0); else skip(); }
}
onMounted(() => window.addEventListener('keydown', keydown));
onBeforeUnmount(() => { window.removeEventListener('keydown', keydown); void loadQueue(); });
const correctionText = (item: CorrectionView) => item.field === 'cancelled' ? 'Cours annulé' : item.field === 'room' ? `Salle ${item.course.location || '?'} → ${item.value}` : `Horaire → ${item.value}`;
</script>
<template><AccessibleDialog id="queue-dialog" title="À valider" :subtitle="current ? `${total - remaining.length + 1} sur ${total} · glisse à droite pour ${current.declaration ? 'oui' : 'confirmer'}, à gauche pour ${current.declaration ? 'non' : 'contester'}` : undefined" @close="ui.queue = false">
<div class="swipe-area">
  <div v-if="!current" class="empty-state"><strong>Tout est à jour</strong><span>Merci, la promo compte sur toi.</span><button class="primary-action" @click="ui.queue = false">Fermer</button></div>
  <template v-else>
    <div class="swipe-progress" aria-hidden="true"><i :style="{ width: ((total - remaining.length) / Math.max(1, total) * 100) + '%' }"></i></div>
    <div class="swipe-stack">
      <div v-if="remaining[1]" class="swipe-card behind" aria-hidden="true"></div>
      <article :key="current.key" class="swipe-card" :class="current.work ? 'type-' + current.work.type : 'type-correction'" :style="cardStyle" @pointerdown="down" @pointermove="move" @pointerup="up" @pointercancel="up">
        <span class="swipe-stamp yes" :style="{ opacity: dx > 0 ? hint : 0 }" aria-hidden="true">{{ current.declaration ? 'Oui' : 'Confirmer' }}</span>
        <span class="swipe-stamp no" :style="{ opacity: dx < 0 ? hint : 0 }" aria-hidden="true">{{ current.declaration ? 'Non' : 'Contester' }}</span>
        <template v-if="current.work">
          <p class="swipe-kind"><WorkTypeIcon :type="current.work.type" />{{ WORK_TYPE_LABELS[current.work.type] }}<span v-if="current.proposal"> · {{ current.work.proposal!.kind === 'delete' ? 'suppression proposée' : 'modification proposée' }}</span></p>
          <h3>{{ current.work.title }}</h3>
          <p class="swipe-when">{{ frenchDate(current.work.day, { weekday: 'long', day: 'numeric', month: 'long' }) }} · {{ current.work.time }}</p>
          <dl class="swipe-facts"><dt>Pour</dt><dd>{{ current.work.scopeLabel }}</dd><template v-if="current.work.details.where"><dt>Où</dt><dd>{{ current.work.details.where }}</dd></template><template v-if="current.work.details.format"><dt>Format</dt><dd>{{ current.work.details.format }}</dd></template><template v-if="current.work.course"><dt>Cours</dt><dd>{{ current.work.course.summary }}</dd></template><dt>Par</dt><dd>{{ current.work.author }} · {{ Math.floor(current.work.up) }}/{{ current.work.required }} 👍</dd></dl>
          <ul v-if="current.proposal && current.work.proposal!.kind === 'edit'" class="diff"><li v-for="change in current.work.proposal!.changes" :key="change.field"><span class="muted">{{ change.label }} :</span> <del>{{ change.before }}</del> <ArrowRightIcon class="inline-icon" aria-hidden="true" /> <strong>{{ change.after }}</strong></li></ul>
          <p v-else-if="current.proposal" class="swipe-reason">« {{ current.work.proposal!.reason }} »</p>
          <button class="text-button" @click="openedWork = current.work.id; ui.queue = false">Voir la fiche complète</button>
        </template>
        <template v-else-if="current.declaration">
          <p class="swipe-kind"><ShieldCheckIcon class="work-type-icon" aria-hidden="true" />Déclaration de délégué(e)</p>
          <h3>{{ current.declaration.name }} se déclare délégué(e) {{ current.declaration.title }} de {{ current.declaration.group }}</h3>
          <p class="swipe-when">Est-ce exact ?</p>
          <dl class="swipe-facts"><template v-if="current.declaration.electedOn"><dt>Élu(e) le</dt><dd>{{ frenchDate(current.declaration.electedOn, { day: 'numeric', month: 'long', year: 'numeric' }) }}</dd></template><template v-if="current.declaration.note"><dt>Précision</dt><dd>{{ current.declaration.note }}</dd></template></dl>
          <p class="muted">Ce n’est pas un vote : ton avis aide l’administration, qui vérifie avec la liste des délégué(e)s élu(e)s.</p>
        </template>
        <template v-else-if="current.correction">
          <p class="swipe-kind">Correction d’emploi du temps</p>
          <h3>{{ current.correction.course.summary }}</h3>
          <p class="swipe-when">{{ frenchDate(campusDate(current.correction.course.start), { weekday: 'long', day: 'numeric', month: 'long' }) }} · {{ campusTime(current.correction.course.start) }}</p>
          <p class="swipe-reason">{{ correctionText(current.correction) }}</p>
          <p class="muted">Certifié sur l’honneur par {{ current.correction.author }}</p>
        </template>
      </article>
    </div>
    <div v-if="reasons" class="reason-sheet" role="group" aria-label="Pourquoi contester ?"><p><strong>Pourquoi ?</strong></p><div class="choice-row"><button v-for="reason in CONTEST_REASONS" :key="reason" :disabled="busy" @click="answer(-1, reason)">{{ reason }}</button></div><button class="text-button" @click="reasons = false">Annuler</button></div>
    <div v-else class="swipe-actions"><button class="round-action no" :disabled="busy" :aria-label="current.declaration ? 'Non, ce n’est pas notre délégué(e) (flèche gauche)' : 'Contester (flèche gauche)'" @click="contest"><XMarkIcon aria-hidden="true" /></button><button v-if="current.declaration" class="round-action skip" :disabled="busy" aria-label="Je ne sais pas (flèche bas)" title="Je ne sais pas" @click="answer(0)"><QuestionMarkCircleIcon aria-hidden="true" /></button><button v-else class="round-action skip" :disabled="busy" aria-label="Passer (flèche bas)" @click="skip"><ForwardIcon aria-hidden="true" /></button><button class="round-action yes" :disabled="busy" :aria-label="current.declaration ? 'Oui, c’est bien notre délégué(e) (flèche droite)' : 'Confirmer (flèche droite)'" @click="answer(1)"><CheckIcon aria-hidden="true" /></button></div>
  </template>
  <p v-if="status" class="form-error" role="alert">{{ status }}</p>
</div>
</AccessibleDialog></template>
