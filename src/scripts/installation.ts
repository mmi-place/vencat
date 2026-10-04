import { ref } from 'vue';
import { readPreference, writePreference } from './storage';
interface InstallEvent extends Event { prompt(): Promise<void>; userChoice: Promise<{ outcome: string }> }
export const installEvent = ref<InstallEvent>();
export const installed = ref(matchMedia('(display-mode: standalone)').matches || !!(navigator as Navigator & { standalone?: boolean }).standalone);
export const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const installDismissed = ref(readPreference<number>('vencat:install-dismissed', 0));
window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); installEvent.value = event as InstallEvent; });
window.addEventListener('appinstalled', () => { installed.value = true; installEvent.value = undefined; });
export function dismissInstall() { installDismissed.value = Date.now(); writePreference('vencat:install-dismissed', installDismissed.value); }
export async function installApp() { if (!installEvent.value) return; await installEvent.value.prompt(); const choice = await installEvent.value.userChoice; if (choice.outcome === 'accepted') installed.value = true; installEvent.value = undefined; }
