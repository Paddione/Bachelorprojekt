import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { pool, initBillingTables } from '../../../../lib/website-db';

export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });
  await initBillingTables();
  const brand = process.env.BRAND || 'mentolder';
  const r = await pool.query(
    `SELECT COUNT(*)::int AS count FROM billing_invoices WHERE brand=$1 AND status='draft'`,
    [brand]
  );
  return new Response(JSON.stringify({ count: r.rows[0].count }), { headers: { 'Content-Type': 'application/json' } });
};
