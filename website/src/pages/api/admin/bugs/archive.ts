import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { appendBugTicketComment, archiveBugTicket } from '../../../../lib/website-db';
import { buildBackUrl, buildErrorUrl } from './_helpers';

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response(null, { status: 403 });
  }

  const isJson = (request.headers.get('content-type') ?? '').includes('application/json');

  let ticketId = '';
  let status = '', category = '', q = '';

  if (isJson) {
    try {
      const body = await request.json();
      ticketId = String(body?.ticketId ?? '').trim();
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400 });
    }
  } else {
    const form = await request.formData();
    ticketId = form.get('ticketId')?.toString().trim() ?? '';
    status = form.get('status')?.toString() ?? '';
    category = form.get('category')?.toString() ?? '';
    q = form.get('q')?.toString() ?? '';
  }

  const backUrl = buildBackUrl({ status, category, q });

  if (!ticketId) {
    if (isJson) {
      return new Response(JSON.stringify({ error: 'Ticket-ID fehlt' }), { status: 400 });
    }
    return Response.redirect(buildErrorUrl(backUrl, 'Ticket-ID+fehlt'), 303);
  }

  try {
    await archiveBugTicket(ticketId);
    await appendBugTicketComment({
      ticketId,
      author: session.preferred_username,
      kind: 'status_change',
      body: 'archived',
    }).catch(() => {/* best-effort */});
  } catch (err) {
    console.error('[bugs/archive] DB error:', err);
    if (isJson) {
      return new Response(JSON.stringify({ error: 'Datenbankfehler' }), { status: 500 });
    }
    return Response.redirect(buildErrorUrl(backUrl, 'Datenbankfehler'), 303);
  }

  if (isJson) {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return Response.redirect(backUrl, 303);
};
