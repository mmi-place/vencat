<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { ShieldCheckIcon, FlagIcon } from '@heroicons/vue/24/outline';
import AccessibleDialog from '../AccessibleDialog.vue';
import { api, errorText, me, ui, canContribute } from '../../scripts/travaux';
import { selection } from '../../scripts/calendarStore';
import { groupById } from '../../../shared/selection';
// The real class representatives, elected at the IUT, declare themselves here; the administration checks
// and confirms. There is no vote in Vencat.
interface Delegate { id: string; userId: string; name: string; title: string; until?: string; me: boolean }
interface Data { active: Delegate[]; pending: number; mine?: { status: string; title: string; createdAt: string } }
const groupId = computed(() => me.value?.groupId ?? selection.value?.id ?? '');
const group = computed(() => groupById(groupId.value));
const data = ref<Data>({ active: [], pending: 0 });
const status = ref(''), busy = ref(false), declaring = ref(false), title = ref<'titulaire' | 'suppléant'>('titulaire'), note = ref(''), reporting = ref<string>(), reason = ref('');
async function load() { try { data.value = await api<Data>(`/travaux/delegates/${encodeURIComponent(groupId.value)}`); } catch (error) { status.value = errorText(error); } }
onMounted(load);
async function act(action: () => Promise<unknown>, done: string) { if (!canContribute.value) { ui.value.login = true; return; } busy.value = true; status.value = ''; try { await action(); status.value = done; declaring.value = false; reporting.value = undefined; await load(); } catch (error) { status.value = errorText(error); } finally { busy.value = false; } }
const declare = () => act(() => api('/travaux/delegates/request', { body: { title: title.value, note: note.value } }), 'Déclaration envoyée : l’administration la vérifie avec la liste des délégués élus.');
const withdraw = () => act(() => api('/travaux/delegates/mine', { method: 'DELETE' }), 'C’est noté : tu n’es plus enregistré comme délégué.');
const report = (delegate: Delegate) => act(() => api(`/travaux/work/${delegate.userId}/report`, { body: { kind: 'delegate', reason: reason.value || 'Ce n’est pas un délégué élu du groupe' } }), 'Signalement envoyé à l’administration.');
const pending = computed(() => data.value.mine?.status === 'requested');
const isDelegate = computed(() => data.value.active.some(item => item.me));
const until = (iso?: string) => iso ? new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
</script>
<template><AccessibleDialog id="delegates-dialog" :title="'Délégués · ' + (group ? group.promotion + ' ' + group.label : '')" subtitle="Les délégués élus de la classe, vérifiés par l’administration." @close="ui.delegates = false">
  <div class="list-card">
    <div v-for="item in data.active" :key="item.id"><span class="row-icon"><ShieldCheckIcon aria-hidden="true" /></span><span class="row-text"><strong>{{ item.name }}<span class="tag-current">{{ item.title }}</span></strong><small>Vérifié · jusqu’au {{ until(item.until) }}</small></span><button v-if="!item.me && me" class="row-action" :aria-expanded="reporting === item.id" @click="reporting = reporting === item.id ? undefined : item.id"><FlagIcon class="inline-icon" aria-hidden="true" /> Signaler</button></div>
    <div v-if="!data.active.length"><span class="row-text"><strong>Aucun délégué enregistré</strong><small>Les délégués élus peuvent se déclarer ci-dessous.</small></span></div>
  </div>
  <form v-if="reporting" class="contest-box" @submit.prevent="report(data.active.find(item => item.id === reporting)!)"><label class="settings-label">Que se passe-t-il ?<select v-model="reason"><option value="">Ce n’est pas un délégué élu du groupe</option><option>Il n’est plus délégué</option><option>Abus de ses droits (validations, retraits)</option></select></label><button type="submit" :disabled="busy">Envoyer à l’administration</button></form>
  <section class="settings-section" style="margin-top:18px">
    <template v-if="isDelegate"><p class="muted">Tu es enregistré comme délégué : tu peux valider ou retirer les travaux de ton groupe, traiter les signalements et corriger le groupe d’un élève.</p><button class="danger-action" :disabled="busy" @click="withdraw">Je ne suis plus délégué</button></template>
    <p v-else-if="pending" class="work-box">Ta déclaration ({{ data.mine!.title }}) est en cours de vérification par l’administration.</p>
    <template v-else-if="me && me.groupId === groupId">
      <button v-if="!declaring" @click="declaring = true">Je suis délégué(e) de ce groupe</button>
      <form v-else class="work-form" @submit.prevent="declare">
        <p class="muted">Seulement si tu as été élu(e) délégué(e) de {{ group?.promotion }} {{ group?.label }}. L’administration vérifie avant de t’enregistrer ; une fausse déclaration entraîne une sanction.</p>
        <fieldset><legend>Rôle</legend><div class="choice-row"><button type="button" :aria-pressed="title === 'titulaire'" @click="title = 'titulaire'">Titulaire</button><button type="button" :aria-pressed="title === 'suppléant'" @click="title = 'suppléant'">Suppléant(e)</button></div></fieldset>
        <label class="settings-label">Précision pour l’administration (facultatif)<input v-model="note" maxlength="300" placeholder="Ex. élu le 2 octobre en amphi"></label>
        <div class="form-actions"><button type="button" @click="declaring = false">Annuler</button><button type="submit" class="primary-action" :disabled="busy">Déclarer</button></div>
      </form>
    </template>
    <p v-else-if="!me" class="muted">Connecte-toi pour te déclarer délégué ou signaler un problème.</p>
  </section>
  <p v-if="status" class="form-status" role="status">{{ status }}</p>
</AccessibleDialog></template>
