// website/src/lib/tickets/email-templates.ts
import { sendEmail } from '../email';

const FROM_NAME = process.env.FROM_NAME || process.env.BRAND_NAME || 'Workspace';
const PROD_DOMAIN = process.env.PROD_DOMAIN || '';
const BRAND = process.env.BRAND || 'mentolder';
const INFO_EMAIL = PROD_DOMAIN ? `info@${PROD_DOMAIN}` : `info@${BRAND}.de`;

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
${p.note ? `<p><em>Anmerkung:</em> ${p.note}</p>` : ''}
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
