import express, {  } from 'express';
import { HttpError, id, now, authenticate, requireUser, requireContributor, overLimit, groupExists, isAdmin } from './auth.js';
import { parisInstant, cleanText, LIMITS, validTime } from '../../shared/travaux.js';
import { type Correction, db, route, users, audit, problem, adjustReliability, castVote, correctionView } from './common.js';

// Timetable corrections certified on honour: shown over CELCAT, never replacing it.
const router = express.Router();
export const correctionsRouter = router;

router.get('/travaux/corrections/:groupId', route(async (req, res) => {
  const { user } = await authenticate(req);
  const people = await users();
  const items = (await db().list<Correction>('corrections')).filter(item => item.groupId === req.params.groupId && (item.status === 'open' || item.status === 'accepted') && Date.parse(item.course.end) > Date.now() - 7 * 86400000);
  res.json(await Promise.all(items.map(item => correctionView(item, user, people))));
}));
router.post('/travaux/corrections', route(async (req, res) => {
  const { user } = await requireContributor(req);
  const body = req.body ?? {};
  if (body.certified !== true) throw new HttpError(400, 'Coche la case « Je certifie sur l’honneur ».');
  if (!groupExists(body.groupId) || (user.groupId !== body.groupId && !isAdmin(user))) throw new HttpError(403, 'Tu ne peux corriger que l’emploi du temps de ton groupe.');
  const course = body.course ?? {};
  if (typeof course.uid !== 'string' || !Number.isFinite(Date.parse(course.start)) || !Number.isFinite(Date.parse(course.end))) throw new HttpError(400, 'Cours invalide.');
  const field = ['room', 'time', 'cancelled'].includes(body.field) ? body.field as Correction['field'] : undefined;
  if (!field) throw new HttpError(400, 'Correction invalide.');
  const value = cleanText(body.value, 120);
  if (field === 'room' && !value) throw new HttpError(400, 'Indique la salle.');
  if (field === 'time' && (!validTime(body.startTime) || !validTime(body.endTime) || body.startTime >= body.endTime)) throw new HttpError(400, 'Horaires invalides.');
  if (await overLimit('correction:' + user.id, LIMITS.addsPerDay, 86400)) throw new HttpError(429, 'Limite de corrections atteinte pour aujourd’hui.');
  const day = new Date(course.start).toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });
  const existing = (await db().list<Correction>('corrections')).find(item => item.groupId === body.groupId && item.course.uid === course.uid && item.course.start === course.start && item.status === 'open');
  if (existing) throw new HttpError(409, 'Une correction est déjà proposée pour ce cours : vote sur celle-ci.');
  const item: Correction = {
    id: id(), groupId: body.groupId, field, authorId: user.id, createdAt: now(), status: 'open',
    course: { uid: course.uid.slice(0, 200), start: course.start, end: course.end, module: cleanText(course.module, 200), summary: cleanText(course.summary, 200), location: cleanText(course.location, 120) },
    value: field === 'time' ? `${body.startTime}–${body.endTime}` : field === 'cancelled' ? 'Annulé' : value,
    start: field === 'time' ? parisInstant(day, body.startTime) : undefined, end: field === 'time' ? parisInstant(day, body.endTime) : undefined,
  };
  await db().put('corrections', item.id, item);
  await audit(user.id, 'correction:certifiée sur l’honneur', item.id, `${item.course.summary} · ${item.field} → ${item.value}`);
  res.status(201).json(await correctionView(item, user, await users()));
}));
router.post('/travaux/correction/:id/vote', route(async (req, res) => {
  const { user } = await requireContributor(req);
  const item = await db().get<Correction>('corrections', String(req.params.id));
  if (!item || item.status !== 'open') throw new HttpError(404, 'Correction fermée.');
  if (item.authorId === user.id) throw new HttpError(400, 'Ton propre vote ne compte pas.');
  if (user.groupId !== item.groupId && !isAdmin(user)) throw new HttpError(403, 'Seuls les élèves du groupe peuvent voter.');
  await castVote(user, item.id, req.body?.value, req.body?.reason);
  const people = await users();
  const view = await correctionView(item, user, people);
  if (view.state === 'validated') { item.status = 'accepted'; await db().put('corrections', item.id, item); await adjustReliability(item.authorId, 1); }
  else if (view.state === 'contested') { item.status = 'rejected'; await db().put('corrections', item.id, item); await adjustReliability(item.authorId, -2); await problem(item.authorId, 'fausse correction d’emploi du temps', item.course.summary); }
  res.json(await correctionView(item, user, people));
}));
/** CELCAT changed the course: the correction closes by itself. */
router.post('/travaux/correction/:id/close', route(async (req, res) => {
  const { user } = await requireUser(req);
  const item = await db().get<Correction>('corrections', String(req.params.id));
  if (item && user.groupId !== item.groupId && !isAdmin(user)) throw new HttpError(403, 'Réservé aux élèves du groupe.');
  if (item && (item.status === 'open' || item.status === 'accepted') && req.body?.reason === 'celcat') { item.status = 'closed'; await db().put('corrections', item.id, item); }
  res.json({ ok: true });
}));
