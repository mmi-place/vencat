import { watch } from 'vue';
import { readPreference, writePreference } from './storage';
import { preferences, isCalendarView } from './calendarStore';
import { accessibility } from './accessibility';
import { isPaletteId } from './palettes';
import { resolveBackground } from './appearance';
import { api, me } from './travaux';
import { groupById } from '../../shared/selection';
import router from '../router';

// Preferences that follow the account (theme, colors, options, accessibility): merged with the account key by key,
// the most recent change of a key wins, and nothing is ever replaced as a whole. On a new device the account's
// choices arrive by themselves; what only exists on this device is added to the account.
const AT_KEY = 'vencat:prefs-at';
type Values = Record<string, unknown>;
const stamps = readPreference<Record<string, number>>(AT_KEY, {});
const current = (): Values => {
  const p = preferences.value;
  return { theme: p.theme, background: p.background === 'custom' ? undefined : p.background, palette: p.palette, colorMode: p.colorMode, colors: p.colors, weekend: p.weekend, density: p.density, startView: p.startView, accessibility: { ...accessibility.value } };
};
let known = JSON.stringify(current());
let applying = false;

function apply(key: string, value: unknown) {
  const p = preferences.value;
  if (key === 'theme' && ['dark', 'light', 'system'].includes(String(value))) p.theme = value as typeof p.theme;
  else if (key === 'background' && typeof value === 'string' && value !== 'custom') p.background = resolveBackground(value);
  else if (key === 'palette' && isPaletteId(value)) p.palette = value;
  else if (key === 'colorMode' && (value === 'type' || value === 'module')) p.colorMode = value;
  else if (key === 'colors' && value && typeof value === 'object') p.colors = Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([, color]) => typeof color === 'string')) as Record<string, string>;
  else if (key === 'weekend' && typeof value === 'boolean') p.weekend = value;
  else if (key === 'density' && (value === 'compact' || value === 'full')) p.density = value;
  else if (key === 'startView' && (value === 'last' || isCalendarView(value))) p.startView = value;
  else if (key === 'accessibility' && value && typeof value === 'object') {
    const next = value as Record<string, unknown>;
    for (const name of ['highContrast', 'largeText', 'reduceMotion', 'plainBackground', 'shortcuts'] as const) if (typeof next[name] === 'boolean') accessibility.value[name] = next[name] as boolean;
  }
}
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

let pushTimer: ReturnType<typeof setTimeout> | undefined;
const dirty = new Set<string>();
function schedule(keys: string[]) {
  const now = Date.now();
  for (const key of keys) { stamps[key] = now; dirty.add(key); }
  writePreference(AT_KEY, stamps);
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => void push(), 1500);
}
async function push() {
  if (!me.value || !dirty.size) return;
  const values = current(), changes: Record<string, { v: unknown; at: number }> = {};
  for (const key of dirty) if (values[key] !== undefined) changes[key] = { v: values[key], at: stamps[key] ?? Date.now() };
  dirty.clear();
  if (!Object.keys(changes).length) return;
  try { await api('/account/preferences', { method: 'PUT', body: { changes } }); } catch { for (const key of Object.keys(changes)) dirty.add(key); }
}
/** The account's values newer than this device's are applied; this device's values the account does not have are added. */
export async function pullPreferences() {
  if (!me.value) return;
  try {
    const server = await api<Record<string, { v: unknown; at: number }>>('/account/preferences');
    const values = current();
    applying = true;
    for (const [key, entry] of Object.entries(server)) if (key in values && entry.at > (stamps[key] ?? 0)) { apply(key, entry.v); stamps[key] = entry.at; }
    writePreference(AT_KEY, stamps);
    known = JSON.stringify(current());
    applying = false;
    // What the account does not have yet comes from this device (with the time it was last changed here, if known).
    const toAdd = Object.keys(current()).filter(key => current()[key] !== undefined && !server[key]);
    for (const key of toAdd) { stamps[key] ??= 1; dirty.add(key); }
    if (dirty.size) await push();
  } catch { applying = false; /* retried at the next sign-in */ }
  // New device: the account's group opens the planning at once (the person is not asked again).
  if (me.value?.groupId && !readPreference<string>('vencat:group', '')) {
    const group = groupById(me.value.groupId);
    if (group) { writePreference('vencat:group', group.id); if (router.currentRoute.value.path === '/') void router.push(group.path); }
  }
}
watch([() => preferences.value, () => accessibility.value], () => {
  if (applying) return;
  const next = current(), before = JSON.parse(known) as Values;
  const changed = Object.keys(next).filter(key => !same(next[key], before[key]));
  known = JSON.stringify(next);
  if (changed.length) schedule(changed);
}, { deep: true });
watch(() => me.value?.id, id => { if (id) void pullPreferences(); }, { immediate: true });
