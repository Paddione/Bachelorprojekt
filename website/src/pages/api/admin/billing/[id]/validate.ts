import type { APIRoute } from 'astro';
import { pool } from '../../../../../lib/website-db';
import { isAdmin, getSession } from '../../../../../lib/auth';
import { createSidecarClient, sidecarBaseUrlFromEnv } from '../../../../../lib/einvoice/sidecar-client';

export const POST: APIRoute = async ({ params, request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });

  const id = params.id!;
  const r = await pool.query<{ pdf_a3_blob: Buffer | null }>(
    `SELECT pdf_a3_blob FROM billing_invoices WHERE id = $1`, [id]
  );
  if (r.rowCount === 0 || !r.rows[0].pdf_a3_blob) {
    return new Response(JSON.stringify({ error: 'no PDF/A-3 stored for this invoice' }), { status: 404 });
  }
  const client = createSidecarClient(sidecarBaseUrlFromEnv());
  const result = await client.validate({ pdf: r.rows[0].pdf_a3_blob });
  await pool.query(
    `UPDATE billing_invoices SET einvoice_validated_at = now(), einvoice_validation_report = $1 WHERE id = $2`,
    [result, id]
  );
  return new Response(JSON.stringify(result), {
    status: 200, headers: { 'content-type': 'application/json' },
  });
};
