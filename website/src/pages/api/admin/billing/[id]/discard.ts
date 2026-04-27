import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../lib/auth';
import { pool, initBillingTables } from '../../../../../lib/website-db';

export const POST: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });
  try {
    await initBillingTables();
    const brand = process.env.BRAND || 'mentolder';
    await pool.query(
      `DELETE FROM billing_invoices WHERE id=$1 AND brand=$2 AND status='draft'`,
      [params.id, brand]
    );
    return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('[billing/discard]', err);
    return new Response('Internal Server Error', { status: 500 });
  }
};
