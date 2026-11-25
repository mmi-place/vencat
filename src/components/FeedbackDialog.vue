<script setup lang="ts">
import { ref } from 'vue';
import { CheckCircleIcon } from '@heroicons/vue/24/outline';
import AccessibleDialog from './AccessibleDialog.vue';
import { api, errorText, me } from '../scripts/travaux';

// Beta feedback form: type, message, optional reply address and the technical context that makes a bug reproducible.
const props = defineProps<{ group?: string }>();
const emit = defineEmits<{ close: [] }>();
const kinds = [{ id: 'bug', label: 'Bug' }, { id: 'idea', label: 'Idée' }, { id: 'other', label: 'Autre' }] as const;
const kind = ref<'bug' | 'idea' | 'other'>('bug');
const message = ref(''), email = ref(me.value?.email ?? ''), withContext = ref(true);
const busy = ref(false), error = ref(''), sent = ref(false);
function context() {
  const browser = navigator.userAgent.match(/(Edg|Firefox|Chrome|Safari)\/[\d.]+/g)?.pop() ?? navigator.userAgent.slice(0, 80);
  return { page: location.pathname + location.search, groupe: props.group ?? '', version: __APP_VERSION__, navigateur: browser, écran: `${innerWidth}×${innerHeight}`, compte: me.value ? me.value.role : 'non connecté' };
}
async function submit() {
  if (busy.value) return;
  busy.value = true; error.value = '';
  try { await api('/travaux/feedback', { body: { kind: kind.value, message: message.value, email: email.value.trim(), context: withContext.value ? context() : undefined } }); sent.value = true; }
  catch (failure) { error.value = errorText(failure); } finally { busy.value = false; }
}
</script>
<template>
<AccessibleDialog title="Un retour sur la bêta ?" subtitle="Vencat Travaux est en test : dis-nous ce qui ne va pas ou ce qui manque." @close="emit('close')">
  <div v-if="sent" class="feedback-done" role="status"><CheckCircleIcon aria-hidden="true" /><p><strong>Merci, c’est envoyé !</strong></p><button class="primary-action" @click="emit('close')">Fermer</button></div>
  <form v-else class="feedback-form" @submit.prevent="submit">
    <fieldset class="feedback-kinds"><legend class="sr-only">Type de retour</legend><label v-for="item in kinds" :key="item.id" :class="{ on: kind === item.id }"><input v-model="kind" type="radio" name="feedback-kind" :value="item.id">{{ item.label }}</label></fieldset>
    <label class="settings-label">Ton message<textarea v-model="message" rows="5" maxlength="2000" required autofocus placeholder="Ce que tu as fait, ce que tu attendais, ce qui s’est passé…"></textarea></label>
    <label class="settings-label">Mail pour te répondre (facultatif)<input v-model="email" type="email" autocomplete="email" maxlength="120"></label>
    <label class="feedback-check"><input v-model="withContext" type="checkbox">Joindre les infos techniques (page, groupe, version, navigateur, taille d’écran)</label>
    <p v-if="error" class="form-status" role="alert">{{ error }}</p>
    <div class="feedback-actions"><button type="button" @click="emit('close')">Annuler</button><button class="primary-action" :disabled="busy || message.trim().length < 5">{{ busy ? 'Envoi…' : 'Envoyer' }}</button></div>
  </form>
</AccessibleDialog>
</template>
