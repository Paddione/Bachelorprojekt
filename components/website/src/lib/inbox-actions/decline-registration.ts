// components/website/src/lib/inbox-actions/decline-registration.ts
// Extrahiert aus pages/api/admin/inbox/[id]/action.ts (F3/A4). Verbatim, nur Signatur neu.
import { sendRegistrationDeclined } from '../email';
import { updateInboxItemStatus } from '../messaging-db';
import type { InboxActionHandler } from './types';

export const declineRegistration: InboxActionHandler = async (ctx, item, id) => {
  const { session, request } = ctx;
  const p = item.payload as { email: string; firstName: string; lastName: string };
  await sendRegistrationDeclined(p.email, `${p.firstName} ${p.lastName}`, undefined, request);
  await updateInboxItemStatus(id, 'actioned', session.preferred_username);
  return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } });
};
