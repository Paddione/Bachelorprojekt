import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../lib/auth';
import { finalizeInvoice, getCustomerById } from '../../../../../lib/native-billing';
import { generateInvoicePdf, type InvoicePdfSeller } from '../../../../../lib/invoice-pdf';
import { generateZugferdXmlFromNative } from '../../../../../lib/zugferd';
import { sendEmail } from '../../../../../lib/email';
import { pool, getSiteSetting, initBillingTables } from '../../../../../lib/website-db';

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
    getCustomerById(draftCheck.rows[0].customer_id),
  ]);
  const s = Object.fromEntries(settingKeys.map((k,i) => [k, settingVals[i] ?? '']));
  if (!customer) return new Response('Customer not found', { status: 404 });

  const seller: InvoicePdfSeller = {
    name:       s.invoice_sender_name,
    address:    s.invoice_sender_street,
    postalCode: (s.invoice_sender_city ?? '').split(' ')[0] ?? '',
    city:       (s.invoice_sender_city ?? '').split(' ').slice(1).join(' '),
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

  // Finalize
  const finalized = await finalizeInvoice(id);
  if (!finalized) return new Response('Failed to finalize invoice', { status: 409 });

  // Generate ZUGFeRD XML using ZugferdSellerConfig (subset of InvoicePdfSeller)
  const zugferdSeller = {
    name:       seller.name,
    address:    seller.address,
    postalCode: seller.postalCode,
    city:       seller.city,
    country:    seller.country,
    vatId:      seller.vatId,
  };
  const xml = generateZugferdXmlFromNative({ invoice: finalized, lines, customer, seller: zugferdSeller });

  // Generate PDF
  const pdf = await generateInvoicePdf({
    invoice: finalized, lines, customer, seller,
    templateTexts: {
      introText: tmpl.invoice_intro_text || undefined,
      kleinunternehmerNotice: tmpl.invoice_kleinunternehmer_notice || undefined,
      outroText: tmpl.invoice_outro_text || undefined,
    },
  });

  // Store ZUGFeRD XML on invoice
  await pool.query(
    `UPDATE billing_invoices SET zugferd_xml=$2, updated_at=now() WHERE id=$1`, [id, xml]
  );

  // Interpolate email templates
  function interpolate(t: string, vars: Record<string, string>) {
    return t.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? '');
  }
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

  await sendEmail({
    to: customer.email,
    subject,
    text: body,
    attachments: [{ filename: `${finalized.number}.pdf`, content: pdf }],
  });

  return new Response(JSON.stringify({ ok: true, number: finalized.number }), {
    headers: { 'Content-Type': 'application/json' }
  });
};
