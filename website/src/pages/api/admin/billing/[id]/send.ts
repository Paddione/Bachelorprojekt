import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../lib/auth';
import { finalizeInvoice, getCustomerById } from '../../../../../lib/native-billing';
import { generateInvoicePdf, type InvoicePdfSeller } from '../../../../../lib/invoice-pdf';
import { generateZugferdXmlFromNative } from '../../../../../lib/zugferd';
import { sendEmail } from '../../../../../lib/email';
import { pool, getSiteSetting, initBillingTables } from '../../../../../lib/website-db';

function interpolate(t: string, vars: Record<string, string>) {
  return t.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? '');
}

export const POST: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });
  await initBillingTables();
  const id = params.id as string;
  const brand = process.env.BRAND || 'mentolder';

  // Load invoice (must be draft)
  const draftCheck = await pool.query(
    `SELECT * FROM billing_invoices WHERE id=$1 AND brand=$2 AND status='draft'`, [id, brand]
  );
  if (!draftCheck.rows[0]) return new Response('Not found or not draft', { status: 404 });

  // Load seller settings
  const settingKeys = ['invoice_sender_name','invoice_sender_street','invoice_sender_city',
    'invoice_bank_iban','invoice_bank_bic','invoice_bank_name','invoice_vat_id'] as const;
  const [settingVals, customer] = await Promise.all([
    Promise.all(settingKeys.map(k => getSiteSetting(brand, k))),
    getCustomerById(brand, draftCheck.rows[0].customer_id),
  ]);
  const s = Object.fromEntries(settingKeys.map((k,i) => [k, settingVals[i] ?? '']));
  if (!customer) return new Response('Customer not found', { status: 404 });

  const cityParts = (s.invoice_sender_city ?? '').trim();
  if (!cityParts) {
    console.warn('[billing/send] invoice_sender_city not configured for brand', brand);
  }
  const seller: InvoicePdfSeller = {
    name:       s.invoice_sender_name,
    address:    s.invoice_sender_street,
    postalCode: cityParts.split(' ')[0] ?? '',
    city:       cityParts.split(' ').slice(1).join(' '),
    country:    'DE',
    vatId:      s.invoice_vat_id,
    taxNumber:  '',
    iban:       s.invoice_bank_iban,
    bic:        s.invoice_bank_bic,
    bankName:   s.invoice_bank_name,
  };

  // Load email/pdf templates from site_settings
  const tmplKeys = ['invoice_email_subject','invoice_email_body','invoice_intro_text',
                    'invoice_kleinunternehmer_notice','invoice_outro_text'] as const;
  const tmplVals = await Promise.all(tmplKeys.map(k => getSiteSetting(brand, k)));
  const tmpl = Object.fromEntries(tmplKeys.map((k,i) => [k, tmplVals[i] ?? '']));

  // Load line items
  const linesR = await pool.query(
    `SELECT * FROM billing_invoice_line_items WHERE invoice_id=$1 ORDER BY id`, [id]
  );
  const lines = linesR.rows.map((l: Record<string, unknown>) => ({
    description: l.description as string,
    quantity: Number(l.quantity),
    unitPrice: Number(l.unit_price),
    netAmount: Number(l.net_amount),
    unit: l.unit as string | undefined,
  }));

  // Generate PDF + XML before finalizing so we can roll back on failure
  const zugferdSeller = {
    name: seller.name, address: seller.address,
    postalCode: seller.postalCode, city: seller.city,
    country: seller.country, vatId: seller.vatId,
  };

  // Use a temporary invoice object for generation (same data as draft row)
  const draftRow = draftCheck.rows[0];
  const tempInvoice = {
    id: draftRow.id, brand: draftRow.brand, number: draftRow.number,
    status: 'open', customerId: draftRow.customer_id,
    issueDate: (draftRow.issue_date as Date).toISOString().split('T')[0],
    dueDate: (draftRow.due_date as Date).toISOString().split('T')[0],
    taxMode: draftRow.tax_mode, netAmount: Number(draftRow.net_amount),
    taxRate: Number(draftRow.tax_rate), taxAmount: Number(draftRow.tax_amount),
    grossAmount: Number(draftRow.gross_amount),
    notes: draftRow.notes ?? undefined,
    paymentReference: draftRow.payment_reference ?? undefined,
    locked: true,
    servicePeriodStart: draftRow.service_period_start
      ? (draftRow.service_period_start as Date).toISOString().split('T')[0] : undefined,
    servicePeriodEnd: draftRow.service_period_end
      ? (draftRow.service_period_end as Date).toISOString().split('T')[0] : undefined,
  };

  let xml: string;
  let pdf: Buffer;
  try {
    xml = generateZugferdXmlFromNative({ invoice: tempInvoice, lines, customer, seller: zugferdSeller });
    pdf = await generateInvoicePdf({
      invoice: tempInvoice, lines, customer, seller,
      templateTexts: {
        introText: tmpl.invoice_intro_text || undefined,
        kleinunternehmerNotice: tmpl.invoice_kleinunternehmer_notice || undefined,
        outroText: tmpl.invoice_outro_text || undefined,
      },
    });
  } catch (err) {
    console.error('[billing/send] PDF/XML generation failed', err);
    return new Response('PDF generation failed', { status: 500 });
  }

  // Finalize (transitions to open+locked — do this after generation)
  const finalized = await finalizeInvoice(id);
  if (!finalized) return new Response('Failed to finalize invoice', { status: 409 });

  // Store ZUGFeRD XML + PDF reference
  await pool.query(
    `UPDATE billing_invoices SET zugferd_xml=$2, updated_at=now() WHERE id=$1`, [id, xml]
  );

  // Interpolate and send email
  const vars = {
    number: finalized.number,
    gross_amount: finalized.grossAmount.toFixed(2).replace('.', ',') + ' €',
    due_date: finalized.dueDate.split('-').reverse().join('.'),
    payment_reference: finalized.paymentReference ?? finalized.number,
    customer_name: customer.name,
    seller_name: seller.name,
  };
  const subject = interpolate(tmpl.invoice_email_subject || 'Rechnung {{number}}', vars);
  const body = interpolate(
    tmpl.invoice_email_body ||
    'Sehr geehrte/r {{customer_name}},\n\nanbei Rechnung {{number}} über {{gross_amount}}.\n\nMit freundlichen Grüßen\n{{seller_name}}',
    vars
  );

  const sent = await sendEmail({
    to: customer.email,
    subject,
    text: body,
    attachments: [{ filename: `${finalized.number}.pdf`, content: pdf }],
  });

  if (!sent) {
    console.error('[billing/send] Email delivery failed for invoice', finalized.number);
    return new Response(JSON.stringify({ ok: false, number: finalized.number, error: 'Email delivery failed — invoice is finalized, please resend manually.' }),
      { status: 502, headers: { 'Content-Type': 'application/json' } });
  }

  return new Response(JSON.stringify({ ok: true, number: finalized.number }), {
    headers: { 'Content-Type': 'application/json' }
  });
};
