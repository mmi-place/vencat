<script setup lang="ts">
import CourseView from "@/components/CourseView.vue";
import CourseFocus from "@/components/layout/CourseFocus.vue";
import Settings from "@/components/layout/Settings.vue";

import {
	CursorArrowRippleIcon,
	FunnelIcon,
	ArrowLeftIcon,
	ArrowRightIcon,
} from "@heroicons/vue/24/outline";

import { ref, onMounted } from "vue";

import { focusedCourse, focusType } from "@/scripts/timetable";

import {
	toFormatJJMoisAAAA,
	promo_id,
	group_id,
	group_label,
} from "@/scripts/utils";

import {
	weekdays,
	days,
	viewport,
	offset,
	ffwd,
	fbwd,
	sectionDate,
	isSameWeek,
} from "@/scripts/logic";


onMounted(updateMobileViewport);

const isSettingsOpen = ref<boolean>(false);
</script>

<template>
	<CourseFocus v-if="focusedCourse" :course="focusedCourse" />

	<Settings v-if="isSettingsOpen" @close="isSettingsOpen = false" />

	<nav class="flex justify-between p-4">
		<div class="flex items-center justify-center gap-2">
			<img src="@/assets/logo.svg" class="block w-6 h-6" />

			<h1 class="select-none text-xl font-black max-sm:text-xl">
				Vencat
			</h1>
		</div>

		<div class="flex gap-2 justify-center"></div>

		<div class="flex items-center justify-center gap-2">
			<button
				@click="focusType = focusType === 'none' ? 'hover' : 'none'"
				class="group cursor-pointer duration-100"
				:class="
					focusType === 'none'
						? 'text-white opacity-50 max-sm:hidden'
						: 'text-blue-400 opacity-100'
				"
			>
				<FunnelIcon v-if="focusType === 'filter'" class="w-6 h-6" />

				<CursorArrowRippleIcon v-else class="w-6 h-6" />
			</button>

			<button
				@click="isSettingsOpen = true"
				class="group cursor-pointer bg-white/5 text-white text-sm font-bold rounded-xl px-3 py-1.5 duration-100 hover:bg-white/10"
			>
				{{ promo_id }} {{ group_label }}
			</button>
		</div>
	</nav>

	<header class="flex px-4 pb-4 gap-2 md:px-8">
		<button
			class="cursor-pointer text-white text-sm font-semibold rounded-full px-3 py-2 duration-150 hover:scale-105"
			@click="fbwd()"
		>
			<ArrowLeftIcon class="text-white stroke-white stroke-3 w-4 h-4" />
		</button>

		<section
			v-for="(_, index) in viewport"
			:key="group_id + '-' + (index + offset)"
			:id="'date-' + (index + offset)"
			class="flex-1 text-center -space-y-1"
		>
			<h2 class="text-xl font-bold">
				{{ weekdays[index + offset] }}
			</h2>

			<p
				v-if="!isSameWeek(sectionDate(index))"
				class="text-sm font-semibold opacity-50"
			>
				{{
					sectionDate(index).getFullYear() === 2026
						? toFormatJJMoisAAAA(sectionDate(index)).full
						: toFormatJJMoisAAAA(sectionDate(index)).month
				}}
			</p>
		</section>

		<button
			class="cursor-pointer text-white text-sm font-semibold rounded-full px-3 py-2 duration-150 hover:scale-105"
			@click="ffwd()"
		>
			<ArrowRightIcon class="text-white stroke-white stroke-3 w-4 h-4" />
		</button>
	</header>
	<main class="flex px-4 pb-4 gap-2 md:px-8 md:pb-8">
		<section class="sm:w-12"></section>

		<section
			v-for="(_, index) in viewport"
			:key="group_id + '-' + (index + offset)"
			class="flex-1 flex flex-col"
		>
			<CourseView
				v-for="(course, idx) in days[index + offset] || []"
				:key="
					index +
					'-' +
					idx +
					'-' +
					(course.uid || '') +
					'-' +
					new Date(course.start).getTime()
				"
				:course="course"
				:index="idx"
			/>
		</section>

		<section class="sm:w-12"></section>
	</main>
</template>
