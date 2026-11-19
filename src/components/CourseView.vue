<script setup lang="ts">
import { computed } from 'vue';
import { ClockIcon, MapPinIcon, UserIcon, UserGroupIcon } from '@heroicons/vue/24/outline';
import type { CourseDTO } from '../../shared/courses';
import { campusTime, campusDate, frenchDate } from '../../shared/calendar';
import { courseColor, colorText, focused, preferences, courseBadges, clock } from '../scripts/calendarStore';
import { badgeLabels, badgeLevel } from '../../shared/changePresentation';
import { planningSearch, isSearchMatch } from '../scripts/searchStore';
const props = defineProps<{ course: CourseDTO; short?: boolean; list?: boolean }>();
const color = computed(() => courseColor(props.course));
const past = computed(() => Date.parse(props.course.end) <= clock.value.getTime());
const ongoing = computed(() => Date.parse(props.course.start) <= clock.value.getTime() && !past.value);
// New, moved or modified course: the badge grows more visible at 7, 5, 3 and 1 days before it.
const badge = computed(() => courseBadges.value.get(`${props.course.uid}:${props.course.start}`));
const level = computed(() => badge.value ? badgeLevel(campusDate(props.course.start), campusDate(clock.value)) : undefined);
const match = computed(() => planningSearch.value ? isSearchMatch(props.course) : undefined);
const label = computed(() => [match.value ? 'Résultat de la recherche' : '', props.course.summary, frenchDate(campusDate(props.course.start)), props.course.type, campusTime(props.course.start) + ' à ' + campusTime(props.course.end), props.course.location || 'Salle non renseignée', ...props.course.teachers, props.course.group, ongoing.value ? 'En cours' : past.value ? 'Terminé' : 'À venir', badge.value ? { added: 'Nouveau cours', moved: 'Cours déplacé', changed: 'Cours modifié' }[badge.value] : ''].filter(Boolean).join(' · '));
</script>
<template>
<button type="button" class="course" aria-haspopup="dialog" :data-course-start="course.start" :class="{ 'past-course': past, 'ongoing-course': ongoing, 'list-course': list, 'grid-course': !list, 'short-course': short, 'full-course': preferences.density === 'full', 'search-match': match === true, 'search-dimmed': match === false }" :style="{ '--course-color': color, '--course-ink': colorText(color), '--course-light-ink': colorText(color) === '#000000' ? '#172033' : color }" :aria-label="label" :title="label" @click="focused = course">
  <span class="course-stripe" aria-hidden="true"></span>
  <span class="course-content">
    <span class="course-meta"><span class="course-type">{{ course.type === 'inconnu' ? 'Cours' : course.type }}</span><span v-if="badge && level !== undefined" class="change-label" :class="['badge-' + badge, 'badge-level-' + level]">{{ badgeLabels[badge] }}</span><span v-if="course.module && course.module !== course.summary" class="course-module">{{ course.module }}</span></span>
    <span class="course-time"><ClockIcon aria-hidden="true" /><span>{{ campusTime(course.start) }}–{{ campusTime(course.end) }}</span></span>
    <strong class="course-title">{{ course.summary }}</strong>
    <span class="course-room"><MapPinIcon aria-hidden="true" /><span>{{ course.location || 'Salle non renseignée' }}</span></span>
    <span v-if="preferences.density === 'full'" class="course-teachers"><UserIcon aria-hidden="true" /><span>{{ course.teachers.join(', ') || 'Enseignant non renseigné' }}</span></span>
    <span v-if="preferences.density === 'full' && course.group" class="course-group"><UserGroupIcon aria-hidden="true" /><span>{{ course.group }}</span></span>
  </span>
</button>
</template>
