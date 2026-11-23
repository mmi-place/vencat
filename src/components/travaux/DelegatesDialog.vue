<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import AccessibleDialog from '../AccessibleDialog.vue';
import { api, errorText, me, ui, canContribute } from '../../scripts/travaux';
import { selection } from '../../scripts/calendarStore';
import { groupById } from '../../../shared/selection';
interface Data { active: { id: string; name: string; until?: string; me: boolean }[]; requests: { id: string; name: string; supports: number; needed: number; supported: boolean; mine: boolean }[] }
const groupId = computed(() => me.value?.groupId ?? selection.value?.id ?? '');
const group = computed(() => groupById(groupId.value));
const data = ref<Data>({ active: [], requests: [] });
const status = ref(''), busy = ref(false), reporting = ref<string>(), reason = ref('');
async function load() { try { data.value = await api<Data>(`/travaux/delegates/${encodeURIComponent(groupId.value)}`); } catch (error) { status.value = errorText(error); } }
onMounted(load);
async function act(action: () => Promise<unknown>, done: string) { if (!canContribute.value) { ui.value.login = true; return; } busy.value = true; status.value = ''; try { await action(); status.value = done; await load(); } catch (error) { status.value = errorText(error); } finally { busy.value = false; } }
const request = () => act(() => api('/travaux/delegates/request', { body: {} }), 'Demande envoyée. Les élèves du groupe peuvent la soutenir ; l’admin décide.');
const support = (id: string, value: boolean) => act(() => api(`/travaux/delegates/${id}/support`, { body: { value } }), value ? 'Soutien enregistré.' : 'Soutien retiré.');
const report = (id: string) => act(() => api(`/travaux/work/${id}/report`, { body: { kind: 'delegate', reason: reason.value || 'Abus de délégué' } }), 'Signalement envoyé à l’admin.');
const mine = computed(() => data.value.active.some(item => item.me) || data.value.requests.some(item => item.mine));
</script>
<template><AccessibleDialog id="delegates-dialog" :title="'Délégués · ' + (group ? group.promotion + ' ' + group.label : '')" @close="ui.delegates = false">
  <p class="muted">Mandat d’un an. Seul l’admin valide ; à 8 soutiens d’élèves du groupe (comptes de plus de 7 jours), l’admin reçoit une alerte et tranche. Pouvoirs : valider ou retirer dans leur portée, traiter les signalements, corriger le groupe d’un élève.</p>
  <ul class="device-list"><li v-for="item in data.active" :key="item.id"><span><strong>{{ item.name }}</strong><br><small class="muted">jusqu’en {{ item.until ? new Date(item.until).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }) : '—' }}</small></span><button v-if="!item.me" :aria-expanded="reporting === item.id" @click="reporting = reporting === item.id ? undefined : item.id">⚑ Signaler un abus</button></li><li v-if="!data.active.length" class="muted">Aucun délégué pour le moment.</li></ul>
  <form v-if="reporting" class="contest-box" @submit.prevent="report(reporting!)"><label class="settings-label">Motif<input v-model="reason" maxlength="300"></label><button type="submit">Envoyer</button></form>
  <div v-for="item in data.requests" :key="item.id" class="work-box info"><strong>{{ item.name }}</strong> demande à être délégué<br><span class="muted">{{ item.supports }} soutien{{ item.supports > 1 ? 's' : '' }} sur {{ item.needed }} · l’admin décide</span><div v-if="!item.mine" class="button-row"><button :aria-pressed="item.supported" :disabled="busy" @click="support(item.id, !item.supported)">{{ item.supported ? 'Retirer mon soutien' : 'Soutenir' }}</button></div></div>
  <button v-if="me && !mine && me.groupId === groupId" :disabled="busy" @click="request">Demander à être délégué</button>
  <p v-if="status" class="form-status" role="status">{{ status }}</p>
</AccessibleDialog></template>
