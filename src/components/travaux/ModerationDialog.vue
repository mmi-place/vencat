<script setup lang="ts">
import { fmtVotes } from '../../../shared/travaux';
import { onMounted, ref } from 'vue';
import AccessibleDialog from '../AccessibleDialog.vue';
import { api, errorText, ui, openedWork } from '../../scripts/travaux';
import { groupById, groupOptions } from '../../../shared/selection';
import { frenchStamp } from '../../../shared/calendar';
interface Queue {
  role: string;
  proposals: { id: string; workId: string; title: string; kind: 'edit' | 'delete'; author: string; reason?: string; changes: { field: string; label: string; before: string; after: string }[]; up: number; down: number; at: string }[];
  reports: { id: string; kind: string; targetId: string; title: string; reason: string; by: string; at: string }[];
  delegates: { id: string; name: string; group: string; title: string; note: string; electedOn?: string; answers: { yes: number; unknown: number; no: number }; at: string }[];
  names: { id: string; before: string; after: string; email?: string; at: string }[];
  alerts: { id: string; userId: string; name: string; at: string; problems: string[] }[];
  students: { id: string; name: string; groupId: string; readOnlyUntil?: string; banned: boolean; reliability: number }[];
  log: { id: string; at: string; by: string; action: string; target: string; reason: string }[];
}
const data = ref<Queue>();
const status = ref(''), busy = ref(false), reason = ref(''), tab = ref<'queue' | 'students' | 'log'>('queue'), filter = ref('');
async function load() { try { data.value = await api<Queue>('/travaux/moderation'); } catch (error) { status.value = errorText(error); } }
onMounted(load);
// Each action is recorded with its reason.
async function act(kind: string, id: string, action: string, extra: Record<string, unknown> = {}) {
  busy.value = true; status.value = '';
  try { await api('/travaux/moderation/action', { body: { kind, id, action, reason: reason.value, ...extra } }); status.value = 'Fait.'; reason.value = ''; await load(); }
  catch (error) { status.value = errorText(error); } finally { busy.value = false; }
}
const day = frenchStamp;
const empty = () => !!data.value && !data.value.proposals.length && !data.value.reports.length && !data.value.delegates.length && !data.value.names.length && !data.value.alerts.length;
</script>
<template><AccessibleDialog id="moderation-dialog" title="Modération" wide @close="ui.moderation = false">
<div v-if="data" class="moderation">
  <div role="group" class="view-switch" aria-label="Onglets"><button :aria-pressed="tab === 'queue'" @click="tab = 'queue'">File</button><button :aria-pressed="tab === 'students'" @click="tab = 'students'">Élèves</button><button v-if="data.role === 'admin'" :aria-pressed="tab === 'log'" @click="tab = 'log'">Journal</button></div>
  <label class="settings-label">Motif de l’action (enregistré, repris dans les mails)<input v-model="reason" maxlength="300" placeholder="Ex. lien vers un corrigé"></label>
  <template v-if="tab === 'queue'">
    <p v-if="empty()" class="muted">Rien à traiter.</p>
    <section v-if="data.proposals.length" class="mod-proposals" aria-label="Propositions à valider"><h3>Propositions à valider <span class="count">{{ data.proposals.length }}</span></h3>
      <div v-for="item in data.proposals" :key="item.id" class="mod-row"><span class="mod-main"><button class="text-action" @click="openedWork = item.workId">« {{ item.title }} »</button><span class="muted"> · {{ item.kind === 'delete' ? 'suppression' : 'modification' }} proposée par {{ item.author }} · {{ fmtVotes(item.up) }} 👍 {{ fmtVotes(item.down) }} 👎 · {{ day(item.at) }}</span>
        <span v-if="item.kind === 'delete'" class="muted">Motif : {{ item.reason }}</span><ul v-else class="diff"><li v-for="change in item.changes" :key="change.field"><span class="muted">{{ change.label }} :</span> <del>{{ change.before }}</del> → <strong>{{ change.after }}</strong></li></ul></span>
        <span class="mod-actions"><button class="primary-action" :disabled="busy" @click="act('proposal', item.id, 'accept')">Valider sans les votes</button><button :disabled="busy" @click="act('proposal', item.id, 'reject')">Refuser</button></span></div></section>
    <div v-for="item in data.reports" :key="item.id" class="mod-row"><span class="pill pill-late">signalement</span><span class="mod-main"><button v-if="item.kind === 'work'" class="text-action" @click="openedWork = item.targetId">« {{ item.title }} »</button><template v-else>{{ item.kind === 'delegate' ? 'Délégué ' : '' }}{{ item.title }}</template><br><small class="muted">{{ item.reason }} · par {{ item.by }} · {{ day(item.at) }}</small></span><button :disabled="busy" @click="act('report', item.id, 'remove')">{{ item.kind === 'delegate' ? 'Retirer le mandat' : 'Retirer' }}</button><button :disabled="busy" @click="act('report', item.id, 'dismiss')">Classer</button></div>
    <div v-for="item in data.delegates" :key="item.id" class="mod-row"><span class="pill pill-wait">délégué(e)</span><span class="mod-main">{{ item.name }} · {{ item.group }}<br><small class="muted">{{ item.title }} · avis du groupe : {{ item.answers.yes }} oui, {{ item.answers.unknown }} ne sait pas, {{ item.answers.no }} non<template v-if="item.note"> · « {{ item.note }} »</template></small></span><button class="primary-action" :disabled="busy" @click="act('delegate', item.id, 'accept')">Valider</button><button :disabled="busy" @click="act('delegate', item.id, 'refuse')">Refuser</button></div>
    <div v-for="item in data.names" :key="item.id" class="mod-row"><span class="pill pill-soon">nom</span><span class="mod-main">« {{ item.before }} » → « {{ item.after }} »<br><small class="muted">{{ item.email }}</small></span><button :disabled="busy" @click="act('name', item.id, 'accept')">Accepter</button><button :disabled="busy" @click="act('name', item.id, 'refuse')">Refuser</button></div>
    <div v-for="item in data.alerts" :key="item.id" class="mod-row"><span class="pill pill-neutral">alerte</span><span class="mod-main">{{ item.name }} : {{ item.problems.length }} problèmes sur 7 jours<br><small class="muted">{{ item.problems.join(' · ') }}</small></span><button :disabled="busy" @click="act('alert', item.id, 'mail')">Mail explicatif</button><button :disabled="busy" @click="act('alert', item.id, 'dismiss')">Classer</button></div>
  </template>
  <template v-else-if="tab === 'students'">
    <label class="settings-label">Filtrer<input v-model="filter" placeholder="Nom"></label>
    <div v-for="person in data.students.filter(item => !filter || item.name.toLowerCase().includes(filter.toLowerCase())).slice(0, 80)" :key="person.id" class="mod-row"><span class="mod-main">{{ person.name }}<br><small class="muted">{{ groupById(person.groupId)?.promotion }} {{ groupById(person.groupId)?.label }} · fiabilité {{ person.reliability }}<template v-if="person.readOnlyUntil"> · lecture seule</template><template v-if="person.banned"> · banni</template></small></span>
      <select :aria-label="'Groupe de ' + person.name" :value="person.groupId" :disabled="busy" @change="act('user', person.id, 'group', { groupId: ($event.target as HTMLSelectElement).value })"><option v-for="option in groupOptions.filter(item => data!.role === 'admin' || item.promotion === groupById(person.groupId)?.promotion)" :key="option.id" :value="option.id">{{ option.promotion }} {{ option.label }}</option></select>
      <template v-if="data.role === 'admin'"><button v-if="!person.readOnlyUntil && !person.banned" :disabled="busy" @click="act('user', person.id, 'readonly')">Lecture seule 7 j</button><button v-if="!person.banned" class="danger-action" :disabled="busy || !reason" :title="reason ? '' : 'Indique un motif'" @click="act('user', person.id, 'ban')">Bannir</button><button v-if="person.readOnlyUntil || person.banned" :disabled="busy" @click="act('user', person.id, 'lift')">Lever</button></template>
    </div>
  </template>
  <ol v-else class="mod-log"><li v-for="item in data.log" :key="item.id"><span class="muted">{{ day(item.at) }}</span> · {{ item.by }} · {{ item.action }}<span v-if="item.reason" class="muted"> — {{ item.reason }}</span></li></ol>
  <p class="muted">Sanctions progressives : signal discret, mail explicatif après 3 problèmes sur 7 jours, lecture seule 7 jours, bannissement avec contestation par mail. Toujours au compte, jamais à l’adresse IP.</p>
</div>
<p v-if="status" class="form-status" role="status">{{ status }}</p>
</AccessibleDialog></template>
