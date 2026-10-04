import { computed, ref } from 'vue';
import { preferences } from './calendarStore';
const media = window.matchMedia('(prefers-color-scheme: dark)');
export const systemDark = ref(media.matches);
media.addEventListener('change', event => systemDark.value = event.matches);
export const effectiveTheme = computed(() => preferences.value.theme === 'system' ? systemDark.value ? 'dark' : 'light' : preferences.value.theme);
