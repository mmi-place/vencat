<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import AccessibleDialog from '../AccessibleDialog.vue';
import WorkTypeIcon from './WorkTypeIcon.vue';
import { UserGroupIcon, LockClosedIcon } from '@heroicons/vue/24/outline';
import { WORK_TYPES, WORK_TYPE_LABELS, DS_ALLOWED, scopeChoices, similarWorks, checkLink, DEFAULT_DUE_TIME, type WorkInput, type WorkView, type ScopeKind } from '../../../shared/travaux';
import { campusDate, campusTime, frenchDate, minuteOf } from '../../../shared/calendar';
import type { CourseDTO } from '../../../shared/courses';
import { groupById } from '../../../shared/selection';
import { fetchCourses } from '../../scripts/api';
import { api, errorText, form, me, works, replaceWork, openedWork, vote, courseLink, today, loadQueue } from '../../scripts/travaux';
import { selection, savedCourses } from '../../scripts/calendarStore';

const request = form.value!;
const group = computed(() => groupById(me.value?.groupId ?? '') ?? selection.value);
const choices = computed(() => group.value ? scopeChoices(group.value) : []);
const source = request.work;
const course0 = request.course;
const input = ref<WorkInput>(source ? { type: source.type, title: source.title, day: source.day, time: source.hasTime ? source.time : '', scope: source.scope, course: source.course, details: { ...source.details }, links: source.links.map(link => link.url), ds: source.ds ? { ...source.ds, allowed: [...source.ds.allowed] } : undefined, personal: source.personal }
  : { type: request.mode === 'ds' ? 'eval' : request.type ?? 'rendu', title: request.mode === 'ds' && course0 ? `DS ${course0.summary}` : '', day: course0 ? campusDate(course0.start) : request.day ?? today.value, time: request.mode === 'ds' && course0 ? campusTime(course0.start) : '', scope: choices.value[0]!.scope, course: course0 ? courseLink(course0) : undefined, details: { where: request.mode === 'ds' && course0?.location ? 'Salle ' + course0.location : '', format: '', mode: '', info: '' }, links: [], ds: request.mode === 'ds' ? { chapters: '', allowed: [], duration: course0 ? `${Math.round((minuteOf(course0.end) - minuteOf(course0.start)) / 60 * 10) / 10} h`.replace('.', ',') : '', advice: '' } : undefined });
// The scope defaults to the author's subgroup; a course of a wider group suggests the wider scope.
const linksText = ref(input.value.links.join('\n'));
const status = ref(''), busy = ref(false);
const title = request.mode === 'edit' ? 'Proposer une modification' : request.mode === 'ds' ? `Infos du ${course0?.type && /ds/i.test(course0.type) ? 'DS' : 'contrôle'} ${course0?.summary ?? ''}` : 'Nouveau travail';

// Courses of that day for the chosen scope, to link the work.
const dayCourses = ref<CourseDTO[]>([]);
watch(() => [input.value.day, group.value?.id] as const, async ([day, id]) => {
  if (!id) return;
  const local = savedCourses.value.filter(course => campusDate(course.start) === day);
  dayCourses.value = local;
  if (!local.length) { try { dayCourses.value = (await fetchCourses(id, new Date(day + 'T00:00:00Z'), new Date(day + 'T23:00:00Z'))).map(course => ({ ...course, start: course.start.toISOString(), end: course.end.toISOString() })); } catch { /* optional */ } }
}, { immediate: true });
const courseKeyOf = (course?: { uid: string; start: string }) => course ? course.uid + '|' + course.start : '';
const selectedCourse = computed({
  get: () => courseKeyOf(input.value.course),
  set: (key: string) => { const course = dayCourses.value.find(item => courseKeyOf(item) === key); input.value.course = course ? courseLink(course) : undefined; },
});

// Anti-duplicate: as soon as the type and date are chosen, close works are shown.
const similar = computed(() => request.mode === 'edit' ? [] : similarWorks(input.value, works.value.filter(work => work.id !== source?.id)));
async function sameAsExisting(work: WorkView) {
  busy.value = true;
  try { if (!work.mine && work.myVote !== 1) await vote(`/travaux/work/${work.id}/vote`, { value: 1 }); form.value = undefined; openedWork.value = work.id; }
  catch (error) { status.value = errorText(error); } finally { busy.value = false; }
}
const linkErrors = computed(() => linksText.value.split(/\s+/).filter(Boolean).map(value => checkLink(value)).filter(result => 'error' in result).map(result => (result as { error: string }).error));
function toggleAllowed(item: string) { const ds = input.value.ds!; ds.allowed = ds.allowed.includes(item) ? ds.allowed.filter(value => value !== item) : [...ds.allowed.filter(value => item === 'Aucun document' ? false : value !== 'Aucun document'), item]; }
async function submit() {
  status.value = '';
  if (linkErrors.value.length) { status.value = linkErrors.value[0]!; return; }
  const body = { ...input.value, links: linksText.value.split(/\s+/).filter(Boolean) };
  busy.value = true;
  try {
    if (request.mode === 'edit' && source) {
      const view = await api<WorkView>(`/travaux/work/${source.id}/proposal`, { body: { kind: 'edit', changes: body } });
      replaceWork(view); openedWork.value = view.id;
    } else {
      const view = await api<WorkView>('/travaux/works', { body });
      replaceWork(view); openedWork.value = view.id;
    }
    void loadQueue();
    form.value = undefined;
  } catch (error) { status.value = errorText(error); }
  finally { busy.value = false; }
}
const scopeKind = (kind: ScopeKind) => choices.value.find(choice => choice.scope.kind === kind);
</script>
<template><AccessibleDialog id="work-form" :title="title" :subtitle="request.mode === 'edit' ? (source?.personal ? 'Modification immédiate : ce travail n’est visible que par toi.' : 'L’original reste affiché jusqu’au vote.') : undefined" @close="form = undefined">
<form class="work-form" @submit.prevent="submit">
  <div v-if="request.mode === 'ds'" class="work-box ok">Repris de l’emploi du temps : {{ frenchDate(input.day, { weekday: 'short', day: 'numeric', month: 'short' }) }} · {{ course0 ? campusTime(course0.start) + '–' + campusTime(course0.end) : '' }}<template v-if="course0?.location"> · salle {{ course0.location }}</template></div>
  <fieldset v-if="request.mode === 'create'" class="audience"><legend class="sr-only">Pour qui</legend><button type="button" :aria-pressed="!input.personal" @click="input.personal = undefined"><UserGroupIcon aria-hidden="true" /><span><strong>Pour tout le groupe</strong><small>Visible par la promo, vérifié par 3 confirmations</small></span></button><button type="button" :aria-pressed="!!input.personal" @click="input.personal = true"><LockClosedIcon aria-hidden="true" /><span><strong>Juste pour moi</strong><small>Privé, sans vote : un rappel perso</small></span></button></fieldset>
  <fieldset v-if="request.mode !== 'ds'"><legend>Type</legend><div class="choice-row type-choice"><button v-for="type in WORK_TYPES" :key="type" type="button" :class="'type-' + type" :aria-pressed="input.type === type" @click="input.type = type"><WorkTypeIcon :type="type" />{{ WORK_TYPE_LABELS[type] }}</button></div></fieldset>
  <label class="settings-label">Titre<input v-model="input.title" required minlength="2" maxlength="120" placeholder="Ex. Rendu maquette Figma" autofocus></label>
  <div class="form-row"><label class="settings-label">Date<input v-model="input.day" type="date" required></label><label class="settings-label">Heure<input v-model="input.time" type="time" :placeholder="DEFAULT_DUE_TIME"><span class="field-hint">Vide : {{ DEFAULT_DUE_TIME }}</span></label></div>
  <fieldset v-if="!input.personal"><legend>Pour qui</legend><div class="choice-row"><button v-for="choice in choices" :key="choice.scope.key" type="button" :aria-pressed="input.scope.key === choice.scope.key" @click="input.scope = choice.scope">{{ choice.label }}</button></div><p v-if="scopeKind('wide')" class="field-hint">Par défaut ton sous-groupe. Groupe large ou promo si l’annonce concerne plus de monde.</p></fieldset>
  <fieldset v-if="request.mode !== 'ds'"><legend>Lier à un cours <span class="field-hint">(facultatif)</span></legend><div class="course-choices"><button type="button" :aria-pressed="!selectedCourse" @click="selectedCourse = ''">Aucun cours</button><button v-for="course in dayCourses" :key="courseKeyOf(course)" type="button" :aria-pressed="selectedCourse === courseKeyOf(course)" @click="selectedCourse = courseKeyOf(course)"><span class="time">{{ campusTime(course.start) }}</span><span>{{ course.type !== 'inconnu' ? course.type + ' · ' : '' }}{{ course.summary }}</span></button></div><p v-if="!dayCourses.length" class="field-hint">Aucun cours ce jour-là.</p></fieldset>

  <div v-if="similar.length && !input.personal" class="work-box warn" role="status"><strong>Ça existe peut-être déjà :</strong><ul class="similar"><li v-for="work in similar" :key="work.id"><span><b>{{ work.title }}</b>, {{ frenchDate(work.day, { weekday: 'short', day: 'numeric' }) }}, proposé par {{ work.author }}</span><button type="button" :disabled="busy" @click="sameAsExisting(work)">C’est celui-là</button></li></ul></div>

  <template v-if="input.ds">
    <label class="settings-label">Chapitres<input v-model="input.ds.chapters" maxlength="500" placeholder="Ex. 1 à 4 (DOM, événements)"></label>
    <fieldset><legend>Autorisé</legend><div class="choice-row"><button v-for="item in DS_ALLOWED" :key="item" type="button" :aria-pressed="input.ds.allowed.includes(item)" @click="toggleAllowed(item)">{{ item }}</button></div></fieldset>
    <div class="form-row"><label class="settings-label">Durée<input v-model="input.ds.duration" maxlength="60"></label></div>
    <label class="settings-label">Conseils du prof<textarea v-model="input.ds.advice" rows="2" maxlength="500"></textarea></label>
    <p class="muted">Pas de sujets ni de corrigés : ils seront retirés.</p>
  </template>
  <details :open="request.mode !== 'create' || !!input.details.where"><summary>Modalités et liens</summary>
    <label class="settings-label">Où rendre<input v-model="input.details.where" maxlength="500" placeholder="Ex. Moodle › UX › Dépôt, par mail, papier"></label>
    <label class="settings-label">Format<input v-model="input.details.format" maxlength="500" placeholder="Ex. PDF, lien Figma en lecture"></label>
    <fieldset><legend>Travail</legend><div class="choice-row"><button type="button" :aria-pressed="input.details.mode === ''" @click="input.details.mode = ''">Non précisé</button><button type="button" :aria-pressed="input.details.mode === 'seul'" @click="input.details.mode = 'seul'">Seul</button><button type="button" :aria-pressed="input.details.mode === 'groupe'" @click="input.details.mode = 'groupe'">En groupe</button></div></fieldset>
    <label class="settings-label">Infos<textarea v-model="input.details.info" rows="3" maxlength="1500"></textarea></label>
    <label class="settings-label">Liens (un par ligne)<textarea v-model="linksText" rows="2" placeholder="https://…"></textarea><span class="field-hint">Le domaine est toujours affiché. Raccourcisseurs refusés.<template v-if="me?.newAccount"> Compte récent : tes liens seront cliquables après validation.</template></span></label>
    <p v-for="error in linkErrors" :key="error" class="form-error">{{ error }}</p>
  </details>
  <p v-if="status" class="form-error" role="alert">{{ status }}</p>
  <div class="form-actions"><button type="button" @click="form = undefined">Annuler</button><button type="submit" class="primary-action" :disabled="busy">{{ request.mode === 'edit' ? (source?.personal ? 'Enregistrer' : 'Proposer la modification') : input.personal ? 'Ajouter' : 'Proposer à la promo' }}</button></div>
</form>
</AccessibleDialog></template>
