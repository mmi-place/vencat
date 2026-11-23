<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch, nextTick } from 'vue';
import QRCode from 'qrcode';
import { ArrowPathIcon } from '@heroicons/vue/24/outline';
import AccessibleDialog from '../AccessibleDialog.vue';
import { api, errorText, me, ui, needsOnboarding, loadMe, wide, savePendingLogin, readPendingLogin, clearPendingLogin } from '../../scripts/travaux';
import { selection } from '../../scripts/calendarStore';
import { groupOptions } from '../../../shared/selection';
import { isStudentEmail, type Me } from '../../../shared/travaux';

// Desktop: QR code on the left (scanned by a connected phone), mail on the right.
// Mobile: mail, then approval on a connected device when there is one, otherwise a code by mail.
interface Request { requestId: string; poll: string; number: number; devices?: number; mailSent?: boolean; url?: string; expiresAt?: string }
const email = ref(''), code = ref(''), status = ref(''), busy = ref(false);
const mailRequest = ref<Request>(), qrRequest = ref<Request>(), qrImage = ref(''), qrExpired = ref(false);
const timers: ReturnType<typeof setInterval>[] = [];
onBeforeUnmount(() => timers.forEach(clearInterval));
function poll(request: Request, onDone: () => void) {
  const timer = setInterval(async () => {
    if (document.hidden) return;
    if (request.expiresAt && Date.parse(request.expiresAt) < Date.now()) { clearInterval(timer); onDone(); return; }
    try {
      const result = await api<{ status: string; me?: Me }>('/auth/poll', { body: { requestId: request.requestId, poll: request.poll } });
      if (result.status === 'approved' && result.me) { timers.forEach(clearInterval); me.value = result.me; }
      else if (result.status === 'denied') { clearInterval(timer); status.value = 'Demande refusée sur l’autre appareil.'; onDone(); }
    } catch { clearInterval(timer); onDone(); }
  }, 2000);
  timers.push(timer);
}
async function showQr() {
  qrExpired.value = false;
  try {
    const result = await api<Request>('/auth/qr', { body: {} });
    qrRequest.value = result;
    qrImage.value = await QRCode.toDataURL(result.url!, { margin: 1, width: 360, color: { dark: '#0b1020', light: '#ffffff' } });
    poll(result, () => { qrExpired.value = true; });
  } catch { qrExpired.value = true; }
}
onMounted(() => {
  // Coming back from the mail app (the system may have reloaded the page): the request in progress is restored.
  const pending = !me.value ? readPendingLogin() : undefined;
  if (pending) { email.value = pending.email; mailRequest.value = pending.request; poll(pending.request, () => { mailRequest.value = undefined; clearPendingLogin(); }); }
  if (wide.value && !me.value) void showQr();
});

async function start() {
  status.value = '';
  if (!isStudentEmail(email.value)) { status.value = 'Utilise ton adresse étudiante, qui se termine par .uvsq.fr (prenom.nom@ens.uvsq.fr).'; return; }
  busy.value = true;
  try {
    const result = await api<Request & { devCode?: string }>('/auth/start', { body: { email: email.value } });
    mailRequest.value = result;
    savePendingLogin(email.value, result);
    poll(result, () => { status.value = 'Demande expirée. Recommence.'; mailRequest.value = undefined; clearPendingLogin(); });
    if (result.devCode) code.value = result.devCode;
    nextTick(() => document.getElementById('login-code')?.focus());
  } catch (error) { status.value = errorText(error); }
  finally { busy.value = false; }
}
async function sendMail() {
  if (!mailRequest.value) return;
  busy.value = true; status.value = '';
  try { const result = await api<{ devCode?: string }>('/auth/send-mail', { body: { requestId: mailRequest.value.requestId, poll: mailRequest.value.poll } }); mailRequest.value = { ...mailRequest.value, mailSent: true }; savePendingLogin(email.value, mailRequest.value); if (result.devCode) code.value = result.devCode; nextTick(() => document.getElementById('login-code')?.focus()); }
  catch (error) { status.value = errorText(error); } finally { busy.value = false; }
}
async function verify() {
  if (!mailRequest.value) return;
  busy.value = true; status.value = '';
  try { const result = await api<{ me: Me }>('/auth/verify', { body: { requestId: mailRequest.value.requestId, poll: mailRequest.value.poll, code: code.value } }); timers.forEach(clearInterval); me.value = result.me; }
  catch (error) { status.value = errorText(error); code.value = ''; if (/expirée/i.test(status.value)) { clearPendingLogin(); mailRequest.value = undefined; } } finally { busy.value = false; }
}
function restart() { mailRequest.value = undefined; code.value = ''; status.value = ''; clearPendingLogin(); }

// First sign-in: name from the address, group, terms.
const promotion = ref(selection.value?.promotion ?? '');
const groupId = ref(selection.value?.id ?? '');
const promotions = [...new Set(groupOptions.map(group => group.promotion))];
const promoGroups = computed(() => groupOptions.filter(group => group.promotion === promotion.value));
const cgu = ref(false), nameFix = ref(false), firstName = ref(''), lastName = ref('');
watch(me, value => { if (value) { firstName.value = value.firstName; lastName.value = value.lastName; } }, { immediate: true });
const initials = computed(() => ((me.value?.firstName[0] ?? '') + (me.value?.lastName[0] ?? '')).toUpperCase());
async function onboard() {
  busy.value = true; status.value = '';
  try {
    const result = await api<{ me: Me }>('/account/onboard', { body: { groupId: groupId.value, cgu: cgu.value } });
    if (nameFix.value && (firstName.value !== result.me.firstName || lastName.value !== result.me.lastName)) await api('/account/name', { body: { firstName: firstName.value, lastName: lastName.value } });
    me.value = result.me; ui.value.login = false;
  } catch (error) { status.value = errorText(error); } finally { busy.value = false; }
}
watch(() => !!me.value && !needsOnboarding.value, ready => { if (ready) { timers.forEach(clearInterval); clearPendingLogin(); ui.value.login = false; void loadMe(); } });
const title = computed(() => me.value ? 'Bienvenue sur Vencat' : 'Se connecter');
const subtitle = computed(() => me.value ? 'Deux réglages et c’est prêt.' : 'Pour proposer, voter, cocher « fait » et retrouver tes notes partout. La lecture reste ouverte à tous.');
</script>
<template><AccessibleDialog id="login-dialog" :title="title" :subtitle="subtitle" :wide="!me && wide" @close="ui.login = false">
<form v-if="me && needsOnboarding" class="onboard-form" @submit.prevent="onboard">
  <div class="profile-preview"><span class="avatar" aria-hidden="true">{{ initials }}</span><div><strong>{{ me.firstName }} {{ me.lastName }}</strong><p>{{ me.email }} · nom visible par tous</p></div></div>
  <label class="check-label"><input v-model="nameFix" type="checkbox"> Ce n’est pas mon nom exact</label>
  <div v-if="nameFix" class="form-row"><label class="settings-label">Prénom<input v-model="firstName" maxlength="60" autocomplete="given-name"></label><label class="settings-label">Nom<input v-model="lastName" maxlength="60" autocomplete="family-name"></label></div>
  <p v-if="nameFix" class="field-hint">La correction est validée par l’admin, pour éviter les usurpations.</p>
  <fieldset v-if="me.role !== 'teacher'" class="work-form"><legend>Ton groupe</legend>
    <label class="settings-label">Promotion<select v-model="promotion" @change="groupId = ''"><option v-for="item in promotions" :key="item" :value="item">{{ item }}</option></select></label>
    <div class="group-choices" role="group" aria-label="Groupe"><button v-for="group in promoGroups" :key="group.id" type="button" :aria-pressed="groupId === group.id" @click="groupId = group.id">{{ group.label }}</button></div>
    <p class="field-hint">Modifiable une fois par semestre, ou par un délégué.</p>
  </fieldset>
  <ul class="promise-list"><li>Seuls ton mail, ton nom et ton groupe sont enregistrés.</li><li>Tes votes restent anonymes entre élèves.</li><li>Tu peux supprimer ton compte à tout moment.</li></ul>
  <label class="check-label"><input v-model="cgu" type="checkbox" required><span>J’accepte les <button type="button" class="text-button" @click="ui.cgu = true">conditions d’utilisation</button>. Vencat est un projet étudiant non officiel.</span></label>
  <p v-if="status" class="form-error" role="alert">{{ status }}</p>
  <div class="form-actions"><button type="submit" class="primary-action" :disabled="busy || !cgu || (!groupId && me.role !== 'teacher')">C’est parti</button></div>
</form>
<div v-else class="login-layout" :class="{ 'with-qr': wide }">
  <section v-if="wide" class="login-qr" aria-labelledby="qr-title">
    <h3 id="qr-title">Avec ton téléphone</h3>
    <div class="qr-frame" :class="{ expired: qrExpired }"><img v-if="qrImage" :src="qrImage" alt="QR code de connexion"><button v-if="qrExpired" type="button" @click="showQr"><ArrowPathIcon class="inline-icon" aria-hidden="true" /> Nouveau code</button></div>
    <p>Ouvre Vencat sur ton téléphone déjà connecté, puis <strong>Mon compte › Connecter un ordinateur</strong>. L’appareil photo marche aussi.</p>
    <p v-if="qrRequest && !qrExpired" class="waiting">En attente du téléphone · nombre {{ qrRequest.number }}</p>
  </section>
  <section class="login-mail" aria-labelledby="mail-title">
    <h3 v-if="wide" id="mail-title">Avec ton mail étudiant</h3>
    <form v-if="!mailRequest" class="login-mail" @submit.prevent="start">
      <label class="settings-label">Adresse .uvsq.fr<input v-model="email" type="email" autocomplete="email" inputmode="email" required placeholder="prenom.nom@ens.uvsq.fr" autofocus></label>
      <button type="submit" class="primary-action" :disabled="busy">Continuer</button>
      <p class="legal-line">Projet étudiant non officiel · <button type="button" class="text-button" @click="ui.cgu = true">conditions et confidentialité</button></p>
    </form>
    <template v-else>
      <div v-if="mailRequest.devices && !mailRequest.mailSent" class="approve-hint"><p>Valide sur ton appareil déjà connecté. Choisis ce nombre :</p><p class="big-number" aria-label="Nombre à choisir">{{ mailRequest.number }}</p><p class="waiting">En attente de validation</p></div>
      <form v-if="mailRequest.mailSent" class="login-mail" @submit.prevent="verify">
        <p class="lead">Code envoyé à <strong>{{ email }}</strong>. Il est valable 10 minutes ; le lien du mail fonctionne aussi.</p>
        <label class="settings-label" for="login-code">Code à 6 chiffres</label>
        <input id="login-code" v-model="code" class="code-input" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required aria-describedby="code-hint" @input="code = code.replace(/\D/g, '').slice(0, 6); if (code.length === 6) verify()">
        <p id="code-hint" class="field-hint">Regarde aussi dans les indésirables.</p>
        <button type="submit" class="primary-action" :disabled="busy || code.length !== 6">Valider</button>
      </form>
      <button v-else type="button" class="text-button" :disabled="busy" @click="sendMail">Recevoir plutôt un code par mail</button>
      <button type="button" class="text-button" @click="restart">Utiliser une autre adresse</button>
    </template>
    <p v-if="status" class="form-error" role="alert">{{ status }}</p>
  </section>
</div>
</AccessibleDialog></template>
