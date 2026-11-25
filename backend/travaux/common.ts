import { type Request, type Response, type NextFunction } from 'express';
import { store } from './store.js';
import { notifyAdmins } from './notify.js';
import { HttpError, id, now, hash, overLimit, activeDelegations, roleOf, displayName, shortDisplayName, type User, type Delegation } from './auth.js';
import {
  voteState, tally, requiredUpvotes, scopeLabel, scopeMembers, parisInstant, DEFAULT_DUE_TIME, linkDomain, cleanText, LIMITS, WORK_TYPE_LABELS,
  voteWeight, type WorkInput, type WorkView, type WorkState, type Vote, type WorkProposalView, type CourseLink, type WorkScope,
} from '../../shared/travaux.js';

// Shared by the Travaux routes: stored documents, helpers, and the state of a work computed from its votes.

// Stored documents
export interface Work extends Omit<WorkInput, 'time'> {
  id: string; time?: string; authorId: string; authorNew: boolean; createdAt: string; updatedAt: string; state: WorkState;
  forced?: 'validated' | 'removed'; removedReason?: string; teacherConfirmed?: string; proposalId?: string;
  /** Reliability was paid when it was first validated: never again (toggling votes cannot farm it). */
  rewardedAt?: string;
}
export interface VoteDoc extends Vote { targetId: string; userId: string }
export interface Proposal { id: string; workId: string; kind: 'edit' | 'delete'; changes: Partial<WorkInput>; reason?: string; authorId: string; createdAt: string; status: 'open' | 'accepted' | 'rejected'; closedAt?: string }
export interface Marks { done: Record<string, string>; notes: Record<string, string> }
export interface Report { id: string; target: { kind: 'work' | 'delegate' | 'correction' | 'user'; id: string }; reason: string; by: string; at: string; status: 'open' | 'done'; resolution?: string }
export interface NameRequest { id: string; userId: string; firstName: string; lastName: string; at: string; status: 'open' | 'accepted' | 'refused' }
export interface Problem { id: string; userId: string; at: string; kind: string; detail: string }
export interface Audit { id: string; at: string; by: string; action: string; target: string; reason: string }
export interface Alert { id: string; userId: string; at: string; status: 'open' | 'done' }
export interface Correction { id: string; groupId: string; course: CourseLink & { end: string }; field: 'room' | 'time' | 'cancelled'; value: string; start?: string; end?: string; authorId: string; createdAt: string; status: 'open' | 'accepted' | 'rejected' | 'closed' }

export const db = () => store();
export const route = (handler: (req: Request, res: Response) => Promise<unknown>) => (req: Request, res: Response, next: NextFunction) => { handler(req, res).catch(next); };
// Proxies chained (tunnel, then the development proxy) append their values: "https,http". Only the first one is the client's.
export const forwarded = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value)?.split(',')[0]?.trim() || undefined;
export const origin = (req: Request) => process.env.PUBLIC_URL || `${forwarded(req.headers['x-forwarded-proto']) ?? req.protocol}://${forwarded(req.headers['x-forwarded-host']) ?? req.headers.host}`;
export const users = async () => new Map((await db().list<User>('users')).map(user => [user.id, user]));

export async function history(workId: string, by: string, action: string, detail?: string) {
  const at = now();
  await db().put('history', `${workId}:${at}:${id().slice(0, 6)}`, { workId, at, by, action, detail });
}
export async function audit(by: string, action: string, target: string, reason = '') {
  const entry: Audit = { id: id(), at: now(), by, action, target, reason };
  await db().put('audit', entry.id, entry);
}
export async function problem(userId: string, kind: string, detail: string) {
  const entry: Problem = { id: id(), userId, at: now(), kind, detail };
  await db().put('problems', entry.id, entry);
  // 3 problems over 7 days: an alert reaches the moderation queue (the admin decides on the explanatory mail).
  const recent = (await db().list<Problem>('problems')).filter(item => item.userId === userId && Date.parse(item.at) > Date.now() - 7 * 86400000);
  if (recent.length >= 3 && !(await db().list<Alert>('alerts')).some(alert => alert.userId === userId && alert.status === 'open')) {
    const alert: Alert = { id: id(), userId, at: now(), status: 'open' };
    await db().put('alerts', alert.id, alert);
    await notifyAdmins('important', 'Vencat : alerte sur un compte', `Un compte a eu 3 problèmes en 7 jours (${kind}). À traiter dans l’administration (/admin › Modération).`);
  }
}
export async function adjustReliability(userId: string, delta: number) {
  const user = await db().get<User>('users', userId);
  if (!user) return;
  user.reliability = Math.round((user.reliability + delta) * 10) / 10;
  await db().put('users', user.id, user);
}
/** Validated delegates vote with a full weight whatever the age of their account (kept 10 s per instance: read at every vote count). */
let delegateIds: { at: number; ids: Set<string> } | undefined;
const delegateUsers = async () => {
  if (!delegateIds || Date.now() - delegateIds.at > 10_000) delegateIds = { at: Date.now(), ids: new Set((await activeDelegations()).map(item => item.userId)) };
  return delegateIds.ids;
};
export const votesOf = async (targetId: string) => {
  const delegates = await delegateUsers();
  // Votes cast before the mandate was confirmed (weight 0.5) count fully from then on.
  return Object.fromEntries((await db().list<VoteDoc>('votes', targetId + ':')).map(vote => [vote.userId, delegates.has(vote.userId) ? { ...vote, weight: Math.max(vote.weight, 1) } : vote])) as Record<string, VoteDoc>;
};

/** Rights of a person on a scope: delegates of a group in the scope and admins act directly. */
export async function powers(user: User | undefined, scope: WorkScope) {
  if (!user) return { member: false, moderator: false };
  const { role, delegateGroups } = await roleOf(user);
  const members = scopeMembers(scope).map(group => group.id);
  return { member: !!user.groupId && members.includes(user.groupId), moderator: role === 'admin' || delegateGroups.some(group => members.includes(group)), admin: role === 'admin', teacher: role === 'teacher' };
}

// ---------------------------------------------------------------------------
// Work state: forced by a moderator, or computed from the votes. Reliability moves when it settles.
// ---------------------------------------------------------------------------
export async function settle(work: Work, by = 'system') {
  if (work.personal) { if (work.state !== 'removed' && work.forced !== 'removed' && work.state !== 'validated') { work.state = 'validated'; await db().put('works', work.id, work); } return work; }
  const author = await db().get<User>('users', work.authorId);
  const votes = await votesOf(work.id);
  const previous = work.state;
  const next: WorkState = work.forced ?? (work.teacherConfirmed ? 'validated' : voteState(votes, work.authorId, work.createdAt, author?.reliability ?? 0));
  if (next === previous) return work;
  work.state = next;
  await db().put('works', work.id, work);
  if (next === 'validated' && previous !== 'validated' && !work.rewardedAt) {
    work.rewardedAt = now(); await db().put('works', work.id, work);
    await adjustReliability(work.authorId, 1);
    for (const vote of Object.values(votes)) {
      if (vote.userId === work.authorId) continue;
      if (vote.value > 0) await adjustReliability(vote.userId, 0.2);
      else { await adjustReliability(vote.userId, -1); await problem(vote.userId, 'refus contredit', work.title); }
    }
    await history(work.id, by, 'validé');
  } else if (next === 'validated' && previous !== 'validated') await history(work.id, by, 'validé de nouveau');
  else if (next === 'contested') await history(work.id, by, 'contesté');
  return work;
}

export async function workView(work: Work, viewer: User | undefined, people: Map<string, User>, extra?: { votes?: Record<string, VoteDoc> }): Promise<WorkView> {
  const votes = extra?.votes ?? await votesOf(work.id);
  const author = people.get(work.authorId);
  const { up, down } = tally(votes, work.authorId);
  const state: WorkState = work.forced ?? (work.personal || work.teacherConfirmed ? 'validated' : voteState(votes, work.authorId, work.createdAt, author?.reliability ?? 0));
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
    proposal, teacherConfirmed: work.teacherConfirmed, personal: work.personal,
    // Votes are anonymous between students, visible to delegates and the admin.
    voters: moderator ? Object.values(votes).map(vote => ({ name: displayName(people.get(vote.userId)), value: vote.value, reason: vote.reason })) : undefined,
  };
}
export const FIELD_LABELS: Record<string, string> = { title: 'Titre', type: 'Type', day: 'Date', time: 'Heure', where: 'Où', format: 'Format', mode: 'Modalité', info: 'Infos', links: 'Liens', scope: 'Pour' };
export function flat(input: Partial<WorkInput>): Record<string, string> {
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
export function describeChanges(work: Work, changes: Partial<WorkInput>) {
  const before = flat(work), after = flat(changes);
  return Object.keys(after).filter(key => (before[key] ?? '') !== (after[key] ?? '')).map(key => ({ field: key, label: FIELD_LABELS[key] ?? key, before: before[key] || '—', after: after[key] || '—' }));
}

export async function loadWork(workId: string) {
  const work = await db().get<Work>('works', workId);
  if (!work) throw new HttpError(404, 'Travail introuvable.');
  return work;
}
export async function castVote(user: User, targetId: string, value: unknown, reason: unknown) {
  if (value !== 1 && value !== -1 && value !== 0) throw new HttpError(400, 'Vote invalide.');
  if (await overLimit('vote:' + user.id, LIMITS.votesPerHour, 3600)) throw new HttpError(429, `Limite de ${LIMITS.votesPerHour} votes par heure atteinte.`);
  const key = `${targetId}:${user.id}`;
  if (value === 0) { await db().delete('votes', key); return; }
  const text = cleanText(reason, LIMITS.reason);
  if (value === -1 && !text) throw new HttpError(400, 'Indique pourquoi tu contestes.');
  // Validated delegates and administrators vote with a full weight; the others with the weight of their account's age.
  const { role } = await roleOf(user);
  const vote: VoteDoc = { targetId, userId: user.id, value, reason: value === -1 ? text : undefined, at: now(), weight: role === 'delegate' || role === 'admin' ? 1 : voteWeight(user.createdAt) };
  await db().put('votes', key, vote);
}

// Delegates: opinion of the group on a declaration, and end of a mandate (31 August).
export const answerCounts = (delegation: Delegation) => { const values = Object.values(delegation.answers ?? {}); return { yes: values.filter(value => value === 'yes').length, unknown: values.filter(value => value === 'unknown').length, no: values.filter(value => value === 'no').length }; };
export const schoolYearEnd = (from = new Date()) => { const year = from.getUTCMonth() >= 8 ? from.getUTCFullYear() + 1 : from.getUTCFullYear(); return `${year}-08-31T21:59:59.000Z`; };

// A timetable correction as a viewer sees it.
export async function correctionView(item: Correction, viewer: User | undefined, people: Map<string, User>) {
  const votes = await votesOf(item.id);
  const author = people.get(item.authorId);
  const state = item.status === 'accepted' ? 'validated' : voteState(votes, item.authorId, item.createdAt, author?.reliability ?? 0);
  const t = tally(votes, item.authorId);
  return { id: item.id, groupId: item.groupId, course: item.course, field: item.field, value: item.value, start: item.start, end: item.end, author: shortDisplayName(author), state, up: t.up, down: t.down, myVote: viewer ? votes[viewer.id]?.value : undefined, mine: viewer?.id === item.authorId, status: item.status, createdAt: item.createdAt };
}

/** Erases an account (the person's request or an administrator's): mail, name, sessions, marks, name requests, sign-in requests
 *  and feedback replies go. Contributions stay, signed « Ancien étudiant ». A ban or a read-only period is kept as a
 *  hashed-address sanction, so deleting the account never wipes it. */
export async function eraseAccount(user: User) {
  const email = user.email;
  const sanctioned = !!user.banned || (!!user.readOnlyUntil && user.readOnlyUntil > now());
  if (email && sanctioned) await db().put('sanctions', hash(email), { banned: user.banned, readOnlyUntil: user.readOnlyUntil });
  if (email) {
    await db().delete('emails', email);
    for (const login of await db().find<{ id: string }>('logins', 'email', email)) await db().delete('logins', login.id);
    for (const item of await db().find<{ id: string }>('feedback', 'email', email)) await db().delete('feedback', item.id);
  }
  for (const item of await db().find<{ id: string }>('sessions', 'userId', user.id)) await db().delete('sessions', item.id);
  for (const item of await db().find<{ id: string }>('names', 'userId', user.id)) await db().delete('names', item.id);
  await db().delete('marks', user.id);
  await db().delete('prefs', user.id);
  for (const mark of await db().list<{ k: string }>('marks', user.id + ':')) await db().delete('marks', mark.k);
  await db().put('users', user.id, { id: user.id, email: null, firstName: '', lastName: '', createdAt: user.createdAt, reliability: user.reliability, deletedAt: now(), banned: user.banned, readOnlyUntil: user.readOnlyUntil } satisfies User);
}

/** A proposal accepted (votes or moderation): the change is applied, the work and its author are updated. */
export async function applyProposal(work: Work, proposal: Proposal, by: string) {
  proposal.status = 'accepted'; proposal.closedAt = now();
  await db().put('proposals', proposal.id, proposal);
  work.proposalId = undefined; work.updatedAt = now();
  if (proposal.kind === 'delete') {
    work.forced = 'removed'; work.state = 'removed'; work.removedReason = proposal.reason;
    if (!work.personal && /n.existe pas/i.test(proposal.reason ?? '')) { await adjustReliability(work.authorId, -2); await problem(work.authorId, 'travail retiré car faux', work.title); }
    await history(work.id, by, 'retiré', proposal.reason);
  } else {
    const detail = describeChanges(work, proposal.changes).map(change => `${change.label} : ${change.before} → ${change.after}`).join(' · ');
    Object.assign(work, proposal.changes);
    if (!proposal.changes.time) work.time = undefined;
    await history(work.id, by, 'modification validée', detail);
  }
  if (!work.personal && proposal.authorId !== work.authorId) await adjustReliability(proposal.authorId, proposal.kind === 'edit' ? 0.5 : 0.2);
  await db().put('works', work.id, work);
}
/** Moderation bypasses the 3 votes: accept applies the proposal, reject closes it. `by` is an account or "admin:<address>". */
export async function decideProposal(work: Work, proposal: Proposal, by: string, accept: boolean) {
  const admin = by.startsWith('admin:');
  if (accept) {
    await applyProposal(work, proposal, by);
    await history(work.id, by, admin ? 'proposition validée par l’administration' : 'proposition validée par un(e) délégué(e)', 'sans attendre les votes');
  } else {
    proposal.status = 'rejected'; proposal.closedAt = now(); await db().put('proposals', proposal.id, proposal);
    work.proposalId = undefined; work.updatedAt = now(); await db().put('works', work.id, work);
    await history(work.id, by, admin ? 'proposition refusée par l’administration' : 'proposition refusée par un(e) délégué(e)');
  }
  await audit(by, 'proposition:' + (accept ? 'accept' : 'reject'), proposal.id, work.title);
}
