import { ref, watch } from 'vue';
import { readPreference, writePreference } from './storage';

export interface AccessibilityPreferences {
  highContrast: boolean;
  largeText: boolean;
  reduceMotion: boolean;
  plainBackground: boolean;
  shortcuts: boolean;
}
const saved = readPreference<Partial<AccessibilityPreferences>>('vencat:accessibility', {});
export const accessibility = ref<AccessibilityPreferences>({
  highContrast: saved?.highContrast === true, largeText: saved?.largeText === true,
  reduceMotion: saved?.reduceMotion === true, plainBackground: saved?.plainBackground === true,
  shortcuts: saved?.shortcuts !== false,
});
watch(accessibility, value => writePreference('vencat:accessibility', value), { deep: true });
