<script setup lang="ts">
	import CourseView from '@/components/CourseView.vue';
	import CourseFocus from '@/components/layout/CourseFocus.vue';

	import { CursorArrowRippleIcon, FunnelIcon } from '@heroicons/vue/24/outline';
	import { ArrowLeftIcon, ArrowRightIcon } from '@heroicons/vue/24/outline';

	import { ref, onMounted, watch } from 'vue';

	import { loadWeek, focusedCourse, focusedModule, focusType, type UICourse, calculateTotalCourseHours } from '@/scripts/timetable';
	import { toFormatJJMoisAAAA } from '@/scripts/utils';


	const isMobileViewport = ref<boolean>(false);


	const groups: Record<string, Record<string, string>> = {
		'MMI-1': {
			'A1': "G1-QJ2DMFYC5987", // chômeurs
			'A2': "G1-PW2GUKMM5988",
			'B1': "G1-HN2CHYNX5990",
			'B2': "G1-QW2SJTJH5991" // chômeurs ++
		},
		'MMI-2': {
			'A1': "G1-QS2QEJVB5994",
			'A2': "G1-EG2LDXAM5995",
			'B1': "G1-AE2BGJHX5997", // chômeurs pro max ultra
			'B2': "G1-TM2VJCBU5998"
		},
		'MMI-3 dev': {
			'FA A1': "G1-TS2PGRAD6003",
			'FA A2': "G1-KL2GMWYW6004"
		},
		'MMI-3 crea': {
			'FI A1': "G1-EB2URAPF6006",
			'FI A2': "G1-JP2NSAYC6007",
			'FA A1': "G1-CC2LTGMX6000",
			'FA A2': "G1-HW2LKCBM6001"
		}
	}

	const promo_id = ref<string>("MMI-1");
	const group_id = ref<string>(groups[promo_id.value]!['A1']!);

	const weekdays = [
		'Lundi',
		'Mardi',
		'Mercredi',
		'Jeudi',
		'Vendredi',
		'Samedi',
		'Dimanche'
	]

	const offset = ref<number>(0)
	const viewport = ref<number>(5)

	const days = ref<UICourse[][]>([[], [], [], [], [], [], []]);

	const day = ref<Date>(new Date());


	onMounted(async () => {
		const mediaQuery = window.matchMedia('(max-width: 720px)');
		isMobileViewport.value = mediaQuery.matches;

		const handleChange = (e: MediaQueryListEvent) => {
			isMobileViewport.value = e.matches;
		};
		mediaQuery.addEventListener('change', handleChange);

		days.value = await loadWeek(group_id.value, day.value, focusedModule.value ? [focusedModule.value] : undefined)
		calculateTotalCourseHours(days.value);
	});

	watch(isMobileViewport, () => {
		viewport.value = isMobileViewport.value ? 1 : 5
		offset.value = isMobileViewport.value ? day.value.getDay() - 1 : 0
	})

	watch(group_id, async () => {
		days.value = await loadWeek(group_id.value, day.value, focusedModule.value ? [focusedModule.value] : undefined)
		calculateTotalCourseHours(days.value);
	})


	async function fwd(loadOnFinish: boolean = true) {
		offset.value += 1

		if (offset.value > 5) {
			offset.value = 0
			day.value = new Date(day.value.getFullYear(), day.value.getMonth(), day.value.getDate() + 7);
		}

		if (loadOnFinish) {
			days.value = await loadWeek(group_id.value, day.value, focusedModule.value ? [focusedModule.value] : undefined)
			calculateTotalCourseHours(days.value);
		}
	}

	async function bwd(loadOnFinish: boolean = true) {
		offset.value -= 1

		if (offset.value < 0) {
			offset.value = 5
			day.value = new Date(day.value.getFullYear(), day.value.getMonth(), day.value.getDate() - 7);
		}

		if (loadOnFinish) {
			days.value = await loadWeek(group_id.value, day.value, focusedModule.value ? [focusedModule.value] : undefined)
			calculateTotalCourseHours(days.value);
		}
	}

	async function ffwd() {
		let _max: number = isMobileViewport.value ? 1 : 6

		for (let i = 0; i < _max; i++) {
			await fwd(false)
		}

		days.value = await loadWeek(group_id.value, day.value, focusedModule.value ? [focusedModule.value] : undefined)
		calculateTotalCourseHours(days.value);
	}

	async function fbwd() {
		let _max: number = isMobileViewport.value ? 1 : 6

		for (let i = 0; i < _max; i++) {
			await bwd(false)
		}

		days.value = await loadWeek(group_id.value, day.value, focusedModule.value ? [focusedModule.value] : undefined)
		calculateTotalCourseHours(days.value);
	}

	function sectionDate(index: number) {
		return new Date(day.value.getTime() + (index + offset.value - day.value.getDay() + 1) * 24 * 3600 * 1000 );
	}

	function isSameWeek(date: Date, other: Date = new Date()) {
		const getMonday = (d: Date) => {
			const copy = new Date(d.getFullYear(), d.getMonth(), d.getDate());
			const dayOfWeek = copy.getDay();
			const diff = (dayOfWeek === 0) ? -6 : 1 - dayOfWeek; // convert Sunday(0) to previous Monday
			copy.setDate(copy.getDate() + diff);
			copy.setHours(0,0,0,0);
			return copy;
		}

		const a = getMonday(date);
		const b = getMonday(other);

		return a.getFullYear() === b.getFullYear() && a.getTime() === b.getTime();
	}

	watch(focusedModule, async () => {
		days.value = await loadWeek(group_id.value, day.value, focusedModule.value ? [focusedModule.value] : undefined)
		calculateTotalCourseHours(days.value);
	});
</script>
<template>
	<CourseFocus v-if="focusedCourse" :course="focusedCourse" />

	<nav class="flex justify-between p-4 max-sm:flex-col max-sm:justify-center max-sm:gap-2">
		<div class="flex items-center justify-center gap-2">
			<img src="@/assets/logo.svg" class="block w-6 h-6" /> <h1 class="select-none text-xl font-black max-sm:text-xl">Vencat</h1>
		</div>
		<div class="flex gap-2 justify-center">
		</div>
		<div class="flex items-center justify-center gap-2 max-sm:flex-col">
			<button
				@click="focusType = focusType == 'none' ? 'hover' : 'none'"
				class="group cursor-pointer duration-100"
				:class="focusType == 'none' ? 'text-white opacity-50' : 'text-blue-400 opacity-100'"
			>
				<FunnelIcon v-if="focusType == 'filter'" class="w-6 h-6" />
				<CursorArrowRippleIcon v-else class="w-6 h-6" />
			</button>
			<select v-model="promo_id" class="block bg-slate-500/15 text-sm font-bold rounded-full px-4 py-2">
				<option class="text-slate-900 text-sm text-center font-semibold" v-for="promo in Object.keys(groups)" :value="promo">{{ promo }}</option>
			</select>
			<div>
				<button
					class="text-white text-sm text-center font-bold border-b-4 px-4 py-2 duration-150"
					:class="group_id == groups[promo_id]![group]! ? 'border-b-rose-500' : 'border-transparent hover:border-b-rose-500/50'"
					v-for="group in Object.keys(groups[promo_id]!)"
					@click="() => { group_id = groups[promo_id]![group]! }"
				>{{ group }}</button>
			</div>
		</div>
	</nav>
	<header class="flex px-4 pb-4 gap-2 md:px-8">
		<button class="cursor-pointer text-white text-sm font-semibold rounded-full px-3 py-2 duration-150 hover:scale-105" @click="fbwd"><ArrowLeftIcon class="text-white stroke-white stroke-3 w-4 h-4" /></button>
		<section v-for="(item, index) in viewport" :key="group_id + '-' + index + '-' + offset" class="flex-1 text-center -space-y-1">
			<h2 class="text-xl font-bold">{{ weekdays[index + offset] }}</h2>
			<p v-if="!isSameWeek(sectionDate(index))" class="text-sm font-semibold opacity-50">{{ sectionDate(index).getFullYear() == 2026 ? toFormatJJMoisAAAA(sectionDate(index)).full : toFormatJJMoisAAAA(sectionDate(index)).month  }}</p>
		</section>
		<button class="cursor-pointer text-white text-sm font-semibold rounded-full px-3 py-2 duration-150 hover:scale-105" @click="ffwd"><ArrowRightIcon class="text-white stroke-white stroke-3 w-4 h-4" /></button>
	</header>
	<main class="flex px-4 pb-4 gap-2 md:px-8 md:pb-8">
		<section class="sm:w-12"></section>
		<section v-for="(item, index) in viewport" :key="group_id + '-' + index + '-' + offset" class="flex-1 flex flex-col">
			<CourseView v-for="(course, idx) in (days[index + offset] || [])" :key="index + '-' + idx + '-' + (course.uid || '') + '-' + (new Date(course.start)).getTime()" :course="course" :index="idx" />
		</section>
		<section class="sm:w-12"></section>
	</main>
</template>