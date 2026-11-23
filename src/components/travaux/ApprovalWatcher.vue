<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import AccessibleDialog from '../AccessibleDialog.vue';
import { api, errorText, me, meLoaded, qrRequest, ui } from '../../scripts/travaux';
// On a connected device: sign-in requests of the same account, approved by choosing the number shown on the new device.
interface Pending { id: string; device: string; createdAt: string; choices: number[] }
const pending = ref<Pending>();
const qr = ref<{ id: string; device: string; number: number }>();
const status = ref(''), busy = ref(false);
let timer: ReturnType<typeof setInterval> | undefined;
async function check() {
  if (!me.value || document.hidden || pending.value) return;
  try { const list = await api<Pending[]>('/auth/pending'); pending.value = list[0]; } catch { /* retried later */ }
}
async function answer(number?: number) {
  const target = qr.value ? { id: qr.value.id } : pending.value;
  if (!target) return;
  busy.value = true; status.value = '';
  try {
    if (number === undefined) await api('/auth/deny', { body: { requestId: target.id } });
    else await api('/auth/approve', { body: { requestId: target.id, number } });
    status.value = number === undefined ? 'Demande refusée.' : 'Appareil connecté.';
    pending.value = undefined; qr.value = undefined;
  } catch (error) { status.value = errorText(error); pending.value = undefined; qr.value = undefined; }
  finally { busy.value = false; }
}
async function openQr(id: string, number: number) {
  if (!me.value) { ui.value.login = true; status.value = 'Connecte-toi d’abord sur ce téléphone pour valider l’autre appareil.'; return; }
  try { const info = await api<{ id: string; device: string }>(`/auth/qr-info?r=${encodeURIComponent(id)}`); qr.value = { ...info, number }; }
  catch (error) { status.value = errorText(error); }
}
onMounted(() => { timer = setInterval(check, 8000); document.addEventListener('visibilitychange', check); });
onBeforeUnmount(() => { clearInterval(timer); document.removeEventListener('visibilitychange', check); });
watch(me, value => { if (value) void check(); }, { immediate: true });
// A scanned QR code waits for the account to be known; without an account, sign-in comes first and the code stays pending.
watch([meLoaded, me, qrRequest], ([loaded, value, link]) => { if (!loaded || !link) return; if (value) qrRequest.value = undefined; void openQr(link.id, link.number); }, { immediate: true });
</script>
<template>
<AccessibleDialog v-if="pending" id="approve-dialog" title="Connexion demandée" @close="pending = undefined">
  <p><strong>{{ pending.device }}</strong> · {{ new Date(pending.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) }}</p>
  <p>Choisis le nombre affiché sur le nouvel appareil. Si tu n’as rien demandé, refuse.</p>
  <div class="number-choices" role="group" aria-label="Nombres"><button v-for="value in pending.choices" :key="value" :disabled="busy" @click="answer(value)">{{ value }}</button></div>
  <button class="danger-action" :disabled="busy" @click="answer()">Ce n’est pas moi</button>
</AccessibleDialog>
<AccessibleDialog v-if="qr" id="qr-approve-dialog" title="Connecter cet appareil ?" @close="qr = undefined">
  <p>Le QR code scanné demande à connecter <strong>{{ qr.device }}</strong> à ton compte. Vérifie que l’écran affiche le nombre <strong>{{ qr.number }}</strong>.</p>
  <div class="button-row end"><button class="danger-action" :disabled="busy" @click="answer()">Refuser</button><button class="primary-action" :disabled="busy" @click="answer(qr.number)">Connecter</button></div>
</AccessibleDialog>
<p v-if="status" class="toast" role="status" @click="status = ''">{{ status }}</p>
</template>
