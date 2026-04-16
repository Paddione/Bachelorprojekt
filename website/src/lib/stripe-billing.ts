// stripe-billing.ts — Customer, invoice, and quote management via Stripe.
// Replaces invoiceninja.ts.
import Stripe from 'stripe';
import { stripe } from './stripe';

export const SERVICES = {
  'erstgespraech':       { name: 'Kostenloses Erstgespräch',                         cents: 0,      unit: 'Einheit' },
  'callback':            { name: 'Rückruf',                                          cents: 0,      unit: 'Einheit' },
  'meeting':             { name: 'Online-Meeting',                                    cents: 0,      unit: 'Einheit' },
  'termin':              { name: 'Termin vor Ort',                                    cents: 0,      unit: 'Einheit' },
  'digital-cafe-einzel': { name: '50+ digital — Einzelbegleitung',                   cents: 6000,   unit: 'Stunde' },
  'digital-cafe-gruppe': { name: '50+ digital — Kleine Gruppe',                      cents: 4000,   unit: 'Person/Stunde' },
  'digital-cafe-5er':    { name: '50+ digital — 5er-Paket',                          cents: 27000,  unit: 'Paket' },
  'digital-cafe-10er':   { name: '50+ digital — 10er-Paket',                         cents: 50000,  unit: 'Paket' },
  'coaching-session':    { name: 'Führungskräfte-Coaching — Einzelsession (90 Min.)', cents: 15000,  unit: 'Session' },
  'coaching-6er':        { name: 'Führungskräfte-Coaching — 6er-Paket',              cents: 80000,  unit: 'Paket' },
  'coaching-intensiv':   { name: 'Führungskräfte-Coaching — Intensiv-Tag (6 Std.)',   cents: 50000,  unit: 'Tag' },
  'beratung-tag':        { name: 'Unternehmensberatung — Tagessatz',                  cents: 100000, unit: 'Tag' },
} as const;

export type ServiceKey = keyof typeof SERVICES;

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

const STATUS_LABELS: Record<string, string> = {
  draft:         'Entwurf',
  open:          'Offen',
  paid:          'Bezahlt',
  void:          'Storniert',
  uncollectible: 'Überfällig',
};

function fromUnix(ts: number | null | undefined): string {
  if (!ts) return '';
  return new Date(ts * 1000).toISOString().split('T')[0];
}

function centsToEur(cents: number | null | undefined): number {
  return (cents ?? 0) / 100;
}

function mapInvoice(inv: Stripe.Invoice): BillingInvoice {
  return {
    id: inv.id,
    number: inv.number ?? '',
    date: fromUnix(inv.created),
    dueDate: fromUnix(inv.due_date),
    amountDue: centsToEur(inv.amount_due),
    amountPaid: centsToEur(inv.amount_paid),
    amountRemaining: centsToEur(inv.amount_remaining),
    status: (inv.status ?? 'draft') as InvoiceStatus,
    statusLabel: STATUS_LABELS[inv.status ?? 'draft'] ?? 'Unbekannt',
    hostedUrl: inv.hosted_invoice_url ?? null,
    pdfUrl: inv.invoice_pdf ?? null,
  };
}

export function stripeInvoiceDashboardUrl(invoiceId: string): string {
  const isTest = (process.env.STRIPE_SECRET_KEY ?? '').startsWith('sk_test_');
  const base = isTest ? 'https://dashboard.stripe.com/test' : 'https://dashboard.stripe.com';
  return `${base}/invoices/${invoiceId}`;
}

export async function getOrCreateCustomer(params: {
  name: string; email: string; phone?: string; company?: string;
  address1?: string; city?: string; postalCode?: string; vatNumber?: string;
}): Promise<BillingCustomer | null> {
  if (!process.env.STRIPE_SECRET_KEY) {
    console.log('[stripe-billing] No STRIPE_SECRET_KEY. Would create customer:', params.name);
    return null;
  }
  const search = await stripe.customers.search({ query: `email:"${params.email}"`, limit: 1 });
  if (search.data.length > 0) {
    const c = search.data[0];
    return { id: c.id, name: c.name ?? '', email: c.email ?? '' };
  }
  const c = await stripe.customers.create({
    name: params.company || params.name,
    email: params.email,
    phone: params.phone,
    address: params.address1 ? { line1: params.address1, city: params.city, postal_code: params.postalCode, country: 'DE' } : undefined,
    metadata: { vat_number: params.vatNumber ?? '' },
    preferred_locales: ['de'],
  });
  return { id: c.id, name: c.name ?? '', email: c.email ?? '' };
}

export async function createBillingInvoice(params: {
  customerId: string; serviceKey: ServiceKey; quantity?: number; notes?: string; sendEmail?: boolean;
}): Promise<BillingInvoice | null> {
  if (!process.env.STRIPE_SECRET_KEY) return null;
  const service = SERVICES[params.serviceKey];
  const qty = params.quantity ?? 1;
  await stripe.invoiceItems.create({
    customer: params.customerId,
    amount: service.cents * qty,
    currency: 'eur',
    description: `${service.name}${qty > 1 ? ` × ${qty}` : ''}`,
  });
  const draft = await stripe.invoices.create({
    customer: params.customerId,
    collection_method: 'send_invoice',
    days_until_due: 30,
    auto_advance: false,
    description: params.notes ?? '',
  });
  const finalized = await stripe.invoices.finalizeInvoice(draft.id);
  if (params.sendEmail) await stripe.invoices.sendInvoice(finalized.id);
  return mapInvoice(finalized);
}

export async function createBillingQuote(params: {
  customerId: string; serviceKey: ServiceKey; quantity?: number; notes?: string;
}): Promise<{ id: string; status: string; amountTotal: number } | null> {
  if (!process.env.STRIPE_SECRET_KEY) return null;
  const service = SERVICES[params.serviceKey];
  const qty = params.quantity ?? 1;
  // Quotes.PriceData requires an existing product ID (no inline product_data).
  // Create an ephemeral product first, then reference it.
  const product = await stripe.products.create({ name: service.name });
  const q = await stripe.quotes.create({
    customer: params.customerId,
    line_items: [{ price_data: { currency: 'eur', product: product.id, unit_amount: service.cents }, quantity: qty }],
    description: params.notes ?? '',
  });
  return { id: q.id, status: q.status, amountTotal: centsToEur(q.amount_total) };
}

export async function getCustomerInvoices(customerEmail: string): Promise<BillingInvoice[]> {
  if (!process.env.STRIPE_SECRET_KEY) return [];
  const search = await stripe.customers.search({ query: `email:"${customerEmail}"`, limit: 1 });
  if (!search.data.length) return [];
  const result = await stripe.invoices.list({ customer: search.data[0].id, limit: 50 });
  return result.data.map(mapInvoice);
}

export async function getAllBillingInvoices(params?: {
  status?: string; perPage?: number;
}): Promise<AdminBillingInvoice[]> {
  if (!process.env.STRIPE_SECRET_KEY) return [];
  const result = await stripe.invoices.list({
    limit: params?.perPage ?? 100,
    status: (params?.status as Stripe.InvoiceListParams['status']) || undefined,
    expand: ['data.customer'],
  });
  return result.data.map(inv => {
    const customer = typeof inv.customer === 'object' && inv.customer !== null
      ? (inv.customer as Stripe.Customer)
      : null;
    return { ...mapInvoice(inv), customerName: customer?.name ?? '—', customerEmail: customer?.email ?? '—' };
  });
}
