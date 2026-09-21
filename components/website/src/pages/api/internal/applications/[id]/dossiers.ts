import type { APIRoute } from 'astro';
import { pool } from '../../../../../lib/website-db';

import { isAuthorized } from '../auth';

export const GET: APIRoute = async ({ request, params }) => {
  if (!await isAuthorized(request)) {
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

  const r = await pool.query(
    `SELECT id, job_id, artifact_path, kind, created_at
       FROM applications.dossiers
      WHERE job_id = $1
      ORDER BY created_at DESC`,
    [jobNum],
  );

  return new Response(JSON.stringify(r.rows), { headers: { 'Content-Type': 'application/json' } });
};
