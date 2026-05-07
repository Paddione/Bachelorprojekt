import type { APIRoute } from 'astro';
import { pool } from '../../../../lib/website-db';
import { sendBugCloseEmail } from '../../../../lib/tickets/email-templates';

const TOKEN = process.env.INTERNAL_API_TOKEN ?? '';

export const POST: APIRoute = async ({ request }) => {
  if (!TOKEN || request.headers.get('x-internal-token') !== TOKEN) {
    return new Response('forbidden', { status: 403 });
  }
  const body = await request.json() as { externalId: string; resolution: string };
  const r = await pool.query(
    `SELECT external_id, reporter_email FROM tickets.tickets
      WHERE type = 'bug' AND external_id = $1`, [body.externalId]);
  if (r.rowCount === 0) return new Response('not found', { status: 404 });
  const t = r.rows[0];
  if (!t.reporter_email) return new Response(JSON.stringify({ ok: true, skipped: true }),
    { headers: { 'Content-Type': 'application/json' } });
  const sent = await sendBugCloseEmail({
    externalId: t.external_id,
    reporterEmail: t.reporter_email,
    resolution: body.resolution,
  });
  return new Response(JSON.stringify({ ok: true, sent }),
    { headers: { 'Content-Type': 'application/json' } });
};
