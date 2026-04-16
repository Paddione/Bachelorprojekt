import type { APIRoute } from 'astro';
import { getBugTicketStatus } from '../../lib/website-db';

const TICKET_RE = /^BR-\d{8}-[0-9a-f]{4}$/;

// Simple in-memory rate limiting: max 10 requests per minute per IP
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || entry.resetAt < now) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + 60_000 });
    return false;
  }
  if (entry.count >= 10) return true;
  entry.count++;
  return false;
}

export const GET: APIRoute = async ({ request }) => {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim()
    ?? request.headers.get('x-real-ip')
    ?? 'unknown';

  if (isRateLimited(ip)) {
    return new Response(
      JSON.stringify({ error: 'Zu viele Anfragen. Bitte warten Sie eine Minute.' }),
      { status: 429, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const url = new URL(request.url);
  const id = (url.searchParams.get('id') ?? '').trim();

  if (!TICKET_RE.test(id)) {
    return new Response(
      JSON.stringify({ error: 'Ungültiges Ticket-ID-Format. Erwartet: BR-YYYYMMDD-xxxx' }),
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
    console.error('[status] DB lookup failed:', err);
    return new Response(
      JSON.stringify({ error: 'Interner Serverfehler.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
