import { Router } from 'express';
import { redis, configured } from './storage.js';
import { warmSearchCaches } from './search.js';
import { randomBytes } from 'node:crypto';
import { compareSnapshots, type Snapshot, type CourseChange } from '../shared/changes.js';
import { groupById } from '../shared/selection.js';
import { addDay, campusDate, mondayOf } from '../shared/calendar.js';

export const monitoringRouter = Router();
const ttl = 30 * 86400;
monitoringRouter.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
monitoringRouter.get('/history/config', (_req, res) => res.json({ sharedHistory: configured() }));
monitoringRouter.get('/changes/:groupId', async (req, res, next) => {
  if (!configured()) return res.status(503).json({ error: 'Historique partagé non configuré.' });
  if (!groupById(String(req.params.groupId))) return res.status(400).json({ error: 'Groupe invalide.' });
  try { await redis('SADD', 'vencat:monitored', String(req.params.groupId)); const value = await redis<string | null>('GET', `vencat:history:${req.params.groupId}`); res.json(value ? JSON.parse(value) : []); } catch (error) { next(error); }
});
monitoringRouter.get('/monitor', async (req, res, next) => {
  if (!process.env.CRON_SECRET || req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) return res.sendStatus(401);
  if (!configured()) return res.status(503).json({ error: 'Stockage durable non configuré.' });
  try {
    // Lease prevents concurrent jobs from advancing the same baseline twice.
    const lease = randomBytes(16).toString('hex');
    if (!await redis('SET', 'vencat:monitor-lock', lease, 'NX', 'EX', 310)) return res.status(202).json({ busy: true });
    try {
      const groups = (await redis<string[]>('SMEMBERS', 'vencat:monitored')).sort();
      const cursor = Number(await redis<string | null>('GET', 'vencat:monitor-cursor') ?? 0);
      const batch = [...groups.slice(cursor), ...groups.slice(0, cursor)];
      const { getCalendar } = await import('./app.js');
      const results: PromiseSettledResult<void>[] = [];
      const started = Date.now();
      const processGroup = async (group: string) => {
        const start = mondayOf(campusDate(new Date())), weeks = [start, addDay(start, 7)];
        for (const week of weeks) {
          const { snapshot } = await getCalendar(group, week, addDay(week, 6));
          // Fallback has a separate baseline and never generates shared changes.
          if (snapshot.source !== 'post') continue;
          const snapshotKey = `vencat:snapshot:${group}:${week}`;
          const previous = await redis<string | null>('GET', snapshotKey);
          const old: Snapshot | undefined = previous ? JSON.parse(previous) : undefined;
          // Require two observations before recording an unexpected mass removal.
          if (old?.courses.length && !snapshot.courses.length) {
            if (!await redis('GET', `${snapshotKey}:empty`)) { await redis('SET', `${snapshotKey}:empty`, '1', 'EX', 86400); continue; }
          } else await redis('DEL', `${snapshotKey}:empty`);
          const changes = compareSnapshots(old, snapshot);
          if (changes.length) {
            const stored = await redis<string | null>('GET', `vencat:history:${group}`);
            const history = new Map<string, CourseChange>((stored ? JSON.parse(stored) : []).map((entry: CourseChange) => [entry.id, entry]));
            changes.forEach(entry => history.set(entry.id, entry));
            await redis('SET', `vencat:history:${group}`, JSON.stringify([...history.values()].filter(entry => Date.parse(entry.detectedAt) > Date.now() - ttl * 1000).sort((a, b) => b.detectedAt.localeCompare(a.detectedAt)).slice(0, 200)), 'EX', ttl);
          }
          await redis('SET', snapshotKey, JSON.stringify(snapshot), 'EX', ttl);
        }
        if (Date.now() - started < 170000) await warmSearchCaches(group, campusDate(new Date()));
      };
      // Bounded concurrency and time leave room to release the lease before timeout.
      for (let index = 0; index < batch.length && Date.now() - started < 240000; index += 3) results.push(...await Promise.allSettled(batch.slice(index, index + 3).map(processGroup)));
      await redis('SET', 'vencat:monitor-cursor', String((cursor + results.length) % Math.max(1, groups.length)));
      res.json({ processed: results.length, remaining: Math.max(0, groups.length - results.length), failed: results.filter(item => item.status === 'rejected').length });
    } finally { await redis('EVAL', "if redis.call('get',KEYS[1]) == ARGV[1] then return redis.call('del',KEYS[1]) else return 0 end", 1, 'vencat:monitor-lock', lease); }
  } catch (error) { next(error); }
});
