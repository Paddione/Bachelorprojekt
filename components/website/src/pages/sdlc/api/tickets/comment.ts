import type { APIRoute } from 'astro';
import { addComment, createAdminTicket } from '../../../../lib/tickets/admin.ts';
import { checkRateLimit, getClientIp } from '../../../../lib/rate-limit';
import { getSession, isAdmin } from '../../../../lib/auth';
import { COMMENT_CORS_ORIGINS, checkCommentAccess } from '../../../../lib/tickets/comment-gate';
import { config } from '../../../../config/index.js';
import { pool } from '../../../../lib/website-db';
import { autoTriage } from '../../../../lib/sdlc/ticket-triage';

const BRAND = config.brand;
const EXTERNAL_ID_RE = /^T\d{6}$/i;

// Allowlist-Owner ist comment-gate (Single Source); CORS-Header bleiben hier.
const CORS_ORIGINS = COMMENT_CORS_ORIGINS;

function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get('origin') ?? '';
  const allowed = CORS_ORIGINS.some(re => re.test(origin)) ? origin : '';
  if (!allowed) return {};
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  };
}

export const OPTIONS: APIRoute = ({ request }) =>
  new Response(null, { status: 204, headers: corsHeaders(request) });

export const POST: APIRoute = async ({ request, locals }) => {
  const err = (message: string, status: number) =>
    new Response(JSON.stringify({ error: message }), {
      status, headers: { 'Content-Type': 'application/json', ...corsHeaders(request) },
    });

  const ip = getClientIp(request);
  if (!checkRateLimit(`ticket-comment:${ip}`, 5, 60_000)) {
    return err('Zu viele Anfragen. Bitte warten Sie einen Moment.', 429);
  }

  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return err('Ungültiger JSON-Body.', 400); }

  const comment = String(body.comment ?? '').trim();
  if (!comment) return err('Kommentar ist erforderlich.', 400);
  if (comment.length > 10_000) return err('Kommentar zu lang (max. 10.000 Zeichen).', 400);

  const rawId = typeof body.ticketId === 'string' ? body.ticketId.trim().toUpperCase() : '';
  const ticketExternalId = EXTERNAL_ID_RE.test(rawId) ? rawId : undefined;

  // F6: anonyme Kommentare an BELIEBIGEN Tickets sind zu — Admin-Session
  // oder Herkunft aus den Session-Formularen ist Pflicht.
  const session = await getSession(request.headers.get('cookie'));
  const verdict = checkCommentAccess({
    origin: request.headers.get('origin'),
    referer: request.headers.get('referer'),
    hasSession: !!session && isAdmin(session),
    hasTicketId: !!ticketExternalId,
  });
  if (!verdict.allow) return err('Kommentieren ist nur aus den Session-Formularen moeglich.', verdict.status);

  try {
    if (ticketExternalId) {
      const row = await pool.query<{ id: string }>(
        `SELECT id FROM tickets.tickets WHERE external_id = $1 AND brand = $2`,
        [ticketExternalId, BRAND]
      );
      if (row.rows.length === 0) return err('Ticket nicht gefunden.', 404);
      await addComment({
        brand: BRAND,
        ticketId: row.rows[0].id,
        body: comment,
        visibility: 'public',
        actor: { label: 'Session-Form' },
      });
    } else {
      const newTicketId = await createAdminTicket({
        brand: BRAND,
        type: 'task',
        title: 'Session-Form Rücklauf',
        description: comment,
        priority: 'niedrig',
        actor: { label: 'Session-Form' },
      });
      void autoTriage(newTicketId, BRAND).catch(e => locals.requestLogger.error({ err: e }, '[autoTriage]'));
    }
    return new Response(JSON.stringify({ ok: true }), {
      status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders(request) },
    });
  } catch (e) {
    locals.requestLogger.error({ err: e }, '[api/tickets/comment]');
    return err('Interner Fehler. Bitte versuchen Sie es erneut.', 500);
  }
};
