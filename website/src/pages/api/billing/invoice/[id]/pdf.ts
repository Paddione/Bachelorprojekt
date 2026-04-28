import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../lib/auth';
import { pool, initBillingTables } from '../../../../../lib/website-db';

export const GET: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session) return new Response('Unauthorized', { status: 401 });
  await initBillingTables();
  const id = params.id as string | undefined;
  if (!id) return new Response('Missing id', { status: 400 });
  const r = await pool.query(
    `SELECT i.pdf_blob, i.pdf_mime, i.number, c.email AS customer_email
       FROM billing_invoices i
       JOIN billing_customers c ON c.id = i.customer_id
      WHERE i.id=$1`,
    [id]
  );
  const row = r.rows[0];
  if (!row || !row.pdf_blob) return new Response('Not found', { status: 404 });
  if (!isAdmin(session) && session.email !== row.customer_email) {
    return new Response('Forbidden', { status: 403 });
  }
  return new Response(row.pdf_blob, {
    status: 200,
    headers: {
      'Content-Type': row.pdf_mime || 'application/pdf',
      'Content-Disposition': `attachment; filename="${row.number}.pdf"`,
    },
  });
};
