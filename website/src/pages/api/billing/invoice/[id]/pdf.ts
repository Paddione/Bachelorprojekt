import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../lib/auth';
import { pool, initBillingTables } from '../../../../../lib/website-db';
import { getInvoiceForEInvoice } from '../../../../../lib/native-billing';
import { generateInvoicePdf } from '../../../../../lib/invoice-pdf';
import type { EInvoiceProfile } from '../../../../../lib/einvoice-profile';

const VALID_PROFILES: ReadonlySet<EInvoiceProfile> = new Set(['factur-x-minimum', 'xrechnung-cii', 'xrechnung-ubl']);

export const GET: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session) return new Response('Unauthorized', { status: 401 });
  await initBillingTables();
  const id = params.id as string | undefined;
  if (!id) return new Response('Missing id', { status: 400 });

  const url = new URL(request.url);
  const profileParam = url.searchParams.get('profile');

  // Auth: archive-blob path requires either admin or owner-by-email.
  // For ?profile= path: admin-only (regenerated docs include seller env data).
  const r = await pool.query(
    `SELECT i.pdf_blob, i.pdf_mime, i.number, c.email AS customer_email
       FROM billing_invoices i
       JOIN billing_customers c ON c.id = i.customer_id
      WHERE i.id=$1`,
    [id]
  );
  const row = r.rows[0];
  if (!row) return new Response('Not found', { status: 404 });

  if (profileParam) {
    if (!isAdmin(session)) return new Response('Forbidden', { status: 403 });
    if (!VALID_PROFILES.has(profileParam as EInvoiceProfile)) {
      return new Response(`Unknown profile: ${profileParam}`, { status: 400 });
    }
    const data = await getInvoiceForEInvoice(id);
    if (!data) return new Response('Not found', { status: 404 });
    // Bridge EInvoiceLine -> InvoicePdfLine: derive line-level netAmount from quantity * unitPrice.
    const lines = data.lines.map((l) => ({ ...l, netAmount: l.quantity * l.unitPrice }));
    let pdf: Buffer;
    try {
      pdf = await generateInvoicePdf({ ...data, lines, profile: profileParam as EInvoiceProfile } as never);
    } catch (e) {
      return new Response((e as Error).message, { status: 422 });
    }
    return new Response(pdf, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${row.number}-${profileParam}.pdf"`,
      },
    });
  }

  // No profile: serve archived blob (existing GoBD behavior — unchanged)
  if (!row.pdf_blob) return new Response('Not found', { status: 404 });
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
