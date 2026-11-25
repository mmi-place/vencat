import { store } from './store.js';
import { sendMail } from './mail.js';
import { isAdmin, activeDelegations, now, type User } from './auth.js';
import { db, eraseAccount, type Proposal, type Report } from './common.js';

// Daily housekeeping (called by the monitor cron): nothing grows for ever, and personal data does not outlive its use.
// Each rule has its retention; every call is bounded so a serverless function never runs out of time.
const DAY = 86400_000;
const ago = (days: number) => new Date(Date.now() - days * DAY).toISOString();
export const RETENTION = { sessions: 60, reportsDone: 90, problems: 90, proposalsClosed: 90, audit: 365, history: 365, feedback: 365, inactiveWarn: 330, inactiveDelete: 365 } as const;
export interface Housekeeping { sessions: number; logins: number; adminLogins: number; adminSessions: number; problems: number; audit: number; history: number; feedback: number; reports: number; proposals: number; votes: number; warned: number; erased: number }

export async function housekeeping(maxAccounts = 100): Promise<Housekeeping> {
  const result: Housekeeping = { sessions: 0, logins: 0, adminLogins: 0, adminSessions: 0, problems: 0, audit: 0, history: 0, feedback: 0, reports: 0, proposals: 0, votes: 0, warned: 0, erased: 0 };
  const s = store();
  // Sign-in material and sessions that cannot be used any more.
  result.sessions = await s.purge('sessions', 'lastSeen', ago(RETENTION.sessions));
  result.logins = await s.purge('logins', 'expiresAt', ago(1));
  result.adminLogins = await s.purge('adminLogins', 'expiresAt', ago(1));
  result.adminSessions = await s.purge('adminSessions', 'expiresAt', now());
  // Journals and old reports.
  result.problems = await s.purge('problems', 'at', ago(RETENTION.problems));
  result.audit = await s.purge('audit', 'at', ago(RETENTION.audit));
  result.history = await s.purge('history', 'at', ago(RETENTION.history));
  result.feedback = await s.purge('feedback', 'at', ago(RETENTION.feedback));
  for (const report of (await s.list<Report>('reports')).filter(item => item.status === 'done' && item.at < ago(RETENTION.reportsDone))) { await s.delete('reports', report.id); result.reports++; }
  // Closed proposals and their votes (a vote is keyed « proposal:voter »).
  for (const proposal of (await s.list<Proposal>('proposals')).filter(item => item.status !== 'open' && (item.closedAt ?? item.createdAt) < ago(RETENTION.proposalsClosed))) {
    for (const vote of await s.list<{ targetId: string; userId: string }>('votes', proposal.id + ':')) { await s.delete('votes', `${vote.targetId}:${vote.userId}`); result.votes++; }
    await s.delete('proposals', proposal.id); result.proposals++;
  }
  // Inactive accounts: warned by mail after 11 months, erased after 12 (administrators and delegates are never erased).
  const people = (await s.list<User>('users')).filter(user => !user.deletedAt && user.email && !isAdmin(user));
  const inactive = people.map(user => ({ user, last: user.lastActiveAt ?? user.createdAt })).filter(item => item.last < ago(RETENTION.inactiveWarn)).sort((a, b) => a.last.localeCompare(b.last)).slice(0, maxAccounts);
  for (const { user, last } of inactive) {
    if ((await activeDelegations(user.id)).length) continue;
    if (last < ago(RETENTION.inactiveDelete) && user.inactiveWarnedAt && user.inactiveWarnedAt < ago(14)) { await eraseAccount(user); result.erased++; continue; }
    if (!user.inactiveWarnedAt && last < ago(RETENTION.inactiveWarn)) {
      try {
        await sendMail({ to: user.email!, subject: 'Vencat : ton compte sera supprimé s’il reste inactif', text: `Bonjour ${user.firstName || ''},\n\nTu ne t’es pas connecté(e) à Vencat depuis près d’un an. Sans connexion dans les 2 prochaines semaines, ton compte sera supprimé : ton adresse, ton nom, tes cases « Fait » et tes notes seront effacés (tes contributions resteront, signées « Ancien étudiant »).\n\nPour le garder, connecte-toi simplement sur vencat.mmi.place.\n\nVencat est un projet étudiant non officiel.` });
        user.inactiveWarnedAt = now(); await db().put('users', user.id, user); result.warned++;
      } catch { /* the next pass tries again */ }
    }
  }
  return result;
}
