import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { resolveBugTicket } from '../../../../lib/meetings-db';

function buildBackUrl(filters: { status: string; category: string; q: string }): string {
  const params = new URLSearchParams();
  if (filters.status) params.set('status', filters.status);
  if (filters.category) params.set('category', filters.category);
  if (filters.q) params.set('q', filters.q);
  const qs = params.toString();
  return `/admin/bugs${qs ? '?' + qs : ''}`;
}

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
    return Response.redirect(
      new URL(`${backUrl}${backUrl.includes('?') ? '&' : '?'}error=Ticket-ID+und+L%C3%B6sungshinweis+sind+erforderlich`, request.url),
      303,
    );
  }
  if (resolutionNote.length > 1000) {
    return Response.redirect(
      new URL(`${backUrl}${backUrl.includes('?') ? '&' : '?'}error=L%C3%B6sungshinweis+zu+lang+(max.+1000+Zeichen)`, request.url),
      303,
    );
  }

  try {
    await resolveBugTicket(ticketId, resolutionNote);
  } catch (err) {
    console.error('[bugs/resolve] DB error:', err);
    return Response.redirect(
      new URL(`${backUrl}${backUrl.includes('?') ? '&' : '?'}error=Datenbankfehler`, request.url),
      303,
    );
  }

  return Response.redirect(new URL(backUrl, request.url), 303);
};
