<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { UserIcon, DevicePhoneMobileIcon, ComputerDesktopIcon, UserGroupIcon, CalendarIcon, ShieldCheckIcon, ScaleIcon, ArrowRightOnRectangleIcon, QrCodeIcon, ChevronRightIcon, CheckBadgeIcon } from '@heroicons/vue/24/outline';
import AccessibleDialog from '../AccessibleDialog.vue';
import SubscribeButtons from './SubscribeButtons.vue';
import { api, errorText, me, setMe, ui, logout, qrRequest, works, queueCount, wide } from '../../scripts/travaux';
import { groupById, groupOptions } from '../../../shared/selection';
import type { Me } from '../../../shared/travaux';

type Page = 'profile' | 'devices' | 'group' | 'agenda' | 'privacy' | 'scan';
interface Device { id: string; device: string; createdAt: string; lastSeen: string; current: boolean }
const page = ref<Page | undefined>(wide.value ? 'profile' : undefined);
const devices = ref<Device[]>([]);
const status = ref(''), busy = ref(false), confirmText = ref('');
const firstName = ref(me.value?.firstName ?? ''), lastName = ref(me.value?.lastName ?? ''), groupId = ref(me.value?.groupId ?? '');
const group = computed(() => groupById(me.value?.groupId ?? ''));
const initials = computed(() => ((me.value?.firstName[0] ?? '') + (me.value?.lastName[0] ?? '')).toUpperCase());
const hue = computed(() => me.value ? [...me.value.id].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 360 : 0);
const mine = computed(() => works.value.filter(work => work.mine));
const validated = computed(() => mine.value.filter(work => work.state === 'validated').length);
const reliabilityPercent = computed(() => Math.max(4, Math.min(100, ((me.value?.reliability ?? 0) + 2) / 12 * 100)));
const roleLabel = computed(() => ({ student: 'Étudiant', delegate: 'Délégué', admin: 'Admin', teacher: 'Enseignant' })[me.value?.role ?? 'student']);
const nav = computed(() => [
  { id: 'profile' as const, label: 'Profil', icon: UserIcon },
  { id: 'devices' as const, label: 'Appareils', icon: DevicePhoneMobileIcon, count: devices.value.length },
  { id: 'group' as const, label: 'Groupe et délégués', icon: UserGroupIcon },
  { id: 'agenda' as const, label: 'Ajouter à mon agenda', icon: CalendarIcon },
  { id: 'privacy' as const, label: 'Données et compte', icon: ShieldCheckIcon },
]);
const titles: Record<Page, string> = { profile: 'Profil', devices: 'Appareils', group: 'Groupe et délégués', agenda: 'Ajouter à mon agenda', privacy: 'Données et compte', scan: 'Connecter un ordinateur' };
async function loadDevices() { try { devices.value = await api<Device[]>('/account/devices'); } catch (error) { status.value = errorText(error); } }
onMounted(loadDevices);
watch(page, () => { status.value = ''; if (page.value !== 'scan') stopScan(); });
async function act(action: () => Promise<unknown>, done: string) { busy.value = true; status.value = ''; try { await action(); status.value = done; } catch (error) { status.value = errorText(error); } finally { busy.value = false; } }
const revoke = (id: string) => act(async () => { await api(`/account/devices/${id}`, { method: 'DELETE' }); await loadDevices(); }, 'Appareil déconnecté.');
const askName = () => act(() => api('/account/name', { body: { firstName: firstName.value, lastName: lastName.value } }), 'Demande envoyée : l’admin la validera.');
const changeGroup = () => act(async () => { setMe((await api<{ me: Me }>('/account/group', { body: { groupId: groupId.value } })).me); }, 'Groupe modifié.');
const remove = () => act(async () => { await api('/account', { method: 'DELETE' }); await logout(); ui.value.account = false; }, 'Compte supprimé.');
async function signOut() { await logout(); ui.value.account = false; }
const deviceIcon = (label: string) => /iPhone|Android|iPad/.test(label) ? DevicePhoneMobileIcon : ComputerDesktopIcon;
const when = (iso: string) => { const minutes = (Date.now() - Date.parse(iso)) / 60000; return minutes < 60 ? 'actif à l’instant' : minutes < 1440 ? `actif il y a ${Math.round(minutes / 60)} h` : 'vu le ' + new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }); };

// Connect a computer: scan its QR code with the camera when the browser can, else the phone camera app opens the link.
const video = ref<HTMLVideoElement>();
let stream: MediaStream | undefined;
const canScan = !!navigator.mediaDevices?.getUserMedia;
// Native detector when the browser has one, otherwise jsQR on video frames (iPhone Safari).
async function detector(): Promise<(source: HTMLVideoElement) => Promise<string | undefined>> {
  const Native = (window as unknown as { BarcodeDetector?: new (options: unknown) => { detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]> } }).BarcodeDetector;
  if (Native) { const native = new Native({ formats: ['qr_code'] }); return async source => (await native.detect(source).catch(() => []))[0]?.rawValue; }
  const { default: jsQR } = await import('jsqr');
  const canvas = document.createElement('canvas'), context = canvas.getContext('2d', { willReadFrequently: true })!;
  return async source => {
    const width = source.videoWidth, height = source.videoHeight;
    if (!width || !height) return undefined;
    const scale = Math.min(1, 640 / Math.max(width, height));
    canvas.width = Math.round(width * scale); canvas.height = Math.round(height * scale);
    context.drawImage(source, 0, 0, canvas.width, canvas.height);
    return jsQR(context.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height)?.data;
  };
}
async function scan() {
  page.value = 'scan'; status.value = '';
  if (!canScan) return;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
    await new Promise(resolve => requestAnimationFrame(resolve));
    if (!video.value) return;
    video.value.srcObject = stream; await video.value.play();
    const read = await detector();
    const loop = async () => {
      if (page.value !== 'scan' || !video.value) return;
      const value = await read(video.value);
      if (value) {
        // Recognised by its content (?qr=<id>&n=<number>), whatever the address in front: the server checks the request itself.
        const found = /[?&]qr=([a-f0-9]{32})(?:&n=(\d{2}))?/.exec(value);
        if (found) { stopScan(); qrRequest.value = { id: found[1]!, number: Number(found[2] ?? 0) }; ui.value.account = false; return; }
        status.value = 'Ce n’est pas un QR code de connexion Vencat.';
      }
      setTimeout(() => requestAnimationFrame(() => void loop()), 120);
    };
    void loop();
  } catch { status.value = 'Caméra indisponible : autorise l’accès à la caméra, ou utilise l’appareil photo du téléphone.'; }
}
function stopScan() { stream?.getTracks().forEach(track => track.stop()); stream = undefined; }
onBeforeUnmount(stopScan);
const title = computed(() => !wide.value && page.value ? titles[page.value] : 'Mon compte');
</script>
<template><AccessibleDialog v-if="me" id="account-dialog" :title="title" wide :back="!wide && !!page" @back="page = undefined" @close="ui.account = false">
<div class="account-space" :class="{ 'has-page': !!page }">
  <nav class="account-nav" aria-label="Rubriques du compte">
    <div class="profile-mini"><span class="avatar" :style="{ '--hue': hue }" aria-hidden="true">{{ initials }}</span><strong>{{ me.firstName }} {{ me.lastName }}</strong><small>{{ group ? group.promotion + ' · ' + group.label : roleLabel }} · {{ roleLabel }}</small></div>
    <button v-if="!wide && canScan" class="scan-cta" @click="scan"><QrCodeIcon aria-hidden="true" /><span><strong>Scanner un QR code</strong><small>Connecter un ordinateur en un geste</small></span></button>
    <button v-for="item in nav" :key="item.id" :aria-current="page === item.id ? 'page' : undefined" @click="page = item.id"><component :is="item.icon" aria-hidden="true" />{{ item.label }}<ChevronRightIcon v-if="!wide" class="row-chevron" style="margin-left:auto" aria-hidden="true" /></button>
    <button v-if="queueCount" @click="ui.account = false; ui.queue = true"><CheckBadgeIcon aria-hidden="true" />À valider<span class="count-badge">{{ queueCount }}</span></button>
    <button v-if="me.role === 'admin' || me.role === 'delegate'" @click="ui.moderation = true"><ScaleIcon aria-hidden="true" />Modération</button>
    <button @click="signOut"><ArrowRightOnRectangleIcon aria-hidden="true" />Se déconnecter</button>
  </nav>
  <div v-if="page" class="account-page">
    <template v-if="page === 'profile'">
      <h3 v-if="wide">Profil</h3>
      <div class="stat-row"><div class="stat"><strong>{{ mine.length }}</strong><span>travaux proposés</span></div><div class="stat"><strong>{{ validated }}</strong><span>validés</span></div><div class="stat"><strong>{{ me.reliabilityLabel }}</strong><span>fiabilité</span></div></div>
      <div class="list-card"><div><span class="row-text"><strong>Fiabilité</strong><small>+1 par travail validé, petit bonus quand ton vote va dans le sens du résultat. Un compte fiable n’a besoin que de 1 ou 2 👍.</small><span class="meter" style="margin-top:8px"><i :style="{ width: reliabilityPercent + '%' }"></i></span></span></div></div>
      <p v-if="me.newAccount" class="work-box">Compte récent : tes votes comptent pour moitié et tes liens deviennent cliquables après validation, pendant 7 jours.</p>
      <p v-if="me.readOnlyUntil" class="work-box danger">Lecture seule jusqu’au {{ new Date(me.readOnlyUntil).toLocaleDateString('fr-FR') }}.</p>
      <form class="work-form" @submit.prevent="askName"><fieldset><legend>Nom affiché</legend><div class="form-row"><label class="settings-label">Prénom<input v-model="firstName" required maxlength="60"></label><label class="settings-label">Nom<input v-model="lastName" maxlength="60"></label></div><p class="field-hint">Visible par tous. Une correction est validée par l’admin pour éviter les usurpations.</p></fieldset><button type="submit" :disabled="busy || (firstName === me.firstName && lastName === me.lastName)">Demander la correction</button></form>
    </template>
    <template v-else-if="page === 'devices'">
      <h3 v-if="wide">Appareils</h3><p class="lead">Les appareils connectés à ton compte. Une nouvelle connexion se valide depuis l’un d’eux.</p>
      <div class="list-card"><div v-for="device in devices" :key="device.id"><span class="row-icon"><component :is="deviceIcon(device.device)" aria-hidden="true" /></span><span class="row-text"><strong>{{ device.device }}<span v-if="device.current" class="tag-current">cet appareil</span></strong><small>{{ when(device.lastSeen) }}</small></span><button v-if="!device.current" class="row-action" :disabled="busy" @click="revoke(device.id)">Déconnecter</button></div></div>
      <div class="list-card"><button class="row" @click="scan"><span class="row-icon"><QrCodeIcon aria-hidden="true" /></span><span class="row-text"><strong>Connecter un ordinateur</strong><small>Scanne le QR code affiché sur l’écran de connexion</small></span><ChevronRightIcon class="row-chevron" aria-hidden="true" /></button></div>
    </template>
    <template v-else-if="page === 'scan'">
      <h3 v-if="wide">Connecter un ordinateur</h3>
      <template v-if="canScan"><div class="scan-frame"><video ref="video" class="scan-video" playsinline muted></video><span class="scan-target" aria-hidden="true"></span></div><p class="lead">Vise le QR code affiché sur l’écran de connexion de l’ordinateur.</p></template>
      <p v-else class="lead">Sur l’ordinateur, ouvre Vencat › Se connecter. Scanne le QR code avec l’appareil photo de ce téléphone : le lien s’ouvre ici et te demande de confirmer.</p>
    </template>
    <template v-else-if="page === 'group'">
      <h3 v-if="wide">Groupe et délégués</h3>
      <form class="work-form" @submit.prevent="changeGroup"><label class="settings-label">Mon groupe<select v-model="groupId" :disabled="!me.groupChangeAllowed"><option v-for="option in groupOptions" :key="option.id" :value="option.id">{{ option.promotion }} · {{ option.label }}</option></select></label><p class="field-hint">{{ me.groupChangeAllowed ? 'Possible une fois par semestre.' : 'Déjà changé ce semestre : demande à un délégué.' }}</p><button type="submit" :disabled="busy || groupId === me.groupId">Changer de groupe</button></form>
      <div class="list-card"><button class="row" @click="ui.delegates = true"><span class="row-icon"><UserGroupIcon aria-hidden="true" /></span><span class="row-text"><strong>Délégués du groupe</strong><small>Voir, soutenir une demande, signaler un abus</small></span><ChevronRightIcon class="row-chevron" aria-hidden="true" /></button></div>
    </template>
    <template v-else-if="page === 'agenda'"><h3 v-if="wide">Ajouter à mon agenda</h3><p class="lead">Les travaux de ton groupe dans ton agenda, avec un rappel la veille. Ça remplace les notifications.</p><SubscribeButtons open /></template>
    <template v-else-if="page === 'privacy'">
      <h3 v-if="wide">Données et compte</h3>
      <div class="list-card"><div><span class="row-text"><strong>Ce que Vencat garde</strong><small>{{ me.email }} · ton nom · ton groupe · tes contributions, votes, cases « fait » et notes privées.</small></span></div><button class="row" @click="ui.cgu = true"><span class="row-text"><strong>Conditions et confidentialité</strong><small>Finalité, durée de conservation, tes droits</small></span><ChevronRightIcon class="row-chevron" aria-hidden="true" /></button></div>
      <form class="list-card danger-zone" @submit.prevent="remove"><div><span class="row-text"><strong>Supprimer mon compte</strong><small>Ton mail et ton nom sont effacés tout de suite. Tes contributions restent, signées « Ancien étudiant ».</small></span></div><div><input v-model="confirmText" autocomplete="off" aria-label="Écris SUPPRIMER pour confirmer" placeholder="Écris SUPPRIMER"><button type="submit" class="danger-action row-action" :disabled="busy || confirmText !== 'SUPPRIMER'">Supprimer</button></div></form>
    </template>
    <p v-if="status" class="form-status" role="status">{{ status }}</p>
  </div>
</div>
</AccessibleDialog></template>
