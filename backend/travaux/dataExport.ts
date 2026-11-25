import express from 'express';
import { requireUser } from './auth.js';
import { type Work, type Proposal, type Correction, type NameRequest, db, route } from './common.js';

// « Download my data »: everything Vencat holds about the signed-in account, as one JSON file.
const router = express.Router();
export const exportRouter = router;
router.get('/account/export', route(async (req, res) => {
  const { user } = await requireUser(req);
  const [marksRows, prefs, votes, delegations, names, works, proposals, corrections] = await Promise.all([
    db().list<{ k: string; at?: string; text?: string; gone?: boolean }>('marks', user.id + ':'),
    db().get<{ values: Record<string, { v: unknown; at: number }> }>('prefs', user.id),
    db().find<{ targetId: string; value: number; reason?: string; at: string }>('votes', 'userId', user.id),
    db().find<Record<string, unknown>>('delegations', 'userId', user.id),
    db().find<NameRequest>('names', 'userId', user.id),
    db().find<Work>('works', 'authorId', user.id),
    db().find<Proposal>('proposals', 'authorId', user.id),
    db().find<Correction>('corrections', 'authorId', user.id),
  ]);
  const done: Record<string, string> = {}, notes: Record<string, string> = {};
  for (const row of marksRows) { const [, kind, work] = String(row.k).split(':'); if (kind === 'd' && !row.gone && work && row.at) done[work] = row.at; else if (kind === 'n' && work && row.text) notes[work] = row.text; }
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="vencat-mes-donnees.json"');
  res.send(JSON.stringify({
    exportedAt: new Date().toISOString(),
    account: { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName, groupId: user.groupId, createdAt: user.createdAt, lastActiveAt: user.lastActiveAt, reliability: user.reliability },
    marks: { done, notes },
    preferences: Object.fromEntries(Object.entries(prefs?.values ?? {}).map(([key, entry]) => [key, entry.v])),
    works, proposals, corrections, votes, delegations, nameRequests: names,
  }, null, 2));
}));
