import express, {  } from 'express';
import { sendMail } from './mail.js';
import { HttpError, id, now, authenticate, requireUser, requireContributor, displayName, activeDelegations, adminEmails, type Delegation } from './auth.js';
import { cleanText, LIMITS } from '../../shared/travaux.js';
import { groupById } from '../../shared/selection.js';
import { db, route, users, audit, answerCounts } from './common.js';

// Delegates: the real class representatives (elected at the IUT) declare themselves, the administration
// checks and confirms. The mandate ends with the school year (31 August).
const router = express.Router();
export const delegatesRouter = router;

const TITLES = ['titulaire', 'suppléant'] as const;
router.get('/travaux/delegates/:groupId', route(async (req, res) => {
  const groupId = String(req.params.groupId);
  const { user } = await authenticate(req);
  const people = await users();
  const all = (await db().list<Delegation>('delegations')).filter(item => item.groupId === groupId);
  const active = (await activeDelegations()).filter(item => item.groupId === groupId);
  const mine = user ? all.filter(item => item.userId === user.id).sort((x, y) => y.createdAt.localeCompare(x.createdAt))[0] : undefined;
  res.json({
    active: active.map(item => ({ id: item.id, userId: item.userId, name: displayName(people.get(item.userId)), title: item.title ?? 'titulaire', until: item.until, me: item.userId === user?.id })),
    pending: all.filter(item => item.status === 'requested').length,
    mine: mine && { status: mine.status, title: mine.title ?? 'titulaire', createdAt: mine.createdAt, answers: answerCounts(mine) },
    declarations: all.filter(item => item.status === 'requested' && item.userId !== user?.id).map(item => ({ id: item.id, name: displayName(people.get(item.userId)), title: item.title ?? 'titulaire', electedOn: item.electedOn, myAnswer: user ? item.answers?.[user.id] : undefined })),
  });
}));
router.post('/travaux/delegates/request', route(async (req, res) => {
  const { user } = await requireContributor(req);
  if (!user.groupId) throw new HttpError(400, 'Choisis d’abord ton groupe.');
  const title = TITLES.includes(req.body?.title) ? req.body.title as Delegation['title'] : 'titulaire';
  const note = cleanText(req.body?.note, LIMITS.reason);
  const electedOn = typeof req.body?.electedOn === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.body.electedOn) && req.body.electedOn <= now().slice(0, 10) ? req.body.electedOn : undefined;
  if (!electedOn) throw new HttpError(400, 'Indique la date de l’élection.');
  if (req.body?.certified !== true) throw new HttpError(400, 'Coche la case pour certifier ton élection.');
  const existing = (await db().list<Delegation>('delegations')).find(item => item.userId === user.id && (item.status === 'requested' || (item.status === 'active' && (!item.until || item.until > now()))));
  if (existing) throw new HttpError(409, existing.status === 'active' ? 'Tu es déjà enregistré(e) comme délégué(e).' : 'Ta déclaration est déjà en cours de vérification.');
  const delegation: Delegation = { id: id(), userId: user.id, groupId: user.groupId, status: 'requested', title, note, electedOn, answers: {}, createdAt: now() };
  await audit(user.id, 'délégué(e) : déclaration certifiée sur l’honneur', delegation.id, `${title}, élu(e) le ${electedOn}`);
  await db().put('delegations', delegation.id, delegation);
  // The administration is told at once: it checks with the list of elected representatives.
  const group = groupById(user.groupId);
  for (const admin of adminEmails()) void sendMail({ to: admin, subject: 'Vencat : déclaration de délégué à vérifier', text: `${displayName(user)} (${user.email}) se déclare délégué(e) ${title} de ${group?.promotion} ${group?.label}, élu(e) le ${electedOn}.${note ? `\nPrécision : ${note}` : ''}\nLes élèves du groupe donnent leur avis dans Vencat. À confirmer ou refuser dans l’administration (/admin › Modération).` }).catch(() => undefined);
  res.status(201).json({ ok: true });
}));
/** A student of the group says whether the declaration is right: yes, don't know, no. */
router.post('/travaux/delegates/:id/answer', route(async (req, res) => {
  const { user } = await requireContributor(req);
  const delegation = await db().get<Delegation>('delegations', String(req.params.id));
  if (!delegation || delegation.status !== 'requested') throw new HttpError(404, 'Cette déclaration a déjà été traitée.');
  if (user.groupId !== delegation.groupId) throw new HttpError(403, 'Seuls les élèves du groupe peuvent donner leur avis.');
  if (delegation.userId === user.id) throw new HttpError(400, 'Tu ne peux pas répondre à ta propre déclaration.');
  const value = req.body?.value;
  if (value !== 'yes' && value !== 'unknown' && value !== 'no') throw new HttpError(400, 'Réponse invalide.');
  delegation.answers = { ...(delegation.answers ?? {}), [user.id]: value };
  await db().put('delegations', delegation.id, delegation);
  res.json({ ok: true, answers: answerCounts(delegation) });
}));
router.delete('/travaux/delegates/mine', route(async (req, res) => {
  const { user } = await requireUser(req);
  for (const item of (await db().list<Delegation>('delegations')).filter(entry => entry.userId === user.id && (entry.status === 'requested' || entry.status === 'active'))) { item.status = 'ended'; item.decidedAt = now(); await db().put('delegations', item.id, item); }
  res.json({ ok: true });
}));
