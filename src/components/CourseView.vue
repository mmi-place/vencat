<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { ClockIcon, MapPinIcon, UserIcon, UserGroupIcon } from '@heroicons/vue/24/outline';
import type { CourseDTO } from '../../shared/courses';
import { campusTime, campusDate, frenchDate } from '../../shared/calendar';
import { courseColor, colorText, focused, preferences, courseBadges, clock, savedCourses } from '../scripts/calendarStore';
import { badgeLabels, badgeLevel } from '../../shared/changePresentation';
import { planningSearch, isSearchMatch } from '../scripts/searchStore';
import { worksForCourse, unseenWorks, checkCorrection, courseHighlight } from '../scripts/travaux';
import { normalizedText } from '../../shared/calendar';
import { WORK_TYPE_LABELS } from '../../shared/travaux';
import WorkTypeIcon from './travaux/WorkTypeIcon.vue';
import { FlagIcon } from '@heroicons/vue/24/solid';
const props = defineProps<{ course: CourseDTO; short?: boolean; list?: boolean }>();
const color = computed(() => courseColor(props.course));
const past = computed(() => Date.parse(props.course.end) <= clock.value.getTime());
const ongoing = computed(() => Date.parse(props.course.start) <= clock.value.getTime() && !past.value);
// New, moved or modified course: the badge grows more visible at 7, 5, 3 and 1 days before it.
const badge = computed(() => courseBadges.value.get(`${props.course.uid}:${props.course.start}`));
const level = computed(() => badge.value ? badgeLevel(campusDate(props.course.start), campusDate(clock.value)) : undefined);
const match = computed(() => planningSearch.value ? isSearchMatch(props.course) : undefined);
// Works linked to the course: a line under the title, and a "Nouveau devoir" badge while not seen.
const linked = computed(() => worksForCourse(props.course));
const newWork = computed(() => linked.value.some(item => unseenWorks.value.some(work => work.id === item.work.id)));
// Correction reported by students: shown over CELCAT, which stays the source.
const correction = computed(() => checkCorrection(props.course));
const fixedTime = computed(() => correction.value?.field === 'time' ? correction.value.value : '');
const fixedRoom = computed(() => correction.value?.field === 'room' ? correction.value.value : '');
const cancelled = computed(() => correction.value?.field === 'cancelled');
const confirmed = computed(() => correction.value?.state === 'validated');
const firstWork = computed(() => linked.value[0]?.work);
const workLabel = (title: string, type: keyof typeof WORK_TYPE_LABELS) => title.toLowerCase().startsWith(WORK_TYPE_LABELS[type].toLowerCase()) ? title : `${WORK_TYPE_LABELS[type]} · ${title}`;
const correctionText = computed(() => !correction.value ? '' : correction.value.field === 'cancelled' ? 'Annulé selon des étudiants' : correction.value.field === 'room' ? `Salle ${correction.value.value} selon des étudiants` : `${correction.value.value} selon des étudiants`);
// Opened from a work (« Lié au cours »): the course is scrolled into view, focused and outlined for a few seconds.
// A course moved by CELCAT is found again by its subject on the same day.
const element = ref<HTMLButtonElement>();
const highlighted = computed(() => {
  const target = courseHighlight.value;
  if (!target) return false;
  if (target.uid === props.course.uid && target.start === props.course.start) return true;
  if (savedCourses.value.some(course => course.uid === target.uid && course.start === target.start)) return false;
  return campusDate(target.start) === campusDate(props.course.start) && normalizedText(target.summary) === normalizedText(props.course.summary) && normalizedText(target.module) === normalizedText(props.course.module);
});
watch(highlighted, value => { if (value) nextTick(() => { element.value?.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); element.value?.focus({ preventScroll: true }); }); }, { immediate: true });
const label = computed(() => [match.value ? 'Résultat de la recherche' : '', props.course.summary, frenchDate(campusDate(props.course.start)), props.course.type, campusTime(props.course.start) + ' à ' + campusTime(props.course.end), props.course.location || 'Salle non renseignée', ...props.course.teachers, props.course.group, ongoing.value ? 'En cours' : past.value ? 'Terminé' : 'À venir', badge.value ? { added: 'Nouveau cours', moved: 'Cours déplacé', changed: 'Cours modifié' }[badge.value] : '', newWork.value ? 'Nouveau devoir' : '', ...linked.value.map(item => `${WORK_TYPE_LABELS[item.work.type]} : ${item.work.title}`), correctionText.value].filter(Boolean).join(' · '));
</script>
<template>
<button ref="element" type="button" class="course" aria-haspopup="dialog" :data-course-start="course.start" :class="{ 'past-course': past, 'ongoing-course': ongoing, 'list-course': list, 'grid-course': !list, 'short-course': short, 'full-course': preferences.density === 'full', 'search-match': match === true, 'search-dimmed': match === false, 'cancelled-course': cancelled, 'cancel-confirmed': cancelled && confirmed, 'has-badge': !!badge && level !== undefined || cancelled || newWork, 'course-highlight': highlighted }" :style="{ '--course-color': color, '--course-ink': colorText(color), '--course-light-ink': colorText(color) === '#000000' ? '#172033' : color }" :aria-label="label" :title="label" @click="focused = course">
  <span class="course-stripe" aria-hidden="true"></span>
  <span class="course-content">
    <span v-if="cancelled" class="change-label course-badge badge-cancelled" :class="{ unconfirmed: !confirmed }">{{ confirmed ? 'Annulé' : 'Annulé ?' }}</span>
    <span v-else-if="badge && level !== undefined" class="change-label course-badge" :class="['badge-' + badge, 'badge-level-' + level]">{{ badgeLabels[badge] }}</span>
    <span v-else-if="newWork" class="change-label course-badge work-new-badge">Nouveau devoir</span>
    <span class="course-meta"><span class="course-type">{{ course.type === 'inconnu' ? 'Cours' : course.type }}</span><span v-if="course.module && course.module !== course.summary" class="course-module">{{ course.module }}</span></span>
    <span class="course-time" :class="{ 'is-fixed': fixedTime, unconfirmed: fixedTime && !confirmed }"><ClockIcon aria-hidden="true" /><span v-if="fixedTime" class="fixed-value"><del>{{ campusTime(course.start) }}–{{ campusTime(course.end) }}</del> <ins>{{ fixedTime }}</ins><FlagIcon class="fix-flag" aria-hidden="true" /></span><span v-else>{{ campusTime(course.start) }}–{{ campusTime(course.end) }}</span></span>
    <strong class="course-title">{{ course.summary }}</strong>
    <span class="course-room" :class="{ 'is-fixed': fixedRoom, unconfirmed: fixedRoom && !confirmed }"><MapPinIcon aria-hidden="true" /><span v-if="fixedRoom" class="fixed-value"><del>{{ course.location || '?' }}</del> <ins>{{ fixedRoom }}</ins><FlagIcon class="fix-flag" aria-hidden="true" /></span><span v-else>{{ course.location || 'Salle non renseignée' }}</span></span>
    <span v-if="preferences.density === 'full'" class="course-teachers"><UserIcon aria-hidden="true" /><span>{{ course.teachers.join(', ') || 'Enseignant non renseigné' }}</span></span>
    <span v-if="preferences.density === 'full' && course.group" class="course-group"><UserGroupIcon aria-hidden="true" /><span>{{ course.group }}</span></span>
    <span v-if="firstWork" class="course-works" :class="'type-' + firstWork.type"><WorkTypeIcon :type="firstWork.type" /><span class="course-works-text">{{ workLabel(firstWork.title, firstWork.type) }}{{ firstWork.hasTime ? ' · ' + firstWork.time : '' }}</span><span v-if="linked.length > 1" class="course-works-more">+{{ linked.length - 1 }}</span></span>
  </span>
</button>
</template>
