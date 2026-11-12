// components/website/src/lib/inbox-actions/finalize-meeting.ts
// Extrahiert aus pages/api/admin/inbox/[id]/action.ts (F3/A4). Verbatim, nur Signatur neu.
import { updateInboxItemStatus } from '../messaging-db';
import type { InboxActionHandler } from './types';

const SITE_URL = process.env.SITE_URL || '';

export const finalizeMeeting: InboxActionHandler = async (ctx, item, id) => {
  const { session } = ctx;
  const p = item.payload as {
    customerName: string; customerEmail: string; meetingType: string;
    meetingDate: string; roomToken?: string; projectId?: string;
  };
  const res = await fetch(`${SITE_URL}/api/meeting/finalize`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // F4: Admin-Server ruft als interner Aufrufer mit Shared Secret auf.
      ...(process.env.MEETING_INTERNAL_TOKEN
        ? { Authorization: `Bearer ${process.env.MEETING_INTERNAL_TOKEN}` }
        : {}),
    },
    body: JSON.stringify({
      customerName: p.customerName, customerEmail: p.customerEmail,
      meetingType: p.meetingType, meetingDate: p.meetingDate,
      roomToken: p.roomToken ?? undefined,
      projectId: p.projectId ?? undefined,
    }),
  });
  if (!res.ok) {
    return new Response(JSON.stringify({ error: 'Meeting-Finalisierung fehlgeschlagen.' }), { status: 500 });
  }
  const data = await res.json() as { results?: string[] };
  await updateInboxItemStatus(id, 'actioned', session.preferred_username);
  return new Response(JSON.stringify({ success: true, results: data.results ?? [] }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
