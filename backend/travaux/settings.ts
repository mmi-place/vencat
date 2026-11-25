import type { Request, Response, NextFunction } from 'express';
import { store } from './store.js';

// Global switch of the administration: « planning only » turns off every user content (works, accounts,
// corrections, delegates) when it gets out of control; the timetable keeps working. Read every 20 s at most.
export interface GlobalSettings { planningOnly: boolean; message?: string; since?: string; by?: string; notifyEmails?: Partial<Record<'feedback' | 'reports' | 'important', string[]>> }
let cached: { value: GlobalSettings; at: number } | undefined;
export async function settings(): Promise<GlobalSettings> {
  if (cached && Date.now() - cached.at < 20_000) return cached.value;
  const value = await store().get<GlobalSettings>('settings', 'global').catch(() => undefined) ?? { planningOnly: false };
  cached = { value, at: Date.now() };
  return value;
}
/** Read for a write: never the 20 s cache (another instance may have saved since), and a failed read is an error, not the defaults. */
export async function freshSettings(): Promise<GlobalSettings> { return await store().get<GlobalSettings>('settings', 'global') ?? { planningOnly: false }; }
export async function saveSettings(value: GlobalSettings) { await store().put('settings', 'global', value); cached = { value, at: Date.now() }; }
export const DEFAULT_MESSAGE = 'Les Travaux sont temporairement désactivés. L’emploi du temps reste disponible.';
/** Refuses user content while « planning only » is on (the configuration route stays open so devices learn it). */
export async function planningOnlyGuard(req: Request, res: Response, next: NextFunction) {
  // The configuration (devices learn the mode) and adding a CELCAT course to a calendar stay open.
  // Mounted on several prefixes: Express strips them from req.path.
  const path = req.baseUrl.replace(/^\/api/, '') + req.path;
  if (path === '/travaux/config' || path === '/travaux/course-event.ics' || path === '/travaux/feedback') return next();
  try {
    const current = await settings();
    if (!current.planningOnly) return next();
    res.setHeader('Cache-Control', 'no-store');
    if (path.startsWith('/travaux/ics/')) { res.type('text/calendar; charset=utf-8').send('BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Vencat//Travaux//FR\r\nEND:VCALENDAR\r\n'); return; }
    res.status(503).json({ error: current.message || DEFAULT_MESSAGE, planningOnly: true });
  } catch { next(); }
}
