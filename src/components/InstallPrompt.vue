<script setup lang="ts">
import { computed, ref } from 'vue';
import { installEvent, installed, ios, installDismissed, dismissInstall, installApp } from '../scripts/installation';
defineProps<{ explicit?: boolean }>();
const help = ref(false);
const visible = computed(() => !installed.value && Date.now() - installDismissed.value > 14 * 86400000);
</script>
<template><section v-if="!installed && (explicit || visible)" class="install-prompt"><div><strong>Vencat sur votre écran d’accueil</strong><p class="muted">Ouvrez votre planning comme une application, même sans réseau après enregistrement.</p><p v-if="help" class="install-help">{{ ios ? 'Dans Safari, ouvrez Partager, puis « Sur l’écran d’accueil ». Validez avec Ajouter.' : 'Ouvrez le menu de votre navigateur et choisissez « Installer l’application » ou « Ajouter à l’écran d’accueil », si proposé.' }}</p></div><div class="button-row"><button @click="installEvent ? installApp() : help = !help">{{ installEvent ? 'Installer' : 'Comment installer' }}</button><button v-if="!explicit" class="icon-button" aria-label="Masquer la proposition d’installation" @click="dismissInstall"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg></button></div></section><p v-else-if="explicit" class="muted">L’application est déjà installée.</p></template>
