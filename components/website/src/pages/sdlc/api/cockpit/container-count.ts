import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { pool } from '../../../../lib/website-db';

export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
  }
  const brand = process.env.BRAND_ID ?? process.env.BRAND ?? 'mentolder';
  let total = 0;
  try {
    const r = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM tickets.tickets
        WHERE brand = $1 AND type IN ('project','feature')
          AND status NOT IN ('done','archived') AND is_test_data = false`,
      [brand]);
    total = Number(r.rows[0]?.count ?? 0);
  } catch { /* fail-soft: badge stays 0 */ }
  return new Response(JSON.stringify({ total }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
