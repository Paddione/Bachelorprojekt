import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { pool, initBillingTables } from '../../../../lib/website-db';
import { verifyInvoiceIntegrity } from '../../../../lib/invoice-hash';

export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });
  await initBillingTables();
  const ids = await pool.query(`SELECT id FROM billing_invoices WHERE locked=true`);
  const results = await Promise.all(
    ids.rows.map((r: { id: string }) => verifyInvoiceIntegrity(r.id))
  );
  const valid = results.filter((r): r is NonNullable<typeof r> => r !== null);
  const mismatches = valid.filter(r => !r.ok);
  return new Response(
    JSON.stringify({
      checked: valid.length,
      ok: valid.length - mismatches.length,
      mismatches: mismatches.map(m => ({
        id: m.invoiceId,
        expected: m.expectedHash,
        stored: m.storedHash,
      })),
    }),
    { headers: { 'Content-Type': 'application/json' } }
  );
};
