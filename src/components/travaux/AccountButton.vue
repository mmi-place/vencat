<script setup lang="ts">
import { computed } from 'vue';
import { UserCircleIcon } from '@heroicons/vue/24/outline';
import { me, ui, queueCount, meLoaded } from '../../scripts/travaux';
// The account lives in the main bar, in both sections.
defineProps<{ compact?: boolean }>();
const initials = computed(() => me.value ? ((me.value.firstName[0] ?? '') + (me.value.lastName[0] ?? '')).toUpperCase() || '?' : '');
const hue = computed(() => me.value ? [...me.value.id].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 360 : 0);
</script>
<template>
<button v-if="me" class="account-button" :aria-label="`Mon compte, ${me.firstName} ${me.lastName}${queueCount ? ', ' + queueCount + ' propositions à valider' : ''}`" aria-haspopup="dialog" :aria-expanded="ui.account" @click="ui.account = true"><span class="avatar" :style="{ '--hue': hue }" aria-hidden="true">{{ initials }}</span><span v-if="!compact" class="account-name">{{ me.firstName }}</span><span v-if="queueCount" class="count-badge account-badge" aria-hidden="true">{{ queueCount }}</span></button>
<button v-else-if="meLoaded" class="account-button signed-out" aria-haspopup="dialog" :aria-expanded="ui.login"  aria-label="Se connecter" @click="ui.login = true"><UserCircleIcon aria-hidden="true" /><span v-if="!compact" class="account-label">Se connecter</span></button>
</template>
