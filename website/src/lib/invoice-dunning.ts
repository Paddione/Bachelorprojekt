import { pool, getSiteSetting, initBillingTables } from './website-db';
import { getInvoice, getCustomerById, type Invoice, type Customer } from './native-billing';
import { generateDunningPdf, type InvoicePdfCustomer, type InvoicePdfSeller } from './invoice-pdf';
import { archiveBillingPdf } from './billing-archive';
import { sendEmail } from './email';
import { logBillingEvent } from './billing-audit';

export interface PendingDunning {
  id: string;
  invoiceId: string;
  invoiceNumber: string;
  level: number;
  customerEmail: string;
  customerName: string;
  outstanding: number;
  feeAmount: number;
  interestAmount: number;
  pdfPath: string;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function fmt(n: number): string {
  return n.toFixed(2).replace('.', ',') + ' €';
}

async function numberSetting(brand: string, key: string, fallback: number): Promise<number> {
  const raw = await getSiteSetting(brand, key);
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function buildDunningPdf(params: {
  brand: string;
  invoice: Invoice;
  customer: Customer;
  level: number;
  outstanding: number;
  feeAmount: number;
  interestAmount: number;
}): Promise<Buffer> {
  const [senderName, senderStreet, senderCity, senderZip, senderCountry, senderVat, senderIban, senderBic, senderBank, senderEmail, senderPhone] = await Promise.all([
    getSiteSetting(params.brand, 'invoice_sender_name'),
    getSiteSetting(params.brand, 'invoice_sender_street'),
    getSiteSetting(params.brand, 'invoice_sender_city'),
    getSiteSetting(params.brand, 'invoice_sender_zip'),
    getSiteSetting(params.brand, 'invoice_sender_country'),
    getSiteSetting(params.brand, 'invoice_sender_vat_id'),
    getSiteSetting(params.brand, 'invoice_sender_iban'),
    getSiteSetting(params.brand, 'invoice_sender_bic'),
    getSiteSetting(params.brand, 'invoice_sender_bank'),
    getSiteSetting(params.brand, 'invoice_sender_email'),
    getSiteSetting(params.brand, 'invoice_sender_phone'),
  ]);

  const customer: InvoicePdfCustomer = {
    name: params.customer.name,
    company: params.customer.company,
    addressLine1: params.customer.addressLine1,
    city: params.customer.city,
    postalCode: params.customer.postalCode,
    country: params.customer.landIso,
    email: params.customer.email,
  };

  const seller: InvoicePdfSeller = {
    name: senderName || params.brand,
    address: senderStreet || '',
    postalCode: senderZip || '',
    city: senderCity || '',
    country: senderCountry || 'DE',
    vatId: senderVat || '',
    taxNumber: '', // optional
    iban: senderIban || '',
    bic: senderBic || '',
    bankName: senderBank || '',
    email: senderEmail || undefined,
    phone: senderPhone || undefined,
  };

  return generateDunningPdf({
    dunning: {
      id: '', // not needed for PDF
      invoiceId: params.invoice.id,
      brand: params.brand,
      level: params.level,
      generatedAt: new Date().toISOString(),
      feeAmount: params.feeAmount,
      interestAmount: params.interestAmount,
      outstandingAtGeneration: params.outstanding,
    },
    invoice: params.invoice,
    customer,
    seller,
  });
}

export async function runDunningDetection(brand: string): Promise<{ generated: number; skipped: number }> {
  await initBillingTables();
  const intervalDays = await numberSetting(brand, 'invoice_dunning_interval_days', 14);
  const interestPa = await numberSetting(brand, 'invoice_dunning_interest_pa', 5);
  const rows = await pool.query<{
    id: string;
    number: string;
    status: string;
    dunning_level: number;
    due_date: Date;
    last_dunning_at: Date | null;
    gross_amount: number;
    paid_amount: number | null;
    customer_id: string;
  }>(
    `SELECT id, number, status, dunning_level, due_date, last_dunning_at, gross_amount, paid_amount, customer_id
       FROM billing_invoices
      WHERE brand=$1
        AND status IN ('open','partially_paid','overdue','dunning_1','dunning_2')
        AND locked=true`,
    [brand]
  );

  let generated = 0;
  let skipped = 0;
  for (const row of rows.rows) {
    const dueDate = new Date(row.due_date);
    const outstanding = round2(Number(row.gross_amount) - Number(row.paid_amount ?? 0));
    if (outstanding <= 0) { skipped++; continue; }
    const daysOverdue = Math.floor((Date.now() - dueDate.getTime()) / 86_400_000);
    if (daysOverdue <= 0) { skipped++; continue; }

    const nextLevel = Math.min(3, Number(row.dunning_level ?? 0) + 1);
    const eligibleByInterval = !row.last_dunning_at
      || (Date.now() - new Date(row.last_dunning_at).getTime()) / 86_400_000 >= intervalDays;
    if (!eligibleByInterval || nextLevel < 1 || nextLevel > 3) { skipped++; continue; }

    const invoice = await getInvoice(row.id);
    if (!invoice) { skipped++; continue; }
    const customer = await getCustomerById(brand, row.customer_id);
    if (!customer) { skipped++; continue; }

    const feeAmount = await numberSetting(brand, `invoice_dunning_fee_${nextLevel}`, nextLevel === 1 ? 0 : nextLevel === 2 ? 5 : 10);
    const interestAmount = round2(outstanding * daysOverdue * interestPa / 100 / 365);
    const pdf = await buildDunningPdf({
      brand,
      invoice,
      customer,
      level: nextLevel,
      outstanding,
      feeAmount,
      interestAmount,
    });
    const pdfPath = await archiveBillingPdf({
      brand,
      invoiceNumber: invoice.number,
      filename: `mahnung-${nextLevel}-${invoice.number}.pdf`,
      content: pdf,
    }) ?? `Billing/${brand}/${invoice.number}/mahnung-${nextLevel}-${invoice.number}.pdf`;

    try {
      await pool.query(
        `INSERT INTO billing_invoice_dunnings
           (invoice_id, brand, level, fee_amount, interest_amount, outstanding_at_generation, pdf_path)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [invoice.id, brand, nextLevel, feeAmount, interestAmount, outstanding, pdfPath]
      );
    } catch {
      skipped++;
      continue;
    }

    await pool.query(
      `UPDATE billing_invoices
          SET status=$2, dunning_level=$3, last_dunning_at=now(), updated_at=now()
        WHERE id=$1`,
      [invoice.id, `dunning_${nextLevel}`, nextLevel]
    );
    await logBillingEvent({
      invoiceId: invoice.id,
      action: 'dunning_generated',
      fromStatus: invoice.status,
      toStatus: `dunning_${nextLevel}`,
      metadata: { level: nextLevel, feeAmount, interestAmount, pdfPath },
    });
    generated++;
  }

  return { generated, skipped };
}

export async function listPendingDunnings(brand: string): Promise<PendingDunning[]> {
  await initBillingTables();
  const r = await pool.query(
    `SELECT d.id, d.invoice_id, d.level, d.outstanding_at_generation, d.fee_amount, d.interest_amount, d.pdf_path,
            i.number AS invoice_number, c.email AS customer_email, c.name AS customer_name
       FROM billing_invoice_dunnings d
       JOIN billing_invoices i ON i.id = d.invoice_id
       JOIN billing_customers c ON c.id = i.customer_id
      WHERE d.brand=$1 AND d.sent_at IS NULL AND i.status <> 'cancelled'
      ORDER BY d.generated_at ASC`,
    [brand]
  );
  return r.rows.map((row: Record<string, unknown>) => ({
    id: row.id as string,
    invoiceId: row.invoice_id as string,
    invoiceNumber: row.invoice_number as string,
    level: Number(row.level),
    customerEmail: row.customer_email as string,
    customerName: row.customer_name as string,
    outstanding: Number(row.outstanding_at_generation),
    feeAmount: Number(row.fee_amount),
    interestAmount: Number(row.interest_amount),
    pdfPath: row.pdf_path as string,
  }));
}

export async function sendDunning(id: string, actorEmail: string): Promise<boolean> {
  const r = await pool.query(
    `SELECT d.id, d.level, d.invoice_id, d.fee_amount, d.interest_amount, d.outstanding_at_generation,
            i.number, i.payment_reference, c.email, c.name
       FROM billing_invoice_dunnings d
       JOIN billing_invoices i ON i.id = d.invoice_id
       JOIN billing_customers c ON c.id = i.customer_id
      WHERE d.id=$1 AND d.sent_at IS NULL`,
    [id]
  );
  const row = r.rows[0];
  if (!row) return false;
  const total = Number(row.outstanding_at_generation) + Number(row.fee_amount) + Number(row.interest_amount);
  const ok = await sendEmail({
    to: row.email,
    subject: `Mahnung ${row.level} zu Rechnung ${row.number}`,
    text:
      `Hallo ${row.name},\n\n` +
      `zur Rechnung ${row.number} ist weiterhin ein Betrag offen.\n` +
      `Offener Betrag: ${fmt(Number(row.outstanding_at_generation))}\n` +
      `Mahngebühr: ${fmt(Number(row.fee_amount))}\n` +
      `Verzugszins: ${fmt(Number(row.interest_amount))}\n` +
      `Gesamt: ${fmt(total)}\n\n` +
      `Verwendungszweck: ${row.payment_reference ?? row.number}\n`,
  });
  if (!ok) return false;
  await pool.query(`UPDATE billing_invoice_dunnings SET sent_at=now(), sent_by=$2 WHERE id=$1`, [id, actorEmail]);
  await logBillingEvent({
    invoiceId: row.invoice_id as string,
    action: 'dunning_sent',
    reason: `Mahnung ${row.level}`,
    metadata: { dunningId: id, sentBy: actorEmail },
  });
  return true;
}

