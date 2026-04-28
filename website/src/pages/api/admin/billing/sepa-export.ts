import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { pool, initBillingTables } from '../../../../lib/website-db';
import { buildPain008, validateMandates, type SepaCreditor } from '../../../../lib/sepa-pain008';

function nextBusinessDay(days: number): string {
  const d = new Date();
  let added = 0;
  while (added < days) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() !== 0 && d.getDay() !== 6) added++;
  }
  return d.toISOString().split('T')[0];
}

export const GET: APIRoute = async ({ request, url }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });

  const creditorIban = process.env.SEPA_CREDITOR_IBAN;
  const creditorBic  = process.env.SEPA_CREDITOR_BIC;
  const creditorId   = process.env.SEPA_CREDITOR_ID;
  if (!creditorIban || !creditorBic || !creditorId) {
    return new Response(
      JSON.stringify({ error: 'SEPA_CREDITOR_IBAN, SEPA_CREDITOR_BIC, SEPA_CREDITOR_ID must be set' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }
  const creditorName = process.env.SEPA_CREDITOR_NAME || process.env.BRAND_NAME || 'Unbekannt';

  const collectionDate = url.searchParams.get('date') ?? nextBusinessDay(2);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(collectionDate)) {
    return new Response('date must be YYYY-MM-DD', { status: 400 });
  }

  await initBillingTables();
  const brand = process.env.BRAND || 'mentolder';

  const result = await pool.query<{
    number: string;
    gross_amount: number;
    paid_amount: number | null;
    payment_reference: string | null;
    customer_name: string;
    sepa_iban: string | null;
    sepa_bic: string | null;
    sepa_mandate_ref: string | null;
    sepa_mandate_date: Date | null;
  }>(
    `SELECT
       i.number,
       i.gross_amount,
       i.paid_amount,
       i.payment_reference,
       c.name  AS customer_name,
       c.sepa_iban,
       c.sepa_bic,
       c.sepa_mandate_ref,
       c.sepa_mandate_date
     FROM billing_invoices i
     JOIN billing_customers c ON c.id = i.customer_id
     WHERE i.brand = $1
       AND i.status IN ('open', 'partially_paid')
     ORDER BY i.number`,
    [brand]
  );

  if (result.rows.length === 0) {
    return new Response(JSON.stringify({ error: 'no open invoices' }), {
      status: 404, headers: { 'Content-Type': 'application/json' },
    });
  }

  const rows = result.rows.map(r => ({
    invoiceNumber:    r.number,
    amount:           Math.round((Number(r.gross_amount) - Number(r.paid_amount ?? 0)) * 100) / 100,
    paymentReference: r.payment_reference ?? undefined,
    customerName:     r.customer_name,
    sepaIban:         r.sepa_iban ?? undefined,
    sepaBic:          r.sepa_bic ?? undefined,
    sepaMandateRef:   r.sepa_mandate_ref ?? undefined,
    sepaMandateDate:  r.sepa_mandate_date
      ? (() => { const d = r.sepa_mandate_date!; return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })()
      : undefined,
  }));

  const { valid, skipped } = validateMandates(rows);

  if (valid.length === 0) {
    return new Response(
      JSON.stringify({ error: 'no invoices with complete SEPA mandate data', skipped }),
      { status: 422, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const creditor: SepaCreditor = { name: creditorName, iban: creditorIban, bic: creditorBic, creditorId };
  const xml = buildPain008(creditor, collectionDate, valid);
  const filename = `sepa-lastschrift-${collectionDate}.xml`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      ...(skipped.length > 0 ? { 'X-Sepa-Skipped': JSON.stringify(skipped) } : {}),
    },
  });
};
