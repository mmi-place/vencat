import express, {  } from 'express';
import { sendMail } from './mail.js';
import { HttpError, now, requireUser, groupExists, roleOf, displayName, activeDelegations, isNewAccount, type User, type Session, type Delegation } from './auth.js';
import { scopeMembers, cleanText, tally, LIMITS } from '../../shared/travaux.js';
import { groupById } from '../../shared/selection.js';
import {
  type Work, type Proposal, type Report, type NameRequest, type Problem, type Audit, type Alert, db, route, users, history, audit, problem, loadWork,
  answerCounts, schoolYearEnd, describeChanges, decideProposal, votesOf, resetFullWeightCache,
} from './common.js';

// Moderation queue (admin: everything; delegates: reports in their groups)
const router = express.Router();
export const moderationRouter = router;

router.get('/travaux/moderation', route(async (req, res) => {
  const { user } = await requireUser(req);
  const { role, delegateGroups } = await roleOf(user);
  if (role !== 'admin' && role !== 'delegate') throw new HttpError(403, 'Réservé aux délégué(e)s et à l’administration.');
  res.json(await moderationData(role === 'admin', delegateGroups));
}));
/** Moderation queue: everything for the administration, reports of their groups for delegates. */
export async function moderationData(admin: boolean, delegateGroups: string[]) {
  const people = await users();
  const works = new Map((await db().list<Work>('works')).map(work => [work.id, work]));
  const inMyGroups = (work?: Work) => admin || (!!work && scopeMembers(work.scope).some(group => delegateGroups.includes(group.id)));
  const reports = (await db().list<Report>('reports')).filter(item => item.status === 'open' && !(item.target.kind === 'work' && works.get(item.target.id)?.personal) && (admin || (item.target.kind === 'work' && inMyGroups(works.get(item.target.id)))));
  const problems = await db().list<Problem>('problems');
  const delegations = await activeDelegations();
  // Proposals still waiting for their votes: moderation can settle them at once.
  const proposals = await Promise.all((await db().list<Proposal>('proposals')).filter(item => item.status === 'open' && works.get(item.workId) && !works.get(item.workId)!.personal && inMyGroups(works.get(item.workId))).map(async item => {
    const work = works.get(item.workId)!, t = tally(await votesOf(item.id), item.authorId);
    return { id: item.id, workId: work.id, title: work.title, kind: item.kind, author: displayName(people.get(item.authorId)), reason: item.reason, changes: describeChanges(work, item.changes), up: t.up, down: t.down, at: item.createdAt };
  }));
  const actor = (id: string) => id.startsWith('admin:') ? (admin ? id.slice(6) : 'Administration') : displayName(people.get(id));
  return {
    proposals: proposals.sort((a, b) => a.at.localeCompare(b.at)),
    reports: reports.map(item => ({ id: item.id, kind: item.target.kind, targetId: item.target.id, title: item.target.kind === 'work' ? works.get(item.target.id)?.title ?? 'Travail' : item.target.kind === 'delegate' ? displayName(people.get(item.target.id)) : item.target.id, reason: item.reason, by: displayName(people.get(item.by)), at: item.at })),
    delegates: admin ? (await db().list<Delegation>('delegations')).filter(item => item.status === 'requested').map(item => ({ id: item.id, name: displayName(people.get(item.userId)), email: people.get(item.userId)?.email ?? undefined, group: `${groupById(item.groupId)?.promotion} ${groupById(item.groupId)?.label}`, title: item.title ?? 'titulaire', note: item.note ?? '', electedOn: item.electedOn, answers: answerCounts(item), at: item.createdAt })) : [],
    activeDelegates: admin ? (await activeDelegations()).map(item => ({ id: item.id, name: displayName(people.get(item.userId)), group: `${groupById(item.groupId)?.promotion} ${groupById(item.groupId)?.label}`, title: item.title ?? 'titulaire', until: item.until })) : [],
    names: admin ? (await db().list<NameRequest>('names')).filter(item => item.status === 'open').map(item => ({ id: item.id, before: displayName(people.get(item.userId)), after: [item.firstName, item.lastName].filter(Boolean).join(' '), email: people.get(item.userId)?.email, at: item.at })) : [],
    alerts: admin ? (await db().list<Alert>('alerts')).filter(item => item.status === 'open').map(item => ({ id: item.id, userId: item.userId, name: displayName(people.get(item.userId)), at: item.at, problems: problems.filter(entry => entry.userId === item.userId && Date.parse(entry.at) > Date.now() - 7 * 86400000).map(entry => `${entry.kind} : ${entry.detail}`) })) : [],
    students: [...people.values()].filter(person => !person.deletedAt && (admin || (person.groupId && delegateGroups.includes(person.groupId)))).map(person => ({ trusted: !!person.trusted, newAccount: isNewAccount(person), delegateOf: delegations.filter(item => item.userId === person.id).map(item => item.groupId), id: person.id, name: displayName(person), email: admin ? person.email : undefined, groupId: person.groupId, readOnlyUntil: person.readOnlyUntil, banned: !!person.banned, reliability: person.reliability, createdAt: person.createdAt })),
    log: admin ? (await db().list<Audit>('audit')).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 60).map(item => ({ ...item, by: actor(item.by) })) : [],
    role: admin ? 'admin' : 'delegate',
  };
}
const explanation = (name: string, what: string, contact: string) => `Bonjour ${name},\n\n${what}\n\nCe n’est pas une accusation : il arrive à tout le monde de se tromper de date ou de groupe. Pour que Vencat reste fiable pour toute la promo, les informations ajoutées et les votes doivent correspondre à ce qui a été annoncé en cours.\n\nSi tu penses que c’est une erreur, réponds simplement à ce mail${contact ? ` ou écris à ${contact}` : ''} : une personne relira la décision.\n\nVencat est un projet étudiant non officiel.`;
router.post('/travaux/moderation/action', route(async (req, res) => {
  const { user } = await requireUser(req);
  const { role, delegateGroups } = await roleOf(user);
  if (role !== 'admin' && role !== 'delegate') throw new HttpError(403, 'Réservé aux délégué(e)s et à l’administration.');
  await moderationAction(user.id, role === 'admin', delegateGroups, req.body ?? {});
  res.json({ ok: true });
}));
/** One moderation decision, recorded with its reason. actorId is an account or "admin:<address>". */
export async function moderationAction(actorId: string, admin: boolean, delegateGroups: string[], body: Record<string, unknown>) {
  const req = { body };
  const { kind, action } = req.body ?? {};
  const targetId = String(req.body?.id ?? ''), reason = cleanText(req.body?.reason, LIMITS.reason);
  const contact = process.env.CONTACT_EMAIL || '';
  if (kind === 'proposal') {
    if (action !== 'accept' && action !== 'reject') throw new HttpError(400, 'Action inconnue.');
    const proposal = await db().get<Proposal>('proposals', targetId);
    if (!proposal || proposal.status !== 'open') throw new HttpError(404, 'Proposition fermée.');
    const work = await loadWork(proposal.workId);
    if (!admin && !scopeMembers(work.scope).some(group => delegateGroups.includes(group.id))) throw new HttpError(403, 'Hors de ta portée.');
    await decideProposal(work, proposal, actorId, action === 'accept');
    return;
  }
  if (kind === 'report') {
    const report = await db().get<Report>('reports', targetId);
    if (!report) throw new HttpError(404, 'Signalement introuvable.');
    if (action === 'remove' && report.target.kind === 'work') {
      const work = await loadWork(report.target.id);
      if (!admin && !scopeMembers(work.scope).some(group => delegateGroups.includes(group.id))) throw new HttpError(403, 'Hors de ta portée.');
      work.forced = 'removed'; work.state = 'removed'; work.removedReason = reason || report.reason; work.updatedAt = now();
      await db().put('works', work.id, work); await history(work.id, actorId, 'retiré après signalement', reason || report.reason);
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
    if (action === 'accept') delegation.until = schoolYearEnd();
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
    else if (action === 'trust' && admin) person.trusted = now();
    else if (action === 'untrust' && admin) person.trusted = undefined;
    else if (action === 'readonly' && admin) {
      person.readOnlyUntil = new Date(Date.now() + 7 * 86400000).toISOString();
      if (person.email) await sendMail({ to: person.email, subject: 'Vencat : compte en lecture seule pendant 7 jours', text: explanation(person.firstName, `Ton compte passe en lecture seule pendant 7 jours. ${reason}`, contact) }).catch(() => undefined);
    } else if (action === 'ban' && admin) {
      person.banned = { at: now(), reason };
      for (const session of await db().find<Session>('sessions', 'userId', person.id)) await db().delete('sessions', session.id);
      if (person.email) await sendMail({ to: person.email, subject: 'Vencat : compte banni', text: explanation(person.firstName, `Ton compte a été banni. ${reason}`, contact) }).catch(() => undefined);
    } else if (action === 'lift' && admin) { person.readOnlyUntil = undefined; person.banned = undefined; }
    else throw new HttpError(400, 'Action inconnue.');
    await db().put('users', person.id, person);
  } else throw new HttpError(400, 'Action inconnue.');
  if (kind === 'delegate' || kind === 'user') resetFullWeightCache();
  await audit(actorId, `${kind}:${action}`, targetId, reason);
}
