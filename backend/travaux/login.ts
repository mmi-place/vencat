import express, { type Request, type Response } from 'express';
import { persistentStore } from './store.js';
import { settings as globalSettings, DEFAULT_MESSAGE } from './settings.js';
import { sendMail, loginMail, mailConfigured } from './mail.js';
import { notifyAdmins } from './notify.js';
import {
  HttpError, id, now, authenticate, requireUser, createSession, clearSessionCookie, overLimit, addressKey, newLogin, loginExpired, LOGIN_TTL_MS, samePoll,
  newSecrets, checkCode, checkMagic, userForEmail, allowedEmail, groupExists, meOf, REUSE_MAX, MAX_ATTEMPTS, type User, type Session,
  type Login,
} from './auth.js';
import { cleanText, semesterOf } from '../../shared/travaux.js';
import { type NameRequest, db, route, origin, eraseAccount } from './common.js';

// Configuration and sign-in
const router = express.Router();
export const loginRouter = router;

router.get('/travaux/config', route(async (_req, res) => { const global = await globalSettings(); res.json({ planningOnly: global.planningOnly, message: global.planningOnly ? global.message || DEFAULT_MESSAGE : '', mail: mailConfigured() || process.env.NODE_ENV !== 'production', persistent: persistentStore(), contact: process.env.CONTACT_EMAIL || '', teacherAccounts: process.env.TEACHER_ACCOUNTS === 'true' }); }));

router.get('/auth/me', route(async (req, res) => {
  const { user } = await authenticate(req);
  res.json({ me: user ? await meOf(user) : null });
}));

async function mailLogin(req: Request, login: Login) {
  if (!login.email) throw new HttpError(400, 'Adresse manquante.');
  if (login.mails >= 3 || await overLimit('mail:' + login.email, 5, 3600) || await overLimit('mail-ip:' + addressKey(req), 20, 3600)) throw new HttpError(429, 'Trop de mails envoyés. Réessaie dans un moment.');
  const { code, magic } = newSecrets(login);
  login.mails++; login.attempts = 0;
  // The mail promises 10 minutes from its own sending (a resend extends the request).
  if (!login.firstUsedAt) login.expiresAt = new Date(Date.now() + LOGIN_TTL_MS).toISOString();
  await db().put('logins', login.id, login);
  const link = `${origin(req)}/?lien=${login.id}&t=${magic}`;
  const mail = loginMail(login.email, code, link, login.device);
  try { await sendMail(mail); }
  catch (error) { console.error('[mail]', error instanceof Error ? error.message : error); throw new HttpError(502, 'Le mail n’a pas pu être envoyé. Réessaie dans quelques minutes.'); }
  const logOnly = !!process.env.MAIL_LOG_ONLY && new RegExp(process.env.MAIL_LOG_ONLY, 'i').test(login.email);
  return process.env.NODE_ENV !== 'production' && (!mailConfigured() || process.env.NODE_TEST_CONTEXT || logOnly) ? code : undefined;
}

/** Sign-in requests (they hold an address) are deleted once expired: on about one start out of ten, at most 100 of them. */
async function purgeLogins() {
  if (Math.random() > 0.1) return;
  try {
    const old = (await db().list<Login>('logins')).filter(item => Date.parse(item.expiresAt) + 3600_000 < Date.now()).slice(0, 100);
    for (const item of old) await db().delete('logins', item.id);
  } catch { /* the next start tries again */ }
}
router.post('/auth/start', route(async (req, res) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  if (!allowedEmail(email)) throw new HttpError(400, 'Utilise ton adresse étudiante, qui se termine par .uvsq.fr (par exemple prenom.nom@ens.uvsq.fr).');
  if (await overLimit('start-ip:' + addressKey(req), 30, 600)) throw new HttpError(429, 'Trop de demandes. Réessaie dans quelques minutes.');
  const { login, poll } = newLogin(req, email);
  await db().put('logins', login.id, login);
  await purgeLogins();
  // The mail (code + link) goes out at once.
  const devCode = await mailLogin(req, login);
  res.json({ requestId: login.id, poll, mailSent: true, devCode, expiresAt: login.expiresAt });
}));

router.post('/auth/qr', route(async (req, res) => {
  if (await overLimit('qr-ip:' + addressKey(req), 30, 600)) throw new HttpError(429, 'Trop de demandes. Réessaie dans quelques minutes.');
  const { login, poll } = newLogin(req);
  await db().put('logins', login.id, login);
  res.json({ requestId: login.id, poll, url: `${origin(req)}/?qr=${login.id}`, expiresAt: login.expiresAt });
}));

async function ownedLogin(req: Request) {
  const login = await db().get<Login>('logins', String(req.body?.requestId ?? ''));
  if (!login || !samePoll(login, req.body?.poll)) throw new HttpError(404, 'Demande introuvable. Recommence.');
  if (loginExpired(login)) throw new HttpError(410, 'Demande expirée. Recommence.');
  return login;
}
router.post('/auth/send-mail', route(async (req, res) => {
  const login = await ownedLogin(req);
  const devCode = await mailLogin(req, login);
  res.json({ mailSent: true, devCode, expiresAt: login.expiresAt });
}));

async function finish(req: Request, res: Response, user: User, login: Login) {
  // A request already used with its code stays reusable for a few minutes; otherwise it is consumed.
  if (!login.firstUsedAt) await db().delete('logins', login.id);
  await createSession(req, res, user);
  return { me: await meOf(user) };
}
router.post('/auth/verify', route(async (req, res) => {
  const login = await ownedLogin(req);
  if (await overLimit('verify-ip:' + addressKey(req), 60, 600)) throw new HttpError(429, 'Trop d’essais. Réessaie dans quelques minutes.');
  if (login.attempts >= MAX_ATTEMPTS) throw new HttpError(429, 'Trop d’essais. Demande un nouveau code.');
  if (!checkCode(login, req.body?.code)) {
    // Counted atomically as well: parallel guesses cannot all read « 0 attempts ».
    if (await overLimit('verify-fail:' + login.id, MAX_ATTEMPTS, 3600)) { login.attempts = MAX_ATTEMPTS; await db().put('logins', login.id, login); throw new HttpError(429, 'Trop d’essais. Demande un nouveau code.'); }
    login.attempts++; await db().put('logins', login.id, login);
    throw new HttpError(400, login.attempts >= MAX_ATTEMPTS ? 'Trop d’essais. Demande un nouveau code.' : `Code incorrect. ${MAX_ATTEMPTS - login.attempts} essai(s) restant(s).`);
  }
  res.json(await useCode(req, res, login));
}));
/** Sign-in with the mail code or link: the request is kept, reusable for a few minutes (REUSE_MAX times). */
async function useCode(req: Request, res: Response, login: Login) {
  const user = await userForEmail(login.email!);
  login.firstUsedAt ??= now(); login.uses = (login.uses ?? 0) + 1; login.attempts = 0;
  if (login.uses >= REUSE_MAX) await db().delete('logins', login.id); else await db().put('logins', login.id, login);
  await createSession(req, res, user);
  return { me: await meOf(user) };
}
router.post('/auth/poll', route(async (req, res) => {
  const login = await ownedLogin(req);
  if (login.status === 'denied') { await db().delete('logins', login.id); return res.json({ status: 'denied' }); }
  if (login.status !== 'approved' || !login.approvedUserId) return res.json({ status: 'waiting' });
  const user = await db().get<User>('users', login.approvedUserId);
  if (!user || user.deletedAt) throw new HttpError(404, 'Compte introuvable.');
  res.json({ status: 'approved', ...await finish(req, res, user, login) });
}));
// The mail link opens the app, which asks to confirm: a link scanner that only fetches it signs nobody in.
// It signs in the device that opens it, and never approves the request of another device.
router.get('/auth/magic', route(async (req, res) => {
  res.redirect(302, `/?lien=${encodeURIComponent(String(req.query.r ?? ''))}&t=${encodeURIComponent(String(req.query.t ?? ''))}`);
}));
router.post('/auth/magic', route(async (req, res) => {
  if (await overLimit('magic-ip:' + addressKey(req), 30, 600)) throw new HttpError(429, 'Trop de demandes. Réessaie dans quelques minutes.');
  const login = await db().get<Login>('logins', String(req.body?.r ?? ''));
  if (!login || loginExpired(login) || !login.email || !checkMagic(login, req.body?.t)) throw new HttpError(410, 'Ce lien a expiré ou a déjà servi. Demande un nouveau code.');
  res.json(await useCode(req, res, login));
}));
router.get('/auth/qr-info', route(async (req, res) => {
  await requireUser(req);
  const login = await db().get<Login>('logins', String(req.query.r ?? ''));
  if (!login || loginExpired(login) || login.status !== 'waiting' || !login.qr) throw new HttpError(404, 'Ce QR code a expiré. Affiche-en un nouveau.');
  res.json({ id: login.id, device: login.device, createdAt: login.createdAt });
}));
router.post('/auth/approve', route(async (req, res) => {
  const { user } = await requireUser(req);
  const login = await db().get<Login>('logins', String(req.body?.requestId ?? ''));
  // Only a QR code request can be approved from a connected device (mail requests sign in with their code or link).
  if (!login || loginExpired(login) || login.status !== 'waiting' || !login.qr) throw new HttpError(404, 'Demande introuvable ou expirée.');
  login.status = 'approved'; login.approvedUserId = user.id;
  await db().put('logins', login.id, login);
  res.json({ ok: true });
}));
router.post('/auth/deny', route(async (req, res) => {
  const { user } = await requireUser(req);
  const login = await db().get<Login>('logins', String(req.body?.requestId ?? ''));
  if (login && (!login.email || login.email === user.email)) { login.status = 'denied'; await db().put('logins', login.id, login); }
  res.json({ ok: true });
}));
router.post('/auth/logout', route(async (req, res) => {
  const { session } = await authenticate(req);
  if (session) await db().delete('sessions', session.id);
  clearSessionCookie(req, res);
  res.json({ ok: true });
}));

// ---------------------------------------------------------------------------
// Account
// ---------------------------------------------------------------------------
router.post('/account/onboard', route(async (req, res) => {
  const { user } = await requireUser(req);
  if (req.body?.cgu !== true) throw new HttpError(400, 'Accepte les conditions d’utilisation pour continuer.');
  if (!user.staff) {
    if (!groupExists(req.body?.groupId)) throw new HttpError(400, 'Choisis ton groupe.');
    if (!user.groupId) { user.groupId = req.body.groupId; user.groupSemester = semesterOf(now()); }
  }
  user.cguAcceptedAt ??= now();
  await db().put('users', user.id, user);
  res.json({ me: await meOf(user) });
}));
router.get('/account/devices', route(async (req, res) => {
  const { user, session } = await requireUser(req);
  const sessions = (await db().find<Session>('sessions', 'userId', user.id)).sort((a, b) => b.lastSeen.localeCompare(a.lastSeen));
  res.json(sessions.map(item => ({ id: item.id, device: item.device, createdAt: item.createdAt, lastSeen: item.lastSeen, current: item.id === session.id })));
}));
router.delete('/account/devices/:id', route(async (req, res) => {
  const { user } = await requireUser(req);
  const session = await db().get<Session>('sessions', String(req.params.id));
  if (session?.userId === user.id) await db().delete('sessions', session.id);
  res.json({ ok: true });
}));
router.post('/account/group', route(async (req, res) => {
  const { user } = await requireUser(req);
  if (!groupExists(req.body?.groupId)) throw new HttpError(400, 'Groupe inconnu.');
  const semester = semesterOf(now());
  if (user.groupId && user.groupSemester === semester && user.groupId !== req.body.groupId) throw new HttpError(403, 'Tu as déjà changé de groupe ce semestre. Demande à un(e) délégué(e) du groupe.');
  if (user.groupId !== req.body.groupId) { user.groupId = req.body.groupId; user.groupSemester = semester; await db().put('users', user.id, user); }
  res.json({ me: await meOf(user) });
}));
router.post('/account/name', route(async (req, res) => {
  const { user } = await requireUser(req);
  const firstName = cleanText(req.body?.firstName, 60), lastName = cleanText(req.body?.lastName, 60);
  if (!firstName) throw new HttpError(400, 'Prénom manquant.');
  const open = (await db().find<NameRequest>('names', 'userId', user.id)).find(item => item.status === 'open');
  const request: NameRequest = { id: open?.id ?? id(), userId: user.id, firstName, lastName, at: now(), status: 'open' };
  await db().put('names', request.id, request);
  await notifyAdmins('important', 'Vencat : demande de changement de nom', `${user.email} demande à s’appeler « ${firstName} ${lastName} ».\nÀ valider dans l’administration (/admin › Modération).`);
  res.json({ ok: true, message: 'Demande envoyée : l’admin la validera.' });
}));
router.delete('/account', route(async (req, res) => {
  const { user } = await requireUser(req);
  await eraseAccount(user);
  clearSessionCookie(req, res);
  res.json({ ok: true });
}));
