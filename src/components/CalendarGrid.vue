<script setup lang="ts">
import { computed, ref, watch, nextTick, onMounted, onBeforeUnmount } from 'vue';
import CourseView from './CourseView.vue';
import { campusDate, campusTime, minuteOf, frenchDate, layoutDay, calendarWeekDays, courseOccursOn, courseKey } from '../../shared/calendar';
import { date, week, weekCourses, view, hasData, savedCourses, clock } from '../scripts/calendarStore';
const scroll = ref<HTMLElement>();
const narrow = ref(matchMedia('(max-width: 767px)').matches);
const resized = () => narrow.value = matchMedia('(max-width: 767px)').matches;
onMounted(() => { window.addEventListener('resize', resized); });
onBeforeUnmount(() => { window.removeEventListener('resize', resized); });
const scale = computed(() => narrow.value ? 1.6 : 1.4);
const dates = computed(() => view.value === 'day' ? [date.value] : calendarWeekDays(week.value, savedCourses.value));
const layout = computed(() => dates.value.map(day => layoutDay(weekCourses.value.filter(course => courseOccursOn(course, day)), day)));
const ticks = Array.from({ length: 25 }, (_, index) => index * 60);
const nowDay = computed(() => campusDate(clock.value)), now = computed(() => minuteOf(clock.value.toISOString()));
function showNow() { if (scroll.value) scroll.value.scrollTop = Math.max(0, now.value * scale.value - scroll.value.clientHeight * .4); }
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
  if (scroll.value) { scroll.value.scrollTop = Math.max(0, (Number.isFinite(first) ? first : 480) * scale.value - 14); scroll.value.scrollLeft = 0; }
}, { immediate: true });
</script>
<template>
<div ref="scroll" class="calendar-scroll" :class="{ 'day-timeline': view === 'day' }" tabindex="0" :aria-label="view === 'day' ? 'Planning du jour, défilement vertical des heures' : 'Planning de la semaine, défilement vertical des heures'">
<p v-if="!layout.flat().length" class="timeline-empty" role="status">{{ view === 'day' ? 'Aucun cours prévu ce jour.' : 'Aucun cours prévu cette semaine.' }}</p>
<div class="timeline" :style="{ '--day-count': dates.length, '--visible-days': view === 'day' ? 1 : 5, '--hour-height': scale * 60 + 'px' }">
  <div class="timeline-corner" aria-hidden="true"><span>h</span></div>
  <button v-for="day in dates" :key="day" class="timeline-day" :class="{ today: day === nowDay }" :aria-label="'Voir le ' + frenchDate(day)" @click="date = day; view = 'day'"><span>{{ frenchDate(day, { weekday: 'short' }) }}</span><strong>{{ frenchDate(day, { day: 'numeric' }) }}</strong></button>
  <div class="hour-axis" :style="{ height: 1440 * scale + 'px' }"><span v-for="tick in ticks" :key="tick" :class="{ afternoon: tick >= 780 }" :style="{ top: tick * scale + 'px' }">{{ String(tick / 60).padStart(2, '0') }}<span class="desktop-hour">:00</span></span></div>
  <section v-for="(day, index) in dates" :key="day" class="timeline-column" :aria-label="frenchDate(day)" :style="{ height: 1440 * scale + 'px' }">
    <div class="noon-band" :style="{ top: 720 * scale + 'px', height: 60 * scale + 'px' }" aria-hidden="true"></div>
    <div v-for="tick in ticks" :key="tick" class="hour-rule" :class="{ 'noon-rule': tick === 720 }" :style="{ top: tick * scale + 'px' }"></div>
    <CourseView v-for="item in layout[index]" :key="courseKey(item.course)" :course="item.course" :week="view === 'week'" :short="item.end - item.start <= 60" :style="{ position: 'absolute', top: item.start * scale + 'px', height: Math.max(24, (item.end - item.start) * scale - 4) + 'px', left: `calc(${item.column / item.columns * 100}% + 2px)`, width: `calc(${100 / item.columns}% - 4px)` }" />
    <div v-if="day === nowDay" class="now-line" :style="{ top: now * scale + 'px' }"><span class="sr-only">Maintenant {{ campusTime(clock) }}</span></div>
  </section>
</div>
</div>
</template>
