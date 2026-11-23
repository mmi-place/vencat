<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import WorkDialog from './WorkDialog.vue';
import WorkForm from './WorkForm.vue';
import LoginDialog from './LoginDialog.vue';
import ApprovalWatcher from './ApprovalWatcher.vue';
import AccountDialog from './AccountDialog.vue';
import QueueDialog from './QueueDialog.vue';
import DelegatesDialog from './DelegatesDialog.vue';
import ModerationDialog from './ModerationDialog.vue';
import InfoDialogs from './InfoDialogs.vue';
import { readPendingLogin, wide, ui, form, openedWork, me, needsOnboarding, loadMe, launchLinks, loadQueue, loadWorks, loadCorrections, section } from '../../scripts/travaux';
import { online } from '../../scripts/calendarStore';
// Dialogs of the Travaux section, available from both sections.
const notice = ref('');
onMounted(async () => {
  await loadMe();
  if (launchLinks.connexion === 'ok') notice.value = me.value ? `Connecté en tant que ${me.value.firstName}.` : '';
  if (launchLinks.connexion === 'expiree') { notice.value = 'Ce lien de connexion a expiré ou a déjà servi. Recommence.'; ui.value.login = true; }
  if (launchLinks.work) { section.value = 'travaux'; openedWork.value = launchLinks.work; }
  if (needsOnboarding.value || (!me.value && readPendingLogin())) ui.value.login = true;
  setTimeout(() => { notice.value = ''; }, 5000);
});
document.addEventListener('visibilitychange', () => { if (!document.hidden && !me.value && !ui.value.login && readPendingLogin()) ui.value.login = true; });
watch(online, value => { if (value) { void loadWorks(); void loadQueue(); void loadCorrections(); } });
let timer: ReturnType<typeof setInterval> | undefined;
onMounted(() => { timer = setInterval(() => { if (!document.hidden) { void loadQueue(); if (section.value === 'travaux') void loadWorks(); } }, 5 * 60_000); });
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
<ApprovalWatcher />
<p v-if="notice" class="toast" role="status" @click="notice = ''">{{ notice }}</p>
</template>
