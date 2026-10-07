<script setup lang="ts">
import { computed, ref } from 'vue';
import AccessibleDialog from '../AccessibleDialog.vue';
import AuthorCredits from '../AuthorCredits.vue';
import InstallPrompt from '../InstallPrompt.vue';
import { preferences, savedCourses, typeColors, courseColor, loadCalendar, snapshots, history, unseenChanges } from '../../scripts/calendarStore';
import { clearCalendarStorage } from '../../scripts/storage';
import ThemePicker from '../ThemePicker.vue';
import { effectiveTheme } from '../../scripts/theme';
import { PaintBrushIcon, AdjustmentsHorizontalIcon, ArrowPathIcon, DevicePhoneMobileIcon, ChevronRightIcon, BellIcon, CalendarDaysIcon, PhotoIcon } from '@heroicons/vue/24/outline';
import { backgrounds, backgroundStyle } from '../../scripts/appearance';
import { customBackgroundUrl, importBackground, removeBackground } from '../../scripts/customBackground';
import type { CourseDTO } from '../../../shared/courses';
const emit = defineEmits<{ close: []; changes: []; date: [] }>();
const status = ref('');
const category = ref('Uni');
const categories = ['Uni', 'Dégradé', 'Géométrique', 'Image'];
const importing = ref(false), imageStatus = ref('');
const displayedBackgrounds = computed(() => backgrounds.filter(item => item.category === category.value && (item.id !== 'custom' || customBackgroundUrl.value)));
async function upload(event: Event) {
  const input = event.target as HTMLInputElement, file = input.files?.[0]; if (!file) return;
  importing.value = true; imageStatus.value = '';
  try { await importBackground(file); preferences.value.background = 'custom'; imageStatus.value = 'Image enregistrée sur cet appareil.'; }
  catch (error) { imageStatus.value = error instanceof Error ? error.message : 'Impossible d’enregistrer cette image.'; }
  finally { importing.value = false; input.value = ''; }
}
async function removeImage() { try { await removeBackground(); if (preferences.value.background === 'custom') preferences.value.background = 'unified'; imageStatus.value = 'Image supprimée.'; } catch { imageStatus.value = 'Impossible de supprimer cette image.'; } }
const defaultColor = (key: string) => courseColor({ type: key, module: key } as CourseDTO);
const colorKeys = computed(() => preferences.value.colorMode === 'type' ? [...new Set([...Object.keys(typeColors), ...savedCourses.value.map(course => course.type)])] : [...new Set(savedCourses.value.map(course => course.module))]);
async function clearCopies() { try { await clearCalendarStorage(); snapshots.value = {}; history.value = []; status.value = 'Copies locales et historique local supprimés. Actualisez pour enregistrer à nouveau les cours.'; } catch { status.value = 'Impossible de vider le stockage local.'; } }

const props = defineProps<{ initialPage?: 'appearance' | 'home'; mobile?: boolean }>();
const page = ref<string>(props.initialPage ?? 'home');
const titles: Record<string, string> = { home: 'Réglages', appearance: 'Affichage et apparence', colors: 'Couleurs des cours', data: 'Copies et actualisation', install: 'Installer Vencat' };
</script>
<template><AccessibleDialog :title="titles[page]!" :back="page !== 'home'" :wide="page === 'appearance'" @back="page = 'home'" @close="emit('close')">
<nav v-if="page === 'home'" class="settings-menu" aria-label="Catégories des réglages"><template v-if="mobile"><button @click="emit('changes')"><BellIcon /><span><strong>Changements du planning<span v-if="unseenChanges.length" class="menu-notice-dot"></span></strong><small>{{ unseenChanges.length ? unseenChanges.length + ' non lus' : 'Consulter les modifications' }}</small></span><ChevronRightIcon /></button><button @click="emit('date')"><CalendarDaysIcon /><span><strong>Choisir une date</strong><small>Aller à une journée ou une semaine</small></span><ChevronRightIcon /></button></template><button @click="page = 'appearance'"><PaintBrushIcon /><span><strong>Affichage et apparence</strong><small>Thème, détail des cartes et fond</small></span><ChevronRightIcon /></button><button @click="page = 'colors'"><AdjustmentsHorizontalIcon /><span><strong>Couleurs des cours</strong><small>Par type ou matière, palette personnalisée</small></span><ChevronRightIcon /></button><button @click="page = 'data'"><ArrowPathIcon /><span><strong>Copies et actualisation</strong><small>Planning hors ligne et données locales</small></span><ChevronRightIcon /></button><button @click="page = 'install'"><DevicePhoneMobileIcon /><span><strong>Installer Vencat</strong><small>Retrouver le planning sur l’écran d’accueil</small></span><ChevronRightIcon /></button></nav>
<template v-else-if="page === 'appearance'"><section class="settings-section"><h3>Thème</h3><ThemePicker /><label>Informations des cartes<select v-model="preferences.density"><option value="compact">Compact</option><option value="full">Complet</option></select></label><p class="muted">Ce réglage s’applique à Liste, Jour et Semaine.</p></section><section class="settings-section"><h3>Fond de l’application</h3><p class="muted">Choisissez un aperçu. Le fond s’adapte au thème pour garder le planning lisible.</p><div class="background-categories" aria-label="Catégories de fonds"><button v-for="name in categories" :key="name" :aria-pressed="category === name" @click="category = name">{{ name === 'Géométrique' ? 'Motifs' : name === 'Image' ? 'Images' : name }}</button></div><div class="background-options"><button v-for="item in displayedBackgrounds" :key="item.id" class="background-option" :aria-pressed="preferences.background === item.id" @click="preferences.background = item.id"><span class="background-preview" :style="{ background: backgroundStyle(item.id, effectiveTheme, customBackgroundUrl) }" aria-hidden="true"><span class="preview-course"></span><span class="preview-course"></span></span><span class="background-name">{{ item.label }}</span><span class="background-category">{{ item.category }}</span></button></div><div v-if="category === 'Image'" class="image-import"><label class="upload-background"><PhotoIcon aria-hidden="true" />{{ importing ? 'Enregistrement…' : 'Importer une image' }}<input :disabled="importing" type="file" accept="image/jpeg,image/png,image/webp,image/avif" @change="upload" /></label><p class="muted">JPG, PNG, WebP ou AVIF · 10 Mo maximum. Votre image reste sur cet appareil.</p><button v-if="customBackgroundUrl" class="text-action" @click="removeImage">Supprimer mon image</button><p role="status">{{ imageStatus }}</p></div></section>
</template>
<template v-else-if="page === 'colors'"><section class="settings-section"><h3>Lecture des cours</h3><label>Informations des cartes<select v-model="preferences.density"><option value="compact">Compact · titre, horaires, salle et type</option><option value="full">Complet · enseignants et groupe en plus</option></select></label><label>Couleurs<select v-model="preferences.colorMode"><option value="type">Par type de cours</option><option value="module">Par matière</option></select></label><details class="color-customization"><summary>Personnaliser les couleurs</summary><div class="color-settings"><label v-for="key in colorKeys" :key="key"><span>{{ key }}</span><input type="color" :aria-label="'Couleur pour ' + key" :value="defaultColor(key)" @input="event => preferences.colors[preferences.colorMode + ':' + key] = (event.target as HTMLInputElement).value"></label></div><p class="muted">Le texte s’adapte à la couleur pour rester lisible. Le type reste indiqué sur chaque carte.</p><button @click="preferences.colors = {}">Restaurer les couleurs</button></details></section>
</template>
<template v-else-if="page === 'data'"><section class="settings-section"><h3>Copies et actualisation</h3><p class="muted">La semaine courante et la suivante sont enregistrées sur cet appareil après un chargement réussi. Les données peuvent être effacées par le navigateur.</p><label class="check-label"><input v-model="preferences.refresh" type="checkbox">Actualiser au retour dans l’application et toutes les dix minutes pendant son utilisation</label><div class="button-row"><button @click="loadCalendar(true)">Actualiser maintenant</button><button @click="clearCopies">Effacer les copies locales</button></div><p role="status">{{ status }}</p></section>
</template><InstallPrompt v-else explicit />
<template #footer><div class="settings-footer"><p class="muted">Les préférences sont enregistrées automatiquement sur cet appareil.</p><AuthorCredits class="settings-credits" /></div></template>
</AccessibleDialog></template>
