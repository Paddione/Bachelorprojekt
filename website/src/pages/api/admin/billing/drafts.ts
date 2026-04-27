import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { pool, initBillingTables } from '../../../../lib/website-db';

export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });
  await initBillingTables();
  const brand = process.env.BRAND || 'mentolder';
  const r = await pool.query(
    `SELECT i.*, c.name AS customer_name, c.email AS customer_email
     FROM billing_invoices i JOIN billing_customers c ON c.id = i.customer_id
     WHERE i.brand=$1 AND i.status='draft' ORDER BY i.created_at DESC LIMIT 100`,
    [brand]
  );
  return new Response(JSON.stringify(r.rows), { headers: { 'Content-Type': 'application/json' } });
};
