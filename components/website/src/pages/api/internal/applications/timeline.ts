import type { APIRoute } from 'astro';
import { pool } from '../../../../lib/website-db';

export const POST: APIRoute = async ({ request }) => {
  const token = process.env.INTERNAL_API_TOKEN ?? '';
  if (!token || request.headers.get('x-internal-token') !== token) {
    return new Response('forbidden', { status: 403 });
  }
  const body = (await request.json()) as { job_id: number; event_type: string; notes?: string };
  const r = await pool.query(
    `INSERT INTO applications.timeline (job_id, event_type, notes)
     VALUES ($1, $2, $3)
     RETURNING id, created_at`,
    [body.job_id, body.event_type, body.notes ?? null],
  );
  return new Response(JSON.stringify(r.rows[0]), { headers: { 'Content-Type': 'application/json' } });
};
