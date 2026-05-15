import type { APIRoute } from 'astro';
import { addComment, createAdminTicket } from '../../../lib/tickets/admin';
import { checkRateLimit, getClientIp } from '../../../lib/rate-limit';
import { config } from '../../../config/index.js';
import { pool } from '../../../lib/website-db';

const BRAND = config.brand;
const EXTERNAL_ID_RE = /^T\d{6}$/i;

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status, headers: { 'Content-Type': 'application/json' },
  });
}

export const POST: APIRoute = async ({ request }) => {
  const ip = getClientIp(request);
  if (!checkRateLimit(`ticket-comment:${ip}`, 5, 60_000)) {
    return jsonError('Zu viele Anfragen. Bitte warten Sie einen Moment.', 429);
  }

  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return jsonError('Ungültiger JSON-Body.', 400); }

  const comment = String(body.comment ?? '').trim();
  if (!comment) return jsonError('Kommentar ist erforderlich.', 400);
  if (comment.length > 1000) return jsonError('Kommentar zu lang (max. 1000 Zeichen).', 400);

  const rawId = typeof body.ticketId === 'string' ? body.ticketId.trim().toUpperCase() : '';
  const ticketExternalId = EXTERNAL_ID_RE.test(rawId) ? rawId : undefined;

  try {
    if (ticketExternalId) {
      const row = await pool.query<{ id: string }>(
        `SELECT id FROM tickets.tickets WHERE external_id = $1 AND brand = $2`,
        [ticketExternalId, BRAND]
      );
      if (row.rows.length === 0) {
        return jsonError('Ticket nicht gefunden.', 404);
      }
      await addComment({
        brand: BRAND,
        ticketId: row.rows[0].id,
        body: comment,
        visibility: 'public',
        actor: { label: 'Portal-Nutzer' },
      });
    } else {
      await createAdminTicket({
        brand: BRAND,
        type: 'task',
        title: 'Portal-Feedback',
        description: comment,
        priority: 'niedrig',
        actor: { label: 'Portal-Nutzer' },
      });
    }
    return new Response(JSON.stringify({ ok: true }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[api/tickets/comment]', err);
    return jsonError('Interner Fehler. Bitte versuchen Sie es erneut.', 500);
  }
};
