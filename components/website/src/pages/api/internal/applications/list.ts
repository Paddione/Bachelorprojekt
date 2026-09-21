import type { APIRoute } from 'astro';
import { pool } from '../../../../lib/website-db';

import { isAuthorized } from './auth';

const STATUSES = ['found', 'drafting', 'applied', 'interviewing', 'offered'] as const;

export const GET: APIRoute = async ({ request }) => {
  if (!await isAuthorized(request)) {
    return new Response('forbidden', { status: 403 });
  }
  const r = await pool.query(
    `SELECT j.id, j.company, j.role_title, j.status, j.match_score, j.match_evidence_ids,
            j.source_url, COUNT(d.id) AS dossier_count
       FROM applications.jobs j
       LEFT JOIN applications.dossiers d ON d.job_id = j.id
      WHERE j.status <> 'withdrawn'
      GROUP BY j.id
      ORDER BY j.status, j.updated_at DESC`);
  const grouped: Record<string, unknown[]> = Object.fromEntries(STATUSES.map((s) => [s, []]));
  for (const row of r.rows as Array<{
    id: number; company: string; role_title: string; status: string;
    match_score: number | null; match_evidence_ids: string[] | null; source_url: string | null;
    dossier_count: string | number;
  }>) {
    const bucket = grouped[row.status];
    if (!bucket) continue;
    bucket.push({
      id: row.id,
      company: row.company,
      role_title: row.role_title,
      dossier_count: Number(row.dossier_count),
      match_score: row.match_score,
      match_evidence_ids: row.match_evidence_ids,
      source_url: row.source_url,
    });
  }
  return new Response(JSON.stringify(grouped), { headers: { 'Content-Type': 'application/json' } });
};
