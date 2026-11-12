// components/website/src/lib/inbox-actions/archive-contact.ts
// Extrahiert aus pages/api/admin/inbox/[id]/action.ts (F3/A4). Verbatim, nur Signatur neu.
import { updateInboxItemStatus } from '../messaging-db';
import type { InboxActionHandler } from './types';

export const archiveContact: InboxActionHandler = async (ctx, _item, id) => {
  await updateInboxItemStatus(id, 'archived', ctx.session.preferred_username);
  return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } });
};
