export const maxScreen = (size: string): boolean => {
	const screens: Record<string, string> = {
		xs: "480px",
		sm: "640px",
		md: "768px",
		lg: "1024px",
		xl: "1280px",
		"2xl": "1536px",
	};

	const mediaQuery = window.matchMedia(
		`(max-width: ${screens[size] || size})`,
	);
	return mediaQuery.matches;
};

export const minScreen = (size: string): boolean => {
	const screens: Record<string, string> = {
		xs: "480px",
		sm: "640px",
		md: "768px",
		lg: "1024px",
		xl: "1280px",
		"2xl": "1536px",
	};

	const mediaQuery = window.matchMedia(
		`(min-width: ${screens[size] || size})`,
	);
	return mediaQuery.matches;
};

export const isDark = (): boolean => {
	return (
		window.matchMedia &&
		window.matchMedia("(prefers-color-scheme: dark)").matches
	);
};

import { watch } from "vue";
import { group_id } from "@/scripts/utils";
import {
	loadWeek,
	calculateTotalCourseHours,
	focusedModule,
} from "@/scripts/timetable";
import { day, days, viewport, offset } from "@/scripts/logic";
import { isMobileViewport } from "@/scripts/viewport";

export const updateMobileViewport = async () => {
	const mediaQuery = window.matchMedia("(max-width: 720px)");
	isMobileViewport.value = mediaQuery.matches;

	const handleChange = (e: MediaQueryListEvent) => {
		isMobileViewport.value = e.matches;
	};
	mediaQuery.addEventListener("change", handleChange);

	days.value = await loadWeek(
		group_id.value,
		day.value,
		focusedModule.value ? [focusedModule.value] : undefined,
	);
	calculateTotalCourseHours(days.value);
};

watch(isMobileViewport, () => {
	viewport.value = isMobileViewport.value ? 1 : 5;
	offset.value = isMobileViewport.value ? day.value.getDay() - 1 : 0;
});