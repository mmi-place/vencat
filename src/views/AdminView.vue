<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { ChartBarIcon, ShieldExclamationIcon, UsersIcon, ClipboardDocumentListIcon, MapPinIcon, UserGroupIcon, ClockIcon, ArrowRightOnRectangleIcon, ArrowPathIcon } from '@heroicons/vue/24/outline';
import { api, errorText } from '../scripts/travaux';
import { groupOptions } from '../../shared/selection';
import { WORK_TYPE_LABELS, WORK_STATE_LABELS, type WorkView } from '../../shared/travaux';
import { frenchDate } from '../../shared/calendar';

// Administration: its own sign-in by mail code, a session that ends with the browser session.
type Tab = 'overview' | 'moderation' | 'accounts' | 'works' | 'corrections' | 'delegates' | 'log';
interface Overview {
  stats: { accounts: number; active: number; works: number; states: Record<string, number>; newWorks: number; groups: number };
  reports: { id: string; kind: string; targetId: string; title: string; reason: string; by: string; at: string }[];
  delegates: { id: string; name: string; group: string; supports: number; at: string }[];
  activeDelegates: { id: string; name: string; group: string; until?: string }[];
  names: { id: string; before: string; after: string; email?: string; at: string }[];
  alerts: { id: string; name: string; at: string; problems: string[] }[];
  students: { id: string; name: string; email?: string | null; groupId?: string; readOnlyUntil?: string; banned: boolean; reliability: number; createdAt: string }[];
  log: { id: string; at: string; by: string; action: string; target: string; reason: string }[];
}
interface Correction { id: string; group: string; course: { summary: string; start: string; location?: string }; field: string; value: string; author: string; status: string; createdAt: string }
const session = ref<{ email: string; expiresAt: string }>();
const checked = ref(false);
const email = ref(''), code = ref(''), requestId = ref(''), status = ref(''), busy = ref(false);
const tab = ref<Tab>('overview');
const data = ref<Overview>();
const works = ref<(WorkView & { group: string; promotion?: string })[]>([]);
const corrections = ref<Correction[]>([]);
const query = ref(''), workQuery = ref(''), workState = ref(''), reason = ref('');

async function check() { try { session.value = await api('/admin/me'); await load(); } catch { session.value = undefined; } checked.value = true; }
onMounted(() => { document.title = 'Administration · Vencat'; void check(); });
async function start() {
  busy.value = true; status.value = '';
  try { const result = await api<{ requestId: string; devCode?: string }>('/admin/start', { body: { email: email.value } }); requestId.value = result.requestId; if (result.devCode) code.value = result.devCode; status.value = 'Si cette adresse est autorisée, un code vient d’être envoyé.'; }
  catch (error) { status.value = errorText(error); } finally { busy.value = false; }
}
async function verify() {
  busy.value = true; status.value = '';
  try { await api('/admin/verify', { body: { requestId: requestId.value, code: code.value } }); await check(); }
  catch (error) { status.value = errorText(error); code.value = ''; } finally { busy.value = false; }
}
async function logout() { await api('/admin/logout', { body: {} }).catch(() => undefined); session.value = undefined; requestId.value = ''; code.value = ''; }
async function load() {
  try {
    data.value = await api<Overview>('/admin/overview');
    if (tab.value === 'works') works.value = await api(`/admin/works?q=${encodeURIComponent(workQuery.value)}&state=${workState.value}`);
    if (tab.value === 'corrections') corrections.value = await api('/admin/corrections');
  } catch (error) { if (/expirée|401/.test(errorText(error))) session.value = undefined; status.value = errorText(error); }
}
watch(tab, () => void load());
let timer: ReturnType<typeof setTimeout> | undefined;
watch([workQuery, workState], () => { clearTimeout(timer); timer = setTimeout(() => void load(), 250); });
async function act(body: Record<string, unknown>, done = 'Fait.') {
  busy.value = true; status.value = '';
  try { await api('/admin/action', { body: { reason: reason.value, ...body } }); status.value = done; await load(); }
  catch (error) { status.value = errorText(error); } finally { busy.value = false; }
}
async function workAction(id: string, action: string) { busy.value = true; try { await api(`/admin/work/${id}`, { body: { action, reason: reason.value } }); await load(); } catch (error) { status.value = errorText(error); } finally { busy.value = false; } }
async function correctionAction(id: string, action: string) { busy.value = true; try { await api(`/admin/correction/${id}`, { body: { action, reason: reason.value } }); await load(); } catch (error) { status.value = errorText(error); } finally { busy.value = false; } }
const todo = computed(() => data.value ? data.value.reports.length + data.value.delegates.length + data.value.names.length + data.value.alerts.length : 0);
const accounts = computed(() => (data.value?.students ?? []).filter(item => !query.value || `${item.name} ${item.email ?? ''}`.toLowerCase().includes(query.value.toLowerCase())).slice(0, 150));
const tabs = computed(() => [
  { id: 'overview' as const, label: 'Vue d’ensemble', icon: ChartBarIcon },
  { id: 'moderation' as const, label: 'Modération', icon: ShieldExclamationIcon, count: todo.value },
  { id: 'accounts' as const, label: 'Comptes', icon: UsersIcon },
  { id: 'works' as const, label: 'Travaux', icon: ClipboardDocumentListIcon },
  { id: 'corrections' as const, label: 'Corrections', icon: MapPinIcon },
  { id: 'delegates' as const, label: 'Délégués', icon: UserGroupIcon },
  { id: 'log' as const, label: 'Journal', icon: ClockIcon },
]);
const day = (iso: string) => new Date(iso).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
</script>
<template>
<div class="admin-app">
  <main v-if="!checked" class="admin-login"><p class="muted">Chargement…</p></main>
  <main v-else-if="!session" class="admin-login">
    <form class="admin-login-card" @submit.prevent="requestId ? verify() : start()">
      <p class="eyebrow">Vencat</p><h1>Administration</h1>
      <p class="muted">Accès réservé. Un code est envoyé par mail ; la session se termine à la fermeture du navigateur.</p>
      <label class="settings-label">Adresse mail<input v-model="email" type="email" autocomplete="email" required :disabled="!!requestId" autofocus></label>
      <template v-if="requestId"><label class="settings-label" for="admin-code">Code reçu</label><input id="admin-code" v-model="code" class="code-input" inputmode="numeric" autocomplete="one-time-code" maxlength="6" required @input="code = code.replace(/\D/g, '').slice(0, 6); if (code.length === 6) verify()"></template>
      <button type="submit" class="primary-action" :disabled="busy">{{ requestId ? 'Entrer' : 'Recevoir un code' }}</button>
      <button v-if="requestId" type="button" class="text-button" @click="requestId = ''; code = ''">Changer d’adresse</button>
      <p v-if="status" class="form-status" role="status">{{ status }}</p>
      <a class="text-button" href="/">← Retour à Vencat</a>
    </form>
  </main>
  <div v-else class="admin-shell">
    <aside class="admin-side">
      <a class="brand" href="/"><img src="../assets/logo.svg" width="26" height="26" alt=""><span>Vencat</span></a>
      <p class="admin-badge">Administration</p>
      <nav aria-label="Administration"><button v-for="item in tabs" :key="item.id" :aria-current="tab === item.id ? 'page' : undefined" @click="tab = item.id"><component :is="item.icon" aria-hidden="true" />{{ item.label }}<span v-if="item.count" class="count-badge">{{ item.count }}</span></button></nav>
      <div class="admin-me"><small class="muted">{{ session.email }}</small><button @click="logout"><ArrowRightOnRectangleIcon aria-hidden="true" />Se déconnecter</button></div>
    </aside>
    <main class="admin-main">
      <header class="admin-head"><h1>{{ tabs.find(item => item.id === tab)?.label }}</h1><label class="admin-reason"><span>Motif</span><input v-model="reason" maxlength="300" placeholder="Motif enregistré avec l’action (et repris dans les mails)"></label><button class="icon-button quiet" aria-label="Actualiser" @click="load"><ArrowPathIcon aria-hidden="true" /></button></header>
      <p v-if="status" class="form-status" role="status">{{ status }}</p>
      <template v-if="data && tab === 'overview'">
        <div class="admin-stats"><div class="stat"><strong>{{ data.stats.accounts }}</strong><span>comptes</span></div><div class="stat"><strong>{{ data.stats.active }}</strong><span>actifs sur 7 jours</span></div><div class="stat"><strong>{{ data.stats.works }}</strong><span>travaux partagés</span></div><div class="stat"><strong>{{ data.stats.newWorks }}</strong><span>ajoutés cette semaine</span></div><div class="stat"><strong>{{ data.stats.states.contested ?? 0 }}</strong><span>contestés</span></div><div class="stat"><strong>{{ todo }}</strong><span>à traiter</span></div></div>
        <section class="admin-card"><h2>À traiter</h2><p v-if="!todo" class="muted">Rien en attente.</p><button v-else class="primary-action" @click="tab = 'moderation'">Ouvrir la modération ({{ todo }})</button></section>
        <section class="admin-card"><h2>États des travaux</h2><div class="admin-bars"><div v-for="(count, state) in data.stats.states" :key="state" class="admin-bar"><span>{{ WORK_STATE_LABELS[state as keyof typeof WORK_STATE_LABELS] ?? state }}</span><i :style="{ width: (count / Math.max(1, data.stats.works) * 100) + '%' }"></i><b>{{ count }}</b></div></div></section>
      </template>
      <template v-else-if="data && tab === 'moderation'">
        <p v-if="!todo" class="muted">Rien à traiter.</p>
        <section v-if="data.reports.length" class="admin-card"><h2>Signalements</h2><div v-for="item in data.reports" :key="item.id" class="admin-row"><div><strong>{{ item.kind === 'delegate' ? 'Délégué : ' : '' }}{{ item.title }}</strong><small>{{ item.reason }} · par {{ item.by }} · {{ day(item.at) }}</small></div><button class="danger-action" :disabled="busy" @click="act({ kind: 'report', id: item.id, action: 'remove' })">{{ item.kind === 'delegate' ? 'Retirer le mandat' : 'Retirer' }}</button><button :disabled="busy" @click="act({ kind: 'report', id: item.id, action: 'dismiss' })">Classer</button></div></section>
        <section v-if="data.delegates.length" class="admin-card"><h2>Demandes de délégué</h2><div v-for="item in data.delegates" :key="item.id" class="admin-row"><div><strong>{{ item.name }}</strong><small>{{ item.group }} · {{ item.supports }} soutiens · {{ day(item.at) }}</small></div><button class="primary-action" :disabled="busy" @click="act({ kind: 'delegate', id: item.id, action: 'accept' })">Valider</button><button :disabled="busy" @click="act({ kind: 'delegate', id: item.id, action: 'refuse' })">Refuser</button></div></section>
        <section v-if="data.names.length" class="admin-card"><h2>Corrections de nom</h2><div v-for="item in data.names" :key="item.id" class="admin-row"><div><strong>« {{ item.before }} » → « {{ item.after }} »</strong><small>{{ item.email }}</small></div><button :disabled="busy" @click="act({ kind: 'name', id: item.id, action: 'accept' })">Accepter</button><button :disabled="busy" @click="act({ kind: 'name', id: item.id, action: 'refuse' })">Refuser</button></div></section>
        <section v-if="data.alerts.length" class="admin-card"><h2>Alertes de fiabilité</h2><div v-for="item in data.alerts" :key="item.id" class="admin-row"><div><strong>{{ item.name }}</strong><small>{{ item.problems.join(' · ') }}</small></div><button :disabled="busy" @click="act({ kind: 'alert', id: item.id, action: 'mail' }, 'Mail explicatif envoyé.')">Mail explicatif</button><button :disabled="busy" @click="act({ kind: 'alert', id: item.id, action: 'dismiss' })">Classer</button></div></section>
      </template>
      <template v-else-if="data && tab === 'accounts'">
        <input v-model="query" class="admin-search" placeholder="Rechercher un nom ou une adresse" aria-label="Rechercher un compte">
        <div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Nom</th><th>Adresse</th><th>Groupe</th><th>Fiabilité</th><th>État</th><th>Actions</th></tr></thead><tbody>
          <tr v-for="person in accounts" :key="person.id"><td>{{ person.name }}</td><td class="muted">{{ person.email }}</td><td><select :value="person.groupId" :aria-label="'Groupe de ' + person.name" :disabled="busy" @change="act({ kind: 'user', id: person.id, action: 'group', groupId: ($event.target as HTMLSelectElement).value })"><option v-for="option in groupOptions" :key="option.id" :value="option.id">{{ option.promotion }} {{ option.label }}</option></select></td><td>{{ person.reliability }}</td><td><span v-if="person.banned" class="pill pill-late">banni</span><span v-else-if="person.readOnlyUntil" class="pill pill-soon">lecture seule</span><span v-else class="muted">actif</span></td>
            <td class="admin-actions"><button v-if="!person.readOnlyUntil && !person.banned" :disabled="busy" @click="act({ kind: 'user', id: person.id, action: 'readonly' })">Lecture seule 7 j</button><button v-if="!person.banned" class="danger-action" :disabled="busy || !reason" :title="reason ? '' : 'Indique un motif'" @click="act({ kind: 'user', id: person.id, action: 'ban' })">Bannir</button><button v-if="person.readOnlyUntil || person.banned" :disabled="busy" @click="act({ kind: 'user', id: person.id, action: 'lift' })">Lever</button><button :disabled="busy" @click="act({ kind: 'delegate-appoint', id: person.id })">Nommer délégué</button><button class="danger-action" :disabled="busy || !reason" @click="act({ kind: 'user-delete', id: person.id })">Supprimer</button></td></tr>
        </tbody></table></div>
      </template>
      <template v-else-if="tab === 'works'">
        <div class="admin-filters"><input v-model="workQuery" class="admin-search" placeholder="Titre, groupe, auteur" aria-label="Rechercher un travail"><select v-model="workState" aria-label="État"><option value="">Tous les états</option><option v-for="(label, state) in WORK_STATE_LABELS" :key="state" :value="state">{{ label }}</option></select></div>
        <div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Échéance</th><th>Travail</th><th>Pour</th><th>Auteur</th><th>État</th><th>Votes</th><th>Actions</th></tr></thead><tbody>
          <tr v-for="work in works" :key="work.id"><td>{{ frenchDate(work.day, { day: 'numeric', month: 'short' }) }} {{ work.time }}</td><td><span class="type-tag" :class="'tag-' + work.type">{{ WORK_TYPE_LABELS[work.type] }}</span> {{ work.title }}</td><td>{{ work.promotion }} · {{ work.group }}</td><td>{{ work.author }}</td><td><span class="pill" :class="'pill-' + work.state">{{ WORK_STATE_LABELS[work.state] }}</span></td><td>{{ Math.floor(work.up) }} 👍 · {{ Math.floor(work.down) }} 👎</td>
            <td class="admin-actions"><button v-if="work.state !== 'validated'" :disabled="busy" @click="workAction(work.id, 'validate')">Valider</button><button v-if="work.state !== 'removed'" class="danger-action" :disabled="busy" @click="workAction(work.id, 'remove')">Retirer</button><button v-else :disabled="busy" @click="workAction(work.id, 'restore')">Rétablir</button></td></tr>
        </tbody></table></div>
      </template>
      <template v-else-if="tab === 'corrections'">
        <div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Cours</th><th>Groupe</th><th>Correction</th><th>Par</th><th>État</th><th>Actions</th></tr></thead><tbody>
          <tr v-for="item in corrections" :key="item.id"><td>{{ item.course.summary }}<br><small class="muted">{{ day(item.course.start) }}</small></td><td>{{ item.group }}</td><td>{{ item.field === 'cancelled' ? 'Annulé' : item.field === 'room' ? `Salle ${item.course.location ?? '?'} → ${item.value}` : item.value }}</td><td>{{ item.author }}</td><td>{{ item.status }}</td>
            <td class="admin-actions"><button :disabled="busy" @click="correctionAction(item.id, 'accept')">Valider</button><button class="danger-action" :disabled="busy" @click="correctionAction(item.id, 'reject')">Rejeter</button><button :disabled="busy" @click="correctionAction(item.id, 'close')">Fermer</button></td></tr>
        </tbody></table></div>
      </template>
      <template v-else-if="data && tab === 'delegates'">
        <section class="admin-card"><h2>Mandats en cours</h2><p v-if="!data.activeDelegates.length" class="muted">Aucun délégué.</p><div v-for="item in data.activeDelegates" :key="item.id" class="admin-row"><div><strong>{{ item.name }}</strong><small>{{ item.group }} · jusqu’au {{ item.until ? new Date(item.until).toLocaleDateString('fr-FR') : '—' }}</small></div><button class="danger-action" :disabled="busy" @click="act({ kind: 'delegate-end', id: item.id })">Mettre fin</button></div></section>
        <p class="muted">Pour nommer un délégué directement : onglet Comptes › Nommer délégué.</p>
      </template>
      <template v-else-if="data && tab === 'log'">
        <div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Quand</th><th>Qui</th><th>Action</th><th>Motif</th></tr></thead><tbody><tr v-for="item in data.log" :key="item.id"><td>{{ day(item.at) }}</td><td>{{ item.by }}</td><td>{{ item.action }}</td><td class="muted">{{ item.reason }}</td></tr></tbody></table></div>
      </template>
      <p class="muted admin-foot">Groupes représentés : {{ data?.stats.groups ?? '—' }}</p>
    </main>
  </div>
</div>
</template>
