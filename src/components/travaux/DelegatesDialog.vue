<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { ShieldCheckIcon, FlagIcon, ClockIcon } from '@heroicons/vue/24/outline';
import AccessibleDialog from '../AccessibleDialog.vue';
import { api, errorText, me, ui, canContribute, loadQueue } from '../../scripts/travaux';
import { selection } from '../../scripts/calendarStore';
import { groupById } from '../../../shared/selection';
import { frenchDate } from '../../../shared/calendar';
// The delegates elected in the class declare themselves here. The students of the group say whether the
// declaration is right (an opinion, not a vote), and the administration checks and confirms.
interface Delegate { id: string; userId: string; name: string; title: string; until?: string; me: boolean }
interface Answers { yes: number; unknown: number; no: number }
interface Declaration { id: string; name: string; title: string; electedOn?: string; myAnswer?: 'yes' | 'unknown' | 'no' }
interface Data { active: Delegate[]; mine?: { status: string; title: string; createdAt: string; answers: Answers }; declarations: Declaration[] }
const groupId = computed(() => me.value?.groupId ?? selection.value?.id ?? '');
const group = computed(() => groupById(groupId.value));
const groupName = computed(() => group.value ? `${group.value.promotion} ${group.value.label}` : 'ton groupe');
const data = ref<Data>({ active: [], declarations: [] });
const status = ref(''), busy = ref(false), declaring = ref(false), reporting = ref<string>(), reason = ref('');
const title = ref<'titulaire' | 'suppléant'>('titulaire'), electedOn = ref(''), note = ref(''), certified = ref(false);
const today = new Date().toISOString().slice(0, 10);
async function load() { try { data.value = await api<Data>(`/travaux/delegates/${encodeURIComponent(groupId.value)}`); } catch (error) { status.value = errorText(error); } }
onMounted(load);
async function act(action: () => Promise<unknown>, done: string) {
  if (!canContribute.value) { ui.value.login = true; return; }
  busy.value = true; status.value = '';
  try { await action(); status.value = done; declaring.value = false; reporting.value = undefined; await load(); void loadQueue(); }
  catch (error) { status.value = errorText(error); } finally { busy.value = false; }
}
const declare = () => act(() => api('/travaux/delegates/request', { body: { title: title.value, electedOn: electedOn.value, note: note.value, certified: certified.value } }), 'Déclaration envoyée. Les élèves du groupe donnent leur avis, puis l’administration vérifie.');
const withdraw = () => act(() => api('/travaux/delegates/mine', { method: 'DELETE' }), 'C’est noté : tu n’es plus enregistré(e) comme délégué(e).');
const answer = (item: Declaration, value: 'yes' | 'unknown' | 'no') => act(() => api(`/travaux/delegates/${item.id}/answer`, { body: { value } }), 'Merci, ton avis est enregistré.');
const report = (delegate: Delegate) => act(() => api(`/travaux/work/${delegate.userId}/report`, { body: { kind: 'delegate', reason: reason.value || 'Ce n’est pas un(e) délégué(e) élu(e) du groupe' } }), 'Signalement envoyé à l’administration.');
const pending = computed(() => data.value.mine?.status === 'requested');
const refused = computed(() => data.value.mine?.status === 'refused');
const isDelegate = computed(() => data.value.active.some(item => item.me));
const titleLabel = (value: string) => value === 'suppléant' ? 'suppléant(e)' : 'titulaire';
const day = (iso?: string) => iso ? frenchDate(iso.slice(0, 10), { day: 'numeric', month: 'long', year: 'numeric' }) : '';
const answerLabels = { yes: 'Oui', unknown: 'Je ne sais pas', no: 'Non' } as const;
</script>
<template><AccessibleDialog id="delegates-dialog" :title="'Délégués · ' + groupName" subtitle="Les délégué(e)s élu(e)s de la classe, vérifié(e)s par l’administration." @close="ui.delegates = false">
  <section class="settings-section">
    <div class="list-card">
      <div v-for="item in data.active" :key="item.id"><span class="row-icon"><ShieldCheckIcon aria-hidden="true" /></span><span class="row-text"><strong>{{ item.name }}<span class="tag-current">{{ titleLabel(item.title) }}</span></strong><small>Vérifié(e) par l’administration · mandat jusqu’au {{ day(item.until) }}</small></span><button v-if="!item.me && me" class="row-action" :aria-expanded="reporting === item.id" @click="reporting = reporting === item.id ? undefined : item.id"><FlagIcon class="inline-icon" aria-hidden="true" /> Signaler</button></div>
      <div v-if="!data.active.length"><span class="row-text"><strong>Aucun(e) délégué(e) enregistré(e)</strong><small>Les délégué(e)s élu(e)s de {{ groupName }} peuvent se déclarer ci-dessous.</small></span></div>
    </div>
    <form v-if="reporting" class="contest-box" @submit.prevent="report(data.active.find(item => item.id === reporting)!)"><label class="settings-label">Que se passe-t-il ?<select v-model="reason"><option value="">Ce n’est pas un(e) délégué(e) élu(e) du groupe</option><option>Il ou elle n’est plus délégué(e)</option><option>Abus de ses droits (validations, retraits)</option></select></label><button type="submit" :disabled="busy">Envoyer à l’administration</button></form>
  </section>

  <section v-if="data.declarations.length" class="settings-section">
    <h3>Déclarations à vérifier</h3>
    <div v-for="item in data.declarations" :key="item.id" class="declaration-card">
      <p><strong>{{ item.name }}</strong> se déclare délégué(e) {{ titleLabel(item.title) }}<template v-if="item.electedOn">, élu(e) le {{ day(item.electedOn) }}</template>. Est-ce exact ?</p>
      <div class="choice-row" role="group" :aria-label="'Avis sur la déclaration de ' + item.name"><button v-for="(text, value) in answerLabels" :key="value" type="button" :aria-pressed="item.myAnswer === value" :disabled="busy" @click="answer(item, value)">{{ text }}</button></div>
    </div>
    <p class="field-hint">Ce n’est pas un vote : ton avis aide l’administration, qui vérifie avec la liste des délégué(e)s élu(e)s.</p>
  </section>

  <section class="settings-section">
    <template v-if="isDelegate"><p class="muted">Tu es enregistré(e) comme délégué(e) : tu peux valider ou retirer les travaux de ton groupe, traiter les signalements et corriger le groupe d’un élève.</p><button class="danger-action" :disabled="busy" @click="withdraw">Je ne suis plus délégué(e)</button></template>
    <div v-else-if="pending" class="work-box"><p><ClockIcon class="inline-icon" aria-hidden="true" /> <strong>Ta déclaration ({{ titleLabel(data.mine!.title) }}) est en cours de vérification.</strong></p><p class="muted">Avis du groupe : {{ data.mine!.answers.yes }} oui · {{ data.mine!.answers.unknown }} ne sait pas · {{ data.mine!.answers.no }} non. L’administration décide.</p><button class="text-button" :disabled="busy" @click="withdraw">Retirer ma déclaration</button></div>
    <template v-else-if="me && me.groupId === groupId">
      <p v-if="refused" class="work-box danger">Ta dernière déclaration a été refusée par l’administration. Si c’est une erreur, réponds au mail de Vencat ou contacte l’administration.</p>
      <button v-if="!declaring" @click="declaring = true">Je suis délégué(e) élu(e) de {{ groupName }}</button>
      <form v-else class="work-form" @submit.prevent="declare">
        <p class="muted">Réservé aux délégué(e)s élu(e)s de {{ groupName }}. Les élèves du groupe donnent leur avis, puis l’administration vérifie avant de t’enregistrer.</p>
        <fieldset><legend>Rôle</legend><div class="choice-row"><button type="button" :aria-pressed="title === 'titulaire'" @click="title = 'titulaire'">Titulaire</button><button type="button" :aria-pressed="title === 'suppléant'" @click="title = 'suppléant'">Suppléant(e)</button></div></fieldset>
        <label class="settings-label">Date de l’élection<input v-model="electedOn" type="date" :max="today" required></label>
        <label class="settings-label">Précision pour l’administration <span class="field-hint">(facultatif)</span><input v-model="note" maxlength="300" placeholder="Ex. élection en amphi avec Mme Dupont"></label>
        <label class="check-label"><input v-model="certified" type="checkbox" required> Je certifie sur l’honneur avoir été élu(e) délégué(e) {{ titleLabel(title) }} de {{ groupName }}. Une fausse déclaration entraîne une sanction.</label>
        <div class="form-actions"><button type="button" @click="declaring = false">Annuler</button><button type="submit" class="primary-action" :disabled="busy || !certified || !electedOn">Envoyer ma déclaration</button></div>
      </form>
    </template>
    <p v-else-if="!me" class="muted">Connecte-toi pour te déclarer délégué(e), donner ton avis ou signaler un problème.</p>
  </section>
  <p v-if="status" class="form-status" role="status">{{ status }}</p>
</AccessibleDialog></template>
