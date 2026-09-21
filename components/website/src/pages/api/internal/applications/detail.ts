import type { APIRoute } from 'astro';
import { pool } from '../../../../lib/website-db';

import { isAuthorized } from './auth';

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
    `SELECT id, company, role_title, status, source_url, raw_text, requirements,
            match_score, match_evidence_ids, dossier_count,
            created_at, updated_at
       FROM (
         SELECT j.*, COUNT(d.id) AS dossier_count
           FROM applications.jobs j
           LEFT JOIN applications.dossiers d ON d.job_id = j.id
          WHERE j.id = $1
          GROUP BY j.id
       ) sub`,
    [jobNum],
  );

  if (r.rows.length === 0) {
    return new Response('not found', { status: 404 });
  }

  const row = r.rows[0] as {
    id: number;
    company: string;
    role_title: string;
    status: string;
    source_url: string | null;
    raw_text: string | null;
    requirements: string | null;
    match_score: number | null;
    match_evidence_ids: string[] | null;
    dossier_count: number;
    created_at: string;
    updated_at: string;
  };

  return new Response(JSON.stringify({
    id: row.id,
    company: row.company,
    role_title: row.role_title,
    status: row.status as ApplicationStatus,
    source_url: row.source_url,
    raw_text: row.raw_text,
    requirements: row.requirements,
    match_score: row.match_score,
    match_evidence_ids: row.match_evidence_ids,
    dossier_count: row.dossier_count,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }), { headers: { 'Content-Type': 'application/json' } });
};

type ApplicationStatus = 'found' | 'drafting' | 'applied' | 'interviewing' | 'offered' | 'rejected' | 'withdrawn';
