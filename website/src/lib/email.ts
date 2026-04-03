// Email helper using nodemailer.
// Uses Mailpit in dev (localhost:1025), real SMTP in prod.

import nodemailer from 'nodemailer';

const SMTP_HOST = import.meta.env.SMTP_HOST || 'mailpit.workspace.svc.cluster.local';
const SMTP_PORT = parseInt(import.meta.env.SMTP_PORT || '1025');
const SMTP_SECURE = import.meta.env.SMTP_SECURE === 'true';
const SMTP_USER = import.meta.env.SMTP_USER || '';
const SMTP_PASS = import.meta.env.SMTP_PASS || '';
const FROM_EMAIL = import.meta.env.FROM_EMAIL || 'info@mentolder.de';
const FROM_NAME = import.meta.env.FROM_NAME || 'mentolder.de';

const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: SMTP_SECURE,
  ...(SMTP_USER ? { auth: { user: SMTP_USER, pass: SMTP_PASS } } : {}),
});

interface SendEmailParams {
  to: string;
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
  headers?: Record<string, string>;
}

export async function sendEmail(params: SendEmailParams): Promise<boolean> {
  try {
    await transporter.sendMail({
      from: `"${FROM_NAME}" <${FROM_EMAIL}>`,
      to: params.to,
      subject: params.subject,
      text: params.text,
      html: params.html,
      replyTo: params.replyTo,
      headers: params.headers,
    });
    return true;
  } catch (err) {
    console.error('[email] Failed to send:', err);
    return false;
  }
}

export async function sendRegistrationConfirmation(email: string, name: string): Promise<boolean> {
  return sendEmail({
    to: email,
    subject: 'Ihre Registrierung bei mentolder.de',
    text: `Hallo ${name},

vielen Dank fur Ihre Registrierung bei mentolder.de.

Ihre Anfrage wird in Kurze gepruft. Sie erhalten eine separate E-Mail, sobald Ihr Zugang freigeschaltet wurde.

Bei Fragen erreichen Sie uns unter info@mentolder.de oder +49 151 508 32 601.

Mit freundlichen Grussen
mentolder.de`,
    html: `<p>Hallo ${name},</p>
<p>vielen Dank fur Ihre Registrierung bei mentolder.de.</p>
<p>Ihre Anfrage wird in Kurze gepruft. Sie erhalten eine separate E-Mail, sobald Ihr Zugang freigeschaltet wurde.</p>
<p>Bei Fragen erreichen Sie uns unter <a href="mailto:info@mentolder.de">info@mentolder.de</a> oder +49 151 508 32 601.</p>
<p>Mit freundlichen Grussen<br>mentolder.de</p>`,
  });
}

export async function sendRegistrationApproved(email: string, name: string): Promise<boolean> {
  return sendEmail({
    to: email,
    subject: 'Ihr Zugang bei mentolder.de wurde freigeschaltet',
    text: `Hallo ${name},

Ihr Zugang bei mentolder.de wurde freigeschaltet!

Sie erhalten in Kurze eine separate E-Mail mit einem Link, um Ihr Passwort festzulegen.

Danach konnen Sie sich unter https://web.korczewski.de/ einloggen.

Mit freundlichen Grussen
mentolder.de`,
    html: `<p>Hallo ${name},</p>
<p><strong>Ihr Zugang bei mentolder.de wurde freigeschaltet!</strong></p>
<p>Sie erhalten in Kurze eine separate E-Mail mit einem Link, um Ihr Passwort festzulegen.</p>
<p>Danach konnen Sie sich unter <a href="https://web.korczewski.de/">web.korczewski.de</a> einloggen.</p>
<p>Mit freundlichen Grussen<br>mentolder.de</p>`,
  });
}

export async function sendRegistrationDeclined(email: string, name: string, reason?: string): Promise<boolean> {
  return sendEmail({
    to: email,
    subject: 'Zu Ihrer Registrierung bei mentolder.de',
    text: `Hallo ${name},

vielen Dank fur Ihr Interesse an mentolder.de.

Leider konnen wir Ihre Registrierung derzeit nicht bestatigen.${reason ? `\n\nGrund: ${reason}` : ''}

Falls Sie Fragen haben, kontaktieren Sie uns gerne unter info@mentolder.de.

Mit freundlichen Grussen
mentolder.de`,
  });
}

export async function sendContactReply(email: string, name: string, replyText: string, threadId?: string): Promise<boolean> {
  return sendEmail({
    to: email,
    subject: 'Antwort auf Ihre Anfrage bei mentolder.de',
    text: `Hallo ${name},

${replyText}

Mit freundlichen Grussen
mentolder.de`,
    html: `<p>Hallo ${name},</p>
<p>${replyText.replace(/\n/g, '<br>')}</p>
<p>Mit freundlichen Grussen<br>mentolder.de</p>`,
    ...(threadId ? { headers: { 'X-Mattermost-Thread-Id': threadId } } : {}),
  });
}
