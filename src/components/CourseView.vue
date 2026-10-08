<script setup lang="ts">
import { computed } from 'vue';
import { ClockIcon, MapPinIcon, UserIcon, UserGroupIcon } from '@heroicons/vue/24/outline';
import type { CourseDTO } from '../../shared/courses';
import { campusTime, campusDate, frenchDate } from '../../shared/calendar';
import { courseColor, colorText, focused, preferences, history, clock } from '../scripts/calendarStore';
const props = defineProps<{ course: CourseDTO; short?: boolean; week?: boolean; list?: boolean }>();
const color = computed(() => courseColor(props.course));
const past = computed(() => Date.parse(props.course.end) <= clock.value.getTime());
const ongoing = computed(() => Date.parse(props.course.start) <= clock.value.getTime() && !past.value);
const changed = computed(() => history.value.some(item => item.after?.uid === props.course.uid && item.after?.start === props.course.start));
const label = computed(() => [props.course.summary, frenchDate(campusDate(props.course.start)), props.course.type, campusTime(props.course.start) + ' à ' + campusTime(props.course.end), props.course.location || 'Salle non renseignée', ...props.course.teachers, props.course.group, ongoing.value ? 'En cours' : past.value ? 'Terminé' : 'À venir', changed.value ? 'Planning modifié' : ''].filter(Boolean).join(' · '));
</script>
<template>
<button type="button" class="course" aria-haspopup="dialog" :data-course-start="course.start" :class="{ 'past-course': past, 'ongoing-course': ongoing, 'list-course': list, 'week-course': week, 'short-course': short, 'full-course': preferences.density === 'full' }" :style="{ '--course-color': color, '--course-ink': colorText(color), '--course-light-ink': colorText(color) === '#000000' ? '#172033' : color }" :aria-label="label" :title="label" @click="focused = course">
  <span class="course-stripe" aria-hidden="true"></span>
  <span class="course-content">
    <span class="course-meta"><span class="course-type">{{ course.type === 'inconnu' ? 'Cours' : course.type }}</span><span v-if="changed" class="change-label">Modifié</span><span v-if="course.module && course.module !== course.summary" class="course-module">{{ course.module }}</span></span>
    <span class="course-time"><ClockIcon aria-hidden="true" /><span>{{ campusTime(course.start) }}–{{ campusTime(course.end) }}</span></span>
    <strong class="course-title">{{ course.summary }}</strong>
    <span class="course-room"><MapPinIcon aria-hidden="true" /><span>{{ course.location || 'Salle non renseignée' }}</span></span>
    <span v-if="preferences.density === 'full'" class="course-teachers"><UserIcon aria-hidden="true" /><span>{{ course.teachers.join(', ') || 'Enseignant non renseigné' }}</span></span>
    <span v-if="preferences.density === 'full' && course.group" class="course-group"><UserGroupIcon aria-hidden="true" /><span>{{ course.group }}</span></span>
  </span>
</button>
</template>
