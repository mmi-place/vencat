<script setup lang="ts">
	import { ref, onMounted } from 'vue';

	import CrossIcon from '@/components/icons/CrossIcon.vue';
	import CalendarIcon from '../icons/CalendarIcon.vue';
	import PinIcon from '../icons/PinIcon.vue';
	import PeopleIcon from '../icons/PeopleIcon.vue';
	import InfoIcon from '../icons/InfoIcon.vue';
	import ExtLinkIcon from '../icons/ExtLinkIcon.vue';
	import FunnelIcon from '../icons/FunnelIcon.vue';
	import ClockIcon from '../icons/ClockIcon.vue';

	import type { Module } from '@/scripts/utils';

	import { toFormatHHMM, colors, modules, durationHHMM } from '@/scripts/utils';
	import { focusedCourse, focusedModule, focusType, type UICourse, hours } from '@/scripts/timetable';
	import { maxScreen, isDark } from '@/scripts/media';

	const props = defineProps<{
		course: UICourse,
	}>();

	const module: Module = modules.value[props.course.module] || { title: props.course.module, emoji: '', short: props.course.module, description: '', coeff: 0 };

	const color = ref<string[]>(colors['unknown']!)

	const calcColor = () => {
		color.value = colors[props.course.type] || colors['unknown']!;
	}

	onMounted(() => {
		calcColor();
	});
</script>
<template>
	<section class="select-none fixed top-0 z-500 bg-slate-300/60 backdrop-blur-md w-screen h-screen dark:bg-slate-950/60 md:flex md:flex-col md:items-center md:justify-center" :style="{ backgroundColor: (color[isDark() ? 0 : 6] || '#ffffff') + '60' }">
		<div class="bg-white font-bold shadow-2xl p-6 space-y-4 max-md:h-screen md:rounded-4xl md:min-w-1/2 md:p-8 lg:min-w-1/3 dark:bg-slate-900" :style="{ backgroundColor: (color[isDark() ? 0 : 6] || '#ffffff'), color: (color[isDark() ? 5 : 3] || '#000000') }">
			<div class="flex items-center gap-2">
				<div class="shrink-0 flex items-center justify-center bg-slate-950/5 text-2xl rounded-full w-13 h-13 dark:bg-white/5" :style="{ backgroundColor: (color[3] || '#000000') + '20' }">
					{{ module.emoji  }}
				</div>
				<div v-if="course.type == 'Réunion'" class="flex-1 flex flex-col justify-center">
					<h2 class="text-lg font-black">{{ maxScreen('xs') ? module.short : course.summary }}</h2>
				</div>
				<div v-else class="flex-1 flex flex-col justify-center">
					<h2 class="text-lg font-black -mt-1 -mb-1.5" :style="{ color: color[3] }">{{ maxScreen('xs') ? module.short : course.summary }}</h2>
					<span class="text-sm font-bold" :style="{ color: color[isDark() ? 4 : 3] }">{{ course.type }} - {{ course.module }}</span>
				</div>
				<div class="cursor-pointer flex items-center gap-1 bg-red-500 text-white text-sm font-semibold rounded-full p-1.5 duration-300 dark:bg-white/5 hover:scale-105" v-on:click="focusedCourse = null" :style="{ backgroundColor: (color[3] || '#000000') + '20' }"><CrossIcon class="w-3.5 h-3.5" :color="color[3] || '#000000'" /></div>
			</div>
			<div>
				<p v-if="maxScreen('xs')"><span class="font-bold">Matière:</span> {{ course.summary }}</p>
			</div>
			<div class="flex">
				<div class="shrink-0 flex items-center w-8">
					<CalendarIcon :color="color[3] || '#000000'" class="w-6 h-6" />
				</div>
				<div class="flex-1 -space-y-1">
					<p class="font-black">{{ toFormatHHMM(new Date(course.start)) }}</p>
					<p class="text-sm font-bold">{{ toFormatHHMM(new Date(course.end)) }}</p>
				</div>
			</div>

			<div class="flex">
				<div class="shrink-0 flex items-center w-8">
					<PinIcon :color="color[3] || '#000000'" class="w-6 h-6" />
				</div>
				<div class="max-w-lg">
					<p>{{ course.location || 'Inconnu' }}</p>
				</div>
			</div>

			<div class="flex">
				<div class="shrink-0 flex items-center w-8">
					<PeopleIcon :color="color[3] || '#000000'" class="w-6 h-6" />
				</div>
				<div class="max-w-lg">
					<p>{{ course.teachers.join(', ') || "Inconnu" }}</p>
				</div>
			</div>

			<div class="flex">
				<div class="shrink-0 flex items-center w-8">
					<ClockIcon :color="color[3] || '#000000'" class="w-6 h-6" />
				</div>
				<div class="max-w-lg">
					<p>{{ durationHHMM(hours[course.module] || 0 ) }} cette semaine</p>
				</div>
			</div>

			<div class="flex">
				<div class="shrink-0 flex items-center w-8">
					<InfoIcon :color="color[3] || '#000000'" class="w-6 h-6" />
				</div>
				<div class="max-w-lg">
					<p>{{ module.description }}</p>
				</div>
			</div>

			<div class="flex">
				<div class="shrink-0 flex items-center w-6">
					<FunnelIcon :color="color[3] || '#000000'" class="w-5 h-5" />
				</div>
				<div class="text-sm max-w-lg -translate-y-0.5" :style="{ color: color[3] }">
					<a @click="() => { focusedModule = course.module; focusedCourse = null; focusType = 'filter' }" class="cursor-pointer underline-offset-[1.5px] decoration-[1.5px] hover:underline">Afficher uniquement les cours de ce module</a>
				</div>
			</div>
			<div class="flex">
				<div class="shrink-0 flex items-center w-6">
					<ExtLinkIcon :color="color[3] || '#000000'" class="w-5 h-5" />
				</div>
				<div class="text-sm max-w-lg -translate-y-0.5" :style="{ color: color[3] }">
					<a :href="'https://plan-up.pages.dev?module=' + course.module" class="underline-offset-[1.5px] decoration-[1.5px] hover:underline">Consulter les devoirs pour ce module</a>
				</div>
			</div>
		</div>
	</section>
</template>