<script setup lang="ts">
import { courseNavigation as vCourseNavigation } from '../scripts/keyboardNavigation';
import { wallpaperBackdrop as vWallpaperBackdrop } from '../scripts/wallpaperBackdrop';
import { computed } from 'vue';
import CourseView from './CourseView.vue';
import NextCourseHint from './NextCourseHint.vue';
import WorkDots from './travaux/WorkDots.vue';
import { isDs, worksForCourse, form, requireAccount } from '../scripts/travaux';
const addDs = (course: import('../../shared/courses').CourseDTO) => requireAccount(() => { form.value = { mode: 'ds', course }; });
import { date, week, weekCourses, savedCourses, preferences, clock } from '../scripts/calendarStore';
import { calendarWeekDays, campusDate, campusTime, courseOccursOn, courseKey, frenchDate, layoutDay } from '../../shared/calendar';
const props = defineProps<{ daily: boolean }>();
const dates = computed(() => props.daily ? [date.value] : calendarWeekDays(week.value, savedCourses.value, preferences.value.weekend));
const days = computed(() => dates.value.map(day => {
  let previousEnd = 480;
  return { day, items: layoutDay(weekCourses.value.filter(course => courseOccursOn(course, day)), day).map(item => {
    const gap = Math.max(0, item.start - previousEnd);
    const pause = { start: previousEnd, end: item.start, minutes: gap };
    previousEnd = Math.max(previousEnd, item.end);
    return { ...item, pause, height: Math.max(preferences.value.density === 'full' ? 124 : 104, (item.end - item.start) * 1.15) };
  }) };
}));
const time = (minute: number) => String(Math.floor(minute / 60)).padStart(2, '0') + ':' + String(minute % 60).padStart(2, '0');
</script>
<template><div v-course-navigation class="list-calendar" role="region" tabindex="0" aria-describedby="course-keyboard-help" :class="{ 'daily-list': daily, 'compact-list': preferences.density === 'compact' }" :style="{ '--list-days': dates.length }" :aria-label="daily ? 'Liste des cours du jour' : 'Liste des cours de la semaine'"><section v-for="entry in days" :key="entry.day" class="list-day"><header v-wallpaper-backdrop class="list-day-heading" :class="{ today: entry.day === campusDate(clock) }"><h2>{{ frenchDate(entry.day, { weekday: 'long' }) }}</h2><p>{{ frenchDate(entry.day, { day: 'numeric', month: 'short' }) }}<WorkDots :day="entry.day" /></p></header><template v-if="!entry.items.length"><p class="list-empty">Aucun cours prévu.</p><NextCourseHint v-if="daily" :after="entry.day" /></template><template v-for="(item, index) in entry.items" :key="courseKey(item.course)"><div v-if="item.pause.minutes >= 15" class="list-pause" :class="{ 'first-pause': index === 0 }" :style="{ '--pause-height': item.pause.minutes * 1.15 + 'px' }"><span>{{ index === 0 ? 'Premier cours à ' + campusTime(item.course.start) : item.pause.start < 840 && item.pause.end > 720 ? 'Pause déjeuner' : 'Pause' }}</span><span v-if="index > 0">{{ time(item.pause.start) }}–{{ time(item.pause.end) }}</span></div><CourseView :course="item.course" list :style="{ '--list-course-height': item.height + 'px' }" /><button v-if="isDs(item.course) && !worksForCourse(item.course).some(link => link.work.ds) && Date.parse(item.course.end) > clock.getTime()" type="button" class="ds-info-button" @click="addDs(item.course)">+ Ajouter les infos du DS</button></template></section></div></template>
