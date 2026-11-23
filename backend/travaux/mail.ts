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
  await (await transport).sendMail({ from: sender(), replyTo: process.env.CONTACT_EMAIL || undefined, to: mail.to, subject: mail.subject, text: mail.text, html: mail.html ?? textToHtml(mail.subject, mail.text) });
}

const escape = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);

// Table layout with inline styles: the only form that renders the same in Gmail, Outlook, Apple Mail and webmails.
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
export function layout(preheader: string, content: string) {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark"><title>Vencat</title></head>
<body style="margin:0;padding:0;background:#f2f1f8;font-family:${FONT};color:#17152a">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escape(preheader)}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f2f1f8"><tr><td align="center" style="padding:28px 12px">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px">
<tr><td style="padding:0 4px 14px"><table role="presentation" cellspacing="0" cellpadding="0"><tr><td style="width:34px;height:34px;border-radius:10px;background:#5b3fc4;color:#ffffff;font-weight:800;font-size:18px;text-align:center;line-height:34px">V</td><td style="padding-left:10px;font-size:18px;font-weight:800;color:#17152a">Vencat</td></tr></table></td></tr>
<tr><td style="background:#ffffff;border-radius:18px;padding:30px 28px;border:1px solid #e3e0f0">${content}</td></tr>
<tr><td style="padding:16px 8px;font-size:12px;line-height:18px;color:#6b6885;text-align:center">Vencat est un projet étudiant non officiel de MMI Place.<br>Tu reçois ce mail parce que ton adresse universitaire a été utilisée sur Vencat.</td></tr>
</table></td></tr></table></body></html>`;
}
const paragraph = (text: string) => `<p style="margin:0 0 14px;font-size:15px;line-height:23px;color:#2b2840">${escape(text).replace(/\n/g, '<br>')}</p>`;
/** HTML version of a plain mail: paragraphs in the Vencat layout. */
export const textToHtml = (subject: string, text: string) => layout(subject, `<h1 style="margin:0 0 18px;font-size:20px;line-height:26px;color:#17152a">${escape(subject.replace(/^\[TEST\]\s*/, '').replace(/^Vencat\s*:\s*/, ''))}</h1>${text.split(/\n{2,}/).map(paragraph).join('')}`);

export function loginMail(to: string, code: string, link: string, device: string): Mail {
  const text = `Bonjour,\n\nVoici ton code de connexion à Vencat : ${code}\n\nTu peux aussi ouvrir ce lien sur l’appareil de ton choix :\n${link}\n\nDemande faite depuis : ${device}\nLe code et le lien sont valables 10 minutes. Si tu n’es pas à l’origine de cette demande, ignore ce mail : personne ne peut se connecter sans ce code.\n\nVencat est un projet étudiant non officiel.`;
  const spaced = `${code.slice(0, 3)}&nbsp;${code.slice(3)}`;
  const html = layout(`Ton code : ${code} · valable 10 minutes`, `
<h1 style="margin:0 0 8px;font-size:22px;line-height:28px;color:#17152a">Ton code de connexion</h1>
<p style="margin:0 0 22px;font-size:15px;line-height:22px;color:#5d5a75">Saisis-le sur l’écran de connexion. Il est valable 10 minutes.</p>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="background:#f3effe;border-radius:14px;padding:20px 10px;font-family:'SF Mono',Menlo,Consolas,monospace;font-size:38px;line-height:44px;font-weight:800;letter-spacing:8px;color:#3a2a8c">${spaced}</td></tr></table>
<p style="margin:24px 0 12px;font-size:15px;line-height:22px;color:#5d5a75;text-align:center">ou</p>
<table role="presentation" cellspacing="0" cellpadding="0" align="center"><tr><td style="border-radius:12px;background:#5b3fc4"><a href="${escape(link)}" style="display:inline-block;padding:14px 26px;font-size:16px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:12px">Se connecter en un clic</a></td></tr></table>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:28px"><tr><td style="border-top:1px solid #ece9f5;padding-top:16px;font-size:13px;line-height:20px;color:#6b6885"><strong style="color:#2b2840">Demande faite depuis :</strong> ${escape(device)}<br>Ce n’est pas toi ? Ignore ce mail : personne ne peut se connecter sans ce code.</td></tr></table>`);
  return { to, subject: `${code} est ton code Vencat`, text, html };
}
