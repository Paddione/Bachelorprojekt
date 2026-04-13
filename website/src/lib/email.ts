// Email helper using nodemailer.
// Uses Mailpit in dev (localhost:1025), real SMTP in prod.

import nodemailer from 'nodemailer';

const SMTP_HOST = process.env.SMTP_HOST || 'mailpit.workspace.svc.cluster.local';
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '1025');
const SMTP_SECURE = process.env.SMTP_SECURE === 'true';
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';
const FROM_EMAIL = process.env.FROM_EMAIL || process.env.CONTACT_EMAIL || '';
const FROM_NAME = process.env.FROM_NAME || process.env.BRAND_NAME || 'Workspace';
const CONTACT_PHONE = process.env.CONTACT_PHONE || '';
const PROD_DOMAIN = process.env.PROD_DOMAIN || '';

const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: SMTP_SECURE,
  connectionTimeout: 5_000,
  socketTimeout: 10_000,
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
    subject: `Ihre Registrierung bei ${FROM_NAME}`,
    text: `Hallo ${name},

vielen Dank für Ihre Registrierung bei ${FROM_NAME}.

Ihre Anfrage wird in Kürze geprüft. Sie erhalten eine separate E-Mail, sobald Ihr Zugang freigeschaltet wurde.

Bei Fragen erreichen Sie uns unter ${FROM_EMAIL}${CONTACT_PHONE ? ` oder ${CONTACT_PHONE}` : ''}.

Mit freundlichen Grüßen
${FROM_NAME}`,
    html: `<p>Hallo ${name},</p>
<p>vielen Dank für Ihre Registrierung bei ${FROM_NAME}.</p>
<p>Ihre Anfrage wird in Kürze geprüft. Sie erhalten eine separate E-Mail, sobald Ihr Zugang freigeschaltet wurde.</p>
<p>Bei Fragen erreichen Sie uns unter <a href="mailto:${FROM_EMAIL}">${FROM_EMAIL}</a>${CONTACT_PHONE ? ` oder ${CONTACT_PHONE}` : ''}.</p>
<p>Mit freundlichen Grüßen<br>${FROM_NAME}</p>`,
  });
}

export async function sendRegistrationApproved(email: string, name: string): Promise<boolean> {
  const loginUrl = PROD_DOMAIN ? `https://web.${PROD_DOMAIN}/` : '';
  return sendEmail({
    to: email,
    subject: `Ihr Zugang bei ${FROM_NAME} wurde freigeschaltet`,
    text: `Hallo ${name},

Ihr Zugang bei ${FROM_NAME} wurde freigeschaltet!

Sie erhalten in Kürze eine separate E-Mail mit einem Link, um Ihr Passwort festzulegen.
${loginUrl ? `\nDanach können Sie sich unter ${loginUrl} einloggen.\n` : ''}
Mit freundlichen Grüßen
${FROM_NAME}`,
    html: `<p>Hallo ${name},</p>
<p><strong>Ihr Zugang bei ${FROM_NAME} wurde freigeschaltet!</strong></p>
<p>Sie erhalten in Kürze eine separate E-Mail mit einem Link, um Ihr Passwort festzulegen.</p>
${loginUrl ? `<p>Danach können Sie sich unter <a href="${loginUrl}">${loginUrl}</a> einloggen.</p>` : ''}
<p>Mit freundlichen Grüßen<br>${FROM_NAME}</p>`,
  });
}

export async function sendRegistrationDeclined(email: string, name: string, reason?: string): Promise<boolean> {
  return sendEmail({
    to: email,
    subject: `Zu Ihrer Registrierung bei ${FROM_NAME}`,
    text: `Hallo ${name},

vielen Dank für Ihr Interesse an ${FROM_NAME}.

Leider können wir Ihre Registrierung derzeit nicht bestätigen.${reason ? `\n\nGrund: ${reason}` : ''}

Falls Sie Fragen haben, kontaktieren Sie uns gerne unter ${FROM_EMAIL}.

Mit freundlichen Grüßen
${FROM_NAME}`,
  });
}

export async function sendContactReply(email: string, name: string, replyText: string, threadId?: string): Promise<boolean> {
  return sendEmail({
    to: email,
    subject: `Antwort auf Ihre Anfrage bei ${FROM_NAME}`,
    text: `Hallo ${name},

${replyText}

Mit freundlichen Grüßen
${FROM_NAME}`,
    html: `<p>Hallo ${name},</p>
<p>${replyText.replace(/\n/g, '<br>')}</p>
<p>Mit freundlichen Grüßen<br>${FROM_NAME}</p>`,
    ...(threadId ? { headers: { 'X-Mattermost-Thread-Id': threadId } } : {}),
  });
}
