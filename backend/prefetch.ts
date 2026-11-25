import { Router } from 'express';
import { searchDataset } from './search.js';
import { configured, redis } from './storage.js';
import { groupOptions } from '../shared/selection.js';
import { campusDate } from '../shared/calendar.js';
import { detectAll } from './changes.js';
import { rateLimited } from './identity.js';

// Refresh of the one-month search for every group, in one pass (plus the change detection).
// Long-running server (local, VPS): in-process, at 02:00 and 14:00 (Paris).
// Vercel (Hobby: a cron runs once a day, a function stops after 300 s): the daily cron, plus a pass started by a visit
// when the last one is old (see below). One call refreshes the groups a few at a time under a time budget; if the
// budget runs out, it hands the rest to one more call.
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
  // Each pass also detects the timetable changes of every group (current and next week).
  const run = () => { void prefetchAll(0, Infinity, log).then(() => detectAll(prefetchGroups(), Infinity)).then(result => log(`[changements] ${result.groups} groupes, ${result.changes} changement(s) en ${Math.round(result.ms / 1000)} s`)).catch(error => log(`[changements] ${error instanceof Error ? error.message : error}`)).finally(plan); };
  plan();
  return () => clearTimeout(timer);
}

// Serverless (Vercel). Hobby crons run once a day, so the daily cron does the full pass and a visit can start one too:
// when the last full pass is older than PREFETCH_STALE_MS, the next visitor's app asks for a new one (POST /prefetch/touch).
export const PREFETCH_STALE_MS = 12 * 3600_000;
const LAST_KEY = 'vencat:prefetch:last', LOCK_KEY = 'vencat:prefetch:lock';
let memoryLast = 0;
async function lastPass() {
  if (configured()) { try { const value = Number(await redis('GET', LAST_KEY)); if (value) return value; } catch { /* per-instance value */ } }
  return memoryLast;
}
async function markPass() { memoryLast = Date.now(); if (configured()) { try { await redis('SET', LAST_KEY, String(memoryLast)); } catch { /* per-instance value */ } } }
const originOf = (req: { protocol: string; headers: { host?: string } }) => process.env.PUBLIC_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : `${req.protocol}://${req.headers.host}`);

/** One call of the full pass: groups from `from`, then change detection; hands the rest to one more call when out of budget. */
async function runPass(req: { protocol: string; headers: { host?: string } }, from: number, slot: string) {
  const result = await prefetchAll(from);
  // Change detection in the same call when the budget allows it (otherwise the daily /api/monitor does it).
  const changes = result.next === undefined && from === 0 ? await detectAll(prefetchGroups(), Math.max(0, PREFETCH_BUDGET_MS - result.ms)) : undefined;
  if (result.next !== undefined) {
    // Out of budget: one more call finishes the pass (only its start is awaited).
    await fetch(`${originOf(req)}/api/prefetch?from=${result.next}&slot=${encodeURIComponent(slot)}`, { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` }, signal: AbortSignal.timeout(4000) }).catch(() => undefined);
  } else await markPass();
  return { slot, from, ...result, changes };
}

export const prefetchRouter = Router();
prefetchRouter.get('/prefetch', async (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!process.env.CRON_SECRET || req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) return res.sendStatus(401);
  const from = Number(req.query.from ?? 0);
  if (!Number.isInteger(from) || from < 0 || from >= prefetchGroups().length) return res.status(400).json({ error: 'Index invalide.' });
  const clock = parisClock();
  // One pass per day for the cron (whatever the hour: summer and winter time shift it), once per slot.
  const slot = typeof req.query.slot === 'string' ? req.query.slot : `${clock.day}`;
  try {
    if (configured() && !await redis('SET', `vencat:prefetch:${slot}:${from}`, '1', 'NX', 'EX', 86400)) return res.status(202).json({ duplicate: true });
    res.json(await runPass(req, from, slot));
  } catch (error) { next(error); }
});
// A visit: the app calls this once in a while. Nothing happens unless the last full pass is old and no pass is running.
prefetchRouter.post('/prefetch/touch', async (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!process.env.VERCEL && process.env.PREFETCH_ON_VISIT !== '1') return res.status(204).end();
  if (req.headers['x-requested-with'] !== 'vencat') return res.sendStatus(400);
  try {
    if (Date.now() - await lastPass() < PREFETCH_STALE_MS) return res.status(204).end();
    if (configured() && await rateLimited(req)) return res.status(429).end();
    if (configured() ? !await redis('SET', LOCK_KEY, '1', 'NX', 'EX', 600) : false) return res.status(202).json({ running: true });
    res.json(await runPass(req, 0, `visit-${Date.now()}`));
  } catch (error) { next(error); }
});
