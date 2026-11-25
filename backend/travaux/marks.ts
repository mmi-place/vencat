import express from 'express';
import { requireUser, now } from './auth.js';
import { cleanText, LIMITS } from '../../shared/travaux.js';
import { type Marks, db, route } from './common.js';

// Private marks of an account: « done » and notes. One small document per mark (never one document per account):
// two devices, or two quick taps, can never overwrite each other. Removals leave a short-lived tombstone so that a
// device that was offline cannot bring back a mark removed elsewhere. Old marks are pruned.
interface DoneDoc { at: string; gone?: boolean }
interface NoteDoc { text: string; at: string }
const WORK_ID = /^[a-f0-9]{32}$/;
const DONE_KEEP_MS = 200 * 86400_000, GONE_KEEP_MS = 30 * 86400_000, MAX_DONE = 3000;
const doneKey = (userId: string, work: string) => `${userId}:d:${work}`, noteKey = (userId: string, work: string) => `${userId}:n:${work}`;
const router = express.Router();
export const marksRouter = router;

/** Marks of the old format (one document per account) are split into per-mark documents, then removed. */
async function migrate(userId: string) {
  const legacy = await db().get<Marks>('marks', userId);
  if (!legacy) return;
  for (const [work, at] of Object.entries(legacy.done ?? {})) if (WORK_ID.test(work)) await put<DoneDoc>(doneKey(userId, work), { at: typeof at === 'string' ? at : now() });
  for (const [work, text] of Object.entries(legacy.notes ?? {})) if (WORK_ID.test(work)) await put<NoteDoc>(noteKey(userId, work), { text, at: now() });
  await db().delete('marks', userId);
}
// list() returns documents only, so every document carries its own key.
const withKey = <T extends object>(key: string, doc: T) => ({ ...doc, k: key });
type Row = { k: string } & Partial<DoneDoc & NoteDoc>;
async function load(userId: string): Promise<{ marks: Marks; gone: Map<string, string> }> {
  await migrate(userId);
  const rows = await db().list<Row>('marks', userId + ':');
  const marks: Marks = { done: {}, notes: {} }, gone = new Map<string, string>();
  const stale: string[] = [];
  for (const row of rows) {
    const [, kind, work] = String(row.k ?? '').split(':');
    if (!work || !WORK_ID.test(work)) continue;
    if (kind === 'd') {
      if (row.gone) { gone.set(work, row.at ?? ''); if (Date.parse(row.at ?? '') < Date.now() - GONE_KEEP_MS) stale.push(row.k); }
      else if (Date.parse(row.at ?? '') < Date.now() - DONE_KEEP_MS) stale.push(row.k);
      else marks.done[work] = row.at ?? now();
    } else if (kind === 'n' && row.text) marks.notes[work] = row.text;
  }
  // Pruning: old marks and tombstones, and the oldest marks beyond the cap (at most 100 deletions per call).
  const oldest = Object.entries(marks.done).sort((a, b) => a[1].localeCompare(b[1])).slice(0, Math.max(0, Object.keys(marks.done).length - MAX_DONE)).map(([work]) => doneKey(userId, work));
  for (const key of [...stale, ...oldest].slice(0, 100)) await db().delete('marks', key);
  for (const key of oldest.slice(0, 100)) delete marks.done[key.split(':')[2]!];
  return { marks, gone };
}
const put = <T extends object>(key: string, doc: T) => db().put('marks', key, withKey(key, doc));

router.get('/account/marks', route(async (req, res) => {
  const { user } = await requireUser(req);
  res.json((await load(user.id)).marks);
}));
// Changes: { done: { id: true|false }, notes: { id: text } } touch only the listed marks.
// Merge: { merge: { done: { id: iso }, notes: { id: text } } } only ADDS what the account does not have yet
// (never overwrites, never removes), then answers with the whole set.
router.put('/account/marks', route(async (req, res) => {
  const { user } = await requireUser(req);
  const body = (req.body ?? {}) as { done?: Record<string, boolean>; notes?: Record<string, string>; merge?: { done?: Record<string, string>; notes?: Record<string, string> } };
  for (const [work, value] of Object.entries(body.done ?? {}).slice(0, 200)) {
    if (!WORK_ID.test(work)) continue;
    await put<DoneDoc>(doneKey(user.id, work), value ? { at: now() } : { at: now(), gone: true });
  }
  for (const [work, value] of Object.entries(body.notes ?? {}).slice(0, 200)) {
    if (!WORK_ID.test(work)) continue;
    const text = cleanText(value, LIMITS.note);
    if (text) await put<NoteDoc>(noteKey(user.id, work), { text, at: now() }); else await db().delete('marks', noteKey(user.id, work));
  }
  if (!body.merge) return res.json({ ok: true });
  const { marks, gone } = await load(user.id);
  for (const [work, at] of Object.entries(body.merge.done ?? {}).slice(0, 500)) {
    if (!WORK_ID.test(work) || marks.done[work]) continue;
    const date = Date.parse(at);
    if (!Number.isFinite(date) || date > Date.now() + 60_000 || date < Date.now() - DONE_KEEP_MS) continue;
    // Removed on another device after this mark was made: it stays removed.
    if (gone.has(work) && Date.parse(gone.get(work)!) >= date) continue;
    marks.done[work] = new Date(date).toISOString();
    await put<DoneDoc>(doneKey(user.id, work), { at: marks.done[work] });
  }
  for (const [work, value] of Object.entries(body.merge.notes ?? {}).slice(0, 500)) {
    if (!WORK_ID.test(work) || marks.notes[work]) continue;
    const text = cleanText(value, LIMITS.note);
    if (!text) continue;
    marks.notes[work] = text;
    await put<NoteDoc>(noteKey(user.id, work), { text, at: now() });
  }
  res.json(marks);
}));
