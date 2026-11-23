<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, watch, nextTick } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ArrowLeftIcon, ArrowRightIcon, ArrowPathIcon, Cog6ToothIcon, MagnifyingGlassIcon, Bars3Icon, CalendarDaysIcon, ViewColumnsIcon, ClockIcon, BellIcon, ListBulletIcon, PaintBrushIcon, PhotoIcon, XMarkIcon } from '@heroicons/vue/24/outline';
import CourseFocus from '../components/layout/CourseFocus.vue';
import Settings, { type SettingsPage } from '../components/layout/Settings.vue';
import AuthorCredits from '../components/AuthorCredits.vue';
import GroupPicker from '../components/GroupPicker.vue';
import ListCalendar from '../components/ListCalendar.vue';
import CalendarSkeleton from '../components/CalendarSkeleton.vue';
import ChangesDialog from '../components/ChangesDialog.vue';
import { todayPlanningDate, mondayOf } from '../../shared/calendar';
import { type SearchCriterion } from '../../shared/search';
import SearchDialog from '../components/SearchDialog.vue';
import { planningSearch, isSearchMatch, type PlanningSearch } from '../scripts/searchStore';
import { BellIcon as BellSolidIcon } from '@heroicons/vue/24/solid';
import CalendarGrid from '../components/CalendarGrid.vue';
import InstallPrompt from '../components/InstallPrompt.vue';
import { accessibility } from '../scripts/accessibility';
import { arrowNavigation as vArrowNavigation } from '../scripts/keyboardNavigation';
import AccessibleDialog from '../components/AccessibleDialog.vue';
import KeyboardHelp from '../components/KeyboardHelp.vue';
import SectionSwitch from '../components/travaux/SectionSwitch.vue';
import SectionTabs from '../components/travaux/SectionTabs.vue';
import AccountButton from '../components/travaux/AccountButton.vue';
import WorkDots from '../components/travaux/WorkDots.vue';
import TravauxPanel from '../components/travaux/TravauxPanel.vue';
import TravauxRoot from '../components/travaux/TravauxRoot.vue';
import { section, toggleSection, ui as travauxUi, form as travauxForm, openedWork } from '../scripts/travaux';
import { selection, date, view, week, preferences, selectedIds, loading, error, storageError, hasData, missingGroups, lastFetched, online, fallback, loadCalendar, weekCourses, clock, focused, history, unseenChanges, resolveTodayDate, snapshots, showLinkedView } from '../scripts/calendarStore';
import { readPreference, writePreference } from '../scripts/storage';
import { groupById, groupByPath, type GroupOption } from '../../shared/selection';
import { campusDate, campusTime, frenchDate, addDay, validDay, isWeekend } from '../../shared/calendar';
const route = useRoute(), router = useRouter();
const settingsPage = ref<SettingsPage>('home');
function openSettings(page: SettingsPage = 'home') { settingsPage.value = page; settingsOpen.value = true; }
const settingsOpen = ref(false), pickerOpen = ref(false), changesOpen = ref(false);
const routeError = ref('');
const searchInitial = ref<SearchCriterion>();
const modesOpen = ref(false), dateOpen = ref(false), searchOpen = ref(false);
const viewport = window.matchMedia('(max-width: 1023px)');
const narrow = ref(viewport.matches);
const resized = () => narrow.value = viewport.matches;
const daily = computed(() => view.value === 'day' || view.value === 'list' && narrow.value);
const todayTarget = computed(() => {
  const current = campusDate(clock.value);
  const courses = selection.value ? snapshots.value[selection.value.id + ':' + mondayOf(current)]?.courses : undefined;
  return todayPlanningDate(current, courses, preferences.value.weekend);
});
// With weekends hidden, a Saturday or Sunday is replaced by the nearest weekday in the chosen direction.
function visibleDay(day: string, direction = 1) {
  let result = day;
  while (!preferences.value.weekend && isWeekend(result)) result = addDay(result, direction);
  return result;
}
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
// The URL only carries the group, plus the date when it is not today. The view lives in the preferences.
const planningQuery = (): Record<string, string> => date.value === todayTarget.value ? {} : { date: date.value };
function selectGroup(group: GroupOption) { pickerOpen.value = false; router.push({ path: group.path, query: selection.value ? planningQuery() : {} }); }
// Installed apps reopen the URL saved at installation (iOS keeps its query): it must not force a date or a view.
const standalone = matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
let launching = true, ownRoute = '';
const linkView = (value: unknown) => ['day', 'jour'].includes(String(value)) ? 'day' as const : ['week', 'semaine', 'grid'].includes(String(value)) ? 'week' as const : ['list', 'liste'].includes(String(value)) ? 'list' as const : undefined;
let navigationGeneration = 0;
const resolvingDate = ref(false);
async function applyRoute() {
  // URLs written by the app itself only mirror its state: nothing to recompute.
  // Consumed once, so a later real navigation (Back) to the same URL is applied.
  if (route.fullPath === ownRoute) { ownRoute = ''; return; }
  ownRoute = '';
  const current = ++navigationGeneration;
  const query = launching && standalone ? {} : route.query;
  launching = false;
  resolvingDate.value = false;
  routeError.value = '';
  let group = groupByPath(route.path);
  if (route.path === '/') {
    let remembered = readPreference<string>('vencat:group', '');
    if (!remembered) { try { remembered = localStorage.getItem('group_id') ?? ''; } catch { /* storage blocked */ } }
    group = groupById(remembered);
    if (group) { router.replace({ path: group.path, query }); return; }
  } else if (!group) routeError.value = 'Ce lien ne correspond pas à un groupe. Choisissez votre filière, votre promotion et votre groupe.';
  const explicitDate = typeof query.date === 'string' && validDay(query.date) ? query.date : undefined;
  let targetDate = explicitDate ? visibleDay(explicitDate) : campusDate(new Date());
  if (!explicitDate && group) {
    resolvingDate.value = true;
    targetDate = await resolveTodayDate(group.id, targetDate);
    if (current !== navigationGeneration) return;
    resolvingDate.value = false;
  }
  if (query.date && !explicitDate) routeError.value = 'La date du lien est invalide. Le planning affiche la période courante.';
  selection.value = group;
  if (group) writePreference('vencat:group', group.id);
  date.value = targetDate;
  // A shared link may choose the view; otherwise the remembered one is kept.
  const sharedView = linkView(query.vue);
  if (sharedView) showLinkedView(sharedView);
  focused.value = undefined;
  syncRoute();
}
// Replace (not push) keeps the browser history to real page changes.
function syncRoute() {
  if (!selection.value) return;
  const target = router.resolve({ path: selection.value.path, query: planningQuery() }).fullPath;
  if (target === route.fullPath) return;
  ownRoute = target;
  void router.replace(target);
}
watch(() => route.fullPath, applyRoute, { immediate: true });
watch([date, todayTarget], syncRoute);
watch([selectedIds, week], async () => { searchOpen.value = false; await loadCalendar(); await refreshSharedChanges(); }, { immediate: true });
watch(() => preferences.value.weekend, () => { date.value = visibleDay(date.value); });
function move(direction: number) {
  if (planningSearch.value) return moveToResult(direction);
  date.value = daily.value ? visibleDay(addDay(date.value, direction), direction) : addDay(date.value, direction * 7);
}
// Search shown on the planning: previous / next go straight to the days (or weeks) that contain results.
const searchNotice = ref('');
const resultDays = computed(() => (planningSearch.value?.days ?? []).filter(day => preferences.value.weekend || !isWeekend(day)));
const periodStart = computed(() => daily.value ? date.value : week.value), periodEnd = computed(() => daily.value ? date.value : addDay(week.value, 6));
const periodMatches = computed(() => weekCourses.value.filter(course => isSearchMatch(course) && campusDate(course.start) >= periodStart.value && campusDate(course.start) <= periodEnd.value).length);
const previousResult = computed(() => [...resultDays.value].reverse().find(day => day < periodStart.value));
const nextResult = computed(() => resultDays.value.find(day => day > periodEnd.value));
function moveToResult(direction: number) {
  const target = direction > 0 ? nextResult.value : previousResult.value;
  if (target) { date.value = target; searchNotice.value = ''; }
  else searchNotice.value = direction > 0 ? 'Aucun résultat plus tard.' : 'Aucun résultat plus tôt.';
}
function showSearch(search: PlanningSearch) {
  planningSearch.value = search; searchOpen.value = false; searchNotice.value = '';
  const days = resultDays.value;
  const target = days.find(day => day >= periodStart.value) ?? days[days.length - 1];
  if (target && (target < periodStart.value || target > periodEnd.value)) date.value = target;
}
// The tab title names the group, so it can be told apart from other tabs and read first by screen readers.
watch(groupLabel, label => { document.title = selection.value ? `${label} · Vencat` : 'Vencat'; }, { immediate: true });
function closePlanningSearch() { planningSearch.value = undefined; searchNotice.value = ''; }
watch(selection, closePlanningSearch);
async function goToday() {
  if (!selection.value) return;
  const current = ++navigationGeneration;
  const target = await resolveTodayDate(selection.value.id);
  if (current === navigationGeneration) date.value = target;
}

// The shared history changes at most once a day: ask at most every ten minutes, unless the panel is opened.
const changesCheckedAt = new Map<string, number>();
async function refreshSharedChanges(force = false) {
  if (!online.value || !selection.value) return;
  const selected = selectedIds.value.join();
  const ids = selectedIds.value.filter(id => force || Date.now() - (changesCheckedAt.get(id) ?? 0) > 10 * 60_000);
  if (!ids.length) return;
  ids.forEach(id => changesCheckedAt.set(id, Date.now()));
  const results = await Promise.allSettled(ids.map(async id => { const response = await fetch(`/api/changes/${id}`); if (!response.ok) { changesCheckedAt.delete(id); throw new Error(); } return await response.json(); }));
  if (selected !== selectedIds.value.join()) return;
  const data = results.flatMap(item => item.status === 'fulfilled' && Array.isArray(item.value) ? item.value : []);
  history.value = [...new Map([...data, ...history.value].map(item => [item.id, item])).values()].sort((a, b) => b.detectedAt.localeCompare(a.detectedAt));
}
async function openChanges() { changesOpen.value = true; await refreshSharedChanges(true); }
function closeChanges() { changesOpen.value = false; }
const helpOpen = ref(false);
const dialogOpen = () => Object.values(travauxUi.value).some(Boolean) || !!travauxForm.value || !!openedWork.value || searchOpen.value || modesOpen.value || dateOpen.value || settingsOpen.value || pickerOpen.value || changesOpen.value || helpOpen.value || !!focused.value;
const typing = (target: EventTarget | null) => !!(target as HTMLElement | null)?.closest?.('input, select, textarea, [contenteditable]');
// The current course, or the next one: entry point of the planning for the keyboard.
const entryCourse = () => document.querySelector<HTMLElement>('.timeline-stage .course[tabindex="0"]') ?? document.querySelector<HTMLElement>('.timeline-stage .course');
// Single keys (letters, '/', '?') can be turned off; Alt + Shift combinations stay available as before.
const singleKeys: Record<string, () => void> = {
  '/': toggleSearch, '?': () => { helpOpen.value = true; }, t: () => void today(), g: () => { pickerOpen.value = true; },
  l: () => { view.value = 'list'; }, j: () => { view.value = 'day'; }, s: () => { view.value = 'week'; },
  c: () => void openChanges(), p: () => entryCourse()?.focus(), w: toggleSection,
};
function showKeys(event: KeyboardEvent | FocusEvent) {
  const visible = event instanceof KeyboardEvent && event.key === 'Alt' && event.type === 'keydown' && accessibility.value.shortcuts && !dialogOpen();
  if (visible) document.documentElement.dataset.showKeys = 'true'; else delete document.documentElement.dataset.showKeys;
}
function keydown(event: KeyboardEvent) {
  if (event.defaultPrevented || dialogOpen() || typing(event.target)) return;
  const target = event.target as HTMLElement | null, plain = !event.ctrlKey && !event.metaKey && !event.altKey;
  if (event.key === 'Escape' && planningSearch.value) { event.preventDefault(); closePlanningSearch(); return; }
  // Previous / next period: Page Up / Down anywhere, arrows outside button groups, courses and scrolling areas.
  // In Travaux, the arrows belong to the month grid: the timetable date does not move behind it.
  const inTravaux = section.value === 'travaux';
  if (!inTravaux && plain && (event.key === 'PageUp' || event.key === 'PageDown')) { event.preventDefault(); move(event.key === 'PageDown' ? 1 : -1); return; }
  if (!inTravaux && plain && !event.shiftKey && (event.key === 'ArrowLeft' || event.key === 'ArrowRight') && !target?.closest?.('[role="group"], [role="region"], .course')) { event.preventDefault(); move(event.key === 'ArrowRight' ? 1 : -1); return; }
  if (!accessibility.value.shortcuts || event.repeat) return;
  if (event.altKey && event.shiftKey && !event.ctrlKey && !event.metaKey) {
    const actions: Record<string, () => void> = {
      KeyF: toggleSearch, KeyG: () => pickerOpen.value = true,
      KeyS: () => openSettings(),
      KeyA: () => openSettings('accessibility'),
      KeyC: () => void openChanges(), KeyT: () => void today(),
      KeyP: () => entryCourse()?.focus(), KeyW: toggleSection,
      ArrowLeft: () => move(-1), ArrowRight: () => move(1),
      Digit1: () => view.value = 'list', Digit2: () => view.value = 'day', Digit3: () => view.value = 'week',
    };
    if (actions[event.code]) { event.preventDefault(); actions[event.code]!(); }
    return;
  }
  // event.key already includes Shift, so '/' and '?' work on AZERTY and QWERTY keyboards alike.
  const action = plain ? singleKeys[event.key.length === 1 ? event.key.toLowerCase() : ''] : undefined;
  if (action) { event.preventDefault(); action(); }
}

function reconnect() { online.value = navigator.onLine; if (online.value && selection.value) loadCalendar(true).then(() => refreshSharedChanges()); }
function foreground() { clock.value = new Date(); if (!document.hidden && preferences.value.refresh && selection.value) loadCalendar().then(() => refreshSharedChanges()); }
let refreshTimer: ReturnType<typeof setInterval>, clockTimer: ReturnType<typeof setInterval>;
onMounted(() => { viewport.addEventListener('change', resized); clockTimer = setInterval(() => clock.value = new Date(), 30_000); window.addEventListener('keydown', keydown); window.addEventListener('keydown', showKeys); window.addEventListener('keyup', showKeys); window.addEventListener('blur', showKeys); window.addEventListener('online', reconnect); window.addEventListener('offline', reconnect); document.addEventListener('visibilitychange', foreground); refreshTimer = setInterval(foreground, 10 * 60_000); });
onBeforeUnmount(() => { viewport.removeEventListener('change', resized); window.removeEventListener('keydown', keydown); window.removeEventListener('keydown', showKeys); window.removeEventListener('keyup', showKeys); window.removeEventListener('blur', showKeys); window.removeEventListener('online', reconnect); window.removeEventListener('offline', reconnect); document.removeEventListener('visibilitychange', foreground); clearInterval(refreshTimer); clearInterval(clockTimer); });
</script>

<template>
<a class="skip-link" href="#planning">Aller au planning</a>
<div class="app-shell" :class="{ 'calendar-app': selection }">
  <nav class="app-nav" :class="{ 'onboarding-nav': !selection }" aria-label="Navigation principale">
    <div class="brand-row"><a class="brand" href="/" @click.prevent="router.push('/')"><img src="../assets/logo.svg" width="26" height="26" alt=""><span>Vencat</span></a><button v-if="selection" class="icon-button quiet" :disabled="loading || !online" aria-label="Actualiser les cours" @click="loadCalendar(true)"><ArrowPathIcon aria-hidden="true" :class="{ refreshing: loading }" /></button></div>
    <SectionTabs v-if="selection" />
    <div v-if="selection" class="desktop-actions"><button data-key="G" class="group-button" aria-haspopup="dialog" :aria-expanded="pickerOpen" :aria-controls="pickerOpen ? 'group-dialog' : undefined" @click="pickerOpen = true">{{ groupLabel }}</button><button class="icon-button quiet" aria-haspopup="dialog" :aria-expanded="searchOpen" :aria-controls="searchOpen ? 'search-dialog' : undefined" data-key="/" aria-label="Rechercher un cours" @click="toggleSearch"><MagnifyingGlassIcon aria-hidden="true" /></button><button class="icon-button quiet" aria-label="Apparence : thème et couleurs des cours" aria-haspopup="dialog" :aria-expanded="settingsOpen && settingsPage === 'appearance'" @click="openSettings('appearance')"><PaintBrushIcon aria-hidden="true" /></button><button class="icon-button quiet" aria-label="Fond de l’application" aria-haspopup="dialog" :aria-expanded="settingsOpen && settingsPage === 'background'" @click="openSettings('background')"><PhotoIcon aria-hidden="true" /></button><button class="icon-button quiet" aria-label="Réglages" aria-haspopup="dialog" :aria-expanded="settingsOpen" :aria-controls="settingsOpen ? 'settings-dialog' : undefined" @click="openSettings()"><Cog6ToothIcon aria-hidden="true" /></button><button class="icon-button quiet" :class="{ 'unread-bell': unseenChanges.length }" :aria-label="unseenChanges.length ? 'Changements du planning non lus' : 'Changements du planning'" data-key="C" aria-haspopup="dialog" :aria-expanded="changesOpen" :aria-controls="changesOpen ? 'changes-dialog' : undefined" @click="openChanges"><BellSolidIcon aria-hidden="true" v-if="unseenChanges.length" /><BellIcon aria-hidden="true" v-else /></button><AccountButton /></div>
  </nav>
  <p v-if="routeError" role="alert" class="notice">{{ routeError }}</p>
  <main v-if="resolvingDate && !selection" id="planning" tabindex="-1" class="onboarding"><p role="status">Chargement du planning…</p></main>
  <main v-else-if="!selection" id="planning" tabindex="-1" class="onboarding"><h1>Quel est votre groupe ?</h1><p class="intro">Choisissez votre filière, votre promotion puis votre groupe pour retrouver votre emploi du temps.</p><GroupPicker @select="selectGroup" /><p class="muted">Votre choix sera mémorisé sur cet appareil. Vous pourrez le modifier à tout moment.</p></main>
  <main v-else id="planning" tabindex="-1" class="planning" :class="{ 'travaux-mode': section === 'travaux' }"><template v-if="section === 'cours'"><h1 class="sr-only">Planning de {{ groupLabel }}</h1>
    <p id="course-keyboard-help" class="sr-only">Tab pour atteindre les cours. Flèches haut et bas pour parcourir une journée, gauche et droite pour changer de colonne. Début et Fin pour le premier et le dernier cours. Entrée pour les détails, Échap pour revenir au planning.</p>
    <p class="sr-only" role="status" aria-live="polite" aria-atomic="true">{{ groupLabel }} · {{ daily ? frenchDate(date) : 'Semaine du ' + frenchDate(week) }} · {{ view === 'list' ? 'Liste' : view === 'day' ? 'Jour' : 'Semaine' }}</p>
    <header class="planning-header">
      <button class="date-heading" aria-haspopup="dialog" :aria-expanded="dateOpen" :aria-controls="dateOpen ? 'date-dialog' : undefined" :aria-label="frenchDate(date) + ' · Choisir une date'" @click="dateOpen = true"><span class="date-number" :class="{ today: date === campusDate(clock) }">{{ frenchDate(date, { day: 'numeric' }) }}</span><span class="date-text"><span class="date-weekday">{{ frenchDate(date, { weekday: 'long' }) }}</span><span>{{ frenchDate(date, { month: 'long', year: 'numeric' }) }}<WorkDots v-if="daily" :day="date" inline /></span></span></button>
    <div class="week-navigation"><button class="icon-button quiet" :aria-label="daily ? 'Jour précédent' : 'Semaine précédente'" @click="move(-1)"><ArrowLeftIcon aria-hidden="true" /></button><button class="period-label" @click="dateOpen = true">{{ daily ? frenchDate(date, { weekday: 'short', day: 'numeric', month: 'short' }) : frenchDate(week, { day: 'numeric', month: 'short' }) + ' – ' + frenchDate(addDay(week, 6), { day: 'numeric', month: 'short' }) }}<span class="sr-only"> · Choisir une date</span></button><button class="icon-button quiet" :aria-label="daily ? 'Jour suivant' : 'Semaine suivante'" @click="move(1)"><ArrowRightIcon aria-hidden="true" /></button><button data-key="T" class="desktop-today" :disabled="onToday" @click="today">Aujourd’hui</button></div>
      <div class="mobile-clock"><AccountButton compact /><time :datetime="clock.toISOString()">{{ campusTime(clock) }}</time><button class="icon-button" :disabled="loading || !online" aria-label="Actualiser les cours" @click="loadCalendar(true)"><ArrowPathIcon aria-hidden="true" :class="{ refreshing: loading }" /></button></div>
      <div class="desktop-view-controls"><div v-arrow-navigation role="group" class="view-switch" aria-label="Vue du planning"><button data-key="L" :aria-pressed="view === 'list'" @click="view = 'list'">Liste</button><button data-key="J" :aria-pressed="view === 'day'" @click="view = 'day'">Jour</button><button data-key="S" :aria-pressed="view === 'week'" @click="view = 'week'">Semaine</button></div><div v-arrow-navigation role="group" class="view-switch" aria-label="Détail des cartes"><button :aria-pressed="preferences.density === 'compact'" @click="preferences.density = 'compact'">Compact</button><button :aria-pressed="preferences.density === 'full'" @click="preferences.density = 'full'">Complet</button></div></div>
    </header>

    <div v-if="planningSearch" class="planning-search" role="region" aria-label="Résultats de recherche sur le planning"><MagnifyingGlassIcon aria-hidden="true" /><p><strong>{{ planningSearch.label }}</strong><span>{{ periodMatches }} ici · {{ planningSearch.count }} au total</span></p><button class="icon-button quiet" :disabled="!previousResult" :aria-label="'Résultat précédent' + (previousResult ? ', ' + frenchDate(previousResult) : '')" @click="moveToResult(-1)"><ArrowLeftIcon aria-hidden="true" /></button><button class="icon-button quiet" :disabled="!nextResult" :aria-label="'Résultat suivant' + (nextResult ? ', ' + frenchDate(nextResult) : '')" @click="moveToResult(1)"><ArrowRightIcon aria-hidden="true" /></button><button class="text-action" @click="toggleSearch">Modifier</button><button class="icon-button quiet" aria-label="Quitter la recherche sur le planning" @click="closePlanningSearch"><XMarkIcon aria-hidden="true" /></button><p class="sr-only" role="status">{{ searchNotice }}</p></div>
    <div v-if="!online || fallback" class="sync-status" role="status" aria-live="polite"><span v-if="!online">Hors ligne{{ lastFetched ? ' · copie du ' + new Date(lastFetched).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' }) : ' · aucune copie disponible' }}</span><span v-else-if="fallback">Planning de secours</span></div>
    <p v-if="error" role="alert" class="notice">{{ error }} <button :disabled="loading || !online" @click="loadCalendar(true)">Réessayer</button></p><p v-if="storageError" role="alert" class="notice">{{ storageError }}</p>
    <p v-if="missingGroups.length && !loading" class="notice">Cette semaine n’est pas enregistrée pour {{ groupLabel }}. {{ online ? 'Actualisez pour la charger.' : 'Reconnectez-vous pour la charger.' }}</p>
    <CalendarSkeleton v-if="loading && !hasData" :daily="daily" :list="view === 'list'" />
    <div v-if="hasData || weekCourses.length" class="timeline-stage" :aria-busy="loading" @touchstart.passive="startSwipe" @touchend.passive="finishSwipe" @click.capture="interceptClick"><ListCalendar v-if="view === 'list'" :daily="daily" /><CalendarGrid v-else ref="calendar" /></div>
    </template><TravauxPanel v-else />
    <div class="mobile-overlays"><button v-if="!onToday && section === 'cours'" class="floating-today" @click="today"><ClockIcon aria-hidden="true" />Aujourd’hui</button>
    <InstallPrompt class="mobile-install" /></div>
    <nav class="mobile-dock" aria-label="Commandes du planning"><div class="dock-left"><button class="icon-button" :aria-label="unseenChanges.length ? 'Ouvrir le menu, ' + unseenChanges.length + ' changements non lus' : 'Ouvrir le menu'" aria-haspopup="dialog" :aria-expanded="settingsOpen" :aria-controls="settingsOpen ? 'settings-dialog' : undefined" @click="openSettings()"><Bars3Icon aria-hidden="true" /><span v-if="unseenChanges.length" class="changes-dot"></span></button><button data-key="G" class="group-button" aria-haspopup="dialog" :aria-expanded="pickerOpen" :aria-controls="pickerOpen ? 'group-dialog' : undefined" @click="pickerOpen = true">{{ groupLabel }}</button></div><SectionSwitch /><div class="dock-right"><button class="icon-button" aria-haspopup="dialog" :aria-expanded="searchOpen" :aria-controls="searchOpen ? 'search-dialog' : undefined" data-key="/" aria-label="Rechercher un cours" @click="toggleSearch"><MagnifyingGlassIcon aria-hidden="true" /></button><button v-if="section === 'cours'" class="icon-button" aria-label="Choisir la vue et le détail des cartes" aria-haspopup="dialog" :aria-expanded="modesOpen" :aria-controls="modesOpen ? 'views-dialog' : undefined" @click="modesOpen = true"><ListBulletIcon aria-hidden="true" v-if="view === 'list'" /><CalendarDaysIcon aria-hidden="true" v-else-if="view === 'day'" /><ViewColumnsIcon aria-hidden="true" v-else /></button></div></nav>
  </main>
  <footer v-if="!selection" class="app-footer"><AuthorCredits /></footer>
</div>
<SearchDialog v-if="searchOpen" :initial="searchInitial" @close="searchOpen = false" @open="focused = $event" @show="showSearch" />
<CourseFocus v-if="focused" @close="focused = undefined" @search="searchFromCourse" />
<Settings v-if="settingsOpen" :initial-page="settingsPage" :mobile="narrow" @close="settingsOpen = false" @changes="settingsOpen = false; openChanges()" @date="settingsOpen = false; dateOpen = true" @group="settingsOpen = false; pickerOpen = true" @account="settingsOpen = false; travauxUi.account = true" @login="settingsOpen = false; travauxUi.login = true" />
<AccessibleDialog id="group-dialog" v-if="pickerOpen" title="Changer de groupe" @close="pickerOpen = false"><GroupPicker :initial="selection" @select="selectGroup" /></AccessibleDialog>
<AccessibleDialog id="views-dialog" v-if="modesOpen" title="Affichage" @close="modesOpen = false"><section class="settings-section"><h3>Vue du planning</h3><div v-arrow-navigation role="group" class="view-switch"><button data-key="L" :aria-pressed="view === 'list'" @click="view = 'list'">Liste</button><button data-key="J" :aria-pressed="view === 'day'" @click="view = 'day'">Jour</button><button data-key="S" :aria-pressed="view === 'week'" @click="view = 'week'">Semaine</button></div><p class="muted">Liste affiche une journée sur petit écran et la semaine sur grand écran.</p><h3>Informations des cartes</h3><div v-arrow-navigation role="group" class="view-switch"><button :aria-pressed="preferences.density === 'compact'" @click="preferences.density = 'compact'">Compact</button><button :aria-pressed="preferences.density === 'full'" @click="preferences.density = 'full'">Complet</button></div><p class="muted">Compact : titre, horaires, salle et type. Complet : enseignants et groupe en plus. Touchez un cours pour retrouver tous ses détails.</p><button @click="modesOpen = false">Revenir au planning</button></section></AccessibleDialog>
<AccessibleDialog id="date-dialog" v-if="dateOpen" title="Choisir une date" @close="dateOpen = false"><label class="settings-label">Date du planning<input type="date" :value="date" @change="event => { const value = (event.target as HTMLInputElement).value; if (validDay(value)) { date = visibleDay(value); dateOpen = false; } }"></label><button class="date-today" @click="today(); dateOpen = false">Revenir à aujourd’hui</button></AccessibleDialog>
<AccessibleDialog id="help-dialog" v-if="helpOpen" title="Raccourcis clavier" wide @close="helpOpen = false"><KeyboardHelp /></AccessibleDialog>
<TravauxRoot />
<ChangesDialog v-if="changesOpen" @close="closeChanges" @goto="day => { closeChanges(); date = visibleDay(day); }" />

</template>
