<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, watch, nextTick } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ArrowLeftIcon, ArrowRightIcon, ArrowPathIcon, Cog6ToothIcon, MagnifyingGlassIcon, Bars3Icon, CalendarDaysIcon, ViewColumnsIcon, ClockIcon, BellIcon, ListBulletIcon, SunIcon, MoonIcon, ComputerDesktopIcon } from '@heroicons/vue/24/outline';
import CourseFocus from '../components/layout/CourseFocus.vue';
import Settings from '../components/layout/Settings.vue';
import AuthorCredits from '../components/AuthorCredits.vue';
import GroupPicker from '../components/GroupPicker.vue';
import ListCalendar from '../components/ListCalendar.vue';
import CalendarSkeleton from '../components/CalendarSkeleton.vue';
import ChangesDialog from '../components/ChangesDialog.vue';
import { todayPlanningDate, mondayOf } from '../../shared/calendar';
import { type SearchCriterion } from '../../shared/search';
import SearchDialog from '../components/SearchDialog.vue';
import { BellIcon as BellSolidIcon } from '@heroicons/vue/24/solid';
import CalendarGrid from '../components/CalendarGrid.vue';
import InstallPrompt from '../components/InstallPrompt.vue';
import { accessibility } from '../scripts/accessibility';
import { arrowNavigation as vArrowNavigation } from '../scripts/keyboardNavigation';
import AccessibleDialog from '../components/AccessibleDialog.vue';
import { selection, date, view, week, preferences, selectedIds, loading, error, storageError, hasData, missingGroups, lastFetched, online, fallback, loadCalendar, weekCourses, clock, focused, history, unseenChanges, resolveTodayDate, snapshots } from '../scripts/calendarStore';
import { readPreference, writePreference } from '../scripts/storage';
import { groupById, groupByPath, type GroupOption } from '../../shared/selection';
import { campusDate, campusTime, frenchDate, addDay, validDay } from '../../shared/calendar';
const route = useRoute(), router = useRouter();
const settingsPage = ref<'home' | 'accessibility'>('home');
const settingsOpen = ref(false), pickerOpen = ref(false), changesOpen = ref(false);
const routeError = ref('');
const searchInitial = ref<SearchCriterion>();
const modesOpen = ref(false), dateOpen = ref(false), searchOpen = ref(false);
const themeNotice = ref('');
let noticeTimer: ReturnType<typeof setTimeout>;
function cycleTheme() {
  const choices = ['dark', 'light', 'system'] as const;
  preferences.value.theme = choices[(choices.indexOf(preferences.value.theme) + 1) % choices.length]!;
  themeNotice.value = { dark: 'Thème sombre', light: 'Thème clair', system: 'Thème de l’appareil' }[preferences.value.theme];
  clearTimeout(noticeTimer); noticeTimer = setTimeout(() => themeNotice.value = '', 2600);
}
const viewport = window.matchMedia('(max-width: 1023px)');
const narrow = ref(viewport.matches);
const resized = () => narrow.value = viewport.matches;
const daily = computed(() => view.value === 'day' || view.value === 'list' && narrow.value);
const todayTarget = computed(() => {
  const current = campusDate(clock.value);
  const courses = selection.value ? snapshots.value[selection.value.id + ':' + mondayOf(current)]?.courses : undefined;
  return todayPlanningDate(current, courses);
});
const onToday = computed(() => daily.value ? date.value === todayTarget.value : week.value === mondayOf(todayTarget.value));
const calendar = ref<InstanceType<typeof CalendarGrid>>();
const groupLabel = computed(() => selection.value ? selection.value.promotion + ' · ' + selection.value.label : 'Choisir un groupe');
function toggleSearch() { searchInitial.value = undefined; searchOpen.value = !searchOpen.value; }
function searchFromCourse(criterion: SearchCriterion) { focused.value = undefined; searchInitial.value = criterion; searchOpen.value = true; }
async function today() { await goToday(); if (date.value === campusDate(new Date())) nextTick(() => calendar.value?.showNow()); }
let touchStart: { x: number; y: number } | undefined, suppressClick = false;
function startSwipe(event: TouchEvent) { const touch = event.touches[0]; if (touch && event.touches.length === 1) touchStart = { x: touch.clientX, y: touch.clientY }; }
function finishSwipe(event: TouchEvent) { const touch = event.changedTouches[0]; if (!touch || !touchStart) return; const dx = touch.clientX - touchStart.x, dy = touch.clientY - touchStart.y; touchStart = undefined; if (daily.value && !searchOpen.value && innerWidth <= 767 && Math.abs(dx) > 80 && Math.abs(dy) < 45) { suppressClick = true; move(dx < 0 ? 1 : -1); setTimeout(() => suppressClick = false, 350); } }
function interceptClick(event: MouseEvent) { if (suppressClick) { event.preventDefault(); event.stopPropagation(); suppressClick = false; } }
function selectGroup(group: GroupOption) { pickerOpen.value = false; router.push({ path: group.path, query: selection.value ? { date: date.value, vue: view.value } : { vue: view.value } }); }
let navigationGeneration = 0;
const resolvingDate = ref(false);
async function applyRoute() {
  const current = ++navigationGeneration;
  resolvingDate.value = false;
  routeError.value = '';
  let group = groupByPath(route.path);
  if (route.path === '/') {
    let remembered = readPreference<string>('vencat:group', '');
    if (!remembered) { try { remembered = localStorage.getItem('group_id') ?? ''; } catch { /* storage blocked */ } }
    group = groupById(remembered);
    if (group) { router.replace({ path: group.path, query: route.query }); return; }
  } else if (!group) routeError.value = 'Ce lien ne correspond pas à un groupe. Choisissez votre filière, votre promotion et votre groupe.';
  const explicitDate = typeof route.query.date === 'string' && validDay(route.query.date) ? route.query.date : undefined;
  const nextView = ['day', 'jour'].includes(String(route.query.vue)) ? 'day' : ['week', 'semaine', 'grid'].includes(String(route.query.vue)) ? 'week' : 'list';
  let targetDate = explicitDate ?? campusDate(new Date());
  if (!explicitDate && group) {
    resolvingDate.value = true;
    targetDate = await resolveTodayDate(group.id, targetDate);
    if (current !== navigationGeneration) return;
    resolvingDate.value = false;
  }
  if (route.query.date && !explicitDate) routeError.value = 'La date du lien est invalide. Le planning affiche la période courante.';
  selection.value = group;
  if (group) writePreference('vencat:group', group.id);
  date.value = targetDate;
  view.value = nextView;
  focused.value = undefined;
}
watch(() => route.fullPath, applyRoute, { immediate: true });
watch([date, view], () => { if (selection.value) router.push({ path: selection.value.path, query: { date: date.value, vue: view.value } }); });
watch([selectedIds, week], async () => { searchOpen.value = false; await loadCalendar(); await refreshSharedChanges(); }, { immediate: true });
function move(direction: number) { date.value = addDay(date.value, direction * (daily.value ? 1 : 7)); }
async function goToday() {
  if (!selection.value) return;
  const current = ++navigationGeneration;
  const target = await resolveTodayDate(selection.value.id);
  if (current === navigationGeneration) date.value = target;
}

async function refreshSharedChanges() {
  if (!online.value || !selection.value) return;
  const ids = [...selectedIds.value];
  const results = await Promise.allSettled(ids.map(async id => { const response = await fetch(`/api/changes/${id}`); if (!response.ok) throw new Error(); return await response.json(); }));
  if (ids.join() !== selectedIds.value.join()) return;
  const data = results.flatMap(item => item.status === 'fulfilled' && Array.isArray(item.value) ? item.value : []);
  history.value = [...new Map([...data, ...history.value].map(item => [item.id, item])).values()].sort((a, b) => b.detectedAt.localeCompare(a.detectedAt));
}
async function openChanges() { changesOpen.value = true; await refreshSharedChanges(); }
function closeChanges() { changesOpen.value = false; }
function keydown(event: KeyboardEvent) {
  if (event.defaultPrevented || !accessibility.value.shortcuts || event.repeat || searchOpen.value || modesOpen.value || dateOpen.value || settingsOpen.value || pickerOpen.value || changesOpen.value || focused.value || (event.target as HTMLElement)?.closest('input, select, textarea, [contenteditable]')) return;
  if (event.altKey && event.shiftKey && !event.ctrlKey && !event.metaKey) {
    const key = event.code;
    const actions: Record<string, () => void> = {
      KeyF: toggleSearch, KeyG: () => pickerOpen.value = true,
      KeyS: () => { settingsPage.value = 'home'; settingsOpen.value = true; },
      KeyA: () => { settingsPage.value = 'accessibility'; settingsOpen.value = true; },
      KeyC: () => void openChanges(), KeyT: () => void today(),
      KeyP: () => document.querySelector<HTMLElement>('.timeline-stage .course')?.focus(),
      ArrowLeft: () => move(-1), ArrowRight: () => move(1),
      Digit1: () => view.value = 'list', Digit2: () => view.value = 'day', Digit3: () => view.value = 'week',
    };
    if (actions[key]) { event.preventDefault(); actions[key](); }
    return;
  }
  if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || (event.target as HTMLElement)?.closest('button, a')) return;
  if (event.key === 'ArrowRight') { event.preventDefault(); move(1); }
  if (event.key === 'ArrowLeft') { event.preventDefault(); move(-1); }
  if (event.key === '/') { event.preventDefault(); toggleSearch(); }
}

function reconnect() { online.value = navigator.onLine; if (online.value && selection.value) loadCalendar(true).then(refreshSharedChanges); }
function foreground() { clock.value = new Date(); if (!document.hidden && preferences.value.refresh && selection.value) loadCalendar().then(refreshSharedChanges); }
let refreshTimer: ReturnType<typeof setInterval>, clockTimer: ReturnType<typeof setInterval>;
onMounted(() => { viewport.addEventListener('change', resized); clockTimer = setInterval(() => clock.value = new Date(), 30_000); window.addEventListener('keydown', keydown); window.addEventListener('online', reconnect); window.addEventListener('offline', reconnect); document.addEventListener('visibilitychange', foreground); refreshTimer = setInterval(foreground, 10 * 60_000); });
onBeforeUnmount(() => { viewport.removeEventListener('change', resized); window.removeEventListener('keydown', keydown); window.removeEventListener('online', reconnect); window.removeEventListener('offline', reconnect); document.removeEventListener('visibilitychange', foreground); clearInterval(refreshTimer); clearInterval(clockTimer); clearTimeout(noticeTimer); });
</script>

<template>
<a class="skip-link" href="#planning">Aller au planning</a>
<div class="app-shell" :class="{ 'calendar-app': selection }">
  <nav class="app-nav" :class="{ 'onboarding-nav': !selection }" aria-label="Navigation principale">
    <div class="brand-row"><a class="brand" href="/" @click.prevent="router.push('/')"><img src="../assets/logo.svg" width="26" height="26" alt=""><span>Vencat</span></a><button v-if="selection" class="icon-button quiet" :disabled="loading || !online" aria-label="Actualiser les cours" @click="loadCalendar(true)"><ArrowPathIcon aria-hidden="true" :class="{ refreshing: loading }" /></button></div>
    <div v-if="selection" class="desktop-actions"><button class="group-button" aria-haspopup="dialog" :aria-expanded="pickerOpen" :aria-controls="pickerOpen ? 'group-dialog' : undefined" @click="pickerOpen = true">{{ groupLabel }}</button><button class="icon-button quiet" aria-haspopup="dialog" :aria-expanded="searchOpen" :aria-controls="searchOpen ? 'search-dialog' : undefined" aria-label="Rechercher un cours" @click="toggleSearch"><MagnifyingGlassIcon aria-hidden="true" /></button><button class="icon-button quiet theme-shortcut" aria-label="Changer de thème : sombre, clair, appareil" @click="cycleTheme"><SunIcon aria-hidden="true" v-if="preferences.theme === 'light'" /><ComputerDesktopIcon aria-hidden="true" v-else-if="preferences.theme === 'system'" /><MoonIcon aria-hidden="true" v-else /></button><button class="icon-button quiet" aria-label="Réglages" aria-haspopup="dialog" :aria-expanded="settingsOpen" :aria-controls="settingsOpen ? 'settings-dialog' : undefined" @click="settingsPage = 'home'; settingsOpen = true"><Cog6ToothIcon aria-hidden="true" /></button><button class="icon-button quiet" :class="{ 'unread-bell': unseenChanges.length }" :aria-label="unseenChanges.length ? 'Changements du planning non lus' : 'Changements du planning'" aria-haspopup="dialog" :aria-expanded="changesOpen" :aria-controls="changesOpen ? 'changes-dialog' : undefined" @click="openChanges"><BellSolidIcon aria-hidden="true" v-if="unseenChanges.length" /><BellIcon aria-hidden="true" v-else /></button></div>
  </nav>
  <p v-if="routeError" role="alert" class="notice">{{ routeError }}</p>
  <main v-if="resolvingDate && !selection" id="planning" tabindex="-1" class="onboarding"><p role="status">Chargement du planning…</p></main>
  <main v-else-if="!selection" id="planning" tabindex="-1" class="onboarding"><h1>Quel est votre groupe ?</h1><p class="intro">Choisissez votre filière, votre promotion puis votre groupe pour retrouver votre emploi du temps.</p><GroupPicker @select="selectGroup" /><p class="muted">Votre choix sera mémorisé sur cet appareil. Vous pourrez le modifier à tout moment.</p></main>
  <main v-else id="planning" tabindex="-1" class="planning"><h1 class="sr-only">Planning de {{ groupLabel }}</h1>
    <p id="course-keyboard-help" class="sr-only">Tab pour atteindre les cours. Flèches haut et bas pour parcourir une journée, gauche et droite pour changer de colonne. Début et Fin pour le premier et le dernier cours. Entrée pour les détails, Échap pour revenir au planning.</p>
    <p class="sr-only" role="status" aria-live="polite" aria-atomic="true">{{ groupLabel }} · {{ daily ? frenchDate(date) : 'Semaine du ' + frenchDate(week) }} · {{ view === 'list' ? 'Liste' : view === 'day' ? 'Jour' : 'Semaine' }}</p>
    <header class="planning-header">
      <button class="date-heading" aria-haspopup="dialog" :aria-expanded="dateOpen" :aria-controls="dateOpen ? 'date-dialog' : undefined" :aria-label="frenchDate(date) + ' · Choisir une date'" @click="dateOpen = true"><span class="date-number" :class="{ today: date === campusDate(clock) }">{{ frenchDate(date, { day: 'numeric' }) }}</span><span class="date-text"><span class="date-weekday">{{ frenchDate(date, { weekday: 'long' }) }}</span><span>{{ frenchDate(date, { month: 'long', year: 'numeric' }) }}</span></span></button>
    <div class="week-navigation"><button class="icon-button quiet" :aria-label="daily ? 'Jour précédent' : 'Semaine précédente'" @click="move(-1)"><ArrowLeftIcon aria-hidden="true" /></button><button class="period-label" @click="dateOpen = true">{{ daily ? frenchDate(date, { weekday: 'short', day: 'numeric', month: 'short' }) : frenchDate(week, { day: 'numeric', month: 'short' }) + ' – ' + frenchDate(addDay(week, 6), { day: 'numeric', month: 'short' }) }}<span class="sr-only"> · Choisir une date</span></button><button class="icon-button quiet" :aria-label="daily ? 'Jour suivant' : 'Semaine suivante'" @click="move(1)"><ArrowRightIcon aria-hidden="true" /></button><button class="desktop-today" :disabled="onToday" @click="today">Aujourd’hui</button></div>
      <div class="mobile-clock"><time :datetime="clock.toISOString()">{{ campusTime(clock) }}</time><button class="icon-button" :disabled="loading || !online" aria-label="Actualiser les cours" @click="loadCalendar(true)"><ArrowPathIcon aria-hidden="true" :class="{ refreshing: loading }" /></button></div>
      <div class="desktop-view-controls"><div v-arrow-navigation role="group" class="view-switch" aria-label="Vue du planning"><button :aria-pressed="view === 'list'" @click="view = 'list'">Liste</button><button :aria-pressed="view === 'day'" @click="view = 'day'">Jour</button><button :aria-pressed="view === 'week'" @click="view = 'week'">Semaine</button></div><div v-arrow-navigation role="group" class="view-switch" aria-label="Détail des cartes"><button :aria-pressed="preferences.density === 'compact'" @click="preferences.density = 'compact'">Compact</button><button :aria-pressed="preferences.density === 'full'" @click="preferences.density = 'full'">Complet</button></div></div>
    </header>

    <div v-if="!online || fallback" class="sync-status" role="status" aria-live="polite"><span v-if="!online">Hors ligne{{ lastFetched ? ' · copie du ' + new Date(lastFetched).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' }) : ' · aucune copie disponible' }}</span><span v-else-if="fallback">Planning de secours</span></div>
    <p v-if="error" role="alert" class="notice">{{ error }} <button :disabled="loading || !online" @click="loadCalendar(true)">Réessayer</button></p><p v-if="storageError" role="alert" class="notice">{{ storageError }}</p>
    <p v-if="missingGroups.length && !loading" class="notice">Cette semaine n’est pas enregistrée pour {{ groupLabel }}. {{ online ? 'Actualisez pour la charger.' : 'Reconnectez-vous pour la charger.' }}</p>
    <CalendarSkeleton v-if="loading && !hasData" :daily="daily" :list="view === 'list'" />
    <div v-if="hasData || weekCourses.length" class="timeline-stage" :aria-busy="loading" @touchstart.passive="startSwipe" @touchend.passive="finishSwipe" @click.capture="interceptClick"><ListCalendar v-if="view === 'list'" :daily="daily" /><CalendarGrid v-else ref="calendar" /></div>
    <div class="mobile-overlays"><button v-if="!onToday" class="floating-today" @click="today"><ClockIcon aria-hidden="true" />Aujourd’hui</button>
    <InstallPrompt class="mobile-install" /></div>
    <nav class="mobile-dock" aria-label="Commandes du planning"><div class="dock-left"><button class="icon-button" :aria-label="unseenChanges.length ? 'Ouvrir le menu, ' + unseenChanges.length + ' changements non lus' : 'Ouvrir le menu'" aria-haspopup="dialog" :aria-expanded="settingsOpen" :aria-controls="settingsOpen ? 'settings-dialog' : undefined" @click="settingsPage = 'home'; settingsOpen = true"><Bars3Icon aria-hidden="true" /><span v-if="unseenChanges.length" class="changes-dot"></span></button><button class="group-button" aria-haspopup="dialog" :aria-expanded="pickerOpen" :aria-controls="pickerOpen ? 'group-dialog' : undefined" @click="pickerOpen = true">{{ groupLabel }}</button></div><div class="dock-right"><button class="icon-button" aria-haspopup="dialog" :aria-expanded="searchOpen" :aria-controls="searchOpen ? 'search-dialog' : undefined" aria-label="Rechercher un cours" @click="toggleSearch"><MagnifyingGlassIcon aria-hidden="true" /></button><button class="icon-button" aria-label="Choisir la vue et le détail des cartes" aria-haspopup="dialog" :aria-expanded="modesOpen" :aria-controls="modesOpen ? 'views-dialog' : undefined" @click="modesOpen = true"><ListBulletIcon aria-hidden="true" v-if="view === 'list'" /><CalendarDaysIcon aria-hidden="true" v-else-if="view === 'day'" /><ViewColumnsIcon aria-hidden="true" v-else /></button></div></nav>
  </main>
  <footer v-if="!selection" class="app-footer"><AuthorCredits /></footer>
</div>
<SearchDialog v-if="searchOpen" :initial="searchInitial" @close="searchOpen = false" @open="focused = $event" />
<CourseFocus v-if="focused" @close="focused = undefined" @search="searchFromCourse" />
<Settings v-if="settingsOpen" :initial-page="settingsPage" :mobile="narrow" @close="settingsOpen = false" @changes="settingsOpen = false; openChanges()" @date="settingsOpen = false; dateOpen = true" />
<AccessibleDialog id="group-dialog" v-if="pickerOpen" title="Changer de groupe" @close="pickerOpen = false"><GroupPicker :initial="selection" @select="selectGroup" /></AccessibleDialog>
<AccessibleDialog id="views-dialog" v-if="modesOpen" title="Affichage" @close="modesOpen = false"><section class="settings-section"><h3>Vue du planning</h3><div v-arrow-navigation role="group" class="view-switch"><button :aria-pressed="view === 'list'" @click="view = 'list'">Liste</button><button :aria-pressed="view === 'day'" @click="view = 'day'">Jour</button><button :aria-pressed="view === 'week'" @click="view = 'week'">Semaine</button></div><p class="muted">Liste affiche une journée sur petit écran et la semaine sur grand écran.</p><h3>Informations des cartes</h3><div v-arrow-navigation role="group" class="view-switch"><button :aria-pressed="preferences.density === 'compact'" @click="preferences.density = 'compact'">Compact</button><button :aria-pressed="preferences.density === 'full'" @click="preferences.density = 'full'">Complet</button></div><p class="muted">Compact : titre, horaires, salle et type. Complet : enseignants et groupe en plus. Touchez un cours pour retrouver tous ses détails.</p><button @click="modesOpen = false">Revenir au planning</button></section></AccessibleDialog>
<AccessibleDialog id="date-dialog" v-if="dateOpen" title="Choisir une date" @close="dateOpen = false"><label class="settings-label">Date du planning<input type="date" :value="date" @change="event => { const value = (event.target as HTMLInputElement).value; if (validDay(value)) { date = value; dateOpen = false; } }"></label><button class="date-today" @click="today(); dateOpen = false">Revenir à aujourd’hui</button></AccessibleDialog>
<ChangesDialog v-if="changesOpen" @close="closeChanges" />
<div v-if="themeNotice" class="theme-notice" role="status">{{ themeNotice }}</div>

</template>
