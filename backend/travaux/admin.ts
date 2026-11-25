import express, { type Request, type Response, type NextFunction } from 'express';
import { randomBytes, randomInt } from 'node:crypto';
import { settings as globalSettings, freshSettings, saveSettings } from './settings.js';
import { sendMail, layout } from './mail.js';
import { notifyAdmins, defaultRecipients, TOPICS, isTopic, type Topic } from './notify.js';
import type { Feedback } from './feedback.js';
import { HttpError, hash, id, now, sameOrigin, overLimit, addressKey, deviceLabel, adminEmails, activeDelegations, displayName, type User, type Session, type Delegation } from './auth.js';
import { db, settle, workView, users, history, audit, schoolYearEnd, eraseAccount, votesOf, type Work } from './common.js';
import { moderationData, moderationAction } from './moderation.js';
import { normalizeEmail, cleanText, LIMITS, scopeLabel, type WorkState } from '../../shared/travaux.js';
import { groupById } from '../../shared/selection.js';

// Administration on /admin: separate from student accounts, signed in by a mail code only,
// for the addresses of ADMIN_EMAILS. The session survives leaving the app or closing the browser (persistent cookie), for 3 days at most.
const ADMIN_SESSION_MS = 3 * 24 * 3600_000;
interface AdminLogin { id: string; email: string; codeHash: string; expiresAt: string; attempts: number }
interface AdminSession { email: string; createdAt: string; expiresAt: string; device: string }
const COOKIE = 'vencat_admin';
const router = express.Router();
router.use('/admin', sameOrigin, (_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
const route = (handler: (req: Request, res: Response) => Promise<unknown>) => (req: Request, res: Response, next: NextFunction) => { handler(req, res).catch(next); };
const secure = (req: Request) => req.protocol === 'https' || String(req.headers['x-forwarded-proto'] ?? '').split(',')[0]?.trim() === 'https' || process.env.NODE_ENV === 'production';
const cookie = (req: Request) => (req.headers.cookie ?? '').split(';').map(part => part.trim()).find(part => part.startsWith(COOKIE + '='))?.slice(COOKIE.length + 1);

async function requireAdmin(req: Request) {
  const token = cookie(req);
  const session = token ? await db().get<AdminSession>('adminSessions', hash(token)) : undefined;
  if (!session || session.expiresAt < now() || !adminEmails().includes(session.email)) throw new HttpError(401, 'Session d’administration expirée. Reconnecte-toi.');
  return session;
}
const adminMail = (to: string, code: string, device: string) => ({
  to, subject: `${code} · accès administration Vencat`,
  text: `Code d’accès à l’administration de Vencat : ${code}\nValable 10 minutes. Demande faite depuis : ${device}.\nSi tu n’es pas à l’origine de cette demande, ignore ce mail.`,
  html: layout(`Code d’administration : ${code}`, `<h1 style="margin:0 0 8px;font-size:22px;color:#17152a">Accès administration</h1><p style="margin:0 0 20px;font-size:15px;line-height:22px;color:#5d5a75">Saisis ce code sur la page d’administration. Il est valable 10 minutes.</p><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="background:#fff4e5;border-radius:14px;padding:20px 10px;font-family:'SF Mono',Menlo,Consolas,monospace;font-size:38px;font-weight:800;letter-spacing:8px;color:#8a4b00">${code.slice(0, 3)}&nbsp;${code.slice(3)}</td></tr></table><p style="margin:22px 0 0;font-size:13px;line-height:20px;color:#6b6885"><strong style="color:#2b2840">Demande faite depuis :</strong> ${device.replace(/[<>&]/g, '')}<br>Ce n’est pas toi ? Ignore ce mail.</p>`),
});

router.post('/admin/start', route(async (req, res) => {
  const email = normalizeEmail(String(req.body?.email ?? ''));
  if (await overLimit('admin-start:' + addressKey(req), 10, 900)) throw new HttpError(429, 'Trop de demandes. Réessaie plus tard.');
  // The answer is the same whether the address is allowed or not.
  const login: AdminLogin = { id: id(), email, codeHash: '', expiresAt: new Date(Date.now() + 10 * 60000).toISOString(), attempts: 0 };
  let devCode: string | undefined;
  if (adminEmails().includes(email) && !(await overLimit('admin-mail:' + email, 5, 3600))) {
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    login.codeHash = hash(login.id + ':' + code);
    await sendMail(adminMail(email, code, deviceLabel(req)));
    const logOnly = !!process.env.MAIL_LOG_ONLY && new RegExp(process.env.MAIL_LOG_ONLY, 'i').test(email);
    if (process.env.NODE_ENV !== 'production' && (process.env.NODE_TEST_CONTEXT || logOnly)) devCode = code;
  }
  await db().put('adminLogins', login.id, login);
  res.json({ requestId: login.id, devCode });
}));
router.post('/admin/verify', route(async (req, res) => {
  const login = await db().get<AdminLogin>('adminLogins', String(req.body?.requestId ?? ''));
  if (!login || login.expiresAt < now()) throw new HttpError(410, 'Code expiré. Recommence.');
  if (await overLimit('admin-verify-ip:' + addressKey(req), 30, 600)) throw new HttpError(429, 'Trop d’essais. Réessaie dans quelques minutes.');
  if (login.attempts >= 5) throw new HttpError(429, 'Trop d’essais. Demande un nouveau code.');
  const code = String(req.body?.code ?? '').replace(/\D/g, '');
  if (!login.codeHash || hash(login.id + ':' + code) !== login.codeHash) {
    // Counted atomically too: parallel guesses cannot all read « 0 attempts ».
    if (await overLimit('admin-verify-fail:' + login.id, 5, 3600)) { login.attempts = 5; await db().put('adminLogins', login.id, login); throw new HttpError(429, 'Trop d’essais. Demande un nouveau code.'); }
    login.attempts++; await db().put('adminLogins', login.id, login); throw new HttpError(400, 'Code incorrect.'); }
  await db().delete('adminLogins', login.id);
  const token = randomBytes(32).toString('base64url');
  const session: AdminSession = { email: login.email, createdAt: now(), expiresAt: new Date(Date.now() + ADMIN_SESSION_MS).toISOString(), device: deviceLabel(req) };
  await db().put('adminSessions', hash(token), session);
  // Persistent cookie: a browser (iOS above all) forgets a session cookie as soon as the app is left.
  res.append('Set-Cookie', `${COOKIE}=${token}; Path=/api/admin; HttpOnly; SameSite=Strict; Max-Age=${ADMIN_SESSION_MS / 1000}${secure(req) ? '; Secure' : ''}`);
  await audit('admin:' + login.email, 'connexion administration', login.email);
  res.json({ email: login.email });
}));
router.post('/admin/logout', route(async (req, res) => {
  const token = cookie(req);
  if (token) await db().delete('adminSessions', hash(token));
  res.append('Set-Cookie', `${COOKIE}=; Path=/api/admin; HttpOnly; SameSite=Strict; Max-Age=0${secure(req) ? '; Secure' : ''}`);
  res.json({ ok: true });
}));
router.get('/admin/me', route(async (req, res) => { const session = await requireAdmin(req); res.json({ email: session.email, expiresAt: session.expiresAt }); }));

router.get('/admin/overview', route(async (req, res) => {
  await requireAdmin(req);
  const people = [...(await users()).values()].filter(user => !user.deletedAt);
  const works = (await db().list<Work>('works')).filter(work => !work.personal);
  const sessions = await db().list<Session>('sessions');
  const states = works.reduce<Record<string, number>>((count, work) => { count[work.state] = (count[work.state] ?? 0) + 1; return count; }, {});
  const week = Date.now() - 7 * 86400000;
  res.json({
    stats: { accounts: people.length, active: new Set(sessions.filter(item => Date.parse(item.lastSeen) > week).map(item => item.userId)).size, works: works.length, states, newWorks: works.filter(work => Date.parse(work.createdAt) > week).length, groups: new Set(people.map(person => person.groupId).filter(Boolean)).size },
    ...await moderationData(true, []),
  });
}));
router.get('/admin/settings', route(async (req, res) => { await requireAdmin(req); res.json(await globalSettings()); }));
router.post('/admin/settings', route(async (req, res) => {
  const session = await requireAdmin(req);
  const planningOnly = req.body?.planningOnly === true;
  const message = cleanText(req.body?.message, 300);
  await saveSettings({ ...await freshSettings(), planningOnly, message: message || undefined, since: new Date().toISOString(), by: session.email });
  await audit('admin:' + session.email, planningOnly ? 'mode planning seul : activé' : 'mode planning seul : désactivé', 'global', message);
  await notifyAdmins('important', `Vencat : mode planning seul ${planningOnly ? 'activé' : 'désactivé'}`, `${session.email} a ${planningOnly ? 'activé' : 'désactivé'} le mode planning seul.${message ? `\nMessage affiché : ${message}` : ''}`);
  res.json(await globalSettings());
}));
const notificationsView = async () => ({ topics: await Promise.all((Object.keys(TOPICS) as Topic[]).map(async id => ({ id, ...TOPICS[id], emails: (await freshSettings()).notifyEmails?.[id] ?? defaultRecipients() }))) });
router.get('/admin/notifications', route(async (req, res) => { await requireAdmin(req); res.json(await notificationsView()); }));
router.post('/admin/notifications', route(async (req, res) => {
  const session = await requireAdmin(req);
  if (!isTopic(req.body?.topic)) throw new HttpError(400, 'Catégorie inconnue.');
  const topic: Topic = req.body.topic;
  const list = (Array.isArray(req.body?.emails) ? req.body.emails : []).map((value: unknown) => normalizeEmail(String(value))).filter(Boolean);
  if (list.length > 10 || list.some((value: string) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))) throw new HttpError(400, 'Adresses invalides (10 au maximum).');
  const emails = [...new Set<string>(list)];
  const current = await freshSettings();
  await saveSettings({ ...current, notifyEmails: { ...current.notifyEmails, [topic]: emails } });
  await audit('admin:' + session.email, `notifications « ${TOPICS[topic].label} »`, 'global', emails.join(', ') || 'par défaut (administrateurs)');
  res.json(await notificationsView());
}));
router.get('/admin/feedback', route(async (req, res) => {
  await requireAdmin(req);
  res.json((await db().list<Feedback>('feedback')).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 50));
}));
router.post('/admin/notifications/test', route(async (req, res) => {
  const session = await requireAdmin(req);
  if (!isTopic(req.body?.topic)) throw new HttpError(400, 'Catégorie inconnue.');
  if (await overLimit('notify-test:' + session.email, 10, 3600)) throw new HttpError(429, 'Trop de tests. Réessaie plus tard.');
  const result = await notifyAdmins(req.body.topic, `[Test] Vencat : ${TOPICS[req.body.topic as Topic].label}`, `Ceci est un mail de test de la catégorie « ${TOPICS[req.body.topic as Topic].label} », envoyé par ${session.email}.\nSi tu le reçois, tu seras prévenu(e) pour ce type d’événement.`);
  res.json(result);
}));
router.get('/admin/works', route(async (req, res) => {
  await requireAdmin(req);
  const q = String(req.query.q ?? '').toLowerCase(), state = String(req.query.state ?? '');
  const people = await users();
  const list = (await db().list<Work>('works')).filter(work => !work.personal && (!state || work.state === state) && (!q || `${work.title} ${work.details.where} ${scopeLabel(work.scope)} ${displayName(people.get(work.authorId))}`.toLowerCase().includes(q)))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 200);
  res.json(await Promise.all(list.map(async work => ({ ...(await workView(work, undefined, people)), group: scopeLabel(work.scope), promotion: work.scope.kind === 'group' ? groupById(work.scope.key)?.promotion : work.scope.key.split('|')[0] }))));
}));
// Full sheet of a work for the administration: the work as students see it, the votes with names, the proposal and the history.
router.get('/admin/work/:id', route(async (req, res) => {
  await requireAdmin(req);
  const work = await db().get<Work>('works', String(req.params.id));
  if (!work || work.personal) throw new HttpError(404, 'Travail introuvable.');
  const people = await users();
  const entries = (await db().list<{ at: string; by: string; action: string; detail?: string }>('history', work.id + ':')).sort((a, b) => a.at.localeCompare(b.at));
  const votes = Object.values(await votesOf(work.id));
  res.json({
    work: await workView(await settle(work), undefined, people),
    voters: votes.map(vote => ({ name: displayName(people.get(vote.userId)), value: vote.value, weight: vote.weight, reason: vote.reason })),
    history: entries.map(entry => ({ at: entry.at, by: entry.by === 'system' ? 'Vencat' : entry.by.startsWith('admin:') ? 'Administration' : displayName(people.get(entry.by)), action: entry.action, detail: entry.detail })),
  });
}));
router.post('/admin/work/:id', route(async (req, res) => {
  const session = await requireAdmin(req);
  const work = await db().get<Work>('works', String(req.params.id));
  if (!work || work.personal) throw new HttpError(404, 'Travail introuvable.');
  const action = String(req.body?.action ?? ''), reason = cleanText(req.body?.reason, LIMITS.reason), actor = 'admin:' + session.email;
  const states: Record<string, WorkState | undefined> = { validate: 'validated', remove: 'removed', restore: undefined };
  if (!Object.prototype.hasOwnProperty.call(states, action)) throw new HttpError(400, 'Action inconnue.');
  work.forced = states[action] as Work['forced']; work.updatedAt = now();
  // The state follows from settle() (validate) or is set here (remove, restore), so reliability is handled once, in one place.
  if (action !== 'validate') work.state = states[action] ?? 'pending';
  if (action === 'remove') work.removedReason = reason || 'Retiré par l’administration';
  await db().put('works', work.id, work);
  await history(work.id, actor, { validate: 'validé par l’administration', remove: 'retiré par l’administration', restore: 'rétabli par l’administration' }[action]!, reason);
  await audit(actor, 'travail:' + action, work.id, reason);
  await settle(work, actor);
  res.json({ ok: true });
}));
router.post('/admin/action', route(async (req, res) => {
  const session = await requireAdmin(req);
  const actor = 'admin:' + session.email, body = req.body ?? {};
  const reason = cleanText(body.reason, LIMITS.reason);
  if (body.kind === 'delegate-end') {
    const delegation = await db().get<Delegation>('delegations', String(body.id));
    if (!delegation) throw new HttpError(404, 'Mandat introuvable.');
    delegation.status = 'ended'; delegation.decidedAt = now();
    await db().put('delegations', delegation.id, delegation);
    await audit(actor, 'délégué(e) : fin de mandat', delegation.id, reason);
  } else if (body.kind === 'delegate-appoint') {
    const user = await db().get<User>('users', String(body.id));
    if (!user?.groupId) throw new HttpError(404, 'Compte introuvable ou sans groupe.');
    if ((await activeDelegations(user.id)).length) throw new HttpError(409, 'Déjà délégué(e).');
    const delegation: Delegation = { id: id(), userId: user.id, groupId: user.groupId, status: 'active', title: body.title === 'suppléant' ? 'suppléant' : 'titulaire', createdAt: now(), decidedAt: now(), until: schoolYearEnd() };
    await db().put('delegations', delegation.id, delegation);
    await audit(actor, 'délégué(e) : nomination', user.id, reason);
  } else if (body.kind === 'user-delete') {
    const user = await db().get<User>('users', String(body.id));
    if (!user) throw new HttpError(404, 'Compte introuvable.');
    await eraseAccount(user);
    await audit(actor, 'compte:suppression', user.id, reason);
  } else await moderationAction(actor, true, [], body);
  res.json({ ok: true });
}));
router.get('/admin/corrections', route(async (req, res) => {
  await requireAdmin(req);
  const people = await users();
  const list = (await db().list<{ id: string; groupId: string; course: { summary: string; start: string; location?: string }; field: string; value: string; authorId: string; createdAt: string; status: string }>('corrections')).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 200);
  res.json(list.map(item => ({ ...item, author: displayName(people.get(item.authorId)), group: `${groupById(item.groupId)?.promotion} ${groupById(item.groupId)?.label}` })));
}));
router.post('/admin/correction/:id', route(async (req, res) => {
  const session = await requireAdmin(req);
  const item = await db().get<{ id: string; status: string }>('corrections', String(req.params.id));
  if (!item) throw new HttpError(404, 'Correction introuvable.');
  const status = ({ accept: 'accepted', reject: 'rejected', close: 'closed' } as Record<string, string>)[String(req.body?.action)];
  if (!status) throw new HttpError(400, 'Action inconnue.');
  item.status = status; await db().put('corrections', item.id, item);
  await audit('admin:' + session.email, 'correction:' + req.body.action, item.id, cleanText(req.body?.reason, LIMITS.reason));
  res.json({ ok: true });
}));
router.use('/admin', (error: unknown, _req: Request, res: Response, next: NextFunction) => {
  if (error instanceof HttpError) return res.status(error.status).json({ error: error.message });
  next(error);
});
export const adminRouter = router;
