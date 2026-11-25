import express from 'express';
import { notifyAdmins } from './notify.js';
import { HttpError, id, now, overLimit, addressKey } from './auth.js';
import { db, route } from './common.js';
import { cleanText, normalizeEmail } from '../../shared/travaux.js';

// Feedback during the beta: a small form on desktop, sent by mail to the addresses chosen in the administration
// (the admins by default). Open to anyone, with a rate limit per address.
export const FEEDBACK_KINDS = { bug: 'Bug', idea: 'Idée', other: 'Autre' } as const;
export type FeedbackKind = keyof typeof FEEDBACK_KINDS;
export interface Feedback { id: string; at: string; kind: FeedbackKind; message: string; email?: string; context: Record<string, string> }

const CONTEXT_KEYS = ['page', 'groupe', 'version', 'navigateur', 'écran', 'compte'];

const router = express.Router();
router.post('/travaux/feedback', route(async (req, res) => {
  if (await overLimit('feedback:' + addressKey(req), 5, 3600)) throw new HttpError(429, 'Trop de messages envoyés. Réessaie dans un moment.');
  const kind = (typeof req.body?.kind === 'string' && Object.hasOwn(FEEDBACK_KINDS, req.body.kind) ? req.body.kind : 'other') as FeedbackKind;
  const message = cleanText(req.body?.message, 2000);
  if (message.length < 5) throw new HttpError(400, 'Décris ton retour en quelques mots.');
  const rawEmail = typeof req.body?.email === 'string' ? normalizeEmail(req.body.email) : '';
  if (rawEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail)) throw new HttpError(400, 'Adresse mail invalide.');
  const context: Record<string, string> = {};
  if (req.body?.context && typeof req.body.context === 'object') for (const key of CONTEXT_KEYS) { const value = cleanText(req.body.context[key], 200); if (value) context[key] = value; }
  const item: Feedback = { id: id(), at: now(), kind, message, email: rawEmail || undefined, context };
  await db().put('feedback', item.id, item);
  const lines = Object.entries(context).map(([key, value]) => `${key} : ${value}`).join('\n');
  const text = `${message}\n\n— ${FEEDBACK_KINDS[kind]} · retour Vencat bêta\nRépondre à : ${rawEmail || 'non communiqué'}\n${lines}`;
  const subject = `[Vencat bêta] ${FEEDBACK_KINDS[kind]} : ${message.replace(/\s+/g, ' ').slice(0, 60)}`;
  // Always kept (see the administration); mailed to the chosen list, if there is one.
  const { to, sent } = await notifyAdmins('feedback', subject, text, rawEmail || undefined);
  if (to && !sent) throw new HttpError(502, 'Le message est enregistré mais le mail n’a pas pu partir. Réessaie plus tard.');
  res.json({ ok: true });
}));
export const feedbackRouter = router;
