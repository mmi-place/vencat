import { readPreference, writePreference } from './storage';

// Visits keep the server copies fresh: when the app opens or comes back to the foreground, it tells the server at most
// once an hour per device. The server decides (nothing happens unless its last full refresh is older than 12 hours).
const KEY = 'vencat:warmup', EVERY_MS = 3600_000;
function touch() {
  if (document.hidden || !navigator.onLine) return;
  const last = readPreference<number>(KEY, 0);
  if (Date.now() - last < EVERY_MS) return;
  writePreference(KEY, Date.now());
  void fetch('/api/prefetch/touch', { method: 'POST', headers: { 'x-requested-with': 'vencat' }, keepalive: true }).catch(() => undefined);
}
touch();
document.addEventListener('visibilitychange', touch);
