import type { APIRoute } from 'astro';
import { getBugTicketStatus } from '../../lib/website-db';
import { checkRateLimit, getClientIp } from '../../lib/rate-limit';

const TICKET_RE = /^(T\d{6,}|BR-\d{8}-[0-9a-f]{4})$/;

export const GET: APIRoute = async ({ request , locals }) => {
  const ip = getClientIp(request);

  // Scope rate-limit key to this endpoint so unrelated E2E traffic cannot
  // exhaust the /api/status budget for a legitimate follow-up request.
  if (!checkRateLimit(`status:${ip}`, 10, 60_000)) {
    return new Response(
      JSON.stringify({ error: 'Zu viele Anfragen. Bitte warten Sie eine Minute.' }),
      { status: 429, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const url = new URL(request.url);
  const id = (url.searchParams.get('id') ?? '').trim();

  if (!TICKET_RE.test(id)) {
    return new Response(
      JSON.stringify({ error: 'Ungültiges Ticket-ID-Format. Erwartet: T000123' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    const ticket = await getBugTicketStatus(id);
    if (!ticket) {
      return new Response(
        JSON.stringify({ error: 'Ticket nicht gefunden.' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        ticketId: ticket.ticketId,
        status: ticket.status,
        category: ticket.category,
        createdAt: ticket.createdAt,
        resolvedAt: ticket.resolvedAt,
        resolutionNote: ticket.resolutionNote,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    locals.requestLogger.error({ err }, '[status] DB lookup failed:');
    return new Response(
      JSON.stringify({ error: 'Interner Serverfehler.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
