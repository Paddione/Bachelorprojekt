import { pool, initBillingTables, getNextInvoiceNumber } from './website-db';
import { checkAndApplyTaxModeSwitch } from './tax-monitor';
import { canonicalInvoiceForHash, sha256Hex, type HashableLine } from './invoice-hash';
import { logBillingEvent, type BillingActor } from './billing-audit';
import { validateLeitwegId, formatLeitwegId } from './leitweg';

export { initBillingTables };

export interface Customer {
  id: string; brand: string; name: string; email: string;
  company?: string; addressLine1?: string; city?: string;
  postalCode?: string; landIso: string; vatNumber?: string;
  sepaIban?: string; sepaBic?: string;
  leitwegId?: string;
  sepaMandateRef?: string; sepaMandateDate?: string;
  defaultLeitwegId?: string;
}

export async function createCustomer(p: {
  brand: string; name: string; email: string; company?: string;
  addressLine1?: string; city?: string; postalCode?: string;
  vatNumber?: string; leitwegId?: string;
}): Promise<Customer> {
  await initBillingTables();
  const r = await pool.query(
    `INSERT INTO billing_customers (brand, name, email, company, address_line1, city, postal_code, vat_number, typ, leitweg_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'Kunde',$9)
     ON CONFLICT (brand, email, typ) DO UPDATE
       SET name=EXCLUDED.name, company=EXCLUDED.company,
           address_line1=EXCLUDED.address_line1, city=EXCLUDED.city,
           postal_code=EXCLUDED.postal_code, vat_number=EXCLUDED.vat_number,
           leitweg_id=EXCLUDED.leitweg_id
     RETURNING *`,
    [p.brand, p.name, p.email, p.company??null, p.addressLine1??null,
     p.city??null, p.postalCode??null, p.vatNumber??null, p.leitwegId??null]
  );
  return mapCustomer(r.rows[0]);
}

export async function setBillingCustomerLeitwegId(
  id: string,
  raw: string | null,
): Promise<{ ok: true; value: string | null } | { ok: false; reason: string }> {
  await initBillingTables();
  if (raw === null || raw === '') {
    await pool.query(`UPDATE billing_customers SET leitweg_id = NULL WHERE id = $1`, [id]);
    return { ok: true, value: null };
  }
  const v = validateLeitwegId(raw);
  if (!v.ok) return { ok: false, reason: v.reason ?? 'Format ungültig' };
  const value = formatLeitwegId(raw);
  const r = await pool.query(
    `UPDATE billing_customers SET leitweg_id = $1 WHERE id = $2 RETURNING id`,
    [value, id],
  );
  if (r.rowCount === 0) return { ok: false, reason: 'Kunde nicht gefunden' };
  return { ok: true, value };
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
  taxCategory?: string;
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
  currency: string;
  currencyRate: number | null;
  netAmountEur: number;
  grossAmountEur: number;
  supplyType?: string;
  kind: 'regular' | 'prepayment' | 'final' | 'gutschrift';
  parentInvoiceId?: string;
}

export async function createInvoice(params: {
  brand: string; customerId: string; issueDate: string; dueDays: number;
  taxMode: 'kleinunternehmer' | 'regelbesteuerung';
  taxRate?: number; lines: InvoiceLine[]; notes?: string;
  servicePeriodStart?: string; servicePeriodEnd?: string;
  leitwegId?: string;
  currency?: string;
  supplyType?: string;
  kind?: 'regular' | 'prepayment' | 'final' | 'gutschrift';
  parentInvoiceId?: string;
}): Promise<Invoice> {
  await initBillingTables();
  // Reverse charge enforcement
  let p = params;
  const hasAeLines = (p.lines as Array<InvoiceLine & { taxCategory?: string }>)
    .some(l => l.taxCategory === 'AE');
  if (hasAeLines) {
    const customer = await getCustomerById(p.brand, p.customerId);
    if (!customer?.vatNumber) {
      throw new Error('Reverse charge (AE) requires a VAT ID on the customer');
    }
    if (!p.supplyType) p = { ...p, supplyType: 'eu_b2b_services' };
  }
  const currency = (p.currency ?? 'EUR').toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error(`Invalid currency code: ${p.currency}`);
  let currencyRate: number | null = null;
  if (currency !== 'EUR') {
    const { fetchEcbRates, eurPer } = await import('./ecb-exchange-rates');
    const rates = await fetchEcbRates();
    currencyRate = eurPer(currency, rates);
  }
  const number = await getNextInvoiceNumber(p.brand);
  const issueDate = new Date(p.issueDate);
  const dueDate = new Date(issueDate);
  dueDate.setDate(dueDate.getDate() + p.dueDays);

  const netAmount = p.lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
  const taxRate   = p.taxMode === 'kleinunternehmer' ? 0 : (p.taxRate ?? 19);
  const taxAmount = Math.round(netAmount * (taxRate / 100) * 100) / 100;
  const grossAmount = netAmount + taxAmount;
  const netAmountEur  = currencyRate !== null ? Math.round(netAmount * currencyRate * 100) / 100 : netAmount;
  const grossAmountEur = currencyRate !== null ? Math.round(grossAmount * currencyRate * 100) / 100 : grossAmount;
  const paymentRef = number.replace('RE-', 'RG');
  const kind = p.kind ?? 'regular';

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const r = await client.query(
      `INSERT INTO billing_invoices (brand, number, customer_id, issue_date, due_date,
         service_period_start, service_period_end, tax_mode, net_amount, tax_rate,
         tax_amount, gross_amount, notes, payment_reference, leitweg_id,
         currency, currency_rate, net_amount_eur, gross_amount_eur, supply_type,
         kind, parent_invoice_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22) RETURNING *`,
      [p.brand, number, p.customerId, p.issueDate,
       dueDate.toISOString().split('T')[0],
       p.servicePeriodStart??null, p.servicePeriodEnd??null,
       p.taxMode, netAmount, taxRate, taxAmount, grossAmount,
       p.notes??null, paymentRef, p.leitwegId??null,
       currency, currencyRate, netAmountEur, grossAmountEur, p.supplyType??null,
       kind, p.parentInvoiceId??null]
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

    if (opts.pdfBlob) {
      const { archiveBillingPdf } = await import('./billing-archive');
      const pdfPath = await archiveBillingPdf({
        brand: inv.brand,
        invoiceNumber: inv.number,
        filename: `${inv.number}.pdf`,
        content: opts.pdfBlob,
      });
      if (pdfPath) {
        await client.query(`UPDATE billing_invoices SET pdf_path=$2 WHERE id=$1`, [id, pdfPath]);
      }
    }

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
    currency: (row.currency as string) ?? 'EUR',
    currencyRate: row.currency_rate != null ? Number(row.currency_rate) : null,
    netAmountEur: row.net_amount_eur != null ? Number(row.net_amount_eur) : Number(row.net_amount),
    grossAmountEur: row.gross_amount_eur != null ? Number(row.gross_amount_eur) : Number(row.gross_amount),
    supplyType: (row.supply_type as string) ?? undefined,
    kind: ((row.kind as string) ?? 'regular') as 'regular' | 'prepayment' | 'final' | 'gutschrift',
    parentInvoiceId: (row.parent_invoice_id as string) ?? undefined,
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
    landIso: (row.land_iso as string) ?? 'DE',
    vatNumber: (row.vat_number as string) ?? undefined,
    sepaIban: (row.sepa_iban as string) ?? undefined,
    sepaBic: (row.sepa_bic as string) ?? undefined,
    leitwegId: (row.leitweg_id as string) ?? undefined,
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

import type { EInvoiceInput } from './einvoice-types';

/**
 * Loads a finalized invoice and assembles the EInvoiceInput payload used by
 * the e-invoice generators (Factur-X minimum, XRechnung CII, XRechnung UBL).
 * Seller data is sourced from process.env (SELLER_* with BRAND_NAME fallback).
 */
export async function getInvoiceForEInvoice(id: string): Promise<EInvoiceInput | null> {
  await initBillingTables();
  const r = await pool.query(
    `SELECT i.*, c.name AS c_name, c.email AS c_email, c.address_line1 AS c_addr,
            c.postal_code AS c_zip, c.city AS c_city, c.leitweg_id AS c_leitweg
       FROM billing_invoices i
       JOIN billing_customers c ON c.id = i.customer_id
      WHERE i.id = $1`,
    [id]
  );
  const row = r.rows[0];
  if (!row) return null;
  const lines = (
    await pool.query(
      `SELECT * FROM billing_invoice_line_items WHERE invoice_id = $1 ORDER BY id`,
      [id]
    )
  ).rows;

  const toIsoDate = (v: unknown): string => {
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    if (typeof v === 'string') return v.slice(0, 10);
    return String(v);
  };

  return {
    invoice: {
      number: row.number,
      issueDate: toIsoDate(row.issue_date),
      dueDate: toIsoDate(row.due_date),
      grossAmount: Number(row.gross_amount),
      netAmount: Number(row.net_amount),
      taxAmount: Number(row.tax_amount),
      taxMode: row.tax_mode,
      taxRate: Number(row.tax_rate),
      paymentReference: row.payment_reference ?? undefined,
    },
    lines: lines.map((l) => ({
      description: l.description,
      quantity: Number(l.quantity),
      unitPrice: Number(l.unit_price),
      unit: l.unit ?? 'C62',
    })),
    customer: {
      name: row.c_name,
      email: row.c_email,
      addressLine1: row.c_addr ?? undefined,
      postalCode: row.c_zip ?? undefined,
      city: row.c_city ?? undefined,
      country: 'DE',
      leitwegId: row.c_leitweg ?? undefined,
    },
    seller: {
      name:       process.env.SELLER_NAME        || process.env.BRAND_NAME || 'Unbekannt',
      address:    process.env.SELLER_ADDRESS     || '',
      postalCode: process.env.SELLER_POSTAL_CODE || '',
      city:       process.env.SELLER_CITY        || '',
      country:    process.env.SELLER_COUNTRY     || 'DE',
      vatId:      process.env.SELLER_VAT_ID      || '',
      iban:       process.env.SELLER_IBAN        || undefined,
      bic:        process.env.SELLER_BIC         || undefined,
      email:      process.env.SELLER_EMAIL       || undefined,
      phone:      process.env.SELLER_PHONE       || undefined,
    },
  };
}
