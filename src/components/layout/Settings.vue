<script setup lang="ts">
import { arrowNavigation as vArrowNavigation } from '../../scripts/keyboardNavigation';
import { computed, ref } from 'vue';
import AccessibleDialog from '../AccessibleDialog.vue';
import AuthorCredits from '../AuthorCredits.vue';
import InstallPrompt from '../InstallPrompt.vue';
import CourseColors from '../CourseColors.vue';
import KeyboardHelp from '../KeyboardHelp.vue';
import { preferences, loadCalendar, snapshots, history, unseenChanges } from '../../scripts/calendarStore';
import { clearCalendarStorage } from '../../scripts/storage';
import ThemePicker from '../ThemePicker.vue';
import { effectiveTheme } from '../../scripts/theme';
import { PaintBrushIcon, ArrowPathIcon, DevicePhoneMobileIcon, ChevronRightIcon, BellIcon, CalendarDaysIcon, PhotoIcon, EyeIcon, AdjustmentsHorizontalIcon, ArrowUpTrayIcon, UserCircleIcon, UserGroupIcon } from '@heroicons/vue/24/outline';
import { backgrounds, backgroundStyle, type Background } from '../../scripts/appearance';
import { customBackgroundUrl, importBackground, removeBackground } from '../../scripts/customBackground';
import { accessibility } from '../../scripts/accessibility';
import { me } from '../../scripts/travaux';

export type SettingsPage = 'home' | 'appearance' | 'background' | 'planning' | 'data' | 'accessibility' | 'install';
const props = defineProps<{ initialPage?: SettingsPage; mobile?: boolean }>();
const emit = defineEmits<{ close: []; changes: []; date: []; group: []; account: []; login: [] }>();
// Opened directly on a page (Appearance or Background buttons, shortcuts): no way back to the menu is needed.
const root = props.initialPage ?? 'home';
const page = ref<SettingsPage>(root);
const titles: Record<SettingsPage, string> = { home: 'Réglages', appearance: 'Apparence', background: 'Fond de l’application', planning: 'Planning', data: 'Copies et actualisation', install: 'Installer Vencat', accessibility: 'Accessibilité' };

const status = ref('');
const categories = ['Image', 'Uni', 'Dégradé', 'Géométrique'] as const;
const categoryLabels: Record<typeof categories[number], string> = { Image: 'Images', Uni: 'Uni', Dégradé: 'Dégradés', Géométrique: 'Motifs' };
const category = ref<typeof categories[number]>(backgrounds.find(item => item.id === preferences.value.background)?.category ?? 'Image');
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
const choose = (id: Background) => { preferences.value.background = id; };
async function clearCopies() { try { await clearCalendarStorage(); snapshots.value = {}; history.value = []; status.value = 'Copies locales et historique local supprimés. Actualisez pour enregistrer à nouveau les cours.'; } catch { status.value = 'Impossible de vider le stockage local.'; } }
</script>
<template><AccessibleDialog id="settings-dialog" :title="titles[page]" :back="page !== root" :wide="page === 'background' || page === 'appearance'" @back="page = 'home'" @close="emit('close')">
<nav v-if="page === 'home'" class="settings-menu" aria-label="Catégories des réglages">
  <template v-if="mobile"><button @click="emit('changes')"><BellIcon aria-hidden="true" /><span><strong>Changements du planning<span v-if="unseenChanges.length" class="menu-notice-dot"></span></strong><small>{{ unseenChanges.length ? unseenChanges.length + ' non lus' : 'Consulter les modifications' }}</small></span><ChevronRightIcon aria-hidden="true" /></button><button @click="emit('date')"><CalendarDaysIcon aria-hidden="true" /><span><strong>Choisir une date</strong><small>Aller à une journée ou une semaine</small></span><ChevronRightIcon aria-hidden="true" /></button><button @click="me ? emit('account') : emit('login')"><UserCircleIcon aria-hidden="true" /><span><strong>{{ me ? 'Mon compte' : 'Se connecter' }}</strong><small>{{ me ? me.firstName + ' · appareils, groupe, QR code' : 'Proposer et voter sur les travaux' }}</small></span><ChevronRightIcon aria-hidden="true" /></button><button class="menu-group" @click="emit('group')"><UserGroupIcon aria-hidden="true" /><span><strong>Changer de groupe</strong><small>Filière, promotion et groupe affichés</small></span><ChevronRightIcon aria-hidden="true" /></button></template>
  <button @click="page = 'appearance'"><PaintBrushIcon aria-hidden="true" /><span><strong>Apparence</strong><small>Thème, couleurs des cours et détail des cartes</small></span><ChevronRightIcon aria-hidden="true" /></button>
  <button @click="page = 'background'"><PhotoIcon aria-hidden="true" /><span><strong>Fond</strong><small>Votre image, couleurs unies, dégradés et motifs</small></span><ChevronRightIcon aria-hidden="true" /></button>
  <button @click="page = 'planning'"><AdjustmentsHorizontalIcon aria-hidden="true" /><span><strong>Planning</strong><small>Vue à l’ouverture et week-end</small></span><ChevronRightIcon aria-hidden="true" /></button>
  <button @click="page = 'data'"><ArrowPathIcon aria-hidden="true" /><span><strong>Copies et actualisation</strong><small>Planning hors ligne et données locales</small></span><ChevronRightIcon aria-hidden="true" /></button>
  <button @click="page = 'accessibility'"><EyeIcon aria-hidden="true" /><span><strong>Accessibilité</strong><small>Contraste, texte, animations et clavier</small></span><ChevronRightIcon aria-hidden="true" /></button>
  <button @click="page = 'install'"><DevicePhoneMobileIcon aria-hidden="true" /><span><strong>Installer Vencat</strong><small>Retrouver le planning sur l’écran d’accueil</small></span><ChevronRightIcon aria-hidden="true" /></button>
</nav>

<template v-else-if="page === 'appearance'">
  <section class="settings-section"><h3>Thème</h3><ThemePicker /></section>
  <section class="settings-section"><h3>Cartes des cours</h3><label>Informations affichées<select v-model="preferences.density"><option value="compact">Compact · titre, horaires, salle et type</option><option value="full">Complet · enseignants et groupe en plus</option></select></label><p class="muted">S’applique à Liste, Jour et Semaine.</p></section>
  <CourseColors />
</template>

<template v-else-if="page === 'background'"><section class="settings-section">
  <p class="muted">Le fond s’adapte au thème pour garder le planning lisible.</p>
  <div v-arrow-navigation role="group" class="background-categories" aria-label="Catégories de fonds"><button v-for="name in categories" :key="name" :aria-pressed="category === name" @click="category = name">{{ categoryLabels[name] }}</button></div>
  <div class="background-options">
    <label v-if="category === 'Image'" class="background-option upload-background-option"><span class="background-preview upload-preview" aria-hidden="true"><ArrowUpTrayIcon /></span><span class="background-name">{{ importing ? 'Enregistrement…' : 'Importer une image' }}</span><span class="background-category">JPG, PNG, WebP, AVIF · 10 Mo</span><input :disabled="importing" type="file" accept="image/jpeg,image/png,image/webp,image/avif" @change="upload" /></label>
    <button v-for="item in displayedBackgrounds" :key="item.id" class="background-option" :aria-pressed="preferences.background === item.id" @click="choose(item.id)"><span class="background-preview" :style="{ background: backgroundStyle(item.id, effectiveTheme, customBackgroundUrl) }" aria-hidden="true"><span class="preview-course"></span><span class="preview-course"></span></span><span class="background-name">{{ item.label }}</span><span class="background-category">{{ categoryLabels[item.category] }}</span></button>
  </div>
  <div v-if="category === 'Image'" class="image-import"><p class="muted">Votre image reste sur cet appareil, elle n’est jamais envoyée.</p><button v-if="customBackgroundUrl" class="text-action" @click="removeImage">Supprimer mon image</button><p role="status">{{ imageStatus }}</p></div>
  <p v-if="accessibility.plainBackground || accessibility.highContrast" class="notice">Un fond uni est imposé par vos réglages d’accessibilité.</p>
</section></template>

<template v-else-if="page === 'planning'"><section class="settings-section">
  <label>Vue à l’ouverture<select v-model="preferences.startView"><option value="last">Dernière vue utilisée</option><option value="list">Toujours Liste</option><option value="day">Toujours Jour</option><option value="week">Toujours Semaine</option></select></label>
  <label class="check-label"><input v-model="preferences.weekend" type="checkbox" aria-describedby="weekend-help">Afficher le samedi et le dimanche lorsqu’ils ont des cours</label>
  <p id="weekend-help" class="muted">Désactivé par défaut : les cours du week-end sont souvent des créneaux provisoires.</p>
</section></template>

<template v-else-if="page === 'accessibility'"><section class="settings-section accessibility-settings"><h3>Confort de lecture</h3><label class="check-label"><input v-model="accessibility.highContrast" type="checkbox">Renforcer les contrastes</label><label class="check-label"><input v-model="accessibility.largeText" type="checkbox">Agrandir le texte</label><label class="check-label"><input v-model="accessibility.plainBackground" type="checkbox">Utiliser un fond uni pour faciliter la lecture</label><label class="check-label"><input v-model="accessibility.reduceMotion" type="checkbox">Réduire les animations</label><p class="muted">Les préférences de contraste et de réduction des animations de votre appareil sont toujours respectées.</p><h3>Navigation au clavier</h3><label class="check-label"><input v-model="accessibility.shortcuts" type="checkbox" aria-describedby="shortcuts-help">Activer les raccourcis à une touche</label><p id="shortcuts-help" class="muted">Lettres, / et ? : voir la liste ci-dessous. Tab et les flèches de navigation des cours fonctionnent toujours.</p><KeyboardHelp /></section></template>

<template v-else-if="page === 'data'"><section class="settings-section"><p class="muted">La semaine courante et la suivante sont enregistrées sur cet appareil après un chargement réussi. Les données peuvent être effacées par le navigateur.</p><label class="check-label"><input v-model="preferences.refresh" type="checkbox">Actualiser au retour dans l’application et toutes les dix minutes pendant son utilisation</label><div class="button-row"><button @click="loadCalendar(true)">Actualiser maintenant</button><button @click="clearCopies">Effacer les copies locales</button></div><p role="status">{{ status }}</p></section></template>

<InstallPrompt v-else explicit />
<template #footer><div class="settings-footer"><p class="muted">Les préférences sont enregistrées automatiquement sur cet appareil.</p><AuthorCredits class="settings-credits" /></div></template>
</AccessibleDialog></template>
