<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import AccessibleDialog from '../AccessibleDialog.vue';
import { api, errorText, me, ui, logout, qrRequest } from '../../scripts/travaux';
import { groupById, groupOptions } from '../../../shared/selection';
import type { Me } from '../../../shared/travaux';
interface Device { id: string; device: string; createdAt: string; lastSeen: string; current: boolean }
const devices = ref<Device[]>([]);
const status = ref(''), busy = ref(false), page = ref<'home' | 'name' | 'group' | 'delete' | 'scan'>('home');
const firstName = ref(me.value?.firstName ?? ''), lastName = ref(me.value?.lastName ?? ''), groupId = ref(me.value?.groupId ?? ''), confirmText = ref('');
const group = computed(() => groupById(me.value?.groupId ?? ''));
async function loadDevices() { try { devices.value = await api<Device[]>('/account/devices'); } catch (error) { status.value = errorText(error); } }
onMounted(loadDevices);
async function act(action: () => Promise<unknown>, done: string) { busy.value = true; status.value = ''; try { await action(); status.value = done; page.value = 'home'; } catch (error) { status.value = errorText(error); } finally { busy.value = false; } }
const revoke = (id: string) => act(async () => { await api(`/account/devices/${id}`, { method: 'DELETE' }); await loadDevices(); }, 'Appareil déconnecté.');
const askName = () => act(() => api('/account/name', { body: { firstName: firstName.value, lastName: lastName.value } }), 'Demande envoyée : l’admin la validera.');
const changeGroup = () => act(async () => { me.value = (await api<{ me: Me }>('/account/group', { body: { groupId: groupId.value } })).me; }, 'Groupe modifié.');
const remove = () => act(async () => { await api('/account', { method: 'DELETE' }); me.value = null; ui.value.account = false; }, 'Compte supprimé.');
async function signOut() { await logout(); ui.value.account = false; }
// QR scan with the camera when the browser offers it; otherwise the phone camera app opens the link.
const video = ref<HTMLVideoElement>();
let stream: MediaStream | undefined;
const canScan = 'BarcodeDetector' in window;
async function scan() {
  page.value = 'scan'; status.value = '';
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    await new Promise(resolve => requestAnimationFrame(resolve));
    if (!video.value) return;
    video.value.srcObject = stream; await video.value.play();
    const detector = new (window as unknown as { BarcodeDetector: new (options: unknown) => { detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]> } }).BarcodeDetector({ formats: ['qr_code'] });
    const loop = async () => {
      if (page.value !== 'scan' || !video.value) return stopScan();
      const codes = await detector.detect(video.value).catch(() => []);
      const value = codes[0]?.rawValue;
      if (value) { try { const url = new URL(value); if (url.origin === location.origin && url.searchParams.get('qr')) { stopScan(); qrRequest.value = { id: url.searchParams.get('qr')!, number: Number(url.searchParams.get('n')) }; ui.value.account = false; return; } } catch { /* not a Vencat code */ } }
      requestAnimationFrame(() => void loop());
    };
    void loop();
  } catch { status.value = 'Caméra indisponible : utilise l’appareil photo du téléphone pour scanner le QR code.'; page.value = 'home'; }
}
function stopScan() { stream?.getTracks().forEach(track => track.stop()); stream = undefined; }
const day = (iso: string) => new Date(iso).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
</script>
<template><AccessibleDialog v-if="me" id="account-dialog" title="Mon compte" :back="page !== 'home'" @back="stopScan(); page = 'home'" @close="stopScan(); ui.account = false">
<template v-if="page === 'home'">
  <section class="settings-section"><p><strong>{{ me.firstName }} {{ me.lastName }}</strong> · <span class="muted">{{ me.email }}</span></p><p class="muted">{{ group ? group.promotion + ' · ' + group.label : me.role === 'teacher' ? 'Enseignant' : 'Aucun groupe' }} · fiabilité : {{ me.reliabilityLabel }}<template v-if="me.role === 'delegate'"> · délégué</template><template v-if="me.role === 'admin'"> · admin</template></p>
    <p v-if="me.readOnlyUntil" class="notice">Lecture seule jusqu’au {{ day(me.readOnlyUntil) }}.</p><p v-if="me.newAccount" class="muted">Compte récent : tes votes comptent pour moitié pendant 7 jours.</p></section>
  <section class="settings-section"><h3>Mes appareils</h3><ul class="device-list"><li v-for="device in devices" :key="device.id"><span>{{ device.device }}<template v-if="device.current"> · cet appareil</template><br><small class="muted">vu le {{ day(device.lastSeen) }}</small></span><button v-if="!device.current" :disabled="busy" @click="revoke(device.id)">Déconnecter</button></li></ul>
    <button v-if="canScan" @click="scan">Scanner un QR code pour connecter un PC</button></section>
  <section class="settings-section account-actions">
    <button @click="page = 'name'">Corriger mon nom</button>
    <button :disabled="!me.groupChangeAllowed" @click="page = 'group'">Changer de groupe<small v-if="!me.groupChangeAllowed" class="muted"> · déjà fait ce semestre</small></button>
    <button @click="ui.delegates = true">Délégués de mon groupe</button>
    <button v-if="me.role === 'admin' || me.role === 'delegate'" @click="ui.moderation = true">Modération</button>
    <button @click="ui.ics = true">Abonnement agenda</button>
    <button @click="ui.cgu = true">Conditions et confidentialité</button>
    <button @click="signOut">Se déconnecter</button>
    <button class="danger-action" @click="page = 'delete'">Supprimer mon compte</button>
  </section>
</template>
<form v-else-if="page === 'name'" class="work-form" @submit.prevent="askName"><p class="muted">La correction est validée par l’admin, sinon on pourrait usurper un nom.</p><div class="form-row"><label class="settings-label">Prénom<input v-model="firstName" required maxlength="60"></label><label class="settings-label">Nom<input v-model="lastName" maxlength="60"></label></div><div class="button-row end"><button type="submit" class="primary-action" :disabled="busy">Envoyer la demande</button></div></form>
<form v-else-if="page === 'group'" class="work-form" @submit.prevent="changeGroup"><p class="muted">Possible une fois par semestre. Ensuite, demande à un délégué.</p><label class="settings-label">Groupe<select v-model="groupId"><option v-for="option in groupOptions" :key="option.id" :value="option.id">{{ option.promotion }} · {{ option.label }}</option></select></label><div class="button-row end"><button type="submit" class="primary-action" :disabled="busy || groupId === me.groupId">Changer</button></div></form>
<form v-else-if="page === 'delete'" class="work-form" @submit.prevent="remove"><p>Ton mail et ton nom sont effacés immédiatement. Tes contributions restent, signées « Ancien étudiant ». Tes notes privées et cases « fait » sont supprimées.</p><label class="settings-label">Écris SUPPRIMER pour confirmer<input v-model="confirmText" autocomplete="off"></label><div class="button-row end"><button type="submit" class="danger-action" :disabled="busy || confirmText !== 'SUPPRIMER'">Supprimer définitivement</button></div></form>
<div v-else-if="page === 'scan'" class="work-form"><video ref="video" class="scan-video" playsinline muted></video><p class="muted">Vise le QR code affiché sur le PC.</p></div>
<p v-if="status" class="form-status" role="status">{{ status }}</p>
</AccessibleDialog></template>
