import type { APIRoute } from 'astro';
import { pool } from '../../../../lib/website-db';

const STATUSES = ['found', 'drafting', 'applied', 'interviewing', 'offered'] as const;

export const GET: APIRoute = async ({ request }) => {
  const token = process.env.INTERNAL_API_TOKEN ?? '';
  if (!token || request.headers.get('x-internal-token') !== token) {
    return new Response('forbidden', { status: 403 });
  }
  const r = await pool.query(
    `SELECT j.id, j.company, j.role_title, j.status, COUNT(d.id) AS dossier_count
       FROM applications.jobs j
       LEFT JOIN applications.dossiers d ON d.job_id = j.id
      WHERE j.status <> 'withdrawn'
      GROUP BY j.id
      ORDER BY j.status, j.updated_at DESC`);
  const grouped: Record<string, unknown[]> = Object.fromEntries(STATUSES.map((s) => [s, []]));
  for (const row of r.rows as Array<{ id: number; company: string; role_title: string; status: string; dossier_count: string | number }>) {
    const bucket = grouped[row.status];
    if (!bucket) continue;
    bucket.push({
      id: row.id,
      company: row.company,
      role_title: row.role_title,
      dossier_count: Number(row.dossier_count),
    });
  }
  return new Response(JSON.stringify(grouped), { headers: { 'Content-Type': 'application/json' } });
};
