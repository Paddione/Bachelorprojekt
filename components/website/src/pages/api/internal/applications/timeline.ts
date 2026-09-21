import type { APIRoute } from 'astro';
import { pool } from '../../../../lib/website-db';

interface TimelinePayload {
  job_id: number;
  event_type: string;
  notes?: string;
}

export function parseTimelinePayload(body: unknown): TimelinePayload | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const { job_id, event_type, notes } = body as Record<string, unknown>;
  if (typeof job_id !== 'number' || !Number.isSafeInteger(job_id) || job_id < 1
    || typeof event_type !== 'string' || !event_type.trim() || event_type.length > 100
    || (notes !== undefined && (typeof notes !== 'string' || notes.length > 10_000))) return null;
  return { job_id, event_type, ...(notes === undefined ? {} : { notes }) };
}

import { isAuthorized } from './auth';

export const POST: APIRoute = async ({ request }) => {
  if (!await isAuthorized(request)) {
    return new Response('forbidden', { status: 403 });
  }
  let body: TimelinePayload | null;
  try {
    body = parseTimelinePayload(await request.json());
  } catch {
    body = null;
  }
  if (!body) return new Response('invalid timeline payload', { status: 400 });
  const r = await pool.query(
    `INSERT INTO applications.timeline (job_id, event_type, notes)
     VALUES ($1, $2, $3)
     RETURNING id, created_at`,
    [body.job_id, body.event_type, body.notes ?? null],
  );
  return new Response(JSON.stringify(r.rows[0]), { headers: { 'Content-Type': 'application/json' } });
};
