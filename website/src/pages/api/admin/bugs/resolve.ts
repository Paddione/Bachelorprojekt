import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { resolveBugTicket } from '../../../../lib/website-db';
import { buildBackUrl, buildErrorUrl } from './_helpers';

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response(null, { status: 403 });
  }

  const form = await request.formData();
  const ticketId = form.get('ticketId')?.toString().trim() ?? '';
  const resolutionNote = form.get('resolutionNote')?.toString().trim() ?? '';
  const status = form.get('status')?.toString() ?? '';
  const category = form.get('category')?.toString() ?? '';
  const q = form.get('q')?.toString() ?? '';

  const backUrl = buildBackUrl({ status, category, q });

  if (!ticketId || !resolutionNote) {
    return Response.redirect(buildErrorUrl(backUrl, 'Ticket-ID+und+L%C3%B6sungshinweis+sind+erforderlich'), 303);
  }
  if (resolutionNote.length > 1000) {
    return Response.redirect(buildErrorUrl(backUrl, 'L%C3%B6sungshinweis+zu+lang+(max.+1000+Zeichen)'), 303);
  }

  try {
    await resolveBugTicket(ticketId, resolutionNote);
  } catch (err) {
    console.error('[bugs/resolve] DB error:', err);
    return Response.redirect(buildErrorUrl(backUrl, 'Datenbankfehler'), 303);
  }

  return Response.redirect(backUrl, 303);
};
