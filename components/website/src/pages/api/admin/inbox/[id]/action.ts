// components/website/src/pages/api/admin/inbox/[id]/action.ts
// F3/A4 (bp-api-handler-fanout): ADR-013-Muster — Router bleibt dünn (eine Zeile
// pro Aktion), Domänenlogik liegt in lib/inbox-actions/*. Reine Verschiebung.
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../lib/auth';
import { getInboxItem, deleteInboxItem } from '../../../../../lib/messaging-db';
import { approveRegistration } from '../../../../../lib/inbox-actions/approve-registration';
import { declineRegistration } from '../../../../../lib/inbox-actions/decline-registration';
import { approveBooking } from '../../../../../lib/inbox-actions/approve-booking';
import { declineBooking } from '../../../../../lib/inbox-actions/decline-booking';
import { archiveContact } from '../../../../../lib/inbox-actions/archive-contact';
import { resolveBug } from '../../../../../lib/inbox-actions/resolve-bug';
import { closeUserMessage } from '../../../../../lib/inbox-actions/close-user-message';
import { finalizeMeeting } from '../../../../../lib/inbox-actions/finalize-meeting';

export const POST: APIRoute = async ({ request, params , locals }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const id = parseInt(params.id!, 10);
  if (isNaN(id)) {
    return new Response(JSON.stringify({ error: 'Invalid ID' }), { status: 400 });
  }

  const item = await getInboxItem(id);
  if (!item) {
    return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
  }

  const body = await request.json() as { action: string; note?: string };
  const { action, note } = body;

  // `delete` is the unconditional escape hatch — it bypasses the
  // "Already actioned" lock so admins can clear rows stuck in `actioned`
  // or `archived` (the only paths that previously had no remediation).
  // It deletes the row outright; nothing else changes for it.
  if (action === 'delete') {
    const deleted = await deleteInboxItem(id);
    if (deleted === 0) {
      return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
    }
    return new Response(null, { status: 204 });
  }

  if (item.status !== 'pending') {
    return new Response(JSON.stringify({ error: 'Already actioned' }), { status: 409 });
  }

  try {
    const ctx = { session, request, requestLogger: locals.requestLogger, note };
    switch (action) {
      case 'approve_registration': return approveRegistration(ctx, item, id);
      case 'decline_registration': return declineRegistration(ctx, item, id);
      case 'approve_booking':       return approveBooking(ctx, item, id);
      case 'decline_booking':       return declineBooking(ctx, item, id);
      case 'archive_contact':       return archiveContact(ctx, item, id);
      case 'resolve_bug':           return resolveBug(ctx, item, id);
      case 'close_user_message':    return closeUserMessage(ctx, item, id);
      case 'finalize_meeting':      return finalizeMeeting(ctx, item, id);
      default:
        return new Response(JSON.stringify({ error: `Unbekannte Aktion: ${action}` }), { status: 400 });
    }
  } catch (err) {
    locals.requestLogger.error({ err }, '[inbox action ${action}] id=${id}');
    return new Response(JSON.stringify({ error: 'Interner Serverfehler.' }), { status: 500 });
  }
};
