// Email helper using nodemailer.
// Uses Mailpit in dev (localhost:1025), real SMTP in prod.

import nodemailer from 'nodemailer';

const SMTP_HOST = process.env.SMTP_HOST || 'mailpit.workspace.svc.cluster.local';
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '1025');
const SMTP_SECURE = process.env.SMTP_SECURE === 'true';
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';
const FROM_EMAIL = process.env.FROM_EMAIL || '${CONTACT_EMAIL}';
const FROM_NAME = process.env.FROM_NAME || '${BRAND_NAME}';

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
    subject: 'Ihre Registrierung bei ${BRAND_NAME}',
    text: `Hallo ${name},

vielen Dank fur Ihre Registrierung bei ${BRAND_NAME}.

Ihre Anfrage wird in Kurze gepruft. Sie erhalten eine separate E-Mail, sobald Ihr Zugang freigeschaltet wurde.

Bei Fragen erreichen Sie uns unter ${CONTACT_EMAIL} oder ${CONTACT_PHONE}.

Mit freundlichen Grussen
${BRAND_NAME}`,
    html: `<p>Hallo ${name},</p>
<p>vielen Dank fur Ihre Registrierung bei ${BRAND_NAME}.</p>
<p>Ihre Anfrage wird in Kurze gepruft. Sie erhalten eine separate E-Mail, sobald Ihr Zugang freigeschaltet wurde.</p>
<p>Bei Fragen erreichen Sie uns unter <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a> oder ${CONTACT_PHONE}.</p>
<p>Mit freundlichen Grussen<br>${BRAND_NAME}</p>`,
  });
}

export async function sendRegistrationApproved(email: string, name: string): Promise<boolean> {
  return sendEmail({
    to: email,
    subject: 'Ihr Zugang bei ${BRAND_NAME} wurde freigeschaltet',
    text: `Hallo ${name},

Ihr Zugang bei ${BRAND_NAME} wurde freigeschaltet!

Sie erhalten in Kurze eine separate E-Mail mit einem Link, um Ihr Passwort festzulegen.

Danach konnen Sie sich unter https://web.${PROD_DOMAIN}/ einloggen.

Mit freundlichen Grussen
${BRAND_NAME}`,
    html: `<p>Hallo ${name},</p>
<p><strong>Ihr Zugang bei ${BRAND_NAME} wurde freigeschaltet!</strong></p>
<p>Sie erhalten in Kurze eine separate E-Mail mit einem Link, um Ihr Passwort festzulegen.</p>
<p>Danach konnen Sie sich unter <a href="https://web.${PROD_DOMAIN}/">web.${PROD_DOMAIN}</a> einloggen.</p>
<p>Mit freundlichen Grussen<br>${BRAND_NAME}</p>`,
  });
}

export async function sendRegistrationDeclined(email: string, name: string, reason?: string): Promise<boolean> {
  return sendEmail({
    to: email,
    subject: 'Zu Ihrer Registrierung bei ${BRAND_NAME}',
    text: `Hallo ${name},

vielen Dank fur Ihr Interesse an ${BRAND_NAME}.

Leider konnen wir Ihre Registrierung derzeit nicht bestatigen.${reason ? `\n\nGrund: ${reason}` : ''}

Falls Sie Fragen haben, kontaktieren Sie uns gerne unter ${CONTACT_EMAIL}.

Mit freundlichen Grussen
${BRAND_NAME}`,
  });
}

export async function sendContactReply(email: string, name: string, replyText: string, threadId?: string): Promise<boolean> {
  return sendEmail({
    to: email,
    subject: 'Antwort auf Ihre Anfrage bei ${BRAND_NAME}',
    text: `Hallo ${name},

${replyText}

Mit freundlichen Grussen
${BRAND_NAME}`,
    html: `<p>Hallo ${name},</p>
<p>${replyText.replace(/\n/g, '<br>')}</p>
<p>Mit freundlichen Grussen<br>${BRAND_NAME}</p>`,
    ...(threadId ? { headers: { 'X-Mattermost-Thread-Id': threadId } } : {}),
  });
}
