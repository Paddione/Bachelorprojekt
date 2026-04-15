import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { archiveBugTicket } from '../../../../lib/meetings-db';
import { buildBackUrl } from './_helpers';

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
    return Response.redirect(
      new URL(`${backUrl}${backUrl.includes('?') ? '&' : '?'}error=Ticket-ID+fehlt`, request.url),
      303,
    );
  }

  try {
    await archiveBugTicket(ticketId);
  } catch (err) {
    console.error('[bugs/archive] DB error:', err);
    return Response.redirect(
      new URL(`${backUrl}${backUrl.includes('?') ? '&' : '?'}error=Datenbankfehler`, request.url),
      303,
    );
  }

  return Response.redirect(new URL(backUrl, request.url), 303);
};
