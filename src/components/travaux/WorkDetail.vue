<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import AddToCalendar from './AddToCalendar.vue';
import { CheckCircleIcon, PencilIcon, MapPinIcon, DocumentTextIcon, UserGroupIcon, UserIcon, LinkIcon, BookOpenIcon, CheckBadgeIcon, ClockIcon, LightBulbIcon, AcademicCapIcon } from '@heroicons/vue/24/outline';
import { CheckCircleIcon as CheckCircleSolidIcon } from '@heroicons/vue/24/solid';
import { ChevronLeftIcon, ChevronRightIcon, FlagIcon, PencilSquareIcon, TrashIcon, ArrowRightIcon, ArrowLeftIcon } from '@heroicons/vue/24/outline';
withDefaults(defineProps<{ inline?: boolean; back?: boolean }>(), { back: true });
import { WORK_TYPE_LABELS, WORK_STATE_LABELS, CONTEST_REASONS, type WorkView, type HistoryEntry } from '../../../shared/travaux';
import { frenchDate, campusDate, campusTime } from '../../../shared/calendar';
import { api, errorText, openedWork, works, replaceWork, vote, me, canContribute, ui, form, marks, isDone, setDone, setNote, markWorkSeen, section, visibleWorks, label } from '../../scripts/travaux';
import { highlightCourse } from '../../scripts/travaux';
import { date as planningDate, online } from '../../scripts/calendarStore';
const work = ref<WorkView | undefined>(works.value.find(item => item.id === openedWork.value));
const history = ref<HistoryEntry[]>([]);
const status = ref(''), busy = ref(false), contesting = ref(false), deleting = ref(false), reporting = ref(false), reason = ref(''), detail = ref('');
async function refresh(id = openedWork.value) {
  if (!id || id.startsWith('local-')) return;
  markWorkSeen(id);
  try { const data = await api<{ work: WorkView; history: HistoryEntry[] }>(`/travaux/work/${id}`); if (id !== openedWork.value) return; work.value = data.work; history.value = data.history; replaceWork(data.work); }
  catch (error) { if (!work.value) status.value = errorText(error); }
}
watch(openedWork, id => { work.value = works.value.find(item => item.id === id); history.value = []; status.value = ''; contesting.value = deleting.value = reporting.value = false; void refresh(id); }, { immediate: true });
const left = computed(() => work.value ? label(work.value) : undefined);
const stateText = computed(() => !work.value ? '' : work.value.state === 'pending' ? `À confirmer · ${Math.floor(work.value.up)}/${work.value.required}` : WORK_STATE_LABELS[work.value.state]);
const moderator = computed(() => !!work.value?.voters);
function needAccount() { if (!me.value) { ui.value.login = true; return true; } if (!canContribute.value) { status.value = me.value.banned ? 'Compte banni.' : me.value.readOnlyUntil ? 'Compte en lecture seule pour le moment.' : 'Termine la création de ton compte.'; return true; } return false; }
async function run(action: () => Promise<WorkView | undefined | void>, done = '') {
  busy.value = true; status.value = '';
  try { const view = await action(); if (view) { work.value = view; replaceWork(view); } status.value = done || (!online.value ? 'Hors ligne : ton vote partira au retour du réseau.' : ''); void refresh(); }
  catch (error) { status.value = errorText(error); }
  finally { busy.value = false; }
}
const confirm = () => { if (needAccount() || !work.value) return; const id = work.value.id; void run(() => vote(`/travaux/work/${id}/vote`, { value: work.value!.myVote === 1 ? 0 : 1 })); };
function contest(choice: string) { if (!work.value) return; const id = work.value.id; const text = choice === 'Autre' ? reason.value.trim() : choice + (detail.value.trim() ? ' : ' + detail.value.trim() : ''); if (!text) { status.value = 'Indique le motif.'; return; } contesting.value = false; void run(() => vote(`/travaux/work/${id}/vote`, { value: -1, reason: text }), 'Contestation enregistrée.'); }
const withdraw = () => { if (!work.value) return; const id = work.value.id; void run(() => vote(`/travaux/work/${id}/vote`, { value: 0 }), 'Vote retiré.'); };
const voteProposal = (value: 1 | -1) => { if (needAccount() || !work.value?.proposal) return; const id = work.value.proposal.id; void run(() => vote(`/travaux/proposal/${id}/vote`, value === -1 ? { value, reason: 'Modification refusée' } : { value })); };
function proposeDelete() { if (!work.value || !reason.value.trim()) { status.value = 'Indique pourquoi.'; return; } const id = work.value.id, text = reason.value.trim(); deleting.value = false; void run(() => api<WorkView>(`/travaux/work/${id}/proposal`, { body: { kind: 'delete', reason: text } }), 'Proposition envoyée : le travail reste visible pendant le vote.'); }
function report() { if (!work.value) return; const id = work.value.id, text = reason.value.trim() || 'Contenu inapproprié'; reporting.value = false; void run(async () => { await api(`/travaux/work/${id}/report`, { body: { reason: text } }); }, 'Signalement envoyé. Merci.'); }
const moderate = (action: 'validate' | 'remove' | 'restore', falseWork = false) => { if (!work.value) return; const id = work.value.id; void run(() => api<WorkView>(`/travaux/work/${id}/moderate`, { body: { action, reason: reason.value.trim(), false: falseWork } })); };
const teacherConfirm = () => { if (!work.value) return; const id = work.value.id; void run(() => api<WorkView>(`/travaux/work/${id}/confirm`, { body: {} })); };
async function removeOwn() { if (!work.value || !window.confirm('Supprimer ce travail perso ?')) return; const id = work.value.id; await run(() => api<WorkView>(`/travaux/work/${id}/proposal`, { body: { kind: 'delete', reason: 'Supprimé par son auteur' } })); openedWork.value = undefined; }
function edit() { if (needAccount() || !work.value) return; form.value = { mode: 'edit', work: work.value }; }
function startContest() { if (needAccount()) return; reason.value = ''; detail.value = ''; contesting.value = !contesting.value; }
function gotoCourse() { const course = work.value?.course; if (!course) return; planningDate.value = campusDate(course.start); section.value = 'cours'; openedWork.value = undefined; highlightCourse(course); }
const note = ref(marks.value.notes[openedWork.value ?? ''] ?? '');
// The note follows the account copy when it arrives (unless it is being typed).
const noteFocused = ref(false);
watch(() => marks.value.notes[openedWork.value ?? ''], value => { if (!noteFocused.value) note.value = value ?? ''; });
watch(openedWork, id => { note.value = marks.value.notes[id ?? ''] ?? ''; });
// ← / → go to the previous or next work, as in a course window.
const ordered = computed(() => visibleWorks.value);
const index = computed(() => ordered.value.findIndex(item => item.id === openedWork.value));
const previous = computed(() => index.value > 0 ? ordered.value[index.value - 1] : undefined);
const next = computed(() => index.value >= 0 ? ordered.value[index.value + 1] : undefined);
function keydown(event: KeyboardEvent) {
  const target = event.target as HTMLElement;
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || !target.closest?.('.work-detail-root') || target.closest('input, select, textarea, [role="group"]')) return;
  const item = event.key === 'ArrowLeft' ? previous.value : event.key === 'ArrowRight' ? next.value : undefined;
  if (item) { event.preventDefault(); openedWork.value = item.id; }
}
onMounted(() => window.addEventListener('keydown', keydown));
onBeforeUnmount(() => window.removeEventListener('keydown', keydown));
const initials = (name: string) => name.split(/\s+/).filter(Boolean).map(part => part[0]).slice(0, 2).join('').toUpperCase();
function autoGrow(event: Event) { const area = event.target as HTMLTextAreaElement; area.style.height = 'auto'; area.style.height = area.scrollHeight + 'px'; }
const stamp = (iso: string) => new Date(iso).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
</script>
<template><div class="work-detail-root" :class="{ inline }"><header v-if="inline" class="panel-header"><button v-if="back" class="icon-button quiet" aria-label="Revenir à la journée" @click="openedWork = undefined"><ArrowLeftIcon aria-hidden="true" /></button><h2 tabindex="-1">{{ work?.title ?? 'Travail' }}</h2></header><div v-if="work" class="work-detail" :class="'type-' + work.type">
  <p class="work-detail-tags"><span class="type-tag" :class="'tag-' + work.type">{{ WORK_TYPE_LABELS[work.type] }}<template v-if="work.ds"> · DS</template></span><span v-if="!work.personal" class="pill" :class="'pill-' + work.state">{{ stateText }}</span><span v-if="work.teacherConfirmed" class="pill pill-validated">Confirmé par l’enseignant</span><span v-if="work.personal" class="pill pill-personal">Perso · visible par toi seul</span><span v-if="left && work.state !== 'removed'" class="pill" :class="left.late ? 'pill-late' : left.level >= 2 ? 'pill-soon' : 'pill-neutral'">{{ left.label }}</span></p>
  <p class="work-when"><strong>{{ frenchDate(work.day, { weekday: 'long', day: 'numeric', month: 'long' }) }} à {{ work.time }}</strong><span v-if="!work.hasTime" class="muted"> (heure non précisée)</span><br><span class="muted">Pour {{ work.scopeLabel }}</span></p>
  <section class="for-me" aria-label="Pour moi">
    <button type="button" class="done-toggle" :class="{ on: isDone(work.id) }" :aria-pressed="isDone(work.id)" @click="setDone(work.id, !isDone(work.id))"><CheckCircleSolidIcon v-if="isDone(work.id)" aria-hidden="true" /><CheckCircleIcon v-else aria-hidden="true" /><span>{{ isDone(work.id) ? 'Fait' : 'Marquer comme fait' }}</span></button>
    <label class="note-field"><span class="sr-only">Ma note (privée)</span><PencilIcon aria-hidden="true" /><textarea v-model="note" rows="1" maxlength="2000" placeholder="Ajouter une note perso…" @input="autoGrow($event); setNote(work.id, note)" @focus="noteFocused = true" @blur="noteFocused = false"></textarea></label>
    <p v-if="!me" class="for-me-hint">Sans compte, la case et la note restent sur cet appareil.</p>
  </section>
  <AddToCalendar v-if="work.state !== 'removed' && !work.local" :work="work" />
  <p v-if="work.state === 'removed'" class="notice">Ce travail a été retiré. L’historique reste consultable.</p>
  <div v-if="work.state === 'contested' && work.reasons.length" class="work-box warn"><strong>Contesté</strong><ul><li v-for="(item, i) in work.reasons" :key="i">{{ item }}</li></ul><p class="muted">L’auteur peut proposer une correction.</p></div>

  <div v-if="work.proposal" class="work-box" :class="work.proposal.kind === 'delete' ? 'danger' : 'warn'">
    <strong>{{ work.proposal.kind === 'delete' ? 'Suppression proposée' : 'Modification proposée' }} par {{ work.proposal.author }}</strong>
    <p v-if="work.proposal.kind === 'delete'">« {{ work.proposal.reason }} »</p>
    <ul v-else class="diff"><li v-for="change in work.proposal.changes" :key="change.field"><span class="muted">{{ change.label }} :</span> <del>{{ change.before }}</del> <ArrowRightIcon aria-hidden="true" class="inline-icon" /><span class="sr-only">devient</span> <strong>{{ change.after }}</strong></li></ul>
    <p class="muted">{{ Math.floor(work.proposal.up) }} 👍 · {{ Math.floor(work.proposal.down) }} 👎</p>
    <div v-if="!work.proposal.mine" class="button-row"><button :aria-pressed="work.proposal.myVote === 1" :disabled="busy" @click="voteProposal(1)">👍 Valider {{ work.proposal.kind === 'delete' ? 'la suppression' : 'la modif' }}</button><button :aria-pressed="work.proposal.myVote === -1" :disabled="busy" @click="voteProposal(-1)">👎 Refuser</button></div>
    <p v-else class="muted">Ta proposition attend l’avis des autres.</p>
  </div>

  <section v-if="work.details.where || work.details.format || work.details.mode || work.details.info || work.links.length" class="facts" aria-label="Modalités">
    <h3>Modalités</h3>
    <div v-if="work.details.where" class="fact"><MapPinIcon aria-hidden="true" /><div><span class="fact-label">Où rendre</span><span class="fact-value">{{ work.details.where }}</span></div></div>
    <div v-if="work.details.format" class="fact"><DocumentTextIcon aria-hidden="true" /><div><span class="fact-label">Format</span><span class="fact-value">{{ work.details.format }}</span></div></div>
    <div v-if="work.details.mode" class="fact"><UserGroupIcon v-if="work.details.mode === 'groupe'" aria-hidden="true" /><UserIcon v-else aria-hidden="true" /><div><span class="fact-label">Travail</span><span class="fact-value">{{ work.details.mode === 'seul' ? 'Seul' : 'En groupe' }}</span></div></div>
    <p v-if="work.details.info" class="fact-note">{{ work.details.info }}</p>
    <div v-if="work.links.length" class="fact-links"><template v-for="link in work.links" :key="link.url"><a v-if="link.active" class="link-chip" :href="link.url" target="_blank" rel="noopener noreferrer nofollow ugc"><LinkIcon aria-hidden="true" />{{ link.domain }}</a><span v-else class="link-chip inactive" :title="link.url"><LinkIcon aria-hidden="true" />{{ link.domain }} · actif après validation</span></template></div>
  </section>
  <section v-if="work.ds" class="facts" aria-label="Infos du DS">
    <h3>Infos du DS</h3>
    <div v-if="work.ds.chapters" class="fact"><BookOpenIcon aria-hidden="true" /><div><span class="fact-label">Chapitres</span><span class="fact-value">{{ work.ds.chapters }}</span></div></div>
    <div v-if="work.ds.allowed.length" class="fact"><CheckBadgeIcon aria-hidden="true" /><div><span class="fact-label">Autorisé</span><span class="fact-value chips"><span v-for="item in work.ds.allowed" :key="item" class="mini-chip">{{ item }}</span></span></div></div>
    <div v-if="work.ds.duration" class="fact"><ClockIcon aria-hidden="true" /><div><span class="fact-label">Durée</span><span class="fact-value">{{ work.ds.duration }}</span></div></div>
    <div v-if="work.ds.advice" class="fact"><LightBulbIcon aria-hidden="true" /><div><span class="fact-label">Conseils</span><span class="fact-value">{{ work.ds.advice }}</span></div></div>
    <p class="fact-foot">Pas de sujets ni de corrigés : ils sont retirés.</p>
  </section>
  <section v-if="!work.personal || work.course" class="attribution" aria-label="Origine">
    <div v-if="!work.personal" class="attribution-author"><span class="avatar small" aria-hidden="true">{{ initials(work.author) }}</span><span><span class="fact-label">Ajouté par</span><strong>{{ work.author }}</strong><small>le {{ stamp(work.createdAt) }}</small></span></div>
    <button v-if="work.course" type="button" class="course-chip" @click="gotoCourse"><AcademicCapIcon aria-hidden="true" /><span><span class="fact-label">Lié au cours</span><strong>{{ work.course.type ? work.course.type + ' · ' : '' }}{{ work.course.summary }}</strong><small>{{ frenchDate(campusDate(work.course.start), { weekday: 'short', day: 'numeric', month: 'short' }) }} à {{ campusTime(work.course.start) }}</small></span><ChevronRightIcon class="chevron" aria-hidden="true" /></button>
  </section>

  <p v-if="work.local" class="work-box warn">En attente d’envoi : ce travail sera proposé dès le retour du réseau.</p>
  <div v-else-if="work.personal" class="button-row personal-actions"><button @click="edit"><PencilSquareIcon aria-hidden="true" />Modifier</button><button class="danger-action" :disabled="busy" @click="removeOwn"><TrashIcon aria-hidden="true" />Supprimer</button></div>
  <div v-else-if="work.state !== 'removed'" class="vote-block">
    <div v-if="!work.mine" class="button-row"><button class="vote-up" :aria-pressed="work.myVote === 1" :disabled="busy" @click="confirm">👍 Confirmer · {{ Math.floor(work.up) }}</button><button :aria-pressed="work.myVote === -1" :aria-expanded="contesting" :disabled="busy" @click="work.myVote === -1 ? withdraw() : startContest()">👎 {{ work.myVote === -1 ? 'Retirer ma contestation' : 'Contester' }}<template v-if="work.down"> · {{ Math.floor(work.down) }}</template></button></div>
    <p v-else class="muted">Tu as proposé ce travail : ton vote ne compte pas. {{ Math.floor(work.up) }} 👍 · {{ Math.floor(work.down) }} 👎</p>
    <div v-if="contesting" class="contest-box" role="group" aria-label="Motif de la contestation"><p>Pourquoi ?</p><div class="filter-chips"><button v-for="choice in CONTEST_REASONS.filter(item => item !== 'Autre')" :key="choice" @click="contest(choice)">{{ choice }}</button></div><label class="settings-label">Précision (facultatif)<input v-model="detail" maxlength="200" placeholder="Ex. c’est vendredi, pas jeudi"></label><label class="settings-label">Autre motif<input v-model="reason" maxlength="300"></label><button :disabled="!reason.trim()" @click="contest('Autre')">Envoyer</button></div>
    <div class="button-row secondary"><button :disabled="busy || !!work.proposal" @click="edit"><PencilSquareIcon aria-hidden="true" />Proposer une modif</button><button :disabled="busy || !!work.proposal" :aria-expanded="deleting" @click="needAccount() || (reason = 'N’existe pas', deleting = !deleting)"><TrashIcon aria-hidden="true" />N’existe plus</button><button class="icon-button" :aria-expanded="reporting" aria-label="Signaler" title="Signaler" @click="needAccount() || (reason = '', reporting = !reporting)"><FlagIcon aria-hidden="true" /></button></div>
    <div v-if="deleting" class="contest-box"><label class="settings-label">Pourquoi ce travail n’existe plus ?<select v-model="reason"><option>N’existe pas</option><option>Annulé par l’enseignant</option><option>Doublon</option><option>Déjà rendu / passé</option></select></label><p class="muted">Le travail reste visible, barré, pendant le vote. Rien n’est effacé définitivement.</p><button @click="proposeDelete">Proposer la suppression</button></div>
    <div v-if="reporting" class="contest-box"><label class="settings-label">Signaler (sujet ou corrigé partagé, lien piégé, contenu déplacé…)<input v-model="reason" maxlength="300" placeholder="Motif"></label><button @click="report">Envoyer le signalement</button></div>
    <div v-if="moderator" class="contest-box moderator"><p><strong>Délégué / admin</strong></p><details><summary>Votes ({{ work.voters!.length }})</summary><ul><li v-for="(voter, i) in work.voters" :key="i">{{ voter.value > 0 ? '👍' : '👎' }} {{ voter.name }}<span v-if="voter.reason" class="muted"> · {{ voter.reason }}</span></li></ul></details><div class="button-row"><button v-if="work.state !== 'validated'" @click="moderate('validate')">Valider directement</button><button @click="moderate('remove', true)">Retirer (faux)</button><button @click="moderate('remove')">Retirer</button></div></div>
    <button v-if="me?.role === 'teacher' && !work.teacherConfirmed" class="primary-action" @click="teacherConfirm">Confirmer en tant qu’enseignant</button>
  </div>
  <div v-else-if="moderator" class="button-row"><button @click="moderate('restore')">Rétablir</button></div>


  <details v-if="history.length && !work.personal" class="work-history"><summary>Historique ({{ history.length }})</summary><ol><li v-for="(entry, i) in history" :key="i"><span class="muted">{{ stamp(entry.at) }}</span> · {{ entry.action }} · {{ entry.by }}<span v-if="entry.detail" class="muted"> — {{ entry.detail }}</span></li></ol></details>
  <p class="sr-only" role="status">{{ status }}</p><p v-if="status" class="form-status">{{ status }}</p>
  <nav v-if="previous || next" class="course-stepper" aria-label="Autres travaux"><button :disabled="!previous" :aria-label="previous ? 'Travail précédent : ' + previous.title : 'Pas de travail précédent'" @click="openedWork = previous?.id"><ChevronLeftIcon aria-hidden="true" />Précédent</button><button :disabled="!next" :aria-label="next ? 'Travail suivant : ' + next.title : 'Pas de travail suivant'" @click="openedWork = next?.id"><span>Suivant</span><ChevronRightIcon aria-hidden="true" /></button></nav>
</div><p v-else-if="status" class="notice">{{ status }}</p><p v-else role="status">Chargement…</p></div></template>
