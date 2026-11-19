<script setup lang="ts">
import { arrowNavigation as vArrowNavigation } from '../scripts/keyboardNavigation';
import { computed, nextTick, ref } from 'vue';
import { TrashIcon, ArrowRightIcon, CheckIcon, PlusIcon, MinusIcon, ArrowsRightLeftIcon, PencilIcon, CalendarDaysIcon } from '@heroicons/vue/24/outline';
import AccessibleDialog from './AccessibleDialog.vue';
import { visibleChanges, unseenChanges, markChangeSeen, markChangesSeen, dismissChanges, restoreChanges, clock } from '../scripts/calendarStore';
import { changeDetails, changeBadge, changeHeadline } from '../../shared/changePresentation';
import type { CourseChange } from '../../shared/changes';
import { repairText } from '../../shared/text';
import { addDay, campusDate, campusTime, frenchDate } from '../../shared/calendar';
const emit = defineEmits<{ close: []; goto: [day: string] }>();
const onlyUnread = ref(false), status = ref(''), removed = ref<string[]>([]);
const unreadIds = computed(() => new Set(unseenChanges.value.map(item => item.id)));
const touch = matchMedia('(pointer: coarse)').matches;
const course = (change: CourseChange) => (change.after ?? change.before)!;
const kindOf = (change: CourseChange) => change.kind === 'removed' ? 'removed' : changeBadge(change)!;
const icons = { added: PlusIcon, removed: MinusIcon, moved: ArrowsRightLeftIcon, changed: PencilIcon };

// Notification centre: grouped by the day the change was detected, most recent first.
const groups = computed(() => {
  const today = campusDate(clock.value), list: { day: string; label: string; items: (CourseChange & { details: ReturnType<typeof changeDetails> })[] }[] = [];
  for (const change of onlyUnread.value ? unseenChanges.value : visibleChanges.value) {
    const day = campusDate(change.detectedAt);
    let group = list[list.length - 1];
    if (group?.day !== day) {
      group = { day, label: day === today ? 'Aujourd’hui' : day === addDay(today, -1) ? 'Hier' : frenchDate(day, { weekday: 'long', day: 'numeric', month: 'long' }), items: [] };
      list.push(group);
    }
    group.items.push({ ...change, details: changeDetails(change) });
  }
  return list;
});
function ago(value: string) {
  const minutes = Math.round((clock.value.getTime() - Date.parse(value)) / 60_000);
  if (minutes < 1) return 'À l’instant';
  if (minutes < 60) return `Il y a ${minutes} min`;
  if (minutes < 24 * 60) return `Il y a ${Math.round(minutes / 60)} h`;
  return campusTime(value);
}

// Removal: swipe sideways (touch or mouse), the trash button, or the Delete key. Undo stays available.
const list = ref<HTMLElement>();
function remove(ids: string[], refocus = false) {
  const flat = groups.value.flatMap(group => group.items.map(item => item.id));
  const next = flat.find((id, index) => index > flat.indexOf(ids[ids.length - 1]!) && !ids.includes(id)) ?? [...flat].reverse().find(id => !ids.includes(id));
  removed.value = ids;
  status.value = (dismissChanges(ids) ? '' : 'Le navigateur ne permet pas de mémoriser ce choix. ') + (ids.length === 1 ? 'Notification supprimée.' : `${ids.length} notifications supprimées.`);
  ids.forEach(id => delete offsets.value[id]);
  if (refocus) nextTick(() => (list.value?.querySelector<HTMLElement>(`[data-change="${next}"] .notification-card`) ?? document.querySelector<HTMLElement>('.changes-undo'))?.focus());
}
function undo() { restoreChanges(removed.value); status.value = removed.value.length === 1 ? 'Notification rétablie.' : 'Notifications rétablies.'; removed.value = []; }
const offsets = ref<Record<string, number>>({});
let drag: { id: string; x: number; y: number; width: number; pointer: number; horizontal?: boolean } | undefined;
let swiped = false;
function pointerDown(event: PointerEvent, id: string) {
  if (event.button !== 0 || (event.target as HTMLElement).closest('button')) return;
  drag = { id, x: event.clientX, y: event.clientY, width: (event.currentTarget as HTMLElement).offsetWidth, pointer: event.pointerId };
}
function pointerMove(event: PointerEvent) {
  if (!drag || event.pointerId !== drag.pointer) return;
  const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
  if (drag.horizontal === undefined) {
    if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
    drag.horizontal = Math.abs(dx) > Math.abs(dy) * 1.2;
    if (!drag.horizontal) { drag = undefined; return; }
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }
  offsets.value[drag.id] = dx;
}
function pointerUp() {
  if (!drag) return;
  const { id, width } = drag, dx = offsets.value[id] ?? 0;
  drag = undefined; swiped = Math.abs(dx) > 8;
  if (Math.abs(dx) > width * .35) { offsets.value[id] = Math.sign(dx) * width * 1.1; setTimeout(() => remove([id]), 180); }
  else offsets.value[id] = 0;
}
function clickCard(event: MouseEvent) { if (swiped) { event.stopPropagation(); event.preventDefault(); swiped = false; } }
function keyCard(event: KeyboardEvent, id: string) {
  if ((event.key === 'Delete' || event.key === 'Backspace') && !event.altKey && !event.ctrlKey && !event.metaKey) { event.preventDefault(); remove([id], true); }
}
</script>
<template><AccessibleDialog id="changes-dialog" title="Changements du planning" wide kind="panel" @close="emit('close')">
  <div class="changes-toolbar"><div v-arrow-navigation role="group" aria-label="Filtrer les changements" class="view-switch"><button :aria-pressed="!onlyUnread" @click="onlyUnread = false">Tous</button><button :aria-pressed="onlyUnread" @click="onlyUnread = true">Non lus · {{ unseenChanges.length }}</button></div><button v-if="unseenChanges.length" class="text-action" @click="markChangesSeen"><CheckIcon aria-hidden="true" />Tout marquer comme lu</button></div>
  <p v-if="groups.length" class="muted changes-hint">{{ touch ? 'Glissez une notification sur le côté pour la supprimer.' : 'Faites glisser une notification sur le côté, ou utilisez Suppr, pour la supprimer.' }}</p>
  <p v-else class="empty-day">{{ onlyUnread ? 'Vous avez lu tous les changements.' : 'Aucun changement pour le moment.' }}</p>
  <div ref="list" class="notifications">
    <section v-for="group in groups" :key="group.day" class="notification-group" :aria-label="group.label">
      <h3 class="notification-day">{{ group.label }}</h3>
      <ol>
        <li v-for="change in group.items" :key="change.id" :data-change="change.id" class="notification" :class="['notification-' + kindOf(change), { unread: unreadIds.has(change.id) }]">
          <div class="notification-swipe" aria-hidden="true"><TrashIcon /><span>Supprimer</span></div>
          <article class="notification-card" tabindex="-1" :aria-label="changeHeadline(change) + ' : ' + repairText(course(change).summary) + (unreadIds.has(change.id) ? ', non lu' : '')" :style="offsets[change.id] ? { transform: `translateX(${offsets[change.id]}px)`, opacity: String(Math.max(.25, 1 - Math.abs(offsets[change.id]!) / 400)) } : undefined" :class="{ dragging: offsets[change.id] }" @pointerdown="pointerDown($event, change.id)" @pointermove="pointerMove" @pointerup="pointerUp" @pointercancel="pointerUp" @click.capture="clickCard" @keydown="keyCard($event, change.id)">
            <span class="notification-icon" aria-hidden="true"><component :is="icons[kindOf(change)]" /></span>
            <div class="notification-body">
              <p class="notification-top"><span class="notification-kind">{{ changeHeadline(change) }}</span><span v-if="unreadIds.has(change.id)" class="unread-dot"><span class="sr-only">Non lu</span></span><time class="notification-time" :datetime="change.detectedAt">{{ ago(change.detectedAt) }}</time></p>
              <h4>{{ repairText(course(change).summary) }}</h4>
              <p class="notification-when">{{ frenchDate(campusDate(course(change).start), { weekday: 'short', day: 'numeric', month: 'short' }) }} · {{ campusTime(course(change).start) }}–{{ campusTime(course(change).end) }}</p>
              <ul class="notification-diff"><li v-for="detail in change.details" :key="detail.field"><span class="diff-field">{{ detail.field }}</span><del v-if="change.kind !== 'added'">{{ detail.before }}</del><ArrowRightIcon v-if="change.kind === 'changed'" aria-hidden="true" /><span v-if="change.kind === 'changed'" class="sr-only">devient</span><strong v-if="change.kind !== 'removed'">{{ detail.after }}</strong></li></ul>
              <div class="notification-actions">
                <button v-if="change.after" class="text-action" @click="emit('goto', campusDate(change.after.start))"><CalendarDaysIcon aria-hidden="true" />Voir le cours</button>
                <button v-if="unreadIds.has(change.id)" class="text-action" @click="markChangeSeen(change.id)"><CheckIcon aria-hidden="true" />Lu</button>
                <button class="icon-button quiet notification-delete" :aria-label="'Supprimer la notification : ' + repairText(course(change).summary)" @click="remove([change.id], true)"><TrashIcon aria-hidden="true" /></button>
              </div>
            </div>
          </article>
        </li>
      </ol>
    </section>
  </div>
  <template #footer><div class="changes-footer"><p role="status" class="muted">{{ status || 'Les notifications restent tant que vous ne les supprimez pas.' }}</p><button v-if="removed.length" class="text-action changes-undo" @click="undo">Annuler</button><button v-else-if="visibleChanges.length" class="text-action" @click="remove(visibleChanges.map(item => item.id))"><TrashIcon aria-hidden="true" />Tout effacer</button></div></template>
</AccessibleDialog></template>
