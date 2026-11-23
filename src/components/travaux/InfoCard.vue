<script setup lang="ts">
import { XMarkIcon, UserGroupIcon } from '@heroicons/vue/24/outline';
import { infoDismissed } from '../../scripts/travaux';
// How Travaux works, said once, where it is useful.
</script>
<template><div v-if="!infoDismissed" class="info-card" role="note" aria-label="Comment fonctionnent les Travaux">
  <UserGroupIcon class="info-icon" aria-hidden="true" />
  <div><strong>Déclarés par la promo, vérifiés ensemble</strong><p>Un étudiant ajoute ce qui a été annoncé en cours ; 3 confirmations le valident. En pointillés : à confirmer. En cas de doute, l’enseignant et Moodle font foi.</p></div>
  <button class="icon-button quiet" aria-label="Masquer cette explication" @click="infoDismissed = true"><XMarkIcon aria-hidden="true" /></button>
</div></template>
