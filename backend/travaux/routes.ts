import express, { type Request, type Response, type NextFunction } from 'express';
import { store, persistentStore } from './store.js';
import { sendMail, loginMail, mailConfigured } from './mail.js';
import {
  HttpError, id, now, authenticate, requireUser, requireContributor, createSession, clearSessionCookie, sameOrigin, overLimit, addressKey,
  newLogin, loginExpired, samePoll, newSecrets, checkCode, checkMagic, userForEmail, allowedEmail, groupExists, meOf, roleOf, isAdmin, isNewAccount,
  displayName, shortDisplayName, activeDelegations, LOGIN_TTL_MS, MAX_ATTEMPTS, type User, type Session, type Login, type Delegation,
} from './auth.js';
import {
  parseWorkInput, voteState, tally, requiredUpvotes, scopeIncludes, scopeLabel, scopeMembers, parisInstant, DEFAULT_DUE_TIME, linkDomain, cleanText, LIMITS,
  WORK_TYPE_LABELS, WORK_STATE_LABELS, worksToIcs, semesterOf, nameFromEmail, voteWeight, checkLink, isWorkType, validTime, validScope,
  type WorkInput, type WorkView, type WorkState, type Vote, type WorkProposalView, type HistoryEntry, type CourseLink, type WorkScope,
} from '../../shared/travaux.js';
import { groupById } from '../../shared/selection.js';

// ---------------------------------------------------------------------------
// Stored documents
// ---------------------------------------------------------------------------
export interface Work extends Omit<WorkInput, 'time'> {
  id: string; time?: string; authorId: string; authorNew: boolean; createdAt: string; updatedAt: string; state: WorkState;
  forced?: 'validated' | 'removed'; removedReason?: string; teacherConfirmed?: string; proposalId?: string;
}
interface VoteDoc extends Vote { targetId: string; userId: string }
interface Proposal { id: string; workId: string; kind: 'edit' | 'delete'; changes: Partial<WorkInput>; reason?: string; authorId: string; createdAt: string; status: 'open' | 'accepted' | 'rejected'; closedAt?: string }
interface Marks { done: Record<string, string>; notes: Record<string, string> }
interface Report { id: string; target: { kind: 'work' | 'delegate' | 'correction' | 'user'; id: string }; reason: string; by: string; at: string; status: 'open' | 'done'; resolution?: string }
interface NameRequest { id: string; userId: string; firstName: string; lastName: string; at: string; status: 'open' | 'accepted' | 'refused' }
interface Problem { id: string; userId: string; at: string; kind: string; detail: string }
interface Audit { id: string; at: string; by: string; action: string; target: string; reason: string }
interface Alert { id: string; userId: string; at: string; status: 'open' | 'done' }
export interface Correction { id: string; groupId: string; course: CourseLink & { end: string }; field: 'room' | 'time' | 'cancelled'; value: string; start?: string; end?: string; authorId: string; createdAt: string; status: 'open' | 'accepted' | 'rejected' | 'closed' }

const db = () => store();
const router = express.Router();
router.use(['/auth', '/account', '/travaux'], sameOrigin);
router.use(['/auth', '/account', '/travaux'], (_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
const route = (handler: (req: Request, res: Response) => Promise<unknown>) => (req: Request, res: Response, next: NextFunction) => { handler(req, res).catch(next); };
const origin = (req: Request) => process.env.PUBLIC_URL || `${req.headers['x-forwarded-proto'] ?? req.protocol}://${req.headers['x-forwarded-host'] ?? req.headers.host}`;
const users = async () => new Map((await db().list<User>('users')).map(user => [user.id, user]));

async function history(workId: string, by: string, action: string, detail?: string) {
  const at = now();
  await db().put('history', `${workId}:${at}:${id().slice(0, 6)}`, { workId, at, by, action, detail });
}
async function audit(by: string, action: string, target: string, reason = '') {
  const entry: Audit = { id: id(), at: now(), by, action, target, reason };
  await db().put('audit', entry.id, entry);
}
async function problem(userId: string, kind: string, detail: string) {
  const entry: Problem = { id: id(), userId, at: now(), kind, detail };
  await db().put('problems', entry.id, entry);
  // 3 problems over 7 days: an alert reaches the moderation queue (the admin decides on the explanatory mail).
  const recent = (await db().list<Problem>('problems')).filter(item => item.userId === userId && Date.parse(item.at) > Date.now() - 7 * 86400000);
  if (recent.length >= 3 && !(await db().list<Alert>('alerts')).some(alert => alert.userId === userId && alert.status === 'open')) {
    const alert: Alert = { id: id(), userId, at: now(), status: 'open' };
    await db().put('alerts', alert.id, alert);
  }
}
async function adjustReliability(userId: string, delta: number) {
  const user = await db().get<User>('users', userId);
  if (!user) return;
  user.reliability = Math.round((user.reliability + delta) * 10) / 10;
  await db().put('users', user.id, user);
}
const votesOf = async (targetId: string) => Object.fromEntries((await db().list<VoteDoc>('votes', targetId + ':')).map(vote => [vote.userId, vote])) as Record<string, VoteDoc>;

/** Rights of a person on a scope: delegates of a group in the scope and admins act directly. */
async function powers(user: User | undefined, scope: WorkScope) {
  if (!user) return { member: false, moderator: false };
  const { role, delegateGroups } = await roleOf(user);
  const members = scopeMembers(scope).map(group => group.id);
  return { member: !!user.groupId && members.includes(user.groupId), moderator: role === 'admin' || delegateGroups.some(group => members.includes(group)), admin: role === 'admin', teacher: role === 'teacher' };
}

// ---------------------------------------------------------------------------
// Work state: forced by a moderator, or computed from the votes. Reliability moves when it settles.
// ---------------------------------------------------------------------------
async function settle(work: Work, by = 'system') {
  const author = await db().get<User>('users', work.authorId);
  const votes = await votesOf(work.id);
  const previous = work.state;
  const next: WorkState = work.forced ?? (work.teacherConfirmed ? 'validated' : voteState(votes, work.authorId, work.createdAt, author?.reliability ?? 0));
  if (next === previous) return work;
  work.state = next;
  await db().put('works', work.id, work);
  if (next === 'validated' && previous !== 'validated') {
    await adjustReliability(work.authorId, 1);
    for (const vote of Object.values(votes)) {
      if (vote.userId === work.authorId) continue;
      if (vote.value > 0) await adjustReliability(vote.userId, 0.2);
      else { await adjustReliability(vote.userId, -1); await problem(vote.userId, 'refus contredit', work.title); }
    }
    await history(work.id, by, 'validé');
  } else if (next === 'contested') await history(work.id, by, 'contesté');
  return work;
}

async function workView(work: Work, viewer: User | undefined, people: Map<string, User>, extra?: { votes?: Record<string, VoteDoc> }): Promise<WorkView> {
  const votes = extra?.votes ?? await votesOf(work.id);
  const author = people.get(work.authorId);
  const { up, down } = tally(votes, work.authorId);
  const state: WorkState = work.forced ?? (work.teacherConfirmed ? 'validated' : voteState(votes, work.authorId, work.createdAt, author?.reliability ?? 0));
  const time = work.time ?? DEFAULT_DUE_TIME;
  const linksActive = !work.authorNew || state === 'validated' || state === 'probable';
  const { moderator } = await powers(viewer, work.scope);
  let proposal: WorkProposalView | undefined;
  if (work.proposalId) {
    const item = await db().get<Proposal>('proposals', work.proposalId);
    if (item && item.status === 'open') {
      const pv = await votesOf(item.id); const t = tally(pv, item.authorId);
      proposal = { id: item.id, kind: item.kind, author: shortDisplayName(people.get(item.authorId)), reason: item.reason, changes: describeChanges(work, item.changes), up: t.up, down: t.down, myVote: viewer ? pv[viewer.id]?.value : undefined, mine: item.authorId === viewer?.id, createdAt: item.createdAt };
    }
  }
  return {
    id: work.id, type: work.type, title: work.title, due: parisInstant(work.day, time), day: work.day, time, hasTime: !!work.time, scope: work.scope, scopeLabel: scopeLabel(work.scope),
    course: work.course, details: work.details, ds: work.ds, links: work.links.map(url => ({ url, domain: linkDomain(url), active: linksActive })),
    author: displayName(author), authorId: work.authorId, createdAt: work.createdAt, updatedAt: work.updatedAt, state, up, down, required: requiredUpvotes(author?.reliability ?? 0),
    myVote: viewer ? votes[viewer.id]?.value : undefined, mine: work.authorId === viewer?.id,
    reasons: Object.values(votes).filter(vote => vote.value < 0 && vote.reason).map(vote => vote.reason!),
    proposal, teacherConfirmed: work.teacherConfirmed,
    // Votes are anonymous between students, visible to delegates and the admin.
    voters: moderator ? Object.values(votes).map(vote => ({ name: displayName(people.get(vote.userId)), value: vote.value, reason: vote.reason })) : undefined,
  };
}
const FIELD_LABELS: Record<string, string> = { title: 'Titre', type: 'Type', day: 'Date', time: 'Heure', where: 'Où', format: 'Format', mode: 'Modalité', info: 'Infos', links: 'Liens', scope: 'Pour' };
function flat(input: Partial<WorkInput>): Record<string, string> {
  const out: Record<string, string> = {};
  if (input.title !== undefined) out.title = input.title;
  if (input.type !== undefined) out.type = WORK_TYPE_LABELS[input.type];
  if (input.day !== undefined) out.day = new Date(input.day + 'T12:00:00Z').toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
  if (input.time !== undefined || input.day !== undefined) out.time = input.time || DEFAULT_DUE_TIME;
  if (input.details) { out.where = input.details.where; out.format = input.details.format; out.mode = input.details.mode; out.info = input.details.info; }
  if (input.links) out.links = input.links.map(linkDomain).join(', ');
  if (input.scope) out.scope = scopeLabel(input.scope);
  return out;
}
function describeChanges(work: Work, changes: Partial<WorkInput>) {
  const before = flat(work), after = flat(changes);
  return Object.keys(after).filter(key => (before[key] ?? '') !== (after[key] ?? '')).map(key => ({ field: key, label: FIELD_LABELS[key] ?? key, before: before[key] || '—', after: after[key] || '—' }));
}

// ---------------------------------------------------------------------------
// Configuration and sign-in
// ---------------------------------------------------------------------------
router.get('/travaux/config', route(async (_req, res) => res.json({ mail: mailConfigured() || process.env.NODE_ENV !== 'production', persistent: persistentStore(), contact: process.env.CONTACT_EMAIL || '', teacherAccounts: process.env.TEACHER_ACCOUNTS === 'true' })));

router.get('/auth/me', route(async (req, res) => {
  const { user } = await authenticate(req);
  res.json({ me: user ? await meOf(user) : null });
}));

async function mailLogin(req: Request, login: Login) {
  if (!login.email) throw new HttpError(400, 'Adresse manquante.');
  if (login.mails >= 3 || await overLimit('mail:' + login.email, 5, 3600) || await overLimit('mail-ip:' + addressKey(req), 20, 3600)) throw new HttpError(429, 'Trop de mails envoyés. Réessaie dans un moment ou valide sur un appareil connecté.');
  const { code, magic } = newSecrets(login);
  login.mails++; login.attempts = 0;
  await db().put('logins', login.id, login);
  const link = `${origin(req)}/api/auth/magic?r=${login.id}&t=${magic}`;
  const mail = loginMail(login.email, code, link, login.device);
  try { await sendMail(mail); }
  catch (error) { console.error('[mail]', error instanceof Error ? error.message : error); throw new HttpError(502, 'Le mail n’a pas pu être envoyé. Réessaie dans quelques minutes.'); }
  const logOnly = !!process.env.MAIL_LOG_ONLY && new RegExp(process.env.MAIL_LOG_ONLY, 'i').test(login.email);
  return process.env.NODE_ENV !== 'production' && (!mailConfigured() || process.env.NODE_TEST_CONTEXT || logOnly) ? code : undefined;
}

router.post('/auth/start', route(async (req, res) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  if (!allowedEmail(email)) throw new HttpError(400, 'Utilise ton adresse étudiante, qui se termine par .uvsq.fr (par exemple prenom.nom@ens.uvsq.fr).');
  if (await overLimit('start-ip:' + addressKey(req), 30, 600)) throw new HttpError(429, 'Trop de demandes. Réessaie dans quelques minutes.');
  // A new request replaces older ones of the same address: a connected device only ever sees one request.
  for (const previous of (await db().list<Login>('logins')).filter(item => item.email === email && item.status === 'waiting')) await db().delete('logins', previous.id);
  const { login, poll } = newLogin(req, email);
  await db().put('logins', login.id, login);
  const index = await db().get<{ userId: string }>('emails', email);
  const sessions = index ? (await db().list<Session>('sessions')).filter(session => session.userId === index.userId) : [];
  // With a connected device the person can approve there; otherwise the mail goes out at once.
  let devCode: string | undefined;
  if (!sessions.length) devCode = await mailLogin(req, login);
  res.json({ requestId: login.id, poll, number: login.number, devices: sessions.length, mailSent: !sessions.length, devCode, expiresAt: login.expiresAt });
}));

router.post('/auth/qr', route(async (req, res) => {
  if (await overLimit('qr-ip:' + addressKey(req), 30, 600)) throw new HttpError(429, 'Trop de demandes. Réessaie dans quelques minutes.');
  const { login, poll } = newLogin(req);
  await db().put('logins', login.id, login);
  res.json({ requestId: login.id, poll, number: login.number, url: `${origin(req)}/?qr=${login.id}&n=${login.number}`, expiresAt: login.expiresAt });
}));

async function ownedLogin(req: Request) {
  const login = await db().get<Login>('logins', String(req.body?.requestId ?? ''));
  if (!login || !samePoll(login, req.body?.poll)) throw new HttpError(404, 'Demande introuvable. Recommence.');
  if (loginExpired(login)) throw new HttpError(410, 'Demande expirée. Recommence.');
  return login;
}
router.post('/auth/send-mail', route(async (req, res) => {
  const login = await ownedLogin(req);
  res.json({ mailSent: true, devCode: await mailLogin(req, login) });
}));

async function finish(req: Request, res: Response, user: User, login: Login) {
  await db().delete('logins', login.id);
  await createSession(req, res, user);
  return { me: await meOf(user) };
}
router.post('/auth/verify', route(async (req, res) => {
  const login = await ownedLogin(req);
  if (login.attempts >= MAX_ATTEMPTS) throw new HttpError(429, 'Trop d’essais. Demande un nouveau code.');
  if (!checkCode(login, req.body?.code)) {
    login.attempts++; await db().put('logins', login.id, login);
    throw new HttpError(400, login.attempts >= MAX_ATTEMPTS ? 'Trop d’essais. Demande un nouveau code.' : `Code incorrect. ${MAX_ATTEMPTS - login.attempts} essai(s) restant(s).`);
  }
  res.json(await finish(req, res, await userForEmail(login.email!), login));
}));
router.post('/auth/poll', route(async (req, res) => {
  const login = await ownedLogin(req);
  if (login.status === 'denied') { await db().delete('logins', login.id); return res.json({ status: 'denied' }); }
  if (login.status !== 'approved' || !login.approvedUserId) return res.json({ status: 'waiting' });
  const user = await db().get<User>('users', login.approvedUserId);
  if (!user || user.deletedAt) throw new HttpError(404, 'Compte introuvable.');
  res.json({ status: 'approved', ...await finish(req, res, user, login) });
}));
router.get('/auth/magic', route(async (req, res) => {
  const login = await db().get<Login>('logins', String(req.query.r ?? ''));
  if (!login || loginExpired(login) || !login.email || !checkMagic(login, req.query.t)) return res.redirect(302, '/?connexion=expiree');
  const user = await userForEmail(login.email);
  // The device that opens the link is signed in; the device that asked is approved too.
  login.status = 'approved'; login.approvedUserId = user.id; login.magicHash = undefined;
  await db().put('logins', login.id, login);
  await createSession(req, res, user);
  res.redirect(302, '/?connexion=ok');
}));
router.get('/auth/pending', route(async (req, res) => {
  const { user } = await requireUser(req);
  const pending = (await db().list<Login>('logins')).filter(login => login.email === user.email && login.status === 'waiting' && !loginExpired(login));
  res.json(pending.map(login => ({ id: login.id, device: login.device, createdAt: login.createdAt, choices: [login.number, ...login.decoys].sort(() => Math.random() - .5) })));
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
  if (!login || loginExpired(login) || login.status !== 'waiting' || (login.email && login.email !== user.email)) throw new HttpError(404, 'Demande introuvable ou expirée.');
  // A wrong number denies the request: accepting someone else's request by reflex is not possible.
  if (Number(req.body?.number) !== login.number) { login.status = 'denied'; await db().put('logins', login.id, login); throw new HttpError(400, 'Ce n’est pas le bon nombre : la demande est refusée.'); }
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
  const sessions = (await db().list<Session>('sessions')).filter(item => item.userId === user.id).sort((a, b) => b.lastSeen.localeCompare(a.lastSeen));
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
  if (user.groupId && user.groupSemester === semester && user.groupId !== req.body.groupId) throw new HttpError(403, 'Tu as déjà changé de groupe ce semestre. Demande à un délégué.');
  if (user.groupId !== req.body.groupId) { user.groupId = req.body.groupId; user.groupSemester = semester; await db().put('users', user.id, user); }
  res.json({ me: await meOf(user) });
}));
router.post('/account/name', route(async (req, res) => {
  const { user } = await requireUser(req);
  const firstName = cleanText(req.body?.firstName, 60), lastName = cleanText(req.body?.lastName, 60);
  if (!firstName) throw new HttpError(400, 'Prénom manquant.');
  const open = (await db().list<NameRequest>('names')).find(item => item.userId === user.id && item.status === 'open');
  const request: NameRequest = { id: open?.id ?? id(), userId: user.id, firstName, lastName, at: now(), status: 'open' };
  await db().put('names', request.id, request);
  res.json({ ok: true, message: 'Demande envoyée : l’admin la validera.' });
}));
router.delete('/account', route(async (req, res) => {
  const { user } = await requireUser(req);
  // Mail and name are erased at once; contributions stay, signed "Ancien étudiant".
  if (user.email) await db().delete('emails', user.email);
  for (const session of (await db().list<Session>('sessions')).filter(item => item.userId === user.id)) await db().delete('sessions', session.id);
  await db().delete('marks', user.id);
  const erased: User = { id: user.id, email: null, firstName: '', lastName: '', createdAt: user.createdAt, reliability: user.reliability, deletedAt: now(), banned: user.banned };
  await db().put('users', user.id, erased);
  clearSessionCookie(req, res);
  res.json({ ok: true });
}));
router.get('/account/marks', route(async (req, res) => {
  const { user } = await requireUser(req);
  res.json(await db().get<Marks>('marks', user.id) ?? { done: {}, notes: {} });
}));
router.put('/account/marks', route(async (req, res) => {
  const { user } = await requireUser(req);
  const marks = await db().get<Marks>('marks', user.id) ?? { done: {}, notes: {} };
  const body = req.body as { done?: Record<string, boolean>; notes?: Record<string, string> };
  for (const [key, value] of Object.entries(body.done ?? {}).slice(0, 200)) { if (!/^[a-f0-9]{32}$/.test(key)) continue; if (value) marks.done[key] = now(); else delete marks.done[key]; }
  for (const [key, value] of Object.entries(body.notes ?? {}).slice(0, 200)) { if (!/^[a-f0-9]{32}$/.test(key)) continue; const text = cleanText(value, LIMITS.note); if (text) marks.notes[key] = text; else delete marks.notes[key]; }
  await db().put('marks', user.id, marks);
  res.json(marks);
}));

// ---------------------------------------------------------------------------
// Works
// ---------------------------------------------------------------------------
async function worksForGroup(groupId: string) {
  return (await db().list<Work>('works')).filter(work => scopeIncludes(work.scope, groupId));
}
router.get('/travaux/group/:groupId', route(async (req, res) => {
  const groupId = String(req.params.groupId);
  if (!groupExists(groupId)) throw new HttpError(400, 'Groupe inconnu.');
  const { user } = await authenticate(req);
  const people = await users();
  const since = String(req.query.since ?? '');
  const works = (await worksForGroup(groupId)).filter(work => !since || work.day >= since || work.updatedAt >= since);
  for (const work of works) await settle(work);
  res.json(await Promise.all(works.map(work => workView(work, user, people))));
}));
router.get('/travaux/work/:id', route(async (req, res) => {
  const work = await db().get<Work>('works', String(req.params.id));
  if (!work) throw new HttpError(404, 'Travail introuvable.');
  const { user } = await authenticate(req);
  const people = await users();
  const entries = (await db().list<HistoryEntry & { workId: string }>('history', work.id + ':')).sort((a, b) => a.at.localeCompare(b.at));
  res.json({ work: await workView(await settle(work), user, people), history: entries.map(entry => ({ at: entry.at, by: entry.by === 'system' ? 'Vencat' : displayName(people.get(entry.by)), action: entry.action, detail: entry.detail })) });
}));
router.post('/travaux/works', route(async (req, res) => {
  const { user } = await requireContributor(req);
  const input = parseWorkInput(req.body);
  if ('error' in input) throw new HttpError(400, input.error);
  const rights = await powers(user, input.scope);
  if (!rights.member && !rights.moderator && !rights.teacher) throw new HttpError(403, 'Tu ne peux ajouter un travail que pour ton groupe.');
  if (!rights.admin && await overLimit('add:' + user.id, LIMITS.addsPerDay, 86400)) throw new HttpError(429, `Limite de ${LIMITS.addsPerDay} ajouts par jour atteinte.`);
  const work: Work = { ...input, id: id(), authorId: user.id, authorNew: isNewAccount(user), createdAt: now(), updatedAt: now(), state: 'pending', forced: rights.moderator ? 'validated' : undefined, teacherConfirmed: rights.teacher ? displayName(user) : undefined };
  await db().put('works', work.id, work);
  await history(work.id, user.id, input.ds ? 'infos du DS ajoutées' : 'création');
  await settle(work, user.id);
  res.status(201).json(await workView(work, user, await users()));
}));
async function loadWork(workId: string) {
  const work = await db().get<Work>('works', workId);
  if (!work) throw new HttpError(404, 'Travail introuvable.');
  return work;
}
async function castVote(user: User, targetId: string, value: unknown, reason: unknown) {
  if (value !== 1 && value !== -1 && value !== 0) throw new HttpError(400, 'Vote invalide.');
  if (await overLimit('vote:' + user.id, LIMITS.votesPerHour, 3600)) throw new HttpError(429, `Limite de ${LIMITS.votesPerHour} votes par heure atteinte.`);
  const key = `${targetId}:${user.id}`;
  if (value === 0) { await db().delete('votes', key); return; }
  const text = cleanText(reason, LIMITS.reason);
  if (value === -1 && !text) throw new HttpError(400, 'Indique pourquoi tu contestes.');
  const vote: VoteDoc = { targetId, userId: user.id, value, reason: value === -1 ? text : undefined, at: now(), weight: voteWeight(user.createdAt) };
  await db().put('votes', key, vote);
}
router.post('/travaux/work/:id/vote', route(async (req, res) => {
  const { user } = await requireContributor(req);
  const work = await loadWork(String(req.params.id));
  if (work.authorId === user.id) throw new HttpError(400, 'Ton propre vote ne compte pas.');
  const rights = await powers(user, work.scope);
  if (!rights.member && !rights.moderator) throw new HttpError(403, 'Seuls les élèves concernés peuvent voter.');
  await castVote(user, work.id, req.body?.value, req.body?.reason);
  await settle(work, user.id);
  res.json(await workView(work, user, await users()));
}));
router.post('/travaux/work/:id/proposal', route(async (req, res) => {
  const { user } = await requireContributor(req);
  const work = await loadWork(String(req.params.id));
  const rights = await powers(user, work.scope);
  if (!rights.member && !rights.moderator) throw new HttpError(403, 'Seuls les élèves concernés peuvent proposer une modification.');
  if (work.proposalId && (await db().get<Proposal>('proposals', work.proposalId))?.status === 'open') throw new HttpError(409, 'Une proposition est déjà ouverte sur ce travail : vote d’abord sur celle-ci.');
  const kind = req.body?.kind === 'delete' ? 'delete' : 'edit';
  let changes: Partial<WorkInput> = {};
  if (kind === 'edit') {
    const merged = parseWorkInput({ ...work, time: work.time ?? '', ...req.body?.changes });
    if ('error' in merged) throw new HttpError(400, merged.error);
    changes = merged;
    if (!describeChanges(work, changes).length) throw new HttpError(400, 'Aucun changement à proposer.');
  }
  const reason = cleanText(req.body?.reason, LIMITS.reason);
  if (kind === 'delete' && !reason) throw new HttpError(400, 'Indique pourquoi ce travail n’existe plus.');
  const proposal: Proposal = { id: id(), workId: work.id, kind, changes, reason, authorId: user.id, createdAt: now(), status: 'open' };
  if (rights.moderator) { await db().put('proposals', proposal.id, proposal); await applyProposal(work, proposal, user.id); }
  else { await db().put('proposals', proposal.id, proposal); work.proposalId = proposal.id; work.updatedAt = now(); await db().put('works', work.id, work); await history(work.id, user.id, kind === 'delete' ? 'suppression proposée' : 'modification proposée', reason || describeChanges(work, changes).map(change => `${change.label} : ${change.before} → ${change.after}`).join(' · ')); }
  res.status(201).json(await workView(await loadWork(work.id), user, await users()));
}));
async function applyProposal(work: Work, proposal: Proposal, by: string) {
  proposal.status = 'accepted'; proposal.closedAt = now();
  await db().put('proposals', proposal.id, proposal);
  work.proposalId = undefined; work.updatedAt = now();
  if (proposal.kind === 'delete') {
    work.forced = 'removed'; work.state = 'removed'; work.removedReason = proposal.reason;
    if (/n.existe pas/i.test(proposal.reason ?? '')) { await adjustReliability(work.authorId, -2); await problem(work.authorId, 'travail retiré car faux', work.title); }
    await history(work.id, by, 'retiré', proposal.reason);
  } else {
    const detail = describeChanges(work, proposal.changes).map(change => `${change.label} : ${change.before} → ${change.after}`).join(' · ');
    Object.assign(work, proposal.changes);
    if (!proposal.changes.time) work.time = undefined;
    await history(work.id, by, 'modification validée', detail);
  }
  if (proposal.authorId !== work.authorId) await adjustReliability(proposal.authorId, proposal.kind === 'edit' ? 0.5 : 0.2);
  await db().put('works', work.id, work);
}
router.post('/travaux/proposal/:id/vote', route(async (req, res) => {
  const { user } = await requireContributor(req);
  const proposal = await db().get<Proposal>('proposals', String(req.params.id));
  if (!proposal || proposal.status !== 'open') throw new HttpError(404, 'Proposition fermée.');
  if (proposal.authorId === user.id) throw new HttpError(400, 'Ton propre vote ne compte pas.');
  const work = await loadWork(proposal.workId);
  const rights = await powers(user, work.scope);
  if (!rights.member && !rights.moderator) throw new HttpError(403, 'Seuls les élèves concernés peuvent voter.');
  await castVote(user, proposal.id, req.body?.value, req.body?.reason);
  const author = await db().get<User>('users', proposal.authorId);
  const state = voteState(await votesOf(proposal.id), proposal.authorId, proposal.createdAt, author?.reliability ?? 0);
  if (state === 'validated') await applyProposal(work, proposal, user.id);
  else if (state === 'contested') {
    proposal.status = 'rejected'; proposal.closedAt = now(); await db().put('proposals', proposal.id, proposal);
    work.proposalId = undefined; await db().put('works', work.id, work);
    await history(work.id, user.id, proposal.kind === 'delete' ? 'suppression refusée' : 'modification refusée');
  }
  res.json(await workView(await loadWork(work.id), user, await users()));
}));
router.post('/travaux/work/:id/report', route(async (req, res) => {
  const { user } = await requireContributor(req);
  const kind = ['work', 'delegate', 'correction'].includes(req.body?.kind) ? req.body.kind : 'work';
  const reason = cleanText(req.body?.reason, LIMITS.reason) || 'Signalement';
  if (await overLimit('report:' + user.id, 20, 86400)) throw new HttpError(429, 'Trop de signalements aujourd’hui.');
  const report: Report = { id: id(), target: { kind, id: String(req.params.id) }, reason, by: user.id, at: now(), status: 'open' };
  await db().put('reports', report.id, report);
  res.json({ ok: true, message: 'Signalement envoyé. Merci.' });
}));
router.post('/travaux/work/:id/moderate', route(async (req, res) => {
  const { user } = await requireContributor(req);
  const work = await loadWork(String(req.params.id));
  if (!(await powers(user, work.scope)).moderator) throw new HttpError(403, 'Réservé aux délégués et à l’admin.');
  const action = req.body?.action, reason = cleanText(req.body?.reason, LIMITS.reason);
  if (action === 'validate') { work.forced = 'validated'; await history(work.id, user.id, 'validé par un délégué'); }
  else if (action === 'remove') {
    work.forced = 'removed'; work.state = 'removed'; work.removedReason = reason || 'Retiré par la modération';
    if (req.body?.false === true) { await adjustReliability(work.authorId, -2); await problem(work.authorId, 'travail retiré car faux', work.title); }
    await history(work.id, user.id, 'retiré par la modération', reason);
  } else if (action === 'restore') { work.forced = undefined; work.state = 'pending'; await history(work.id, user.id, 'rétabli'); }
  else throw new HttpError(400, 'Action inconnue.');
  work.updatedAt = now();
  await db().put('works', work.id, work);
  await audit(user.id, 'travail:' + action, work.id, reason);
  await settle(work, user.id);
  res.json(await workView(work, user, await users()));
}));
router.post('/travaux/work/:id/confirm', route(async (req, res) => {
  const { user } = await requireUser(req);
  if (!user.staff) throw new HttpError(403, 'Réservé aux enseignants.');
  const work = await loadWork(String(req.params.id));
  work.teacherConfirmed = displayName(user); work.updatedAt = now();
  await db().put('works', work.id, work);
  await history(work.id, user.id, 'confirmé par l’enseignant');
  await settle(work, user.id);
  res.json(await workView(work, user, await users()));
}));

/** What waits for my opinion in my group: proposals I have not voted on. */
router.get('/travaux/queue', route(async (req, res) => {
  const { user } = await requireUser(req);
  if (!user.groupId) return res.json({ works: [], corrections: [] });
  const people = await users();
  const works = (await worksForGroup(user.groupId)).filter(work => work.state !== 'removed');
  const pending: WorkView[] = [];
  for (const work of works) {
    if (work.authorId === user.id) continue;
    const votes = await votesOf(work.id);
    const view = await workView(work, user, people, { votes });
    const needsWork = (view.state === 'pending' || view.state === 'contested' || view.state === 'probable') && !votes[user.id];
    const needsProposal = view.proposal && !view.proposal.mine && view.proposal.myVote === undefined;
    if ((needsWork || needsProposal) && Date.parse(view.due) > Date.now() - 86400000) pending.push(view);
  }
  const corrections = (await db().list<Correction>('corrections')).filter(item => item.groupId === user.groupId && item.status === 'open' && item.authorId !== user.id);
  const open = [];
  for (const item of corrections) { const votes = await votesOf(item.id); if (!votes[user.id]) open.push(await correctionView(item, user, people)); }
  res.json({ works: pending.sort((a, b) => a.due.localeCompare(b.due)), corrections: open });
}));

router.get('/travaux/ics/:file', route(async (req, res) => {
  const groupId = String(req.params.file).replace(/\.ics$/, '');
  const group = groupById(groupId);
  if (!group) throw new HttpError(404, 'Groupe inconnu.');
  const people = await users();
  const since = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const views = await Promise.all((await worksForGroup(groupId)).filter(work => work.day >= since).map(work => workView(work, undefined, people)));
  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', `inline; filename="${`travaux-${group.promotion}-${group.label}`.replace(/[^A-Za-z0-9-]+/g, '-')}.ics"`);
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=900');
  res.send(worksToIcs(`${group.promotion} ${group.label}`, views.filter(view => view.state !== 'contested'), origin(req)));
}));

// ---------------------------------------------------------------------------
// Delegates: one-year term, only the admin validates; 8 supports alert the admin.
// ---------------------------------------------------------------------------
const SUPPORTS_FOR_ALERT = 8;
router.get('/travaux/delegates/:groupId', route(async (req, res) => {
  const groupId = String(req.params.groupId);
  const { user } = await authenticate(req);
  const people = await users();
  const all = (await db().list<Delegation>('delegations')).filter(item => item.groupId === groupId);
  const active = (await activeDelegations()).filter(item => item.groupId === groupId);
  res.json({
    active: active.map(item => ({ id: item.id, name: displayName(people.get(item.userId)), until: item.until, me: item.userId === user?.id })),
    requests: all.filter(item => item.status === 'requested').map(item => ({ id: item.id, name: displayName(people.get(item.userId)), supports: item.supporters.length, needed: SUPPORTS_FOR_ALERT, supported: !!user && item.supporters.includes(user.id), mine: item.userId === user?.id, createdAt: item.createdAt })),
  });
}));
router.post('/travaux/delegates/request', route(async (req, res) => {
  const { user } = await requireContributor(req);
  if (!user.groupId) throw new HttpError(400, 'Choisis d’abord ton groupe.');
  const existing = (await db().list<Delegation>('delegations')).find(item => item.userId === user.id && (item.status === 'requested' || (item.status === 'active' && (!item.until || item.until > now()))));
  if (existing) throw new HttpError(409, existing.status === 'active' ? 'Tu es déjà délégué.' : 'Ta demande est déjà en cours.');
  const delegation: Delegation = { id: id(), userId: user.id, groupId: user.groupId, status: 'requested', supporters: [], createdAt: now() };
  await db().put('delegations', delegation.id, delegation);
  res.status(201).json({ ok: true });
}));
router.post('/travaux/delegates/:id/support', route(async (req, res) => {
  const { user } = await requireContributor(req);
  const delegation = await db().get<Delegation>('delegations', String(req.params.id));
  if (!delegation || delegation.status !== 'requested') throw new HttpError(404, 'Demande introuvable.');
  // A support counts only from the same group and an account at least 7 days old.
  if (user.groupId !== delegation.groupId) throw new HttpError(403, 'Seuls les élèves du même groupe peuvent soutenir.');
  if (isNewAccount(user)) throw new HttpError(403, 'Ton compte doit avoir au moins 7 jours pour soutenir une demande.');
  if (delegation.userId === user.id) throw new HttpError(400, 'Tu ne peux pas soutenir ta propre demande.');
  delegation.supporters = req.body?.value === false ? delegation.supporters.filter(item => item !== user.id) : [...new Set([...delegation.supporters, user.id])];
  if (delegation.supporters.length >= SUPPORTS_FOR_ALERT && !delegation.alertedAt) {
    delegation.alertedAt = now();
    for (const admin of (process.env.ADMIN_EMAILS ?? '').split(',').map(item => item.trim()).filter(Boolean)) {
      const people = await users();
      void sendMail({ to: admin, subject: 'Vencat : demande de délégué à trancher', text: `${displayName(people.get(delegation.userId))} a reçu ${delegation.supporters.length} soutiens pour devenir délégué de ${groupById(delegation.groupId)?.promotion} ${groupById(delegation.groupId)?.label}.\nÀ valider dans la file de modération.` }).catch(() => undefined);
    }
  }
  await db().put('delegations', delegation.id, delegation);
  res.json({ ok: true, supports: delegation.supporters.length });
}));

// ---------------------------------------------------------------------------
// Moderation queue (admin: everything; delegates: reports in their groups)
// ---------------------------------------------------------------------------
router.get('/travaux/moderation', route(async (req, res) => {
  const { user } = await requireUser(req);
  const { role, delegateGroups } = await roleOf(user);
  if (role !== 'admin' && role !== 'delegate') throw new HttpError(403, 'Réservé aux délégués et à l’admin.');
  const admin = role === 'admin';
  const people = await users();
  const works = new Map((await db().list<Work>('works')).map(work => [work.id, work]));
  const inMyGroups = (work?: Work) => admin || (!!work && scopeMembers(work.scope).some(group => delegateGroups.includes(group.id)));
  const reports = (await db().list<Report>('reports')).filter(item => item.status === 'open' && (admin || (item.target.kind === 'work' && inMyGroups(works.get(item.target.id)))));
  const out = {
    reports: reports.map(item => ({ id: item.id, kind: item.target.kind, targetId: item.target.id, title: item.target.kind === 'work' ? works.get(item.target.id)?.title ?? 'Travail' : item.target.kind === 'delegate' ? displayName(people.get(item.target.id)) : item.target.id, reason: item.reason, by: displayName(people.get(item.by)), at: item.at })),
    delegates: admin ? (await db().list<Delegation>('delegations')).filter(item => item.status === 'requested').map(item => ({ id: item.id, name: displayName(people.get(item.userId)), group: `${groupById(item.groupId)?.promotion} ${groupById(item.groupId)?.label}`, supports: item.supporters.length, at: item.createdAt })) : [],
    names: admin ? (await db().list<NameRequest>('names')).filter(item => item.status === 'open').map(item => ({ id: item.id, before: displayName(people.get(item.userId)), after: [item.firstName, item.lastName].filter(Boolean).join(' '), email: people.get(item.userId)?.email, at: item.at })) : [],
    alerts: admin ? (await db().list<Alert>('alerts')).filter(item => item.status === 'open').map(item => {
      const problems = [] as string[];
      return { id: item.id, userId: item.userId, name: displayName(people.get(item.userId)), at: item.at, problems };
    }) : [],
    students: delegateGroups.length || admin ? [...people.values()].filter(person => !person.deletedAt && person.groupId && (admin || delegateGroups.includes(person.groupId))).map(person => ({ id: person.id, name: displayName(person), groupId: person.groupId, readOnlyUntil: person.readOnlyUntil, banned: !!person.banned, reliability: person.reliability })) : [],
    log: admin ? (await db().list<Audit>('audit')).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 30).map(item => ({ ...item, by: displayName(people.get(item.by)) })) : [],
    role,
  };
  const problems = await db().list<Problem>('problems');
  for (const alert of out.alerts) alert.problems.push(...problems.filter(item => item.userId === alert.userId && Date.parse(item.at) > Date.now() - 7 * 86400000).map(item => `${item.kind} : ${item.detail}`));
  res.json(out);
}));
export const explanation = (name: string, what: string, contact: string) => `Bonjour ${name},\n\n${what}\n\nCe n’est pas une accusation : il arrive à tout le monde de se tromper de date ou de groupe. Pour que Vencat reste fiable pour toute la promo, les informations ajoutées et les votes doivent correspondre à ce qui a été annoncé en cours.\n\nSi tu penses que c’est une erreur, réponds simplement à ce mail${contact ? ` ou écris à ${contact}` : ''} : une personne relira la décision.\n\nVencat est un projet étudiant non officiel.`;
router.post('/travaux/moderation/action', route(async (req, res) => {
  const { user } = await requireUser(req);
  const { role, delegateGroups } = await roleOf(user);
  if (role !== 'admin' && role !== 'delegate') throw new HttpError(403, 'Réservé aux délégués et à l’admin.');
  const admin = role === 'admin';
  const { kind, action } = req.body ?? {};
  const targetId = String(req.body?.id ?? ''), reason = cleanText(req.body?.reason, LIMITS.reason);
  const contact = process.env.CONTACT_EMAIL || '';
  if (kind === 'report') {
    const report = await db().get<Report>('reports', targetId);
    if (!report) throw new HttpError(404, 'Signalement introuvable.');
    if (action === 'remove' && report.target.kind === 'work') {
      const work = await loadWork(report.target.id);
      if (!admin && !scopeMembers(work.scope).some(group => delegateGroups.includes(group.id))) throw new HttpError(403, 'Hors de ta portée.');
      work.forced = 'removed'; work.state = 'removed'; work.removedReason = reason || report.reason; work.updatedAt = now();
      await db().put('works', work.id, work); await history(work.id, user.id, 'retiré après signalement', reason || report.reason);
      await problem(work.authorId, 'contenu retiré', work.title);
    }
    if (action === 'remove' && report.target.kind === 'delegate' && admin) {
      const delegation = (await activeDelegations(report.target.id))[0];
      if (delegation) { delegation.status = 'ended'; delegation.decidedAt = now(); await db().put('delegations', delegation.id, delegation); }
    }
    report.status = 'done'; report.resolution = action === 'remove' ? 'retiré' : 'classé';
    await db().put('reports', report.id, report);
  } else if (kind === 'delegate' && admin) {
    const delegation = await db().get<Delegation>('delegations', targetId);
    if (!delegation) throw new HttpError(404, 'Demande introuvable.');
    delegation.status = action === 'accept' ? 'active' : 'refused'; delegation.decidedAt = now();
    if (action === 'accept') delegation.until = new Date(Date.now() + 365 * 86400000).toISOString();
    await db().put('delegations', delegation.id, delegation);
  } else if (kind === 'name' && admin) {
    const request = await db().get<NameRequest>('names', targetId);
    if (!request) throw new HttpError(404, 'Demande introuvable.');
    request.status = action === 'accept' ? 'accepted' : 'refused';
    await db().put('names', request.id, request);
    if (action === 'accept') { const person = await db().get<User>('users', request.userId); if (person) { person.firstName = request.firstName; person.lastName = request.lastName; await db().put('users', person.id, person); } }
  } else if (kind === 'alert' && admin) {
    const alert = await db().get<Alert>('alerts', targetId);
    if (!alert) throw new HttpError(404, 'Alerte introuvable.');
    const person = await db().get<User>('users', alert.userId);
    if (action === 'mail' && person?.email) await sendMail({ to: person.email, subject: 'Vencat : à propos de tes dernières contributions', text: explanation(person.firstName, reason || 'Plusieurs de tes contributions récentes ont été contredites par les autres élèves ou retirées (mauvaises dates, travaux qui n’existaient pas, refus contredits).', contact) });
    alert.status = 'done'; await db().put('alerts', alert.id, alert);
  } else if (kind === 'user') {
    const person = await db().get<User>('users', targetId);
    if (!person) throw new HttpError(404, 'Compte introuvable.');
    if (!admin && !(person.groupId && delegateGroups.includes(person.groupId))) throw new HttpError(403, 'Hors de ta portée.');
    if (action === 'group') { if (!groupExists(req.body?.groupId)) throw new HttpError(400, 'Groupe inconnu.'); person.groupId = req.body.groupId; }
    else if (action === 'readonly' && admin) {
      person.readOnlyUntil = new Date(Date.now() + 7 * 86400000).toISOString();
      if (person.email) await sendMail({ to: person.email, subject: 'Vencat : compte en lecture seule pendant 7 jours', text: explanation(person.firstName, `Ton compte passe en lecture seule pendant 7 jours. ${reason}`, contact) }).catch(() => undefined);
    } else if (action === 'ban' && admin) {
      person.banned = { at: now(), reason };
      for (const session of (await db().list<Session>('sessions')).filter(item => item.userId === person.id)) await db().delete('sessions', session.id);
      if (person.email) await sendMail({ to: person.email, subject: 'Vencat : compte banni', text: explanation(person.firstName, `Ton compte a été banni. ${reason}`, contact) }).catch(() => undefined);
    } else if (action === 'lift' && admin) { person.readOnlyUntil = undefined; person.banned = undefined; }
    else throw new HttpError(400, 'Action inconnue.');
    await db().put('users', person.id, person);
  } else throw new HttpError(400, 'Action inconnue.');
  await audit(user.id, `${kind}:${action}`, targetId, reason);
  res.json({ ok: true });
}));

// ---------------------------------------------------------------------------
// Timetable corrections certified on honour: shown over CELCAT, never replacing it.
// ---------------------------------------------------------------------------
async function correctionView(item: Correction, viewer: User | undefined, people: Map<string, User>) {
  const votes = await votesOf(item.id);
  const author = people.get(item.authorId);
  const state = item.status === 'accepted' ? 'validated' : voteState(votes, item.authorId, item.createdAt, author?.reliability ?? 0);
  const t = tally(votes, item.authorId);
  return { id: item.id, groupId: item.groupId, course: item.course, field: item.field, value: item.value, start: item.start, end: item.end, author: shortDisplayName(author), state, up: t.up, down: t.down, myVote: viewer ? votes[viewer.id]?.value : undefined, mine: viewer?.id === item.authorId, status: item.status, createdAt: item.createdAt };
}
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
  const item = await db().get<Correction>('corrections', String(req.params.id));
  if (item && (item.status === 'open' || item.status === 'accepted') && req.body?.reason === 'celcat') { item.status = 'closed'; await db().put('corrections', item.id, item); }
  res.json({ ok: true });
}));

router.use(['/auth', '/account', '/travaux'], (error: unknown, _req: Request, res: Response, next: NextFunction) => {
  if (error instanceof HttpError) return res.status(error.status).json({ error: error.message });
  next(error);
});

export const travauxRouter = router;
