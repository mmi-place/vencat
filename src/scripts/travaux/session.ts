import { computed, ref } from 'vue';
import { readPreference, writePreference } from '../storage';
import { api, isNetworkError } from './api';
import type { Me } from '../../../shared/travaux';

// The account, kept on the device so that the app stays signed in while offline.
const ME_KEY = 'vencat:me';
export const me = ref<Me | null>(readPreference<Me | null>(ME_KEY, null));
export const meLoaded = ref(false);
/** The account comes from the device copy: the server could not be reached. */
export const sessionOffline = ref(false);
export const config = ref({ mail: true, persistent: false, contact: '', teacherAccounts: false });
export function setMe(value: Me | null) {
  me.value = value;
  if (value) writePreference(ME_KEY, value); else { try { localStorage.removeItem(ME_KEY); } catch { /* storage blocked */ } }
}
let signedOut: ((userId: string) => void) | undefined;
/** Called when the server no longer knows the account kept on the device (expired or revoked session). */
export function onSignedOut(handler: (userId: string) => void) { signedOut = handler; }
export async function loadMe() {
  const previous = me.value?.id;
  try {
    const value = (await api<{ me: Me | null }>('/auth/me')).me;
    if (previous && value?.id !== previous) signedOut?.(previous);
    setMe(value); sessionOffline.value = false;
  }
  catch (error) { sessionOffline.value = isNetworkError(error) && !!me.value; }
  meLoaded.value = true;
  api<typeof config.value>('/travaux/config').then(value => { config.value = value; }).catch(() => undefined);
}
export const needsOnboarding = computed(() => !!me.value && (!me.value.cguAccepted || (!me.value.groupId && me.value.role !== 'teacher')));
export const canContribute = computed(() => !!me.value && !needsOnboarding.value && !me.value.banned && !me.value.readOnlyUntil);
/** Device keys that belong to an account (removed when it signs out). */
export const userKey = (base: string, userId = me.value?.id) => userId ? `${base}:${userId}` : base;

// Sign-in in progress, kept on the device: switching to the mail app may reload the page.
interface PendingLogin { email: string; request: { requestId: string; poll: string; number: number; devices?: number; mailSent?: boolean; expiresAt?: string }; savedAt: number }
const PENDING_KEY = 'vencat:pending-login';
export function savePendingLogin(email: string, request: PendingLogin['request']) { writePreference(PENDING_KEY, { email, request, savedAt: Date.now() }); }
export function readPendingLogin(): PendingLogin | undefined {
  const saved = readPreference<PendingLogin | null>(PENDING_KEY, null);
  if (!saved?.request?.requestId) return undefined;
  // The code lives 10 minutes, and 3 more minutes after a first use.
  if (Date.now() - saved.savedAt > 13 * 60000) { clearPendingLogin(); return undefined; }
  return saved;
}
export function clearPendingLogin() { try { localStorage.removeItem(PENDING_KEY); } catch { /* storage blocked */ } }
