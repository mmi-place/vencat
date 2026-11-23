import { Router } from 'express';
import { searchDataset } from './search.js';
import { configured, redis } from './storage.js';
import { groupOptions } from '../shared/selection.js';
import { campusDate } from '../shared/calendar.js';

// Scheduled refresh of the one-month search for every group, at 02:00 and 14:00 (Paris),
// one group per minute so that CELCAT never receives every request at once.
export const PREFETCH_HOURS = [2, 14];
export const PREFETCH_SPACING_MS = 60_000;
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

/** Long-running server (local or VPS): the next run is planned in-process. */
export function startPrefetchScheduler(log: (message: string) => void = console.log) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const groupTimers: ReturnType<typeof setTimeout>[] = [];
  const plan = () => {
    // Next 02:00 or 14:00 in Paris, found minute by minute (handles daylight saving time).
    const now = Date.now();
    let at = Math.ceil((now + 1000) / 60000) * 60000;
    while (!(PREFETCH_HOURS.includes(parisClock(new Date(at)).hour) && parisClock(new Date(at)).minute === 0)) at += 60000;
    timer = setTimeout(run, at - now);
    log(`[préchargement] prochain passage le ${new Date(at).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })}`);
  };
  const run = () => {
    const groups = prefetchGroups();
    groupTimers.length = 0;
    groups.forEach((groupId, index) => groupTimers.push(setTimeout(() => {
      prefetchMonth(groupId).then(result => log(`[préchargement] ${index + 1}/${groups.length} ${groupId} · ${result.courses} cours · ${result.ms} ms`)).catch(error => log(`[préchargement] ${groupId} échec : ${error instanceof Error ? error.message : error}`));
    }, index * PREFETCH_SPACING_MS)));
    plan();
  };
  plan();
  return () => { clearTimeout(timer); groupTimers.forEach(clearTimeout); };
}

// Serverless (Vercel): the cron starts the run; each call refreshes one group, waits a minute, then calls the next one.
export const prefetchRouter = Router();
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
prefetchRouter.get('/prefetch', async (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!process.env.CRON_SECRET || req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) return res.sendStatus(401);
  const groups = prefetchGroups();
  const index = Number(req.query.index ?? 0);
  if (!Number.isInteger(index) || index < 0 || index >= groups.length) return res.status(400).json({ error: 'Index invalide.' });
  const clock = parisClock();
  const run = typeof req.query.run === 'string' ? req.query.run : `${clock.day}-${clock.hour}`;
  // Cron entries exist for both UTC hours that can be 02:00 / 14:00 in Paris: only the right one starts a run.
  if (index === 0 && req.query.force !== '1' && !PREFETCH_HOURS.includes(clock.hour)) return res.status(204).end();
  try {
    if (configured() && !await redis('SET', `vencat:prefetch:${run}:${index}`, '1', 'NX', 'EX', 86400)) return res.status(202).json({ duplicate: true });
    const started = Date.now();
    const result = await prefetchMonth(groups[index]!).catch(error => ({ groupId: groups[index], error: error instanceof Error ? error.message : String(error) }));
    if (index + 1 < groups.length) {
      await sleep(Math.max(0, PREFETCH_SPACING_MS - (Date.now() - started)));
      const origin = process.env.PUBLIC_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : `${req.protocol}://${req.headers.host}`);
      // The next call runs on its own; only its start is awaited.
      await fetch(`${origin}/api/prefetch?index=${index + 1}&run=${encodeURIComponent(run)}`, { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` }, signal: AbortSignal.timeout(4000) }).catch(() => undefined);
    }
    res.json({ run, index, of: groups.length, result });
  } catch (error) { next(error); }
});
