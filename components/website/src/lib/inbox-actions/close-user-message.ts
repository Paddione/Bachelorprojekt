// components/website/src/lib/inbox-actions/close-user-message.ts
// Extrahiert aus pages/api/admin/inbox/[id]/action.ts (F3/A4). Verbatim, nur Signatur neu.
import { updateInboxItemStatus } from '../messaging-db';
import type { InboxActionHandler } from './types';

export const closeUserMessage: InboxActionHandler = async (ctx, _item, id) => {
  await updateInboxItemStatus(id, 'actioned', ctx.session.preferred_username);
  return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } });
};
