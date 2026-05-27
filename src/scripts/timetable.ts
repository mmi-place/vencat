import type { Course } from "celcat";
import { Timetable } from "celcat";

import { getDuration, loadModules } from "./utils";

const tt = new Timetable();

export type UICourse = Course & {
	hidden: boolean
}

export async function loadWeek(group_id: string, startDate: Date, modules?: string[]): Promise<UICourse[][]> {
	await loadModules();

	try {
		const weekStart = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + 1 - startDate.getDay());
		const weekEnd = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + 7 - startDate.getDay());

		const courses: Course[] = await tt.getTimetable(group_id, weekStart, weekEnd);

		const tempDays: UICourse[][] = [[], [], [], [], [], [], []];

		if (!courses || courses.length === 0) {
			return tempDays;
		}

		let lastCourse: UICourse = {
			uid: 'matin',
			type: 'pause',
			summary: "Matin",
			start: new Date(
				courses[0]!.start.getFullYear(),
				courses[0]!.start.getMonth(),
				courses[0]!.start.getDate(),
				7
			),
			end: courses[0]!.start,
			teachers: [],
			location: '',
			module: '',
			hidden: false
		} as UICourse

		courses.forEach(course => {
			let hidden = false;

			if (modules && !modules.includes(course.module)) {
				hidden = true;
			}

			const dayIndex = (new Date(course.start).getDay() + 6) % 7;

			let duration = lastCourse ? getDuration(lastCourse.end, course.start) : 0
			let isLunch = duration > 0 && (lastCourse.end.getHours() >= 11 && course.start.getHours() <= 14)

			if (duration > .25 && lastCourse.end.getDate() == course.start.getDate()) {
				tempDays[dayIndex]!.push({
					uid: '',
					type: isLunch ? 'lunch' : 'pause',
					summary: isLunch ? "Déjeuner" : "Pause",
					start: lastCourse.end,
					end: course.start,
					teachers: [],
					location: '',
					module: isLunch ? 'lunch' : 'pause',
					hidden: false
				} as UICourse)
			}

			if (course.module == 'Reunion') {
				course.type = 'Réunion'
				course.module = 'Réunion'
				course.summary = 'Réunion'
			}

			tempDays[dayIndex]!.push({
				...course,
				hidden: hidden
			} as UICourse);

			lastCourse = {
				...course,
				hidden: hidden
			} as UICourse;
		});

		return tempDays;
	} catch (error) {
		console.error('Error loading week:', error);
		return [[], [], [], [], [], [], []];
	}
}

export const hours = ref<Record<string, number>>({});

export async function calculateTotalCourseHours(weekCourses: UICourse[][]): Promise<{ [key: string]: number }> {
	let totalHours: Record<string, number> = {};

	weekCourses.forEach(day => {
		day.forEach(course => {
			if (course.type !== 'pause' && course.type !== 'lunch') {
				const duration = (course.end.getTime() - course.start.getTime()) / (1000 * 60 * 60);
				totalHours[course.module] = (totalHours[course.module] || 0) + duration;
			}
		});
	});

	hours.value = totalHours;
	return totalHours;
}

import { ref, watch } from 'vue';

export const focusedCourse = ref<UICourse | null>(null);
export const focusType = ref<'none' | 'hover' | 'filter'>(localStorage.getItem('focusType') as 'none' | 'hover' | 'filter' || 'none');
export const focusedModule = ref<string | null>(null);

watch(focusType, (newValue) => {
	if (newValue == 'none') {
		focusedModule.value = null;
	}

	if (newValue != 'filter') {
		localStorage.setItem('focusType', newValue);
	}
});