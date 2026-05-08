// website/src/lib/tickets/email-templates.ts
import { sendEmail } from '../email';

const FROM_NAME = process.env.FROM_NAME || process.env.BRAND_NAME || 'Workspace';
const PROD_DOMAIN = process.env.PROD_DOMAIN || '';
const BRAND = process.env.BRAND || 'mentolder';
const INFO_EMAIL = PROD_DOMAIN ? `info@${PROD_DOMAIN}` : `info@${BRAND}.de`;

const escHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export interface CloseEmailParams {
  externalId: string;
  reporterEmail: string;
  resolution: string;             // 'fixed' | 'shipped' | 'wontfix' | 'duplicate' | 'cant_reproduce' | 'obsolete'
  note?: string;                   // optional public note
  publicStatusUrl?: string;        // e.g. https://web.mentolder.de/portal/tickets/BR-…
}

const RESOLUTION_LABELS_DE: Record<string, string> = {
  fixed:         'behoben',
  shipped:       'umgesetzt',
  wontfix:       'nicht umgesetzt',
  duplicate:     'als Duplikat geschlossen',
  cant_reproduce:'nicht reproduzierbar',
  obsolete:      'nicht mehr relevant',
};

export async function sendBugCloseEmail(p: CloseEmailParams): Promise<boolean> {
  if (!p.reporterEmail) return false;
  const label = RESOLUTION_LABELS_DE[p.resolution] ?? p.resolution;

  const text = `Hallo,

Ihre Meldung mit der Nummer ${p.externalId} wurde ${label}.
${p.note ? `\nAnmerkung: ${p.note}\n` : ''}
${p.publicStatusUrl ? `Status & Verlauf: ${p.publicStatusUrl}\n\n` : ''}
Vielen Dank für Ihren Beitrag.

Mit freundlichen Grüßen
${FROM_NAME}`;

  const html = `<p>Hallo,</p>
<p>Ihre Meldung mit der Nummer <strong>${p.externalId}</strong> wurde <strong>${label}</strong>.</p>
${p.note ? `<p><em>Anmerkung:</em> ${escHtml(p.note)}</p>` : ''}
${p.publicStatusUrl ? `<p>Status &amp; Verlauf: <a href="${p.publicStatusUrl}">${p.publicStatusUrl}</a></p>` : ''}
<p>Vielen Dank für Ihren Beitrag.</p>
<p>Mit freundlichen Grüßen<br>${FROM_NAME}</p>`;

  return sendEmail({
    to: p.reporterEmail,
    bcc: INFO_EMAIL,
    replyTo: INFO_EMAIL,
    subject: `[${p.externalId}] Ihre Meldung wurde bearbeitet`,
    text,
    html,
  });
}

export async function sendPublicCommentEmail(p: {
  externalId: string;
  reporterEmail: string;
  body: string;
}): Promise<boolean> {
  const BRAND_NAME    = process.env.BRAND_NAME    ?? 'mentolder';
  const PROD_DOMAIN   = process.env.PROD_DOMAIN   ?? 'mentolder.de';
  const CONTACT_EMAIL = process.env.CONTACT_EMAIL ?? `info@${PROD_DOMAIN}`;
  try {
    await sendEmail({
      to: p.reporterEmail,
      bcc: CONTACT_EMAIL,
      replyTo: CONTACT_EMAIL,
      subject: `[${p.externalId}] Antwort vom ${BRAND_NAME}-Team`,
      text:
`Hallo,

zu Ihrer Meldung ${p.externalId} gibt es eine neue Nachricht vom Team:

${p.body}

Antworten Sie einfach auf diese E-Mail, um zurückzuschreiben.

Mit freundlichen Grüßen
${BRAND_NAME}`,
    });
    return true;
  } catch (err) {
    console.error('[sendPublicCommentEmail] failed:', err);
    return false;
  }
}
