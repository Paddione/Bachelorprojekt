import type { APIRoute } from 'astro';
import { pool } from '../../../../../lib/website-db';

export const GET: APIRoute = async ({ params }) => {
  const r = await pool.query<{ factur_x_xml: string | null; number: string }>(
    `SELECT factur_x_xml, number FROM billing_invoices WHERE id = $1`, [params.id]
  );
  if (r.rowCount === 0 || !r.rows[0].factur_x_xml) return new Response('not found', { status: 404 });
  return new Response(r.rows[0].factur_x_xml, {
    status: 200,
    headers: {
      'content-type': 'application/xml',
      'content-disposition': `attachment; filename="factur-x-${r.rows[0].number}.xml"`,
    },
  });
};
