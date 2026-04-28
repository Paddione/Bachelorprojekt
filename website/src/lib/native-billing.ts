import { pool, initBillingTables, getNextInvoiceNumber } from './website-db';
import { checkAndApplyTaxModeSwitch } from './tax-monitor';
import { canonicalInvoiceForHash, sha256Hex, type HashableLine } from './invoice-hash';
import { logBillingEvent, type BillingActor } from './billing-audit';

export { initBillingTables };

export interface Customer {
  id: string; brand: string; name: string; email: string;
  company?: string; addressLine1?: string; city?: string;
  postalCode?: string; country: string; vatNumber?: string;
  sepaIban?: string; sepaBic?: string;
  sepaMandateRef?: string; sepaMandateDate?: string;
  defaultLeitwegId?: string;
}

export async function createCustomer(p: {
  brand: string; name: string; email: string; company?: string;
  addressLine1?: string; city?: string; postalCode?: string;
  vatNumber?: string;
}): Promise<Customer> {
  await initBillingTables();
  const r = await pool.query(
    `INSERT INTO billing_customers (brand, name, email, company, address_line1, city, postal_code, vat_number)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (brand, email) DO UPDATE
       SET name=EXCLUDED.name, company=EXCLUDED.company,
           address_line1=EXCLUDED.address_line1, city=EXCLUDED.city,
           postal_code=EXCLUDED.postal_code, vat_number=EXCLUDED.vat_number
     RETURNING *`,
    [p.brand, p.name, p.email, p.company??null, p.addressLine1??null,
     p.city??null, p.postalCode??null, p.vatNumber??null]
  );
  return mapCustomer(r.rows[0]);
}

export async function getCustomerByEmail(brand: string, email: string): Promise<Customer | null> {
  await initBillingTables();
  const r = await pool.query(`SELECT * FROM billing_customers WHERE brand=$1 AND email=$2`, [brand, email]);
  return r.rows[0] ? mapCustomer(r.rows[0]) : null;
}

export async function getCustomerById(brand: string, id: string): Promise<Customer | null> {
  await initBillingTables();
  const r = await pool.query(`SELECT * FROM billing_customers WHERE id=$1 AND brand=$2`, [id, brand]);
  return r.rows[0] ? mapCustomer(r.rows[0]) : null;
}

export interface InvoiceLine {
  description: string; quantity: number; unitPrice: number; unit?: string;
}

export interface Invoice {
  id: string; brand: string; number: string; status: string;
  customerId: string; issueDate: string; dueDate: string;
  taxMode: string; netAmount: number; taxRate: number;
  taxAmount: number; grossAmount: number; notes?: string;
  paymentReference?: string; paidAt?: string; paidAmount?: number;
  locked: boolean; cancelledInvoiceId?: string;
  servicePeriodStart?: string; servicePeriodEnd?: string;
  leitwegId?: string;
}

export async function createInvoice(p: {
  brand: string; customerId: string; issueDate: string; dueDays: number;
  taxMode: 'kleinunternehmer' | 'regelbesteuerung';
  taxRate?: number; lines: InvoiceLine[]; notes?: string;
  servicePeriodStart?: string; servicePeriodEnd?: string;
  leitwegId?: string;
}): Promise<Invoice> {
  await initBillingTables();
  const number = await getNextInvoiceNumber(p.brand);
  const issueDate = new Date(p.issueDate);
  const dueDate = new Date(issueDate);
  dueDate.setDate(dueDate.getDate() + p.dueDays);

  const netAmount = p.lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
  const taxRate   = p.taxMode === 'kleinunternehmer' ? 0 : (p.taxRate ?? 19);
  const taxAmount = Math.round(netAmount * (taxRate / 100) * 100) / 100;
  const grossAmount = netAmount + taxAmount;
  const paymentRef = number.replace('RE-', 'RG');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const r = await client.query(
      `INSERT INTO billing_invoices (brand, number, customer_id, issue_date, due_date,
         service_period_start, service_period_end, tax_mode, net_amount, tax_rate,
         tax_amount, gross_amount, notes, payment_reference, leitweg_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
      [p.brand, number, p.customerId, p.issueDate,
       dueDate.toISOString().split('T')[0],
       p.servicePeriodStart??null, p.servicePeriodEnd??null,
       p.taxMode, netAmount, taxRate, taxAmount, grossAmount,
       p.notes??null, paymentRef, p.leitwegId??null]
    );
    const inv = r.rows[0];
    await Promise.all(p.lines.map(l =>
      client.query(
        `INSERT INTO billing_invoice_line_items (invoice_id,description,quantity,unit,unit_price,net_amount)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [inv.id, l.description, l.quantity, l.unit??null, l.unitPrice, l.quantity*l.unitPrice]
      )
    ));
    await client.query('COMMIT');
    return mapInvoice(inv);
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

export async function getInvoice(id: string): Promise<Invoice | null> {
  await initBillingTables();
  const r = await pool.query(`SELECT * FROM billing_invoices WHERE id=$1`, [id]);
  return r.rows[0] ? mapInvoice(r.rows[0]) : null;
}

export interface FinalizeOpts {
  actor?: BillingActor;
  pdfBlob?: Buffer;
  pdfMime?: string;
  invoiceInput?: any;
}

export async function finalizeInvoice(id: string, opts: FinalizeOpts = {}): Promise<Invoice | null> {
  await initBillingTables();

  const client = await pool.connect();
  let inv: Invoice;
  let hash: string;
  try {
    await client.query('BEGIN');
    const upd = await client.query(
      `UPDATE billing_invoices
         SET status='open', locked=true, finalized_at=now(), updated_at=now()
       WHERE id=$1 AND status='draft' RETURNING *`,
      [id]
    );
    if (!upd.rows[0]) { await client.query('ROLLBACK'); return null; }
    const row = upd.rows[0];
    inv = mapInvoice(row);

    if (opts.invoiceInput) {
      const { generateFacturX } = await import('./einvoice/factur-x');
      const { generateXRechnung } = await import('./einvoice/xrechnung');
      const { embedFacturX } = await import('./invoice-pdf');
      const { createSidecarClient, sidecarBaseUrlFromEnv, SidecarUnavailableError } = await import('./einvoice/sidecar-client');

      const facturXXml = generateFacturX(opts.invoiceInput);
      const xrechnungXml = opts.invoiceInput.buyer.leitwegId ? generateXRechnung(opts.invoiceInput) : null;

      let pdfA3: Buffer | undefined = opts.pdfBlob;
      let validation: any = null;

      if (opts.pdfBlob && process.env.EINVOICE_SIDECAR_ENABLED === 'true') {
        try {
          pdfA3 = await embedFacturX(opts.pdfBlob, facturXXml);
          const client = createSidecarClient(sidecarBaseUrlFromEnv());
          validation = await client.validate({ pdf: pdfA3 });
          if (!validation.ok && validation.errors.length > 0) {
            throw new Error(`E-invoice validation failed: ${validation.errors.join('; ')}`);
          }
        } catch (e) {
          if (e instanceof SidecarUnavailableError) throw new Error('E-invoice sidecar unavailable; finalization aborted.');
          throw e;
        }
      }

      await client.query(
        `UPDATE billing_invoices
           SET factur_x_xml=$1,
               xrechnung_xml=$2,
               pdf_a3_blob=$3,
               einvoice_validated_at=$4,
               einvoice_validation_report=$5
         WHERE id=$6`,
        [facturXXml, xrechnungXml, pdfA3 ?? null, validation ? new Date() : null, validation ? JSON.stringify(validation) : null, id]
      );
    }

    const linesR = await client.query(
      `SELECT id, description, quantity, unit_price, net_amount, unit
         FROM billing_invoice_line_items WHERE invoice_id=$1 ORDER BY id`,
      [id]
    );
    const lines: HashableLine[] = linesR.rows.map((l: Record<string, unknown>) => ({
      id: Number(l.id),
      description: l.description as string,
      quantity: Number(l.quantity),
      unitPrice: Number(l.unit_price),
      netAmount: Number(l.net_amount),
      unit: (l.unit as string) ?? undefined,
    }));
    hash = sha256Hex(canonicalInvoiceForHash({
      id: inv.id, number: inv.number, brand: inv.brand, customerId: inv.customerId,
      issueDate: inv.issueDate, dueDate: inv.dueDate,
      servicePeriodStart: inv.servicePeriodStart, servicePeriodEnd: inv.servicePeriodEnd,
      taxMode: inv.taxMode, netAmount: inv.netAmount,
      taxRate: inv.taxRate, taxAmount: inv.taxAmount, grossAmount: inv.grossAmount,
    }, lines));
    await client.query(
      `UPDATE billing_invoices
         SET hash_sha256=$2,
             pdf_blob=$3,
             pdf_mime=$4,
             pdf_size_bytes=$5
       WHERE id=$1`,
      [id, hash,
       opts.pdfBlob ?? null,
       opts.pdfMime ?? (opts.pdfBlob ? 'application/pdf' : null),
       opts.pdfBlob?.length ?? null]
    );
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }

  await checkAndApplyTaxModeSwitch(inv.brand, id);
  await logBillingEvent({
    invoiceId: id,
    action: 'finalize',
    actor: opts.actor,
    fromStatus: 'draft',
    toStatus: 'open',
    metadata: { hash, pdfBytes: opts.pdfBlob?.length ?? null },
  });
  return inv;
}

import { recordPayment } from './invoice-payments';

export async function markInvoicePaid(
  id: string,
  p: { paidAt: string; paidAmount: number },
  actor?: BillingActor,
): Promise<Invoice | null> {
  await initBillingTables();
  const cur = await pool.query(
    `SELECT status FROM billing_invoices WHERE id=$1`, [id],
  );
  if (!cur.rows[0]) return null;
  if (cur.rows[0].status === 'paid') return getInvoice(id);
  if (cur.rows[0].status !== 'open' && cur.rows[0].status !== 'partially_paid') {
    return null;
  }

  const fromStatus = cur.rows[0].status;
  await recordPayment({
    invoiceId:  id,
    paidAt:     p.paidAt,
    amount:     p.paidAmount,
    method:     'legacy',
    recordedBy: actor?.userId ?? 'system',
    notes:      'markInvoicePaid shim',
  });
  const after = await getInvoice(id);
  await logBillingEvent({
    invoiceId: id,
    action: 'mark_paid',
    actor,
    fromStatus,
    toStatus: after?.status ?? 'paid',
    metadata: { paidAt: p.paidAt, paidAmount: p.paidAmount },
  });
  return after;
}

function mapInvoice(row: Record<string, unknown>): Invoice {
  const toDate = (v: unknown) => v ? (v as Date).toISOString().split('T')[0] : undefined;
  return {
    id: row.id as string, brand: row.brand as string,
    number: row.number as string, status: row.status as string,
    customerId: row.customer_id as string,
    issueDate: toDate(row.issue_date)!,
    dueDate:   toDate(row.due_date)!,
    taxMode:   row.tax_mode as string,
    netAmount: Number(row.net_amount),
    taxRate:   Number(row.tax_rate),
    taxAmount: Number(row.tax_amount),
    grossAmount: Number(row.gross_amount),
    notes: (row.notes as string) ?? undefined,
    paymentReference: (row.payment_reference as string) ?? undefined,
    paidAt: toDate(row.paid_at),
    paidAmount: row.paid_amount ? Number(row.paid_amount) : undefined,
    locked: Boolean(row.locked),
    cancelledInvoiceId: (row.cancels_invoice_id as string) ?? undefined,
    servicePeriodStart: toDate(row.service_period_start),
    servicePeriodEnd: toDate(row.service_period_end),
    leitwegId: (row.leitweg_id as string) ?? undefined,
  };
}

function mapCustomer(row: Record<string, unknown>): Customer {
  return {
    id: row.id as string, brand: row.brand as string,
    name: row.name as string, email: row.email as string,
    company: (row.company as string) ?? undefined,
    addressLine1: (row.address_line1 as string) ?? undefined,
    city: (row.city as string) ?? undefined,
    postalCode: (row.postal_code as string) ?? undefined,
    country: (row.country as string) ?? 'DE',
    vatNumber: (row.vat_number as string) ?? undefined,
    sepaIban: (row.sepa_iban as string) ?? undefined,
    sepaBic: (row.sepa_bic as string) ?? undefined,
    sepaMandateRef: (row.sepa_mandate_ref as string) ?? undefined,
    sepaMandateDate: (() => {
      const md = row.sepa_mandate_date;
      if (md instanceof Date)
        return `${md.getFullYear()}-${String(md.getMonth() + 1).padStart(2, '0')}-${String(md.getDate()).padStart(2, '0')}`;
      return (md as string | null) ?? undefined;
    })(),
    defaultLeitwegId: (row.default_leitweg_id as string) ?? undefined,
  };
}
