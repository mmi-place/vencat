<script setup lang="ts">
import { arrowNavigation as vArrowNavigation } from '../scripts/keyboardNavigation';
import { computed, ref } from 'vue';
import { TrashIcon, ArrowRightIcon, CheckIcon } from '@heroicons/vue/24/outline';
import AccessibleDialog from './AccessibleDialog.vue';
import { visibleChanges, unseenChanges, markChangeSeen, markChangesSeen, dismissChanges } from '../scripts/calendarStore';
import { changeDetails } from '../../shared/changePresentation';
import { repairText } from '../../shared/text';
import { campusDate, campusTime, frenchDate } from '../../shared/calendar';
const emit = defineEmits<{ close: [] }>();
const onlyUnread = ref(false), status = ref('');
const unreadIds = computed(() => new Set(unseenChanges.value.map(item => item.id)));
const entries = computed(() => (onlyUnread.value ? unseenChanges.value : visibleChanges.value).map(item => ({ ...item, details: changeDetails(item) })));
function dismiss(ids: string[]) {
  status.value = dismissChanges(ids) ? 'Changements masqués sur cet appareil.' : 'Changements masqués. Le navigateur ne permet pas de mémoriser ce choix.';
}
const detected = (value: string) => new Date(value).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
</script>
<template><AccessibleDialog title="Changements du planning" wide @close="emit('close')">
  <div class="changes-toolbar"><div v-arrow-navigation role="group" aria-label="Filtrer les changements" class="view-switch"><button :aria-pressed="!onlyUnread" @click="onlyUnread = false">Tous</button><button :aria-pressed="onlyUnread" @click="onlyUnread = true">Non lus · {{ unseenChanges.length }}</button></div><button v-if="unseenChanges.length" class="text-action" @click="markChangesSeen"><CheckIcon aria-hidden="true" />Tout marquer comme lu</button></div>
  <p v-if="!entries.length" class="empty-day">{{ onlyUnread ? 'Vous avez lu tous les changements.' : 'Aucun changement pour le moment.' }}</p>
  <ol class="changes-feed"><li v-for="change in entries" :key="change.id" class="change-entry" :class="{ unread: unreadIds.has(change.id) }">
    <div class="change-entry-header"><div><span class="change-kind">{{ change.kind === 'added' ? 'Cours ajouté' : change.kind === 'removed' ? 'Cours retiré' : 'Cours modifié' }}<span v-if="unreadIds.has(change.id)" class="unread-tag">Non lu</span></span><h3>{{ repairText((change.after ?? change.before)?.summary ?? '') }}</h3></div><button class="icon-button quiet" :aria-label="'Masquer ce changement : ' + (change.after ?? change.before)?.summary" @click="dismiss([change.id])"><TrashIcon aria-hidden="true" /></button></div>
    <p class="change-course-date">{{ frenchDate(campusDate((change.after ?? change.before)!.start), { weekday: 'long', day: 'numeric', month: 'long' }) }} · {{ campusTime((change.after ?? change.before)!.start) }}–{{ campusTime((change.after ?? change.before)!.end) }}</p>
    <dl class="changed-values"><template v-for="detail in change.details" :key="detail.field"><dt>{{ detail.field }}</dt><dd><del v-if="change.kind !== 'added'">{{ detail.before }}</del><ArrowRightIcon v-if="change.kind === 'changed'" aria-hidden="true" /><strong v-if="change.kind !== 'removed'">{{ detail.after }}</strong></dd></template></dl>
    <div class="change-entry-footer"><p class="change-detected">Détecté le <time :datetime="change.detectedAt">{{ detected(change.detectedAt) }}</time></p><button v-if="unreadIds.has(change.id)" class="text-action" @click="markChangeSeen(change.id)">Marquer comme lu</button></div>
  </li></ol>
  <template #footer><div class="changes-footer"><p role="status" class="muted">{{ status || 'Les changements restent disponibles tant que vous ne les masquez pas.' }}</p><button v-if="visibleChanges.length" class="text-action" @click="dismiss(visibleChanges.map(item => item.id))"><TrashIcon aria-hidden="true" />Effacer l’historique</button></div></template>
</AccessibleDialog></template>
