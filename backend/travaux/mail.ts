// Mails go through the Oracle SMTP server (nodemailer). Without SMTP settings, development logs the message
// in the console so sign-in still works locally.
export interface Mail { to: string; subject: string; text: string; html?: string }
const smtpPassword = () => process.env.SMTP_PASSWORD || process.env.SMTP_PASS;
export const mailConfigured = () => !!(process.env.SMTP_HOST && process.env.SMTP_USER && smtpPassword());
/** Sender: SMTP_FROM, or SMTP_SENDER_NAME <SMTP_ADMIN_EMAIL> (approved sender of the Oracle Email Delivery). */
const sender = () => process.env.SMTP_FROM || `${process.env.SMTP_SENDER_NAME || 'Vencat'} <${process.env.SMTP_ADMIN_EMAIL || process.env.SMTP_USER}>`;
let transport: Promise<{ sendMail(mail: Record<string, unknown>): Promise<unknown> }> | undefined;
export const sentMails: Mail[] = [];

export async function sendMail(mail: Mail): Promise<void> {
  // Automated tests never reach the real SMTP server.
  // MAIL_LOG_ONLY (development only): addresses matching this pattern get the mail in the console instead.
  const logOnly = process.env.NODE_ENV !== 'production' && !!process.env.MAIL_LOG_ONLY && new RegExp(process.env.MAIL_LOG_ONLY, 'i').test(mail.to);
  const testing = process.env.NODE_ENV === 'test' || !!process.env.NODE_TEST_CONTEXT || logOnly;
  if (!mailConfigured() || testing) {
    if (process.env.NODE_ENV === 'production') throw new Error('Envoi des mails non configuré.');
    sentMails.push(mail); if (sentMails.length > 50) sentMails.shift();
    if (!testing) console.log(`\n[mail de développement] à ${mail.to} · ${mail.subject}\n${mail.text}\n`);
    return;
  }
  transport ??= import('nodemailer').then(({ default: nodemailer }) => nodemailer.createTransport({
    host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT || 587), secure: Number(process.env.SMTP_PORT) === 465,
    auth: { user: process.env.SMTP_USER, pass: smtpPassword() },
  }));
  await (await transport).sendMail({ from: sender(), replyTo: process.env.CONTACT_EMAIL || undefined, to: mail.to, subject: mail.subject, text: mail.text, html: mail.html });
}

const escape = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
export function loginMail(to: string, code: string, link: string, device: string): Mail {
  const text = `Bonjour,\n\nVoici ton code de connexion à Vencat : ${code}\n\nTu peux aussi ouvrir ce lien sur l’appareil de ton choix :\n${link}\n\nDemande faite depuis : ${device}\nLe code et le lien sont valables 10 minutes. Si tu n’es pas à l’origine de cette demande, ignore ce mail.\n\nVencat est un projet étudiant non officiel.`;
  const html = `<p>Bonjour,</p><p>Voici ton code de connexion à Vencat :</p><p style="font-size:28px;font-weight:700;letter-spacing:.2em">${escape(code)}</p><p><a href="${escape(link)}">Se connecter avec ce lien</a></p><p style="color:#666">Demande faite depuis : ${escape(device)}. Le code et le lien sont valables 10 minutes. Si tu n’es pas à l’origine de cette demande, ignore ce mail.</p><p style="color:#666">Vencat est un projet étudiant non officiel.</p>`;
  return { to, subject: `Code Vencat : ${code}`, text, html };
}
