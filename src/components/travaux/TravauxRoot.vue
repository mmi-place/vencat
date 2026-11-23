<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import AccessibleDialog from '../AccessibleDialog.vue';
import WorkDialog from './WorkDialog.vue';
import WorkForm from './WorkForm.vue';
import LoginDialog from './LoginDialog.vue';
import ApprovalWatcher from './ApprovalWatcher.vue';
import AccountDialog from './AccountDialog.vue';
import QueueDialog from './QueueDialog.vue';
import DelegatesDialog from './DelegatesDialog.vue';
import ModerationDialog from './ModerationDialog.vue';
import InfoDialogs from './InfoDialogs.vue';
import { loadConfig, api, errorText, setMe, flushOutbox, notify, toast, readPendingLogin, wide, ui, form, openedWork, me, needsOnboarding, loadMe, launchLinks, loadQueue, loadWorks, loadCorrections, section } from '../../scripts/travaux';
import { online } from '../../scripts/calendarStore';
// Dialogs of the Travaux section, available from both sections.
onMounted(async () => {
  await loadMe();
  void flushOutbox();
  if (launchLinks.connexion === 'ok' && me.value) notify(`Connecté en tant que ${me.value.firstName}.`);
  if (launchLinks.connexion === 'expiree') { notify('Ce lien de connexion a expiré ou a déjà servi. Recommence.'); ui.value.login = true; }
  if (launchLinks.work) { section.value = 'travaux'; openedWork.value = launchLinks.work; }
  if (needsOnboarding.value || (!me.value && readPendingLogin())) ui.value.login = true;
});
const resume = () => { if (!document.hidden) void loadConfig(); if (!document.hidden && !me.value && !ui.value.login && readPendingLogin()) ui.value.login = true; };
document.addEventListener('visibilitychange', resume);
onBeforeUnmount(() => document.removeEventListener('visibilitychange', resume));
// Mail link: this device signs in after a confirmation (a link scanner that only opens it signs nobody in).
const magic = ref(launchLinks.magic), magicBusy = ref(false), magicError = ref('');
async function confirmMagic() {
  if (!magic.value) return;
  magicBusy.value = true; magicError.value = '';
  try { const result = await api<{ me: import('../../../shared/travaux').Me }>('/auth/magic', { body: magic.value }); setMe(result.me); magic.value = undefined; notify(`Connecté en tant que ${result.me.firstName}.`); }
  catch (error) { magicError.value = errorText(error); }
  finally { magicBusy.value = false; }
}
watch(online, value => { if (value) { void loadWorks(); void loadQueue(); void loadCorrections(); } });
let timer: ReturnType<typeof setInterval> | undefined;
onMounted(() => { timer = setInterval(() => { if (!document.hidden) { void loadConfig(); void loadQueue(); if (section.value === 'travaux') void loadWorks(); } }, 5 * 60_000); });
onBeforeUnmount(() => clearInterval(timer));
</script>
<template>
<WorkDialog v-if="openedWork && !(wide && section === 'travaux')" />
<WorkForm v-if="form" :key="(form.mode) + (form.work?.id ?? form.day ?? '')" />
<LoginDialog v-if="ui.login" />
<AccountDialog v-if="ui.account && me" />
<QueueDialog v-if="ui.queue" />
<DelegatesDialog v-if="ui.delegates" />
<ModerationDialog v-if="ui.moderation" />
<InfoDialogs />
<AccessibleDialog v-if="magic" id="magic-dialog" title="Se connecter sur cet appareil ?" subtitle="Tu as ouvert le lien de connexion reçu par mail." @close="magic = undefined"><p class="muted">Confirme seulement si c’est toi qui as demandé ce lien. Il connecte l’appareil sur lequel tu es.</p><p v-if="magicError" class="form-error" role="alert">{{ magicError }}</p><div class="form-actions"><button @click="magic = undefined">Annuler</button><button class="primary-action" :disabled="magicBusy" @click="confirmMagic">Se connecter</button></div></AccessibleDialog>
<ApprovalWatcher />
<p class="toast" :class="{ visible: !!toast }" role="status" aria-live="polite" @click="toast = ''">{{ toast }}</p>
</template>
