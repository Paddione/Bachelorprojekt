import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { pool } from '../../../../lib/website-db';
import { updateSuccessorReadiness } from '../../../../lib/ticket-readiness';

export const prerender = false;

export const POST: APIRoute = async ({ request, params }) => {
  const s = await getSession(request.headers.get('cookie'));
  if (!s || !isAdmin(s)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const extId = params.id;
  if (!extId || !/^T\d{6}$/i.test(extId)) {
    return new Response(JSON.stringify({ error: 'invalid_ticket_id' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const { rows } = await pool.query(
      `SELECT id, status FROM tickets.tickets WHERE external_id = $1`,
      [extId.toUpperCase()],
    );
    if (!rows.length) {
      return new Response(JSON.stringify({ error: 'not_found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (rows[0].status !== 'done') {
      return new Response(JSON.stringify({ error: 'ticket_not_done' }), {
        status: 409,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const updated = await updateSuccessorReadiness(rows[0].id, pool);
    return new Response(JSON.stringify({ ok: true, successors_updated: updated }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('[api/tickets/readiness]', e);
    return new Response(JSON.stringify({ error: 'update_failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
