import { Router } from 'express';
import { changesFor, detectAll } from './changes.js';
import { groupById, groupOptions } from '../shared/selection.js';
import { housekeeping } from './travaux/housekeeping.js';

// Change history (detected on the server, see changes.ts) and the daily detection pass for every group.
export const monitoringRouter = Router();
monitoringRouter.use(['/history', '/changes', '/monitor'], (_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
monitoringRouter.get('/history/config', (_req, res) => res.json({ sharedHistory: true }));
monitoringRouter.get('/changes/:groupId', async (req, res, next) => {
  if (!groupById(String(req.params.groupId))) return res.status(400).json({ error: 'Groupe invalide.' });
  try { res.json(await changesFor(String(req.params.groupId))); } catch (error) { next(error); }
});
monitoringRouter.get('/monitor', async (req, res, next) => {
  if (!process.env.CRON_SECRET || req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) return res.sendStatus(401);
  try {
    // Cleaning first (quick), then the change detection of every group.
    const cleaned = await housekeeping().catch(error => ({ error: String(error) }));
    res.json({ ...await detectAll(groupOptions.map(group => group.id)), cleaned });
  } catch (error) { next(error); }
});
