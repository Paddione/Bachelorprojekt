import type { APIRoute } from 'astro';
import { pool } from '../../../../../lib/website-db';
import { isAdmin, getSession } from '../../../../../lib/auth';

export const GET: APIRoute = async ({ params, request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });

  const id = params.id!;
  const r = await pool.query<{ xrechnung_xml: string | null; number: string }>(
    `SELECT xrechnung_xml, number FROM billing_invoices WHERE id = $1`, [id]
  );
  if (r.rowCount === 0) return new Response('not found', { status: 404 });
  const row = r.rows[0];
  if (!row.xrechnung_xml) return new Response('no XRechnung XML for this invoice (Leitweg-ID required)', { status: 404 });
  return new Response(row.xrechnung_xml, {
    status: 200,
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      'content-disposition': `attachment; filename="xrechnung-${row.number}.xml"`,
    },
  });
};
