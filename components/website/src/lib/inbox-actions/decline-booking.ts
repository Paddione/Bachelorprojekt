// components/website/src/lib/inbox-actions/decline-booking.ts
// Extrahiert aus pages/api/admin/inbox/[id]/action.ts (F3/A4). Verbatim, nur Signatur neu.
import { sendEmail } from '../email';
import { updateInboxItemStatus } from '../messaging-db';
import type { InboxActionHandler } from './types';

const BRAND_NAME = process.env.BRAND_NAME || 'Workspace';
const PROD_DOMAIN = process.env.PROD_DOMAIN || '';

export const declineBooking: InboxActionHandler = async (ctx, item, id) => {
  const { session, request } = ctx;
  const p = item.payload as { name: string; email: string; typeLabel: string; slotDisplay: string; date: string };
  const dateFormatted = new Date(p.date + 'T00:00:00').toLocaleDateString('de-DE', {
    weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric',
  });
  await sendEmail({
    to: p.email,
    subject: `Zu Ihrer Terminanfrage bei ${BRAND_NAME}`,
    text: `Hallo ${p.name},\n\nleider können wir den angefragten Termin (${p.typeLabel} am ${dateFormatted}, ${p.slotDisplay}) nicht bestätigen.\n\nBitte wählen Sie einen alternativen Termin unter https://web.${PROD_DOMAIN}/termin oder kontaktieren Sie uns direkt.\n\nMit freundlichen Grüßen\n${BRAND_NAME}`,
  }, request);
  await updateInboxItemStatus(id, 'actioned', session.preferred_username);
  return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } });
};
