import { Router } from 'express';
import { searchDataset } from './search.js';
import { configured, redis } from './storage.js';
import { groupOptions } from '../shared/selection.js';
import { campusDate } from '../shared/calendar.js';

// Scheduled refresh of the one-month search for every group, at 02:00 and 14:00 (Paris), in one pass.
// Vercel limits (Hobby): a cron runs once a day within its hour, a function stops after 300 s.
// So one call refreshes every group, a few at a time, under a time budget; if the budget runs out,
// it hands the rest to one more call.
export const PREFETCH_HOURS = [2, 14];
export const PREFETCH_CONCURRENCY = 4;
/** Seconds of work per call, below the 300 s limit of a function. */
export const PREFETCH_BUDGET_MS = 240_000;
export const prefetchGroups = () => groupOptions.map(group => group.id);
const paris = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', year: 'numeric', month: '2-digit', day: '2-digit', hourCycle: 'h23' });
export function parisClock(date = new Date()) {
  const parts = Object.fromEntries(paris.formatToParts(date).map(part => [part.type, part.value]));
  return { day: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour), minute: Number(parts.minute) };
}
/** Fetches CELCAT again for the current month, even if a copy is still valid. */
export async function prefetchMonth(groupId: string) {
  const started = Date.now();
  const dataset = await searchDataset(groupId, 'month', campusDate(new Date()), undefined, true);
  return { groupId, courses: dataset.courses.length, ms: Date.now() - started };
}
export interface PrefetchResult { done: number; failed: string[]; next?: number; ms: number }
/** Refreshes the groups from `from`, PREFETCH_CONCURRENCY at a time, until done or out of budget. */
export async function prefetchAll(from = 0, budget = PREFETCH_BUDGET_MS, log?: (message: string) => void): Promise<PrefetchResult> {
  const groups = prefetchGroups(), started = Date.now(), failed: string[] = [];
  let index = from, done = 0;
  while (index < groups.length && Date.now() - started < budget) {
    const batch = groups.slice(index, index + PREFETCH_CONCURRENCY);
    const results = await Promise.allSettled(batch.map(prefetchMonth));
    results.forEach((result, offset) => { if (result.status === 'fulfilled') done++; else failed.push(batch[offset]!); });
    index += batch.length;
  }
  const result = { done, failed, next: index < groups.length ? index : undefined, ms: Date.now() - started };
  log?.(`[préchargement] ${done} groupe(s) en ${Math.round(result.ms / 1000)} s${failed.length ? `, échecs : ${failed.join(', ')}` : ''}${result.next !== undefined ? `, reprise au groupe ${result.next}` : ''}`);
  return result;
}

/** Long-running server (local or VPS): the next run is planned in-process. */
export function startPrefetchScheduler(log: (message: string) => void = console.log) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const plan = () => {
    // Next 02:00 or 14:00 in Paris, found minute by minute (handles daylight saving time).
    const now = Date.now();
    let at = Math.ceil((now + 1000) / 60000) * 60000;
    while (!(PREFETCH_HOURS.includes(parisClock(new Date(at)).hour) && parisClock(new Date(at)).minute === 0)) at += 60000;
    timer = setTimeout(run, at - now);
    log(`[préchargement] prochain passage le ${new Date(at).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })}`);
  };
  const run = () => { void prefetchAll(0, Infinity, log).finally(plan); };
  plan();
  return () => clearTimeout(timer);
}

// Serverless (Vercel cron). Cron entries exist for both UTC hours that can be 02:00 / 14:00 in Paris;
// only the call that falls in the right Paris hour works, once per slot (Redis), the others answer 204.
export const prefetchRouter = Router();
prefetchRouter.get('/prefetch', async (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!process.env.CRON_SECRET || req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) return res.sendStatus(401);
  const from = Number(req.query.from ?? 0);
  if (!Number.isInteger(from) || from < 0 || from >= prefetchGroups().length) return res.status(400).json({ error: 'Index invalide.' });
  const clock = parisClock();
  const slot = typeof req.query.slot === 'string' ? req.query.slot : `${clock.day}-${clock.hour}`;
  if (from === 0 && req.query.force !== '1' && !PREFETCH_HOURS.includes(clock.hour)) return res.status(204).end();
  try {
    if (configured() && !await redis('SET', `vencat:prefetch:${slot}:${from}`, '1', 'NX', 'EX', 86400)) return res.status(202).json({ duplicate: true });
    const result = await prefetchAll(from);
    if (result.next !== undefined) {
      // Out of budget: one more call finishes the slot (only its start is awaited).
      const origin = process.env.PUBLIC_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : `${req.protocol}://${req.headers.host}`);
      await fetch(`${origin}/api/prefetch?from=${result.next}&slot=${encodeURIComponent(slot)}`, { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` }, signal: AbortSignal.timeout(4000) }).catch(() => undefined);
    }
    res.json({ slot, from, ...result });
  } catch (error) { next(error); }
});
