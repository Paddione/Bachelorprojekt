// components/website/src/lib/inbox-actions/resolve-bug.ts
// Extrahiert aus pages/api/admin/inbox/[id]/action.ts (F3/A4). Verbatim, nur Signatur neu.
import { resolveBugTicket } from '../website-db';
import { updateInboxItemStatus } from '../messaging-db';
import type { InboxActionHandler } from './types';

export const resolveBug: InboxActionHandler = async (ctx, item, id) => {
  const { session, request, note } = ctx;
  const resolveNote = note?.trim() ?? '';
  if (!resolveNote) {
    return new Response(JSON.stringify({ error: 'Bitte geben Sie eine Notiz an.' }), { status: 400 });
  }
  if (resolveNote.length > 500) {
    return new Response(JSON.stringify({ error: 'Max. 500 Zeichen.' }), { status: 400 });
  }
  const p = item.payload as { ticketId: string; reporterEmail: string; brand: string };
  await resolveBugTicket(p.ticketId, resolveNote,
    { label: session.preferred_username }, request);
  // No manual sendEmail() here — transitionTicket() handles the close-mail.
  await updateInboxItemStatus(id, 'actioned', session.preferred_username);
  return new Response(JSON.stringify({ success: true }),
    { headers: { 'Content-Type': 'application/json' } });
};
