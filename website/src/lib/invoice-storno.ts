import { pool, initBillingTables, getNextInvoiceNumber, getSiteSetting } from './website-db';
import { getCustomerById, type Invoice } from './native-billing';
import { addBooking } from './eur-bookkeeping';
import { generateInvoicePdf, type InvoicePdfSeller } from './invoice-pdf';
import { archiveBillingPdf } from './billing-archive';
import { logBillingEvent, type BillingActor } from './billing-audit';

function iso(d: Date): string {
  return d.toISOString().split('T')[0];
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export async function createCreditNote(invoiceId: string, reason: string, actor?: BillingActor): Promise<Invoice | null> {
  await initBillingTables();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const invR = await client.query(`SELECT * FROM billing_invoices WHERE id=$1 FOR UPDATE`, [invoiceId]);
    const orig = invR.rows[0];
    if (!orig) { await client.query('ROLLBACK'); return null; }
    if (orig.status === 'draft' || orig.status === 'cancelled') throw new Error('invoice cannot be cancelled');
    if (orig.kind === 'gutschrift') throw new Error('credit note cannot be cancelled again');

    const year = new Date(orig.issue_date).getFullYear();
    const number = await getNextInvoiceNumber(orig.brand, 'gutschrift');
    const issueDate = iso(new Date());
    const dueDate = issueDate;
    const ins = await client.query(
      `INSERT INTO billing_invoices
         (brand, number, status, customer_id, issue_date, due_date, tax_mode,
          net_amount, tax_rate, tax_amount, gross_amount, notes, payment_reference,
          paid_amount, locked, cancels_invoice_id, kind, parent_invoice_id,
          currency, currency_rate, net_amount_eur, gross_amount_eur, supply_type)
       VALUES
         ($1,$2,'open',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,0,true,$13,'gutschrift',$14,$15,$16,$17,$18,$19)
       RETURNING *`,
      [
        orig.brand,
        number,
        orig.customer_id,
        issueDate,
        dueDate,
        orig.tax_mode,
        -Number(orig.net_amount),
        Number(orig.tax_rate),
        -Number(orig.tax_amount),
        -Number(orig.gross_amount),
        `Storno für ${orig.number}: ${reason}`,
        `GS-${number}`,
        orig.id,
        orig.parent_invoice_id ?? null,
        orig.currency ?? 'EUR',
        orig.currency_rate ?? null,
        orig.net_amount_eur != null ? -Number(orig.net_amount_eur) : -Number(orig.net_amount),
        orig.gross_amount_eur != null ? -Number(orig.gross_amount_eur) : -Number(orig.gross_amount),
        orig.supply_type ?? null,
      ]
    );
    const credit = ins.rows[0];

    const linesR = await client.query(
      `SELECT description, quantity, unit, unit_price, net_amount
         FROM billing_invoice_line_items WHERE invoice_id=$1 ORDER BY id`,
      [orig.id]
    );
    for (const line of linesR.rows) {
      await client.query(
        `INSERT INTO billing_invoice_line_items
           (invoice_id, description, quantity, unit, unit_price, net_amount)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [credit.id, line.description, -Number(line.quantity), line.unit ?? null, Number(line.unit_price), -Number(line.net_amount)]
      );
    }

    await client.query(`UPDATE billing_invoices SET status='cancelled', updated_at=now() WHERE id=$1`, [orig.id]);
    await client.query('COMMIT');

    if (Number(orig.paid_amount ?? 0) > 0 && Number(orig.gross_amount) !== 0) {
      await addBooking({
        brand: orig.brand,
        bookingDate: issueDate,
        type: 'income',
        category: 'storno',
        description: `Storno ${orig.number}`,
        netAmount: -round2(Number(orig.paid_amount) * Number(orig.net_amount) / Number(orig.gross_amount)),
        vatAmount: -round2(Number(orig.paid_amount) * Number(orig.tax_amount) / Number(orig.gross_amount)),
        invoiceId: credit.id,
        belegnummer: number,
        taxMode: orig.tax_mode,
      });
    }

    await logBillingEvent({
      invoiceId: orig.id,
      action: 'storno',
      actor,
      fromStatus: orig.status,
      toStatus: 'cancelled',
      reason,
      metadata: { creditNoteNumber: number, creditNoteId: credit.id },
    });

    return {
      id: credit.id,
      brand: credit.brand,
      number: credit.number,
      status: credit.status,
      customerId: credit.customer_id,
      issueDate: iso(credit.issue_date),
      dueDate: iso(credit.due_date),
      taxMode: credit.tax_mode,
      netAmount: Number(credit.net_amount),
      taxRate: Number(credit.tax_rate),
      taxAmount: Number(credit.tax_amount),
      grossAmount: Number(credit.gross_amount),
      notes: credit.notes ?? undefined,
      paymentReference: credit.payment_reference ?? undefined,
      paidAmount: Number(credit.paid_amount ?? 0) || undefined,
      locked: Boolean(credit.locked),
      cancelledInvoiceId: credit.cancels_invoice_id ?? undefined,
      kind: credit.kind ?? 'gutschrift',
      parentInvoiceId: credit.parent_invoice_id ?? undefined,
      currency: credit.currency ?? 'EUR',
      currencyRate: credit.currency_rate != null ? Number(credit.currency_rate) : null,
      netAmountEur: credit.net_amount_eur != null ? Number(credit.net_amount_eur) : Number(credit.net_amount),
      grossAmountEur: credit.gross_amount_eur != null ? Number(credit.gross_amount_eur) : Number(credit.gross_amount),
      supplyType: credit.supply_type ?? undefined,
    };
  } finally {
    client.release();
  }
}

export async function generateCreditNotePdf(invoiceId: string): Promise<Buffer | null> {
  const invR = await pool.query(`SELECT * FROM billing_invoices WHERE id=$1`, [invoiceId]);
  const inv = invR.rows[0];
  if (!inv) return null;
  const customer = await getCustomerById(inv.brand, inv.customer_id);
  if (!customer) return null;
  const linesR = await pool.query(`SELECT * FROM billing_invoice_line_items WHERE invoice_id=$1 ORDER BY id`, [invoiceId]);
  const [senderName, senderStreet, senderCity, senderZip, senderCountry, senderVat, senderIban, senderBic, senderBank, senderEmail, senderPhone] = await Promise.all([
    getSiteSetting(inv.brand, 'invoice_sender_name'),
    getSiteSetting(inv.brand, 'invoice_sender_street'),
    getSiteSetting(inv.brand, 'invoice_sender_city'),
    getSiteSetting(inv.brand, 'invoice_sender_zip'),
    getSiteSetting(inv.brand, 'invoice_sender_country'),
    getSiteSetting(inv.brand, 'invoice_sender_vat_id'),
    getSiteSetting(inv.brand, 'invoice_bank_iban'),
    getSiteSetting(inv.brand, 'invoice_bank_bic'),
    getSiteSetting(inv.brand, 'invoice_bank_name'),
    getSiteSetting(inv.brand, 'invoice_sender_email'),
    getSiteSetting(inv.brand, 'invoice_sender_phone'),
  ]);

  const seller: InvoicePdfSeller = {
    name: senderName || inv.brand,
    address: senderStreet || '',
    postalCode: senderZip || '',
    city: senderCity || '',
    country: senderCountry || 'DE',
    vatId: senderVat || '',
    taxNumber: '',
    iban: senderIban || '',
    bic: senderBic || '',
    bankName: senderBank || '',
    email: senderEmail || undefined,
    phone: senderPhone || undefined,
  };
  const pdf = await generateInvoicePdf({
    invoice: {
      id: inv.id, brand: inv.brand, number: inv.number, status: inv.status,
      customerId: inv.customer_id, issueDate: iso(inv.issue_date), dueDate: iso(inv.due_date),
      taxMode: inv.tax_mode, netAmount: Number(inv.net_amount), taxRate: Number(inv.tax_rate),
      taxAmount: Number(inv.tax_amount), grossAmount: Number(inv.gross_amount),
      notes: inv.notes ?? undefined, paymentReference: inv.payment_reference ?? undefined,
      paidAmount: Number(inv.paid_amount ?? 0) || undefined, locked: Boolean(inv.locked),
      kind: inv.kind ?? 'gutschrift', currency: inv.currency ?? 'EUR',
      currencyRate: inv.currency_rate != null ? Number(inv.currency_rate) : null,
      netAmountEur: inv.net_amount_eur != null ? Number(inv.net_amount_eur) : Number(inv.net_amount),
      grossAmountEur: inv.gross_amount_eur != null ? Number(inv.gross_amount_eur) : Number(inv.gross_amount),
    },
    lines: linesR.rows.map((l: Record<string, unknown>) => ({
      description: l.description as string,
      quantity: Number(l.quantity),
      unitPrice: Number(l.unit_price),
      netAmount: Number(l.net_amount),
      unit: (l.unit as string) ?? undefined,
    })),
    customer: {
      name: customer.name,
      company: customer.company,
      addressLine1: customer.addressLine1,
      postalCode: customer.postalCode,
      city: customer.city,
      country: customer.landIso ?? 'DE',
      vatNumber: customer.vatNumber,
      email: customer.email,
    },
    seller,
    templateTexts: { title: 'GUTSCHRIFT' },
  });
  const pdfPath = await archiveBillingPdf({
    brand: inv.brand,
    invoiceNumber: inv.number,
    filename: `${inv.number}.pdf`,
    content: pdf,
  });
  await pool.query(
    `UPDATE billing_invoices SET pdf_blob=$2, pdf_mime='application/pdf', pdf_size_bytes=$3, pdf_path=COALESCE($4, pdf_path) WHERE id=$1`,
    [invoiceId, pdf, pdf.length, pdfPath]
  );
  return pdf;
}
