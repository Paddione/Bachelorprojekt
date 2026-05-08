import { pool, initBillingTables } from './website-db';
import {
  createCustomer as nativeCreateCustomer,
  createInvoice as nativeCreateInvoice,
  getCustomerById as nativeGetCustomerById,
} from './native-billing';

// ---- Static service catalog ----
export const SERVICES = {
  'erstgespraech':       { name: 'Kostenloses Erstgespräch',                          cents: 0,      unit: 'Einheit',       stripePriceId: null },
  'callback':            { name: 'Rückruf',                                           cents: 0,      unit: 'Einheit',       stripePriceId: null },
  'meeting':             { name: 'Online-Meeting',                                     cents: 0,      unit: 'Einheit',       stripePriceId: null },
  'termin':              { name: 'Termin vor Ort',                                     cents: 0,      unit: 'Einheit',       stripePriceId: null },
  '50plus-digital-einzel':  { name: '50+ digital — Einzelbegleitung',                 cents: 6000,   unit: 'Stunde',        stripePriceId: 'price_1TQpf1PmjoQCVSEjnmgFkS8K' },
  '50plus-digital-gruppe':  { name: '50+ digital — Kleine Gruppe',                    cents: 4000,   unit: 'Person/Stunde', stripePriceId: 'price_1TQpf1PmjoQCVSEjJ4owABi3' },
  '50plus-digital-5er':     { name: '50+ digital — 5er-Paket',                        cents: 27000,  unit: 'Paket',         stripePriceId: 'price_1TQpf2PmjoQCVSEjXXJ8yzjL' },
  '50plus-digital-10er':    { name: '50+ digital — 10er-Paket',                       cents: 50000,  unit: 'Paket',         stripePriceId: 'price_1TQpf3PmjoQCVSEjEaHsjWdy' },
  'coaching-session':    { name: 'Führungskräfte-Coaching — Einzelsession (90 Min.)', cents: 15000,  unit: 'Session',       stripePriceId: 'price_1TQpf3PmjoQCVSEj7wrNVb5P' },
  'coaching-6er':        { name: 'Führungskräfte-Coaching — 6er-Paket',               cents: 80000,  unit: 'Paket',         stripePriceId: 'price_1TQpf4PmjoQCVSEjVYaoLJR4' },
  'coaching-intensiv':   { name: 'Führungskräfte-Coaching — Intensiv-Tag (6 Std.)',   cents: 50000,  unit: 'Tag',           stripePriceId: 'price_1TQpf4PmjoQCVSEjLybAjVOi' },
  'beratung-tag':        { name: 'Unternehmensberatung — Tagessatz',                   cents: 100000, unit: 'Tag',           stripePriceId: 'price_1TQpf5PmjoQCVSEjy1MDFQRL' },
} as const;

export type ServiceKey = keyof typeof SERVICES;

// ---- Types ----
export interface BillingCustomer {
  id: string;
  name: string;
  email: string;
}

export type InvoiceStatus = 'draft' | 'open' | 'paid' | 'void' | 'uncollectible';

export interface BillingInvoice {
  id: string;
  number: string;
  date: string;
  dueDate: string;
  amountDue: number;
  amountPaid: number;
  amountRemaining: number;
  status: InvoiceStatus;
  statusLabel: string;
  hostedUrl: string | null;
  pdfUrl: string | null;
}

export interface AdminBillingInvoice extends BillingInvoice {
  customerName: string;
  customerEmail: string;
}

export interface DraftInvoiceItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  currency: string;
}

export interface DraftInvoiceDetail extends AdminBillingInvoice {
  items: DraftInvoiceItem[];
  currency: string;
  subtotalExclTax: number;
  taxAmount: number;
  taxPercent: number;
}

export interface FullInvoice extends AdminBillingInvoice {
  items: DraftInvoiceItem[];
  currency: string;
  subtotalExclTax: number;
  taxAmount: number;
  taxPercent: number;
}

const STATUS_LABELS: Record<string, string> = {
  draft:         'Entwurf',
  open:          'Offen',
  partially_paid: 'Teilbezahlt',
  paid:          'Bezahlt',
  void:          'Storniert',
  cancelled:     'Storniert',
  uncollectible: 'Überfällig',
};

function toDate(v: unknown): string {
  if (!v) return '';
  return (v as Date).toISOString().split('T')[0];
}

function mapRow(row: Record<string, unknown>): BillingInvoice {
  const gross = Number(row.gross_amount ?? 0);
  const paid  = Number(row.paid_amount ?? 0);
  const status = (row.status as string) === 'cancelled' ? 'void' : (row.status as string) as InvoiceStatus;
  return {
    id:              row.id as string,
    number:          (row.number as string) ?? '',
    date:            toDate(row.issue_date),
    dueDate:         toDate(row.due_date),
    amountDue:       gross,
    amountPaid:      paid,
    amountRemaining: gross - paid,
    status,
    statusLabel:     STATUS_LABELS[row.status as string] ?? 'Unbekannt',
    hostedUrl:       null,
    pdfUrl:          null,
  };
}

function mapAdminRow(row: Record<string, unknown>): AdminBillingInvoice {
  return {
    ...mapRow(row),
    customerName:  (row.customer_name as string)  ?? '',
    customerEmail: (row.customer_email as string) ?? '',
  };
}

// ---- Functions ----

export function stripeInvoiceDashboardUrl(_invoiceId: string): string {
  return '#';
}

export async function getOrCreateCustomer(params: {
  brand: string; name: string; email: string; company?: string;
}): Promise<BillingCustomer> {
  const c = await nativeCreateCustomer({ brand: params.brand, name: params.name, email: params.email, company: params.company });
  return { id: c.id, name: c.name, email: c.email };
}

export async function getAllBillingInvoices(params?: {
  status?: string; perPage?: number;
}): Promise<AdminBillingInvoice[]> {
  await initBillingTables();
  const brand = process.env.BRAND || 'mentolder';
  const limit = params?.perPage ?? 200;
  const statusFilter = params?.status ? `AND i.status = '${params.status.replace(/'/g,"''")}'` : '';
  const r = await pool.query(
    `SELECT i.*, c.name AS customer_name, c.email AS customer_email
     FROM billing_invoices i
     JOIN billing_customers c ON c.id = i.customer_id AND c.brand = $1
     WHERE i.brand = $1 ${statusFilter}
     ORDER BY i.created_at DESC LIMIT $2`,
    [brand, limit]
  );
  return r.rows.map(mapAdminRow);
}

export async function getDraftInvoices(): Promise<AdminBillingInvoice[]> {
  await initBillingTables();
  const brand = process.env.BRAND || 'mentolder';
  const r = await pool.query(
    `SELECT i.*, c.name AS customer_name, c.email AS customer_email
     FROM billing_invoices i
     JOIN billing_customers c ON c.id = i.customer_id AND c.brand = $1
     WHERE i.brand = $1 AND i.status = 'draft'
     ORDER BY i.created_at DESC LIMIT 100`,
    [brand]
  );
  return r.rows.map(mapAdminRow);
}

export async function getDraftInvoiceCount(): Promise<number> {
  await initBillingTables();
  const brand = process.env.BRAND || 'mentolder';
  const r = await pool.query(
    `SELECT COUNT(*)::int AS count FROM billing_invoices WHERE brand = $1 AND status = 'draft'`,
    [brand]
  );
  return r.rows[0]?.count ?? 0;
}

export async function getCustomerInvoices(customerEmail: string): Promise<BillingInvoice[]> {
  await initBillingTables();
  const brand = process.env.BRAND || 'mentolder';
  const r = await pool.query(
    `SELECT i.* FROM billing_invoices i
     JOIN billing_customers c ON c.id = i.customer_id AND c.brand = $1
     WHERE i.brand = $1 AND c.email = $2
     ORDER BY i.created_at DESC LIMIT 50`,
    [brand, customerEmail]
  );
  return r.rows.map(mapRow);
}

export async function getDraftInvoiceDetail(invoiceId: string): Promise<DraftInvoiceDetail | null> {
  await initBillingTables();
  const brand = process.env.BRAND || 'mentolder';
  const r = await pool.query(
    `SELECT i.*, c.name AS customer_name, c.email AS customer_email
     FROM billing_invoices i
     JOIN billing_customers c ON c.id = i.customer_id AND c.brand = $1
     WHERE i.id = $2 AND i.brand = $1`,
    [brand, invoiceId]
  );
  if (!r.rows[0]) return null;
  const row = r.rows[0];
  const linesR = await pool.query(
    `SELECT * FROM billing_invoice_line_items WHERE invoice_id = $1 ORDER BY id`,
    [invoiceId]
  );
  const items: DraftInvoiceItem[] = linesR.rows.map((l: Record<string, unknown>) => ({
    id: String(l.id),
    description: l.description as string,
    quantity: Number(l.quantity),
    unitPrice: Number(l.unit_price),
    amount: Number(l.net_amount),
    currency: 'EUR',
  }));
  const base = mapAdminRow(row);
  return {
    ...base,
    items,
    currency: 'EUR',
    subtotalExclTax: Number(row.net_amount ?? 0),
    taxAmount:       Number(row.tax_amount ?? 0),
    taxPercent:      Number(row.tax_rate ?? 0),
  };
}

export async function getFullInvoice(invoiceId: string): Promise<FullInvoice | null> {
  return getDraftInvoiceDetail(invoiceId);
}

/**
 * Creates a draft invoice in the native billing system for a single service line.
 *
 * This is the compatibility shim that callers from the booking-confirmation flow
 * (admin/inbox/[id]/action.ts → approve_booking) and the admin CreateInvoiceModal
 * use. The legacy name comes from the pre-2026 Stripe integration; today it
 * delegates to native-billing's `createInvoice`.
 *
 * SERVICES.cents is in cents — convert to euros (the unit native-billing stores
 * in `unit_price`). The returned shape mirrors `BillingInvoice` so existing
 * callers (which read `id`, `number`, `amountDue`) keep working unchanged.
 */
export async function createBillingInvoice(params: {
  customerId: string;
  serviceKey: ServiceKey;
  quantity?: number;
  sendEmail?: boolean;
}): Promise<BillingInvoice> {
  const brand = process.env.BRAND || 'mentolder';
  const service = SERVICES[params.serviceKey];
  if (!service) throw new Error(`createBillingInvoice: unknown serviceKey "${params.serviceKey}"`);
  if (service.cents <= 0) {
    throw new Error(`createBillingInvoice: service "${params.serviceKey}" has no chargeable price`);
  }

  // Verify the customer exists in this brand to fail fast with a clear message
  // instead of a foreign-key violation deep inside the INSERT.
  const customer = await nativeGetCustomerById(brand, params.customerId);
  if (!customer) {
    throw new Error(`createBillingInvoice: customer ${params.customerId} not found for brand ${brand}`);
  }

  const quantity = params.quantity ?? 1;
  const unitPriceEur = service.cents / 100;

  const inv = await nativeCreateInvoice({
    brand,
    customerId: params.customerId,
    issueDate: new Date().toISOString().split('T')[0],
    dueDays: 14,
    taxMode: 'regelbesteuerung',
    taxRate: 19,
    lines: [{
      description: service.name,
      quantity,
      unitPrice: unitPriceEur,
      unit: service.unit,
    }],
  });

  return {
    id: inv.id,
    number: inv.number,
    date: inv.issueDate,
    dueDate: inv.dueDate,
    amountDue: inv.grossAmount,
    amountPaid: 0,
    amountRemaining: inv.grossAmount,
    status: 'draft',
    statusLabel: STATUS_LABELS.draft ?? 'Entwurf',
    hostedUrl: null,
    pdfUrl: null,
  };
}

export async function createBillingQuote(_params: unknown): Promise<unknown> {
  throw new Error('createBillingQuote: use native billing instead');
}

export async function createMonthlyDraftInvoices(_params: unknown): Promise<unknown[]> {
  console.warn('[stripe-billing] createMonthlyDraftInvoices: native billing only');
  return [];
}

export async function sendDraftInvoice(_invoiceId: string): Promise<void> {
  console.warn('[stripe-billing] sendDraftInvoice: use /api/admin/billing/[id]/send instead');
}

export async function discardDraftInvoice(invoiceId: string): Promise<void> {
  await initBillingTables();
  const brand = process.env.BRAND || 'mentolder';
  await pool.query(
    `DELETE FROM billing_invoices WHERE id = $1 AND brand = $2 AND status = 'draft'`,
    [invoiceId, brand]
  );
}

export async function updateDraftInvoiceItem(_itemId: string, _params: unknown): Promise<void> {
  console.warn('[stripe-billing] updateDraftInvoiceItem: use native billing item routes');
}

export async function addDraftInvoiceItem(_invoiceId: string, _params: unknown): Promise<DraftInvoiceItem> {
  throw new Error('addDraftInvoiceItem: use native billing item routes instead');
}

export async function deleteDraftInvoiceItem(_itemId: string): Promise<void> {
  console.warn('[stripe-billing] deleteDraftInvoiceItem: use native billing item routes');
}
