import type { APIRoute } from 'astro';
import { pool } from '../../../../lib/website-db';

const VALID_STATUSES = ['found', 'drafting', 'applied', 'interviewing', 'offered', 'rejected', 'withdrawn'];

interface StatusPayload {
  status?: string;
}

export function parseStatusPayload(body: unknown): StatusPayload | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const { status } = body as Record<string, unknown>;
  if (typeof status !== 'string' || !VALID_STATUSES.includes(status)) return null;
  return { status };
}

export const PUT: APIRoute = async ({ request, params }) => {
  const token = process.env.INTERNAL_API_TOKEN ?? '';
  if (!token || request.headers.get('x-internal-token') !== token) {
    return new Response('forbidden', { status: 403 });
  }

  const jobId = params.id;
  if (!jobId || typeof jobId !== 'string') {
    return new Response('missing job id', { status: 400 });
  }

  const jobNum = Number(jobId);
  if (!Number.isSafeInteger(jobNum) || jobNum < 1) {
    return new Response('invalid job id', { status: 400 });
  }

  let body: StatusPayload | null;
  try {
    body = parseStatusPayload(await request.json());
  } catch {
    body = null;
  }
  if (!body) return new Response('invalid payload', { status: 400 });

  const r = await pool.query(
    `UPDATE applications.jobs
        SET status = $2, updated_at = now()
      WHERE id = $1
      RETURNING id, company, role_title, status, updated_at`,
    [jobNum, body.status],
  );

  if (r.rows.length === 0) {
    return new Response('not found', { status: 404 });
  }

  return new Response(JSON.stringify(r.rows[0]), { headers: { 'Content-Type': 'application/json' } });
};
