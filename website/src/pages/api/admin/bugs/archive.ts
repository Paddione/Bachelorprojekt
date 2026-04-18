import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { archiveBugTicket } from '../../../../lib/website-db';
import { buildBackUrl, buildErrorUrl } from './_helpers';

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response(null, { status: 403 });
  }

  const form = await request.formData();
  const ticketId = form.get('ticketId')?.toString().trim() ?? '';
  const status = form.get('status')?.toString() ?? '';
  const category = form.get('category')?.toString() ?? '';
  const q = form.get('q')?.toString() ?? '';

  const backUrl = buildBackUrl({ status, category, q });

  if (!ticketId) {
    return Response.redirect(buildErrorUrl(backUrl, 'Ticket-ID+fehlt'), 303);
  }

  try {
    await archiveBugTicket(ticketId);
  } catch (err) {
    console.error('[bugs/archive] DB error:', err);
    return Response.redirect(buildErrorUrl(backUrl, 'Datenbankfehler'), 303);
  }

  return Response.redirect(backUrl, 303);
};
