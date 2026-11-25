import { sendMail } from './mail.js';
import { settings } from './settings.js';

// Mails sent to the administration, by topic. Each topic has its own list of addresses, chosen in the administration
// (Notifications). Administrators (ADMIN_EMAILS) are not mailed by default: an empty list means nobody is mailed.
export const TOPICS = {
  feedback: { label: 'Retours et bugs', description: 'Un message envoyé avec le bouton de retour de la bêta (bug, idée, autre).' },
  reports: { label: 'Signalements', description: 'Un travail, un(e) délégué(e) ou une correction signalé par un élève.' },
  important: { label: 'Important', description: 'Déclaration de délégué à vérifier, demande de changement de nom, alerte sur un compte, mode « planning seul » activé ou coupé.' },
} as const;
export type Topic = keyof typeof TOPICS;
export const isTopic = (value: unknown): value is Topic => typeof value === 'string' && Object.prototype.hasOwnProperty.call(TOPICS, value);

export async function recipients(topic: Topic) { return (await settings()).notifyEmails?.[topic] ?? []; }
/** Mails the people of the topic. Never throws: a failing mail must not break the action that triggered it. */
export async function notifyAdmins(topic: Topic, subject: string, text: string, replyTo?: string) {
  let to: string[] = [];
  try { to = await recipients(topic); } catch { /* settings unreachable */ }
  const results = await Promise.allSettled(to.map(address => sendMail({ to: address, subject, text, replyTo })));
  return { to: to.length, sent: results.filter(result => result.status === 'fulfilled').length };
}
