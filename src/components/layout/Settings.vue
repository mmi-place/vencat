<script setup lang="ts">
import { computed, ref } from 'vue';
import AccessibleDialog from '../AccessibleDialog.vue';
import AuthorCredits from '../AuthorCredits.vue';
import InstallPrompt from '../InstallPrompt.vue';
import { preferences, savedCourses, typeColors, courseColor, loadCalendar, snapshots, history } from '../../scripts/calendarStore';
import { clearCalendarStorage } from '../../scripts/storage';
import ThemePicker from '../ThemePicker.vue';
import { effectiveTheme } from '../../scripts/theme';
import { PaintBrushIcon, AdjustmentsHorizontalIcon, ArrowPathIcon, DevicePhoneMobileIcon, ChevronRightIcon } from '@heroicons/vue/24/outline';
import { backgrounds, backgroundStyle } from '../../scripts/appearance';
import type { CourseDTO } from '../../../shared/courses';
const emit = defineEmits<{ close: [] }>();
const status = ref('');
const defaultColor = (key: string) => courseColor({ type: key, module: key } as CourseDTO);
const colorKeys = computed(() => preferences.value.colorMode === 'type' ? [...new Set([...Object.keys(typeColors), ...savedCourses.value.map(course => course.type)])] : [...new Set(savedCourses.value.map(course => course.module))]);
async function clearCopies() { try { await clearCalendarStorage(); snapshots.value = {}; history.value = []; status.value = 'Copies locales et historique local supprimés. Actualisez pour enregistrer à nouveau les cours.'; } catch { status.value = 'Impossible de vider le stockage local.'; } }

const props = defineProps<{ initialPage?: 'appearance' | 'home' }>();
const page = ref<string>(props.initialPage ?? 'home');
const titles: Record<string, string> = { home: 'Réglages', appearance: 'Affichage et apparence', colors: 'Couleurs des cours', data: 'Copies et actualisation', install: 'Installer Vencat' };
</script>
<template><AccessibleDialog :title="titles[page]!" :back="page !== 'home'" :wide="page === 'appearance'" @back="page = 'home'" @close="emit('close')">
<nav v-if="page === 'home'" class="settings-menu" aria-label="Catégories des réglages"><button @click="page = 'appearance'"><PaintBrushIcon /><span><strong>Affichage et apparence</strong><small>Thème, détail des cartes et fond</small></span><ChevronRightIcon /></button><button @click="page = 'colors'"><AdjustmentsHorizontalIcon /><span><strong>Couleurs des cours</strong><small>Par type ou matière, palette personnalisée</small></span><ChevronRightIcon /></button><button @click="page = 'data'"><ArrowPathIcon /><span><strong>Copies et actualisation</strong><small>Planning hors ligne et données locales</small></span><ChevronRightIcon /></button><button @click="page = 'install'"><DevicePhoneMobileIcon /><span><strong>Installer Vencat</strong><small>Retrouver le planning sur l’écran d’accueil</small></span><ChevronRightIcon /></button></nav>
<template v-else-if="page === 'appearance'"><section class="settings-section"><h3>Thème</h3><ThemePicker /><label>Informations des cartes<select v-model="preferences.density"><option value="compact">Compact</option><option value="full">Complet</option></select></label><p class="muted">Ce réglage s’applique à Liste, Jour et Semaine.</p></section><section class="settings-section"><h3>Fond de l’application</h3><p class="muted">Choisissez un aperçu. Le fond s’adapte au thème pour garder le planning lisible.</p><div class="background-options"><button v-for="item in backgrounds" :key="item.id" class="background-option" :aria-pressed="preferences.background === item.id" @click="preferences.background = item.id"><span class="background-preview" :style="{ background: backgroundStyle(item.id, effectiveTheme) }" aria-hidden="true"><span class="preview-course"></span><span class="preview-course"></span></span><span class="background-name">{{ item.label }}</span><span class="background-category">{{ item.category }}</span></button></div></section>
</template>
<template v-else-if="page === 'colors'"><section class="settings-section"><h3>Lecture des cours</h3><label>Informations des cartes<select v-model="preferences.density"><option value="compact">Compact · titre, horaires, salle et type</option><option value="full">Complet · enseignants et groupe en plus</option></select></label><label>Couleurs<select v-model="preferences.colorMode"><option value="type">Par type de cours</option><option value="module">Par matière</option></select></label><details class="color-customization"><summary>Personnaliser les couleurs</summary><div class="color-settings"><label v-for="key in colorKeys" :key="key"><span>{{ key }}</span><input type="color" :aria-label="'Couleur pour ' + key" :value="defaultColor(key)" @input="event => preferences.colors[preferences.colorMode + ':' + key] = (event.target as HTMLInputElement).value"></label></div><p class="muted">Le texte s’adapte à la couleur pour rester lisible. Le type reste indiqué sur chaque carte.</p><button @click="preferences.colors = {}">Restaurer les couleurs</button></details></section>
</template>
<template v-else-if="page === 'data'"><section class="settings-section"><h3>Copies et actualisation</h3><p class="muted">La semaine courante et la suivante sont enregistrées sur cet appareil après un chargement réussi. Les données peuvent être effacées par le navigateur.</p><label class="check-label"><input v-model="preferences.refresh" type="checkbox">Actualiser au retour dans l’application et toutes les dix minutes pendant son utilisation</label><div class="button-row"><button @click="loadCalendar(true)">Actualiser maintenant</button><button @click="clearCopies">Effacer les copies locales</button></div><p role="status">{{ status }}</p></section>
</template><InstallPrompt v-else explicit />
<template #footer><div class="settings-footer"><p class="muted">Les préférences sont enregistrées automatiquement sur cet appareil.</p><AuthorCredits class="settings-credits" /></div></template>
</AccessibleDialog></template>
