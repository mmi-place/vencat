<script setup lang="ts">
import { courseNavigation as vCourseNavigation } from '../scripts/keyboardNavigation';
import { wallpaperBackdrop as vWallpaperBackdrop } from '../scripts/wallpaperBackdrop';
import { computed, ref, watch, nextTick, onMounted, onBeforeUnmount } from 'vue';
import CourseView from './CourseView.vue';
import { campusDate, campusTime, minuteOf, frenchDate, layoutDay, calendarWeekDays, courseOccursOn, courseKey } from '../../shared/calendar';
import { date, week, weekCourses, view, hasData, savedCourses, clock, preferences, visibleHours } from '../scripts/calendarStore';
const scroll = ref<HTMLElement>();
const narrow = ref(matchMedia('(max-width: 767px)').matches);
const resized = () => narrow.value = matchMedia('(max-width: 767px)').matches;
onMounted(() => { window.addEventListener('resize', resized); });
onBeforeUnmount(() => { window.removeEventListener('resize', resized); });
const scale = computed(() => narrow.value ? 1.6 : 1.4);
const dates = computed(() => view.value === 'day' ? [date.value] : calendarWeekDays(week.value, savedCourses.value, preferences.value.weekend));
const layout = computed(() => dates.value.map(day => layoutDay(weekCourses.value.filter(course => courseOccursOn(course, day)), day)));
// The grid covers the earliest and latest hours of the school year, widened by any displayed course.
const hours = visibleHours;
const span = computed(() => hours.value.end - hours.value.start);
const ticks = computed(() => Array.from({ length: span.value / 60 + 1 }, (_, index) => hours.value.start + index * 60));
const offset = (minute: number) => (minute - hours.value.start) * scale.value;
const nowDay = computed(() => campusDate(clock.value)), now = computed(() => minuteOf(clock.value.toISOString()));
const nowVisible = computed(() => now.value >= hours.value.start && now.value <= hours.value.end);
const lunch = computed(() => ({ start: Math.max(720, hours.value.start), end: Math.min(780, hours.value.end) }));
function showNow() { if (scroll.value) scroll.value.scrollTop = Math.max(0, offset(now.value) - scroll.value.clientHeight * .4); }
defineExpose({ showNow });
watch(scale, async (value, previous) => {
  const top = scroll.value?.scrollTop ?? 0;
  await nextTick();
  if (scroll.value) scroll.value.scrollTop = top * value / previous;
});
let restored = '';
watch([() => view.value === 'day' ? date.value + ':day' : week.value + ':week', hasData], async ([key, ready]) => {
  if (!ready || restored === key) return;
  restored = String(key);
  await nextTick();
  const first = Math.min(...layout.value.flat().map(item => item.start));
  if (scroll.value) { scroll.value.scrollTop = Math.max(0, offset(Number.isFinite(first) ? first : hours.value.start) - 14); scroll.value.scrollLeft = 0; }
}, { immediate: true });
</script>
<template>
<div ref="scroll" v-course-navigation class="calendar-scroll" role="region" aria-describedby="course-keyboard-help" :class="{ 'day-timeline': view === 'day' }" tabindex="0" :aria-label="view === 'day' ? 'Planning du jour, défilement vertical des heures' : 'Planning de la semaine, défilement vertical des heures'">
<p v-if="!layout.flat().length" class="timeline-empty" role="status">{{ view === 'day' ? 'Aucun cours prévu ce jour.' : 'Aucun cours prévu cette semaine.' }}</p>
<div class="timeline" :style="{ '--day-count': dates.length, '--visible-days': view === 'day' ? 1 : 5, '--hour-height': scale * 60 + 'px' }">
  <div v-wallpaper-backdrop class="timeline-corner" aria-hidden="true"><span>h</span></div>
  <button v-for="day in dates" :key="day" v-wallpaper-backdrop class="timeline-day" :class="{ today: day === nowDay }" :aria-label="'Voir le ' + frenchDate(day)" @click="date = day; view = 'day'"><span>{{ frenchDate(day, { weekday: 'short' }) }}</span><strong>{{ frenchDate(day, { day: 'numeric' }) }}</strong></button>
  <div v-wallpaper-backdrop class="hour-axis" :style="{ height: span * scale + 'px' }"><span v-for="tick in ticks" :key="tick" :class="{ afternoon: tick >= 780 }" :style="{ top: offset(tick) + 'px' }">{{ String(tick / 60).padStart(2, '0') }}<span class="desktop-hour">:00</span></span></div>
  <section v-for="(day, index) in dates" :key="day" class="timeline-column" :aria-label="frenchDate(day)" :style="{ height: span * scale + 'px' }">
    <div v-if="lunch.end > lunch.start" class="noon-band" :style="{ top: offset(lunch.start) + 'px', height: (lunch.end - lunch.start) * scale + 'px' }" aria-hidden="true"></div>
    <div v-for="tick in ticks" :key="tick" class="hour-rule" :class="{ 'noon-rule': tick === 720 }" :style="{ top: offset(tick) + 'px' }"></div>
    <CourseView v-for="item in layout[index]" :key="courseKey(item.course)" :course="item.course" :week="view === 'week'" :short="item.end - item.start <= 60" :style="{ position: 'absolute', top: offset(Math.max(item.start, hours.start)) + 'px', height: Math.max(24, (Math.min(item.end, hours.end) - Math.max(item.start, hours.start)) * scale - 4) + 'px', left: `calc(${item.column / item.columns * 100}% + 2px)`, width: `calc(${100 / item.columns}% - 4px)` }" />
    <div v-if="day === nowDay && nowVisible" class="now-line" :style="{ top: offset(now) + 'px' }"><span class="sr-only">Maintenant {{ campusTime(clock) }}</span></div>
  </section>
</div>
</div>
</template>
