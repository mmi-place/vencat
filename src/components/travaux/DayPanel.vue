<script setup lang="ts">
import { computed, watch } from 'vue';
import { PlusIcon, CheckBadgeIcon, ChevronRightIcon } from '@heroicons/vue/24/outline';
import WorkDetail from './WorkDetail.vue';
import WorkItem from './WorkItem.vue';
import InfoCard from './InfoCard.vue';
import { travauxDay, today, worksByDay, openedWork, form, requireAccount, queueCount, ui, me, relativeDay, worksForCourse, section, travauxView, visibleWorks, lateWorks } from '../../scripts/travaux';
import { savedCourses, focused } from '../../scripts/calendarStore';
import { campusDate, campusTime, frenchDate } from '../../../shared/calendar';
import type { CourseDTO } from '../../../shared/courses';
// Right column (30 %): the selected day, or the opened work.
const list = computed(() => worksByDay.value.get(travauxDay.value) ?? []);
const courses = computed(() => savedCourses.value.filter(course => campusDate(course.start) === travauxDay.value));
const add = () => requireAccount(() => { form.value = { mode: 'create', day: travauxDay.value }; });
// In the list there is no selected day: the panel always shows a work, the first one by default.
const listMode = computed(() => travauxView.value === 'liste');
const firstWork = computed(() => lateWorks.value[0] ?? visibleWorks.value.find(work => work.day >= today.value) ?? visibleWorks.value[0]);
watch([listMode, firstWork, openedWork], () => { if (listMode.value && !openedWork.value && firstWork.value) openedWork.value = firstWork.value.id; }, { immediate: true });
function openCourse(course: CourseDTO) { section.value = 'cours'; focused.value = course; }
</script>
<template><aside class="day-panel" aria-label="Journée sélectionnée">
  <WorkDetail v-if="openedWork" :key="openedWork" inline :back="!listMode" />
  <p v-else-if="listMode" class="empty-state"><strong>Aucun travail</strong><span>Rien à afficher avec ces filtres.</span></p>
  <template v-else-if="!listMode">
    <header class="day-panel-head"><p class="eyebrow">{{ relativeDay(travauxDay, today) }}</p><h2>{{ frenchDate(travauxDay, { weekday: 'long', day: 'numeric', month: 'long' }) }}</h2><button class="primary-action" @click="add"><PlusIcon aria-hidden="true" />Ajouter ce jour</button></header>
    <section class="panel-block" aria-label="Travaux du jour">
      <WorkItem v-for="work in list" :key="work.id" :work="work" />
      <p v-if="!list.length" class="empty-state small"><strong>Rien à rendre</strong><span>Aucun travail annoncé pour ce jour.</span></p>
    </section>
    <section v-if="courses.length" class="panel-block" aria-label="Cours du jour"><h3>Cours</h3>
      <button v-for="course in courses" :key="course.uid + course.start" class="panel-course" @click="openCourse(course)"><span class="panel-course-time">{{ campusTime(course.start) }}</span><span class="panel-course-title">{{ course.summary }}<small class="muted">{{ course.type !== 'inconnu' ? course.type + ' · ' : '' }}{{ course.location }}</small></span><span v-if="worksForCourse(course).length" class="count">{{ worksForCourse(course).length }}</span></button>
    </section>
    <button v-if="queueCount" class="panel-cta" @click="ui.queue = true"><CheckBadgeIcon aria-hidden="true" /><span><strong>{{ queueCount }} proposition{{ queueCount > 1 ? 's' : '' }} à valider</strong><small>Un geste par proposition</small></span><ChevronRightIcon aria-hidden="true" /></button>
    <button v-else-if="!me" class="panel-cta" @click="ui.login = true"><CheckBadgeIcon aria-hidden="true" /><span><strong>Se connecter</strong><small>Pour proposer, voter et cocher « fait » partout</small></span><ChevronRightIcon aria-hidden="true" /></button>
    <InfoCard />
  </template>
</aside></template>
