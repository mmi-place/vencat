import express from 'express';
import { HttpError, requireUser } from './auth.js';
import { db, route } from './common.js';

// Preferences that follow the account from one device to another (theme, colors, view options, accessibility).
// Merged key by key: the most recent change of a key wins, a key never changes another. Device-only things
// (last view shown, background image) are not kept here.
export const PREF_KEYS = ['theme', 'background', 'palette', 'colorMode', 'colors', 'weekend', 'density', 'startView', 'accessibility'] as const;
interface Pref { v: unknown; at: number }
interface PrefsDoc { values: Record<string, Pref> }
const MAX_VALUE = 4000;
const router = express.Router();
export const prefsRouter = router;

router.get('/account/preferences', route(async (req, res) => {
  const { user } = await requireUser(req);
  res.json((await db().get<PrefsDoc>('prefs', user.id))?.values ?? {});
}));
router.put('/account/preferences', route(async (req, res) => {
  const { user } = await requireUser(req);
  const changes = (req.body?.changes ?? {}) as Record<string, Pref>;
  const doc = await db().get<PrefsDoc>('prefs', user.id) ?? { values: {} };
  let touched = false;
  for (const key of PREF_KEYS) {
    const change = Object.prototype.hasOwnProperty.call(changes, key) ? changes[key] : undefined;
    if (!change || typeof change.at !== 'number' || !Number.isFinite(change.at) || change.at > Date.now() + 60_000) continue;
    if (JSON.stringify(change.v ?? null).length > MAX_VALUE) throw new HttpError(400, 'Préférence trop volumineuse.');
    if ((doc.values[key]?.at ?? 0) >= change.at) continue;
    doc.values[key] = { v: change.v ?? null, at: Math.floor(change.at) };
    touched = true;
  }
  if (touched) await db().put('prefs', user.id, doc);
  res.json(doc.values);
}));
