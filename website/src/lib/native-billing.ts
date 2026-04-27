import { pool, initBillingTables, getNextInvoiceNumber } from './website-db';
import { checkAndApplyTaxModeSwitch } from './tax-monitor';

export { initBillingTables };

export interface Customer {
  id: string; brand: string; name: string; email: string;
  company?: string; addressLine1?: string; city?: string;
  postalCode?: string; country: string; vatNumber?: string;
  sepaIban?: string; sepaBic?: string;
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
}

export async function createInvoice(p: {
  brand: string; customerId: string; issueDate: string; dueDays: number;
  taxMode: 'kleinunternehmer' | 'regelbesteuerung';
  taxRate?: number; lines: InvoiceLine[]; notes?: string;
  servicePeriodStart?: string; servicePeriodEnd?: string;
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
         tax_amount, gross_amount, notes, payment_reference)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
      [p.brand, number, p.customerId, p.issueDate,
       dueDate.toISOString().split('T')[0],
       p.servicePeriodStart??null, p.servicePeriodEnd??null,
       p.taxMode, netAmount, taxRate, taxAmount, grossAmount,
       p.notes??null, paymentRef]
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

export async function finalizeInvoice(id: string): Promise<Invoice | null> {
  await initBillingTables();
  const r = await pool.query(
    `UPDATE billing_invoices SET status='open', locked=true, updated_at=now()
     WHERE id=$1 AND status='draft' RETURNING *`, [id]
  );
  if (r.rows[0]) {
    const inv = mapInvoice(r.rows[0]);
    await checkAndApplyTaxModeSwitch(inv.brand, id);
    return inv;
  }
  return null;
}

export async function markInvoicePaid(id: string, p: { paidAt: string; paidAmount: number }): Promise<Invoice | null> {
  await initBillingTables();
  const r = await pool.query(
    `UPDATE billing_invoices SET status='paid', paid_at=$2, paid_amount=$3, updated_at=now()
     WHERE id=$1 AND status='open' RETURNING *`,
    [id, p.paidAt, p.paidAmount]
  );
  return r.rows[0] ? mapInvoice(r.rows[0]) : null;
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
  };
}
