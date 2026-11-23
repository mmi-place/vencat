<script setup lang="ts">
import { computed, ref } from 'vue';
import type { CourseDTO } from '../../../shared/courses';
import { WORK_TYPE_LABELS } from '../../../shared/travaux';
import { campusDate, campusTime } from '../../../shared/calendar';
import { worksForCourse, isDs, form, openedWork, requireAccount, correctionFor, corrections, api, errorText, vote, me, canContribute, ui, loadCorrections, type CorrectionView } from '../../scripts/travaux';
import { focused, selection } from '../../scripts/calendarStore';
// In a course window: linked works, adding a work (course pre-filled), DS details, and timetable corrections.
const props = defineProps<{ course: CourseDTO }>();
const linked = computed(() => worksForCourse(props.course));
const hasDs = computed(() => linked.value.some(item => item.work.ds));
function add(mode: 'create' | 'ds') { const course = props.course; requireAccount(() => { focused.value = undefined; form.value = { mode, course, day: campusDate(course.start) }; }); }
function open(id: string) { focused.value = undefined; openedWork.value = id; }
const correction = computed(() => correctionFor(props.course));
const correcting = ref(false), field = ref<'room' | 'time' | 'cancelled'>('room'), value = ref(''), startTime = ref(campusTime(props.course.start)), endTime = ref(campusTime(props.course.end)), certified = ref(false), status = ref(''), busy = ref(false);
async function propose() {
  if (!selection.value) return;
  busy.value = true; status.value = '';
  try {
    const created = await api<CorrectionView>('/travaux/corrections', { body: { groupId: me.value?.groupId ?? selection.value.id, course: { uid: props.course.uid, start: props.course.start, end: props.course.end, module: props.course.module, summary: props.course.summary, location: props.course.location }, field: field.value, value: value.value, startTime: startTime.value, endTime: endTime.value, certified: certified.value } });
    corrections.value = [...corrections.value, created]; correcting.value = false; status.value = 'Correction proposée : elle s’affiche avec « Signalé par des étudiants » et passe par le vote.';
  } catch (error) { status.value = errorText(error); } finally { busy.value = false; }
}
async function voteCorrection(v: 1 | -1) {
  if (!canContribute.value) { ui.value.login = true; return; }
  try { await vote(`/travaux/correction/${correction.value!.id}/vote`, { value: v, reason: v < 0 ? 'Information inexacte' : undefined }); await loadCorrections(); } catch (error) { status.value = errorText(error); }
}
const correctionLabel = (item: CorrectionView) => item.field === 'cancelled' ? 'Cours annulé' : item.field === 'room' ? `Salle ${item.course.location || '?'} → ${item.value}` : `Horaire ${campusTime(item.course.start)}–${campusTime(item.course.end)} → ${item.value}`;
const future = computed(() => Date.parse(props.course.end) > Date.now());
</script>
<template><section class="course-travaux" aria-label="Travaux et corrections">
  <div v-if="correction" class="work-box warn"><strong>Signalé par des étudiants</strong><p>{{ correctionLabel(correction) }}</p><p class="muted">{{ Math.floor(correction.up) }} 👍 · {{ Math.floor(correction.down) }} 👎 · certifié sur l’honneur par {{ correction.author }} · {{ correction.state === 'validated' ? 'validé' : 'à confirmer' }}. CELCAT reste la source officielle.</p><div v-if="!correction.mine && correction.state !== 'validated'" class="button-row"><button :aria-pressed="correction.myVote === 1" @click="voteCorrection(1)">👍 C’est exact</button><button :aria-pressed="correction.myVote === -1" @click="voteCorrection(-1)">👎 Faux</button></div></div>
  <h3>Travaux</h3>
  <ul v-if="linked.length" class="course-work-list"><li v-for="item in linked" :key="item.work.id"><button class="text-action" @click="open(item.work.id)"><span class="type-tag" :class="'tag-' + item.work.type">{{ WORK_TYPE_LABELS[item.work.type] }}</span> {{ item.work.title }} · {{ item.work.hasTime ? item.work.time : 'avant 23:59' }}<template v-if="item.moved"> · cours modifié</template></button></li></ul>
  <p v-else class="muted">Aucun travail lié à ce cours.</p>
  <div class="button-row"><button @click="add('create')">+ Ajouter un travail</button><button v-if="isDs(course) && !hasDs && future" @click="add('ds')">+ Ajouter les infos du DS</button><button v-if="!correction && future" :aria-expanded="correcting" @click="canContribute ? (correcting = !correcting) : (ui.login = true)">Signaler une erreur</button></div>
  <form v-if="correcting" class="contest-box" @submit.prevent="propose">
    <label class="settings-label">Correction<select v-model="field"><option value="room">Salle</option><option value="time">Horaire</option><option value="cancelled">Cours annulé</option></select></label>
    <label v-if="field === 'room'" class="settings-label">Nouvelle salle<input v-model="value" required maxlength="60" placeholder="Ex. E57"></label>
    <div v-if="field === 'time'" class="form-row"><label class="settings-label">Début<input v-model="startTime" type="time" required></label><label class="settings-label">Fin<input v-model="endTime" type="time" required></label></div>
    <label class="check-label"><input v-model="certified" type="checkbox" required> Je certifie sur l’honneur que cette information est exacte</label>
    <p class="muted">Sans valeur juridique, mais enregistré : une fausse déclaration entraîne une sanction. La correction ne remplace jamais CELCAT et se ferme quand CELCAT change ce cours.</p>
    <button type="submit" class="primary-action" :disabled="busy || !certified">Proposer la correction</button>
  </form>
  <p v-if="status" class="form-status" role="status">{{ status }}</p>
</section></template>
