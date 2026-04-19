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
  const draft = await stripe.invoices.create({
    customer: params.customerId,
    collection_method: 'send_invoice',
    days_until_due: 30,
    auto_advance: false,
    description: params.notes ?? '',
  });
  await stripe.invoiceItems.create({
    customer: params.customerId,
    invoice: draft.id,
    amount: service.cents * qty,
    currency: 'eur',
    description: `${service.name}${qty > 1 ? ` × ${qty}` : ''}`,
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
  // QuoteCreateParams.LineItem requires a pre-created price (no inline price_data).
  const product = await stripe.products.create({ name: service.name });
  const price = await stripe.prices.create({ product: product.id, unit_amount: service.cents, currency: 'eur' });
  const q = await stripe.quotes.create({
    customer: params.customerId,
    line_items: [{ price: price.id, quantity: qty }],
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

export interface FullInvoice extends AdminBillingInvoice {
  currency: string;
  taxAmount: number;
  subtotalExclTax: number;
  buyerAddress: {
    line1: string;
    city: string;
    postalCode: string;
    country: string;
  } | null;
  buyerVatId: string | null;
  lines: Array<{ description: string; amountNet: number }>;
}

export async function getFullInvoice(invoiceId: string): Promise<FullInvoice | null> {
  if (!process.env.STRIPE_SECRET_KEY) return null;
  const inv = await stripe.invoices.retrieve(invoiceId, {
    expand: ['customer', 'lines'],
  });
  const customer = typeof inv.customer === 'object' && inv.customer !== null
    ? (inv.customer as Stripe.Customer)
    : null;

  const addr = customer?.address;
  const subtotalExcl = centsToEur(inv.subtotal_excluding_tax ?? inv.subtotal ?? 0);
  const total = centsToEur(inv.total ?? 0);
  const taxAmount = total - subtotalExcl;

  return {
    ...mapInvoice(inv),
    customerName: customer?.name ?? '—',
    customerEmail: customer?.email ?? '—',
    currency: (inv.currency ?? 'eur').toUpperCase(),
    taxAmount: Math.max(0, taxAmount),
    subtotalExclTax: subtotalExcl,
    buyerAddress: addr ? {
      line1: addr.line1 ?? '',
      city: addr.city ?? '',
      postalCode: addr.postal_code ?? '',
      country: addr.country ?? 'DE',
    } : null,
    buyerVatId: customer?.metadata?.vat_number ?? null,
    lines: (inv.lines?.data ?? []).map(l => ({
      description: l.description ?? '',
      amountNet: (l.amount ?? 0) / 100,
    })),
  };
}

export interface DraftInvoiceItem {
  lineItemId: string;
  invoiceItemId: string;
  description: string;
  hours: number;
  rateCents: number;
  amountCents: number;
}

export interface DraftInvoiceDetail extends AdminBillingInvoice {
  period: string;
  items: DraftInvoiceItem[];
}

export async function createMonthlyDraftInvoices(
  groups: import('./website-db').UnbilledCustomerGroup[],
  periodLabel: string
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (!process.env.STRIPE_SECRET_KEY) return result;

  for (const group of groups) {
    const customer = await getOrCreateCustomer({
      name: group.customerName,
      email: group.customerEmail,
    });
    if (!customer) continue;

    const byProject = new Map<string, typeof group.entries>();
    for (const entry of group.entries) {
      if (!byProject.has(entry.projectId)) byProject.set(entry.projectId, []);
      byProject.get(entry.projectId)!.push(entry);
    }

    const draft = await stripe.invoices.create({
      customer: customer.id,
      collection_method: 'send_invoice',
      days_until_due: 14,
      auto_advance: false,
      description: `Zeitabrechnung ${periodLabel}`,
    });

    for (const [, entries] of byProject) {
      const projectName  = entries[0].projectName;
      const totalMinutes = entries.reduce((s, e) => s + e.minutes, 0);
      const totalHours   = totalMinutes / 60;
      const weightedRateCents = totalMinutes > 0
        ? Math.round(entries.reduce((s, e) => s + e.rateCents * e.minutes, 0) / totalMinutes)
        : 0;
      const amountCents = Math.round(totalHours * weightedRateCents);
      if (amountCents === 0) continue;

      const descriptions = entries.map(e => e.description).filter(Boolean).join('; ');
      const lineDescription = descriptions
        ? `${projectName} — ${periodLabel}: ${descriptions}`
        : `${projectName} — ${periodLabel}`;

      await stripe.invoiceItems.create({
        customer: customer.id,
        invoice:  draft.id,
        amount:   amountCents,
        currency: 'eur',
        description: lineDescription,
        metadata: {
          project_id:  entries[0].projectId,
          hours:       totalHours.toFixed(2),
          rate_cents:  weightedRateCents.toString(),
        },
      });
    }

    const refreshed = await stripe.invoices.retrieve(draft.id);
    if ((refreshed.lines?.total_count ?? 0) === 0) {
      await stripe.invoices.del(draft.id);
      continue;  // Kunden überspringen
    }
    result.set(group.customerId, draft.id);
  }
  return result;
}

export async function getDraftInvoiceCount(): Promise<number> {
  if (!process.env.STRIPE_SECRET_KEY) return 0;
  const result = await stripe.invoices.list({ status: 'draft', limit: 100 });
  return result.data.length;
}

export async function getDraftInvoices(): Promise<AdminBillingInvoice[]> {
  if (!process.env.STRIPE_SECRET_KEY) return [];
  const result = await stripe.invoices.list({
    status: 'draft',
    limit: 100,
    expand: ['data.customer'],
  });
  return result.data.map(inv => {
    const customer = typeof inv.customer === 'object' && inv.customer !== null
      ? (inv.customer as Stripe.Customer)
      : null;
    return { ...mapInvoice(inv), customerName: customer?.name ?? '—', customerEmail: customer?.email ?? '—' };
  });
}

export async function getDraftInvoiceDetail(invoiceId: string): Promise<DraftInvoiceDetail | null> {
  if (!process.env.STRIPE_SECRET_KEY) return null;
  const inv = await stripe.invoices.retrieve(invoiceId, {
    expand: ['customer'],
  });
  if (inv.status !== 'draft') return null;

  const customer = typeof inv.customer === 'object' && inv.customer !== null
    ? (inv.customer as Stripe.Customer)
    : null;

  const items: DraftInvoiceItem[] = inv.lines.data.map(line => {
    const invoiceItemId = line.parent?.invoice_item_details?.invoice_item ?? '';
    const meta          = line.metadata ?? {};
    const rateCents     = parseInt(meta.rate_cents ?? '0', 10);
    const hours         = parseFloat(meta.hours ?? '0');
    return {
      lineItemId:  line.id,
      invoiceItemId,
      description: line.description ?? '',
      hours,
      rateCents,
      amountCents: line.amount,
    };
  });

  const period = inv.description?.replace('Zeitabrechnung ', '') ?? '';

  return {
    ...mapInvoice(inv),
    customerName: customer?.name ?? '—',
    customerEmail: customer?.email ?? '—',
    period,
    items,
  };
}

export async function updateDraftInvoiceItem(
  invoiceItemId: string,
  params: { description?: string; hours?: number; rateCents?: number }
): Promise<void> {
  if (!process.env.STRIPE_SECRET_KEY) return;
  const { hours, rateCents } = params;
  const amountCents = hours !== undefined && rateCents !== undefined
    ? Math.round(hours * rateCents)
    : undefined;

  await stripe.invoiceItems.update(invoiceItemId, {
    ...(params.description !== undefined ? { description: params.description } : {}),
    ...(amountCents !== undefined        ? { amount: amountCents }             : {}),
    ...((hours !== undefined || rateCents !== undefined) ? {
      metadata: {
        ...(hours     !== undefined ? { hours:      hours.toFixed(2)     } : {}),
        ...(rateCents !== undefined ? { rate_cents: rateCents.toString() } : {}),
      },
    } : {}),
  });
}

export async function addDraftInvoiceItem(
  invoiceId:  string,
  customerId: string,
  params: { description: string; hours: number; rateCents: number }
): Promise<void> {
  if (!process.env.STRIPE_SECRET_KEY) return;
  const amountCents = Math.round(params.hours * params.rateCents);
  await stripe.invoiceItems.create({
    customer: customerId,
    invoice:  invoiceId,
    amount:   amountCents,
    currency: 'eur',
    description: params.description,
    metadata: {
      hours:      params.hours.toFixed(2),
      rate_cents: params.rateCents.toString(),
    },
  });
}

export async function deleteDraftInvoiceItem(invoiceItemId: string): Promise<void> {
  if (!process.env.STRIPE_SECRET_KEY) return;
  await stripe.invoiceItems.del(invoiceItemId);
}

export async function sendDraftInvoice(invoiceId: string): Promise<void> {
  if (!process.env.STRIPE_SECRET_KEY) return;
  await stripe.invoices.finalizeInvoice(invoiceId);
  await stripe.invoices.sendInvoice(invoiceId);
}

export async function discardDraftInvoice(invoiceId: string): Promise<void> {
  if (!process.env.STRIPE_SECRET_KEY) return;
  const items = await stripe.invoiceItems.list({ invoice: invoiceId, limit: 100 });
  for (const item of items.data) {
    await stripe.invoiceItems.del(item.id).catch(() => {});
  }
  await stripe.invoices.del(invoiceId);
}
