import { online } from '../calendarStore';

// Same-origin calls with the session cookie and the anti-forgery header.
export class ApiError extends Error { constructor(public status: number, message: string) { super(message); } }
/** Network failure (offline, server unreachable): the action can be retried later. */
export const isNetworkError = (error: unknown) => error instanceof ApiError && error.status === 0;
let unauthorized: (() => void) | undefined;
/** Called when the server says the session is no longer valid. */
export function onUnauthorized(handler: () => void) { unauthorized = handler; }
export async function api<T>(path: string, init: { method?: string; body?: unknown; timeout?: number } = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch('/api' + path, { method: init.method ?? (init.body !== undefined ? 'POST' : 'GET'), credentials: 'same-origin', headers: { 'content-type': 'application/json', 'x-requested-with': 'vencat' }, body: init.body !== undefined ? JSON.stringify(init.body) : undefined, signal: AbortSignal.timeout(init.timeout ?? 20_000) });
  } catch { throw new ApiError(0, online.value ? 'Le serveur ne répond pas. Réessaie dans un instant.' : 'Hors ligne : l’action partira au retour du réseau.'); }
  const data = await response.json().catch(() => ({})) as T & { error?: string };
  if (response.status === 401 && !path.startsWith('/auth/') && !path.startsWith('/admin/')) unauthorized?.();
  if (!response.ok) throw new ApiError(response.status, data.error || `Erreur ${response.status}`);
  return data;
}
export const errorText = (error: unknown) => error instanceof Error ? error.message : 'Une erreur est survenue.';
