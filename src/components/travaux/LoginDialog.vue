<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch, nextTick } from 'vue';
import QRCode from 'qrcode';
import AccessibleDialog from '../AccessibleDialog.vue';
import { api, errorText, me, ui, needsOnboarding, loadMe } from '../../scripts/travaux';
import { selection } from '../../scripts/calendarStore';
import { groupOptions } from '../../../shared/selection';
import { isStudentEmail, type Me } from '../../../shared/travaux';

type Step = 'email' | 'wait' | 'qr';
const step = ref<Step>('email');
const email = ref(''), code = ref(''), status = ref(''), busy = ref(false);
const request = ref<{ requestId: string; poll: string; number: number; devices?: number; mailSent?: boolean; url?: string }>();
const qrImage = ref('');
let timer: ReturnType<typeof setInterval> | undefined;
const stop = () => { clearInterval(timer); timer = undefined; };
onBeforeUnmount(stop);
function poll() {
  stop();
  timer = setInterval(async () => {
    if (!request.value || document.hidden) return;
    try {
      const result = await api<{ status: string; me?: Me }>('/auth/poll', { body: { requestId: request.value.requestId, poll: request.value.poll } });
      if (result.status === 'approved' && result.me) { stop(); me.value = result.me; status.value = 'Connecté.'; }
      else if (result.status === 'denied') { stop(); status.value = 'Demande refusée sur l’autre appareil.'; step.value = 'email'; request.value = undefined; }
    } catch (error) { stop(); status.value = errorText(error); }
  }, 2000);
}
async function start() {
  status.value = '';
  if (!isStudentEmail(email.value)) { status.value = 'Utilise ton adresse étudiante, qui se termine par .uvsq.fr (prenom.nom@ens.uvsq.fr).'; return; }
  busy.value = true;
  try {
    const result = await api<typeof request.value & { devCode?: string }>('/auth/start', { body: { email: email.value } });
    request.value = result; step.value = 'wait'; poll();
    if (result?.devCode) { code.value = result.devCode; status.value = 'Mode développement : code prérempli.'; }
    nextTick(() => document.getElementById('login-code')?.focus());
  } catch (error) { status.value = errorText(error); }
  finally { busy.value = false; }
}
async function sendMail() {
  if (!request.value) return;
  busy.value = true; status.value = '';
  try { const result = await api<{ devCode?: string }>('/auth/send-mail', { body: { requestId: request.value.requestId, poll: request.value.poll } }); request.value.mailSent = true; if (result.devCode) code.value = result.devCode; status.value = 'Mail envoyé. Regarde aussi dans les indésirables.'; }
  catch (error) { status.value = errorText(error); } finally { busy.value = false; }
}
async function verify() {
  if (!request.value) return;
  busy.value = true; status.value = '';
  try { const result = await api<{ me: Me }>('/auth/verify', { body: { requestId: request.value.requestId, poll: request.value.poll, code: code.value } }); stop(); me.value = result.me; }
  catch (error) { status.value = errorText(error); } finally { busy.value = false; }
}
async function showQr() {
  step.value = 'qr'; status.value = ''; busy.value = true;
  try {
    const result = await api<NonNullable<typeof request.value>>('/auth/qr', { body: {} });
    request.value = result;
    qrImage.value = await QRCode.toDataURL(result.url!, { margin: 1, width: 220, color: { dark: '#0b1020', light: '#ffffff' } });
    poll();
  } catch (error) { status.value = errorText(error); } finally { busy.value = false; }
}
function back() { stop(); step.value = 'email'; request.value = undefined; code.value = ''; status.value = ''; }

// First sign-in: name proposed from the address, group to choose, terms to accept.
const groupId = ref(selection.value?.id ?? '');
const cgu = ref(false);
const department = computed(() => groupOptions.find(group => group.id === groupId.value)?.department);
const nameFix = ref(false), firstName = ref(''), lastName = ref('');
watch(me, value => { if (value) { firstName.value = value.firstName; lastName.value = value.lastName; } }, { immediate: true });
async function onboard() {
  busy.value = true; status.value = '';
  try {
    const result = await api<{ me: Me }>('/account/onboard', { body: { groupId: groupId.value, cgu: cgu.value } });
    if (nameFix.value && (firstName.value !== result.me.firstName || lastName.value !== result.me.lastName)) await api('/account/name', { body: { firstName: firstName.value, lastName: lastName.value } });
    me.value = result.me; ui.value.login = false;
  } catch (error) { status.value = errorText(error); } finally { busy.value = false; }
}
watch(() => !!me.value && !needsOnboarding.value, ready => { if (ready) { stop(); ui.value.login = false; void loadMe(); } });
const dialogTitle = computed(() => me.value ? 'Bienvenue sur les Travaux' : 'Se connecter');
</script>
<template><AccessibleDialog id="login-dialog" :title="dialogTitle" @close="ui.login = false">
<form v-if="me && needsOnboarding" class="work-form" @submit.prevent="onboard">
  <p>Ton nom affiché : <strong>{{ me.firstName }} {{ me.lastName }}</strong><span class="muted"> (déduit de {{ me.email }})</span></p>
  <label class="check-label"><input v-model="nameFix" type="checkbox"> Ce n’est pas mon nom exact</label>
  <div v-if="nameFix" class="form-row"><label class="settings-label">Prénom<input v-model="firstName" maxlength="60"></label><label class="settings-label">Nom<input v-model="lastName" maxlength="60"></label></div>
  <p v-if="nameFix" class="muted">La correction est validée par l’admin, pour éviter les usurpations.</p>
  <label v-if="me.role !== 'teacher'" class="settings-label">Mon groupe<select v-model="groupId" required><option value="" disabled>Choisir</option><optgroup v-for="promotion in [...new Set(groupOptions.filter(g => !department || g.department === department).map(g => g.promotion))]" :key="promotion" :label="promotion"><option v-for="group in groupOptions.filter(g => g.promotion === promotion)" :key="group.id" :value="group.id">{{ group.promotion }} · {{ group.label }}</option></optgroup></select><small class="muted">Modifiable une fois par semestre, ou par un délégué.</small></label>
  <label class="check-label"><input v-model="cgu" type="checkbox" required> J’accepte les <button type="button" class="text-action" @click="ui.cgu = true">conditions d’utilisation et la politique de confidentialité</button>. Mon nom sera visible par tous.</label>
  <p v-if="status" class="form-error" role="alert">{{ status }}</p>
  <div class="button-row end"><button type="submit" class="primary-action" :disabled="busy || !cgu || (!groupId && me.role !== 'teacher')">Continuer</button></div>
</form>
<form v-else-if="step === 'email'" class="work-form" @submit.prevent="start">
  <p class="muted">La lecture ne demande pas de compte. Un compte sert à proposer, voter, cocher « fait » et garder tes notes sur tous tes appareils.</p>
  <label class="settings-label">Mail étudiant<input v-model="email" type="email" autocomplete="email" inputmode="email" required placeholder="prenom.nom@ens.uvsq.fr" autofocus></label>
  <p v-if="status" class="form-error" role="alert">{{ status }}</p>
  <div class="button-row end"><button type="button" @click="showQr">Afficher un QR code</button><button type="submit" class="primary-action" :disabled="busy">Continuer</button></div>
  <p class="muted">Projet étudiant non officiel. <button type="button" class="text-action" @click="ui.cgu = true">Conditions et confidentialité</button></p>
</form>
<div v-else-if="step === 'wait' && request" class="work-form">
  <div v-if="request.devices" class="work-box info"><p>Valide sur ton appareil déjà connecté : il affiche une demande avec trois nombres. Choisis celui-ci :</p><p class="big-number" aria-label="Nombre à choisir">{{ request.number }}</p></div>
  <div v-if="request.mailSent"><p>Un mail avec un code à 6 chiffres et un lien a été envoyé à <strong>{{ email }}</strong>. Valable 10 minutes.</p></div>
  <form v-if="request.mailSent" class="code-row" @submit.prevent="verify"><label class="settings-label">Code reçu par mail<input id="login-code" v-model="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9 ]{6,7}" maxlength="7" required placeholder="000000"></label><button type="submit" class="primary-action" :disabled="busy || code.replace(/\D/g, '').length !== 6">Valider</button></form>
  <button v-else :disabled="busy" @click="sendMail">Recevoir plutôt un code par mail</button>
  <p v-if="status" class="form-status" role="status">{{ status }}</p>
  <button class="text-action" @click="back">Changer d’adresse</button>
</div>
<div v-else-if="step === 'qr'" class="work-form qr-step">
  <p>Ouvre Vencat sur ton téléphone déjà connecté, puis scanne ce code (menu › Mon compte › Scanner un QR, ou l’appareil photo).</p>
  <img v-if="qrImage" :src="qrImage" width="220" height="220" alt="QR code de connexion" class="qr-image">
  <p v-if="request" class="muted">Le téléphone affichera le nombre <strong>{{ request.number }}</strong>. Valable 10 minutes.</p>
  <p v-if="status" class="form-status" role="status">{{ status }}</p>
  <button class="text-action" @click="back">Revenir</button>
</div>
</AccessibleDialog></template>
