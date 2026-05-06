import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { appendBugTicketComment, resolveBugTicket } from '../../../../lib/website-db';
import { buildBackUrl, buildErrorUrl } from './_helpers';

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response(null, { status: 403 });
  }

  const isJson = (request.headers.get('content-type') ?? '').includes('application/json');

  let ticketId = '';
  let resolutionNote = '';
  let status = '', category = '', q = '';

  if (isJson) {
    try {
      const body = await request.json();
      ticketId = String(body?.ticketId ?? '').trim();
      resolutionNote = String(body?.resolutionNote ?? '').trim();
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400 });
    }
  } else {
    const form = await request.formData();
    ticketId = form.get('ticketId')?.toString().trim() ?? '';
    resolutionNote = form.get('resolutionNote')?.toString().trim() ?? '';
    status = form.get('status')?.toString() ?? '';
    category = form.get('category')?.toString() ?? '';
    q = form.get('q')?.toString() ?? '';
  }

  const backUrl = buildBackUrl({ status, category, q });

  if (!ticketId || !resolutionNote) {
    if (isJson) {
      return new Response(JSON.stringify({ error: 'Ticket-ID und Lösungshinweis sind erforderlich' }), { status: 400 });
    }
    return Response.redirect(buildErrorUrl(backUrl, 'Ticket-ID+und+L%C3%B6sungshinweis+sind+erforderlich'), 303);
  }
  if (resolutionNote.length > 1000) {
    if (isJson) {
      return new Response(JSON.stringify({ error: 'Lösungshinweis zu lang (max. 1000 Zeichen)' }), { status: 400 });
    }
    return Response.redirect(buildErrorUrl(backUrl, 'L%C3%B6sungshinweis+zu+lang+(max.+1000+Zeichen)'), 303);
  }

  try {
    await resolveBugTicket(ticketId, resolutionNote);
    await appendBugTicketComment({
      ticketId,
      author: session.preferred_username,
      kind: 'status_change',
      body: `resolved: ${resolutionNote}`,
    }).catch(() => {/* status_change comment is best-effort, don't fail the resolve */});
  } catch (err) {
    console.error('[bugs/resolve] DB error:', err);
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
