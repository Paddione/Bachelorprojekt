import type { APIRoute } from 'astro';
import { pool } from '../../../../lib/website-db';
import { sendBugCloseEmail } from '../../../../lib/tickets/email-templates.ts';
import { isAuthorized } from '../applications/auth';

export const POST: APIRoute = async ({ request }) => {
  // F7: derselbe Gate wie die Schwester-Routen (konstanter Zeitvergleich,
  // zusaetzlich Admin-Session als Fallback).
  if (!await isAuthorized(request)) {
    return new Response('forbidden', { status: 403 });
  }
  let body: { externalId: string; resolution: string };
  try {
    body = await request.json() as { externalId: string; resolution: string };
  } catch {
    return new Response('invalid json', { status: 400 });
  }
  const r = await pool.query(
    `SELECT external_id, reporter_email FROM tickets.tickets
      WHERE type IN ('bug','fix') AND external_id = $1`, [body.externalId]);
  if (r.rowCount === 0) return new Response('not found', { status: 404 });
  const t = r.rows[0];
  if (!t.reporter_email) return new Response(JSON.stringify({ ok: true, skipped: true }),
    { headers: { 'Content-Type': 'application/json' } });
  const sent = await sendBugCloseEmail({
    externalId: t.external_id,
    reporterEmail: t.reporter_email,
    resolution: body.resolution,
  }, request);
  return new Response(JSON.stringify({ ok: true, sent }),
    { headers: { 'Content-Type': 'application/json' } });
};
