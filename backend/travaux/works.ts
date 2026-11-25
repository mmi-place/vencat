import express, {  } from 'express';
import { HttpError, id, now, authenticate, requireUser, requireContributor, overLimit, groupExists, isNewAccount, displayName, type User, type Delegation } from './auth.js';
import { notifyAdmins } from './notify.js';
import {
  parseWorkInput, voteState, scopeIncludes, cleanText, LIMITS, worksToIcs, courseToIcs, audienceScope, widerScope, type WorkInput,
  type WorkView, type HistoryEntry,
} from '../../shared/travaux.js';
import { groupById, groupOptions } from '../../shared/selection.js';
import {
  type Work, type Proposal, type Report, type Correction, db, route, origin, users, history, audit, problem, adjustReliability, votesOf,
  powers, settle, workView, describeChanges, loadWork, castVote, correctionView,
} from './common.js';

// Works
const router = express.Router();
export const worksRouter = router;

/** Shared works of a group, plus the viewer's own personal works. */
async function worksForGroup(groupId: string, viewerId?: string) {
  return (await db().list<Work>('works')).filter(work => work.personal ? work.authorId === viewerId : scopeIncludes(work.scope, groupId));
}
router.get('/travaux/group/:groupId', route(async (req, res) => {
  const groupId = String(req.params.groupId);
  if (!groupExists(groupId)) throw new HttpError(400, 'Groupe inconnu.');
  const { user } = await authenticate(req);
  const people = await users();
  const since = String(req.query.since ?? '');
  const works = (await worksForGroup(groupId, user?.id)).filter(work => !since || work.day >= since || work.updatedAt >= since);
  for (const work of works) await settle(work);
  res.json(await Promise.all(works.map(work => workView(work, user, people))));
}));
/** One course of the timetable as a calendar event (reminder 15 minutes before). */
router.get('/travaux/course-event.ics', route(async (req, res) => {
  const groupId = String(req.query.group ?? ''), uid = String(req.query.uid ?? ''), start = String(req.query.start ?? '');
  if (!groupExists(groupId) || !uid || !Number.isFinite(Date.parse(start))) throw new HttpError(400, 'Cours introuvable.');
  const day = new Date(start).toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });
  const { getCalendar } = await import('../app.js');
  const monday = (() => { const date = new Date(day + 'T12:00:00Z'); date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7); return date.toISOString().slice(0, 10); })();
  const sunday = new Date(Date.parse(monday + 'T12:00:00Z') + 6 * 86400000).toISOString().slice(0, 10);
  const course = (await getCalendar(groupId, monday, sunday)).snapshot.courses.find(item => item.uid === uid && item.start === start);
  if (!course) throw new HttpError(404, 'Ce cours n’est plus dans l’emploi du temps.');
  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', `inline; filename="${course.summary.normalize('NFD').replace(/[^A-Za-z0-9]+/g, '-').slice(0, 60) || 'cours'}.ics"`);
  res.setHeader('Cache-Control', 'private, no-store');
  res.send(courseToIcs(course, origin(req)));
}));
/** One work as a calendar event (Apple Calendrier opens the file; reminder the day before). */
router.get('/travaux/event/:file', route(async (req, res) => {
  const work = await db().get<Work>('works', String(req.params.file).replace(/\.ics$/, ''));
  const { user } = await authenticate(req);
  if (!work || work.state === 'removed' || (work.personal && work.authorId !== user?.id)) throw new HttpError(404, 'Travail introuvable.');
  const view = await workView(work, user, await users());
  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', `inline; filename="${work.title.normalize('NFD').replace(/[^A-Za-z0-9]+/g, '-').slice(0, 60) || 'travail'}.ics"`);
  res.setHeader('Cache-Control', 'private, no-store');
  res.send(worksToIcs(view.title, [view], origin(req), new Date(), true));
}));
router.get('/travaux/work/:id', route(async (req, res) => {
  const work = await db().get<Work>('works', String(req.params.id));
  const { user } = await authenticate(req);
  if (!work || (work.personal && work.authorId !== user?.id)) throw new HttpError(404, 'Travail introuvable.');
  const people = await users();
  const entries = (await db().list<HistoryEntry & { workId: string }>('history', work.id + ':')).sort((a, b) => a.at.localeCompare(b.at));
  res.json({ work: await workView(await settle(work), user, people), history: entries.map(entry => ({ at: entry.at, by: entry.by === 'system' ? 'Vencat' : entry.by.startsWith('admin:') ? 'Administration' : displayName(people.get(entry.by)), action: entry.action, detail: entry.detail })) });
}));
router.post('/travaux/works', route(async (req, res) => {
  const { user } = await requireContributor(req);
  const input = parseWorkInput(req.body);
  if ('error' in input) throw new HttpError(400, input.error);
  if (input.clientId) { const same = (await db().list<Work>('works')).find(work => work.authorId === user.id && work.clientId === input.clientId); if (same) return res.status(200).json(await workView(same, user, await users())); }
  // A work linked to a course reaches everyone attending it (a promotion lecture: the whole promotion).
  const authorGroup = groupById(user.groupId ?? '');
  if (!input.personal && input.course && authorGroup) input.scope = widerScope(input.scope, audienceScope(input.course.audience, authorGroup));
  const rights = await powers(user, input.scope);
  if (!input.personal && !rights.member && !rights.moderator && !rights.teacher) throw new HttpError(403, 'Tu ne peux ajouter un travail que pour ton groupe.');
  // Personal works only concern their author: a wider budget, and no validation.
  if (!rights.admin && await overLimit((input.personal ? 'add-personal:' : 'add:') + user.id, input.personal ? 50 : LIMITS.addsPerDay, 86400)) throw new HttpError(429, 'Limite d’ajouts atteinte pour aujourd’hui.');
  const work: Work = { ...input, id: id(), authorId: user.id, authorNew: isNewAccount(user), createdAt: now(), updatedAt: now(), state: input.personal ? 'validated' : 'pending', forced: rights.moderator && !input.personal ? 'validated' : undefined, teacherConfirmed: rights.teacher && !input.personal ? displayName(user) : undefined };
  await db().put('works', work.id, work);
  await history(work.id, user.id, input.ds ? 'infos du DS ajoutées' : 'création');
  await settle(work, user.id);
  res.status(201).json(await workView(work, user, await users()));
}));
router.post('/travaux/work/:id/vote', route(async (req, res) => {
  const { user } = await requireContributor(req);
  const work = await loadWork(String(req.params.id));
  if (work.personal) throw new HttpError(400, 'Un travail perso ne se vote pas.');
  if (work.state === 'removed') throw new HttpError(409, 'Ce travail a été retiré.');
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
  const own = !!work.personal && work.authorId === user.id;
  if (work.personal && !own) throw new HttpError(404, 'Travail introuvable.');
  if (work.state === 'removed') throw new HttpError(409, 'Ce travail a été retiré.');
  const rights = own ? { member: true, moderator: true } : await powers(user, work.scope);
  if (!rights.member && !rights.moderator) throw new HttpError(403, 'Seuls les élèves concernés peuvent proposer une modification.');
  if (work.proposalId && (await db().get<Proposal>('proposals', work.proposalId))?.status === 'open') throw new HttpError(409, 'Une proposition est déjà ouverte sur ce travail : vote d’abord sur celle-ci.');
  const kind = req.body?.kind === 'delete' ? 'delete' : 'edit';
  let changes: Partial<WorkInput> = {};
  if (kind === 'edit') {
    const merged = parseWorkInput({ ...work, time: work.time ?? '', ...req.body?.changes });
    if ('error' in merged) throw new HttpError(400, merged.error);
    // A personal work stays personal and a shared one stays shared: only its content changes.
    merged.personal = work.personal; merged.clientId = undefined;
    if (merged.personal) merged.scope = work.scope;
    const group = groupById(user.groupId ?? '');
    if (!merged.personal && merged.course && group) merged.scope = widerScope(merged.scope, audienceScope(merged.course.audience, group));
    if (!merged.personal && JSON.stringify(merged.scope) !== JSON.stringify(work.scope)) { const target = await powers(user, merged.scope); if (!target.member && !target.moderator) throw new HttpError(403, 'Tu ne peux pas déplacer ce travail vers un groupe dont tu ne fais pas partie.'); }
    changes = merged;
    if (!describeChanges(work, changes).length) throw new HttpError(400, 'Aucun changement à proposer.');
  }
  const reason = cleanText(req.body?.reason, LIMITS.reason);
  if (kind === 'delete' && !reason && !own) throw new HttpError(400, 'Indique pourquoi ce travail n’existe plus.');
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
  if (kind === 'work') { const target = await db().get<Work>('works', String(req.params.id)); if (!target || target.personal) throw new HttpError(404, 'Travail introuvable.'); }
  if (await overLimit('report:' + user.id, 20, 86400)) throw new HttpError(429, 'Trop de signalements aujourd’hui.');
  const report: Report = { id: id(), target: { kind, id: String(req.params.id) }, reason, by: user.id, at: now(), status: 'open' };
  await db().put('reports', report.id, report);
  const subject = kind === 'work' ? (await db().get<Work>('works', report.target.id))?.title ?? 'travail' : kind === 'delegate' ? 'délégué(e)' : 'correction';
  await notifyAdmins('reports', `Vencat : signalement (${subject})`, `${displayName(user)} a signalé ${kind === 'work' ? 'le travail' : kind === 'delegate' ? 'une déclaration de délégué(e)' : 'une correction'} « ${subject} ».\nMotif : ${reason}\n\nÀ traiter dans l’administration (/admin › Modération).`);
  res.json({ ok: true, message: 'Signalement envoyé. Merci.' });
}));
router.post('/travaux/work/:id/moderate', route(async (req, res) => {
  const { user } = await requireContributor(req);
  const work = await loadWork(String(req.params.id));
  if (work.personal) throw new HttpError(404, 'Travail introuvable.');
  if (!(await powers(user, work.scope)).moderator) throw new HttpError(403, 'Réservé aux délégué(e)s et à l’administration.');
  const action = req.body?.action, reason = cleanText(req.body?.reason, LIMITS.reason);
  if (action === 'validate') { work.forced = 'validated'; await history(work.id, user.id, 'validé par un(e) délégué(e)'); }
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
  const { user } = await requireContributor(req);
  if (!user.staff) throw new HttpError(403, 'Réservé aux enseignants.');
  const work = await loadWork(String(req.params.id));
  if (work.personal || work.state === 'removed') throw new HttpError(404, 'Travail introuvable.');
  work.teacherConfirmed = displayName(user); work.updatedAt = now();
  await db().put('works', work.id, work);
  await history(work.id, user.id, 'confirmé par l’enseignant');
  await settle(work, user.id);
  res.json(await workView(work, user, await users()));
}));

/** What waits for my opinion in my group: proposals I have not voted on. */
router.get('/travaux/queue', route(async (req, res) => {
  const { user } = await requireUser(req);
  if (!user.groupId) return res.json({ works: [], corrections: [], declarations: [] });
  const people = await users();
  const works = (await worksForGroup(user.groupId)).filter(work => work.state !== 'removed' && !work.personal);
  const pending: WorkView[] = [];
  for (const work of works) {
    if (work.authorId === user.id) continue;
    const votes = await votesOf(work.id);
    const view = await workView(work, user, people, { votes });
    const needsWork = (view.state === 'pending' || view.state === 'contested' || view.state === 'probable') && !votes[user.id];
    const needsProposal = view.proposal && !view.proposal.mine && view.proposal.myVote === undefined;
    if ((needsWork || needsProposal) && Date.parse(view.due) > Date.now() - 86400000) pending.push(view);
  }
  const declarations = (await db().list<Delegation>('delegations')).filter(item => item.groupId === user.groupId && item.status === 'requested' && item.userId !== user.id && !item.answers?.[user.id]).map(item => ({ id: item.id, name: displayName(people.get(item.userId)), title: item.title ?? 'titulaire', electedOn: item.electedOn, note: item.note ?? '', group: `${groupById(item.groupId)?.promotion} ${groupById(item.groupId)?.label}` }));
  const corrections = (await db().list<Correction>('corrections')).filter(item => item.groupId === user.groupId && item.status === 'open' && item.authorId !== user.id);
  const open = [];
  for (const item of corrections) { const votes = await votesOf(item.id); if (!votes[user.id]) open.push(await correctionView(item, user, people)); }
  res.json({ works: pending.sort((a, b) => a.due.localeCompare(b.due)), corrections: open, declarations });
}));

/** Group of a subscription link: its id (G1-…), any case, with or without .ics, or its path (mmi-2-b1). */
function groupFromFile(file: string) {
  const name = decodeURIComponent(file).trim().replace(/\.ics$/i, '');
  return groupById(name) ?? groupOptions.find(group => group.id.toLowerCase() === name.toLowerCase() || group.path.slice(1).replace(/\//g, '-') === name.toLowerCase());
}
// Subscription to every work of a group (calendar apps refresh it by themselves).
router.get('/travaux/ics/:file', route(async (req, res) => {
  const group = groupFromFile(String(req.params.file));
  if (!group) { res.status(404).type('text/plain; charset=utf-8').send('Groupe introuvable : ouvre Vencat, choisis ton groupe, puis Travaux › S’abonner pour copier le bon lien.'); return; }
  const groupId = group.id;
  const people = await users();
  const since = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const views = await Promise.all((await worksForGroup(groupId)).filter(work => work.day >= since).map(work => workView(work, undefined, people)));
  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', `inline; filename="${`travaux-${group.promotion}-${group.label}`.replace(/[^A-Za-z0-9-]+/g, '-')}.ics"`);
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=900');
  res.send(worksToIcs(`${group.promotion} ${group.label}`, views.filter(view => view.state !== 'contested'), origin(req)));
}));
