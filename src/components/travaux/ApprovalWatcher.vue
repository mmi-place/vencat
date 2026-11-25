<script setup lang="ts">
import { ref, watch } from 'vue';
import AccessibleDialog from '../AccessibleDialog.vue';
import { api, errorText, me, meLoaded, qrRequest, ui, notify } from '../../scripts/travaux';
// On a connected device: approves the QR code of a new device (scanned in the app or opened from its link).
const qr = ref<{ id: string; device: string; createdAt: string }>();
const busy = ref(false);
async function answer(approve: boolean) {
  const target = qr.value;
  if (!target) return;
  busy.value = true;
  try {
    await api(approve ? '/auth/approve' : '/auth/deny', { body: { requestId: target.id } });
    notify(approve ? 'Appareil connecté.' : 'Demande refusée.');
  } catch (error) { notify(errorText(error)); }
  finally { busy.value = false; qr.value = undefined; }
}
async function openQr(id: string) {
  if (!me.value) { ui.value.login = true; notify('Connecte-toi d’abord sur ce téléphone pour valider l’autre appareil.'); return; }
  try { qr.value = await api<{ id: string; device: string; createdAt: string }>(`/auth/qr-info?r=${encodeURIComponent(id)}`); }
  catch (error) { notify(errorText(error)); }
}
// A scanned QR code waits for the account to be known; without an account, sign-in comes first.
watch([meLoaded, me, qrRequest], ([loaded, value, link]) => { if (!loaded || !link) return; if (value) qrRequest.value = undefined; void openQr(link.id); }, { immediate: true });
</script>
<template>
<AccessibleDialog v-if="qr" id="qr-approve-dialog" title="Connecter cet appareil ?" @close="qr = undefined">
  <p>Le QR code scanné demande à connecter <strong>{{ qr.device }}</strong> à ton compte, demandé à {{ new Date(qr.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) }}.</p>
  <p class="muted">Valide seulement si tu es devant l’écran qui affiche ce QR code. Si quelqu’un te l’a envoyé, refuse : il pourrait accéder à ton compte.</p>
  <div class="button-row end"><button class="danger-action" :disabled="busy" @click="answer(false)">Refuser</button><button class="primary-action" :disabled="busy" @click="answer(true)">Connecter</button></div>
</AccessibleDialog>
</template>
