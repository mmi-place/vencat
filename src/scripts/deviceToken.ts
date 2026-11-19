import { readPreference, writePreference } from './storage';

// Anonymous device token (see backend/identity.ts): requested once, kept on the device,
// renewed a month before it expires. It only serves the request budget of heavy calls.
interface SavedToken { token: string; expiresAt: string }
const KEY = 'vencat:device-token', RENEW_BEFORE = 30 * 86400_000;
let pending: Promise<string | undefined> | undefined, unavailable = false;

async function deviceToken(): Promise<string | undefined> {
  const saved = readPreference<SavedToken | null>(KEY, null);
  if (saved && typeof saved.token === 'string' && Date.parse(saved.expiresAt) - Date.now() > RENEW_BEFORE) return saved.token;
  if (unavailable || !navigator.onLine) return saved?.token;
  return pending ??= (async () => {
    try {
      const response = await fetch('/api/token', { method: 'POST', signal: AbortSignal.timeout(10_000) });
      // 204: the server does not issue tokens; the device keeps the per-address budget.
      if (response.status === 204) { unavailable = true; return undefined; }
      if (!response.ok) return saved?.token;
      const data = await response.json() as SavedToken;
      if (typeof data.token !== 'string' || !Number.isFinite(Date.parse(data.expiresAt))) return saved?.token;
      writePreference(KEY, data);
      return data.token;
    } catch { return saved?.token; }
    finally { pending = undefined; }
  })();
}

/** fetch() for calls with a request budget: adds the device token when there is one. */
export async function budgetedFetch(url: string, init: RequestInit = {}) {
  const token = await deviceToken();
  const headers = new Headers(init.headers);
  if (token) headers.set('X-Vencat-Token', token);
  return fetch(url, { ...init, headers });
}
