// InvoiceNinja API helper.
// Creates clients, invoices, and quotes for service bookings.
// Uses InvoiceNinja v5 REST API.

const IN_URL = import.meta.env.INVOICENINJA_URL || 'http://invoiceninja.workspace.svc.cluster.local/api/v1';
const IN_TOKEN = import.meta.env.INVOICENINJA_API_TOKEN || '';

async function inApi(method: string, endpoint: string, body?: unknown): Promise<Response> {
  return fetch(`${IN_URL}${endpoint}`, {
    method,
    headers: {
      'X-Api-Token': IN_TOKEN,
      'Content-Type': 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

export interface InvoiceNinjaClient {
  id: string;
  name: string;
  number: string;
}

export interface InvoiceNinjaInvoice {
  id: string;
  number: string;
  amount: number;
  status_id: string;
}

// Find or create an InvoiceNinja client by email
export async function getOrCreateClient(params: {
  name: string;
  email: string;
  phone?: string;
  company?: string;
  address1?: string;
  city?: string;
  postalCode?: string;
  country?: string;
  vatNumber?: string;
}): Promise<InvoiceNinjaClient | null> {
  if (!IN_TOKEN) {
    console.log('[invoiceninja] No API token configured. Would create client:', params.name);
    return null;
  }

  // Search by email
  const searchRes = await inApi('GET', `/clients?email=${encodeURIComponent(params.email)}`);
  if (searchRes.ok) {
    const data = await searchRes.json();
    if (data.data?.length > 0) {
      const c = data.data[0];
      return { id: c.id, name: c.name, number: c.number };
    }
  }

  // Create new client
  const nameParts = params.name.split(' ');
  const firstName = nameParts[0] || '';
  const lastName = nameParts.slice(1).join(' ') || '';

  const res = await inApi('POST', '/clients', {
    name: params.company || params.name,
    contacts: [
      {
        first_name: firstName,
        last_name: lastName,
        email: params.email,
        phone: params.phone || '',
      },
    ],
    address1: params.address1 || '',
    city: params.city || '',
    postal_code: params.postalCode || '',
    country_id: params.country || '276', // Germany
    vat_number: params.vatNumber || '',
  });

  if (res.ok) {
    const data = await res.json();
    const c = data.data;
    return { id: c.id, name: c.name, number: c.number };
  }

  console.error('[invoiceninja] Failed to create client:', res.status);
  return null;
}

// Service definitions with InvoiceNinja product details
export const SERVICES = {
  'digital-cafe-einzel': { name: 'Digital Cafe 50+ — Einzelbegleitung', rate: 60, unit: 'Stunde' },
  'digital-cafe-gruppe': { name: 'Digital Cafe 50+ — Kleine Gruppe', rate: 40, unit: 'Person/Stunde' },
  'digital-cafe-5er': { name: 'Digital Cafe 50+ — 5er-Paket', rate: 270, unit: 'Paket' },
  'digital-cafe-10er': { name: 'Digital Cafe 50+ — 10er-Paket', rate: 500, unit: 'Paket' },
  'coaching-session': { name: 'Fuhrungskrafte-Coaching — Einzelsession (90 Min.)', rate: 150, unit: 'Session' },
  'coaching-6er': { name: 'Fuhrungskrafte-Coaching — 6er-Paket', rate: 800, unit: 'Paket' },
  'coaching-intensiv': { name: 'Fuhrungskrafte-Coaching — Intensiv-Tag (6 Std.)', rate: 500, unit: 'Tag' },
  'beratung-tag': { name: 'Unternehmensberatung — Tagessatz', rate: 1000, unit: 'Tag' },
} as const;

export type ServiceKey = keyof typeof SERVICES;

// Create an invoice for a booked service
export async function createInvoice(params: {
  clientId: string;
  serviceKey: ServiceKey;
  quantity?: number;
  notes?: string;
  sendEmail?: boolean;
}): Promise<InvoiceNinjaInvoice | null> {
  if (!IN_TOKEN) {
    console.log('[invoiceninja] No API token. Would create invoice for:', params.serviceKey);
    return null;
  }

  const service = SERVICES[params.serviceKey];
  const qty = params.quantity || 1;

  const res = await inApi('POST', '/invoices', {
    client_id: params.clientId,
    line_items: [
      {
        product_key: params.serviceKey,
        notes: service.name,
        cost: service.rate,
        quantity: qty,
        tax_name1: 'USt.',
        tax_rate1: 19, // German VAT
      },
    ],
    public_notes: params.notes || '',
    auto_bill_enabled: false,
  });

  if (!res.ok) {
    console.error('[invoiceninja] Failed to create invoice:', res.status);
    return null;
  }

  const data = await res.json();
  const inv = data.data;

  // Send email to client if requested
  if (params.sendEmail && inv.id) {
    await inApi('POST', `/invoices/${inv.id}/email`);
  }

  return {
    id: inv.id,
    number: inv.number,
    amount: inv.amount,
    status_id: inv.status_id,
  };
}

// Create a quote (Angebot) instead of an invoice
export async function createQuote(params: {
  clientId: string;
  serviceKey: ServiceKey;
  quantity?: number;
  notes?: string;
  sendEmail?: boolean;
}): Promise<{ id: string; number: string; amount: number } | null> {
  if (!IN_TOKEN) {
    console.log('[invoiceninja] No API token. Would create quote for:', params.serviceKey);
    return null;
  }

  const service = SERVICES[params.serviceKey];
  const qty = params.quantity || 1;

  const res = await inApi('POST', '/quotes', {
    client_id: params.clientId,
    line_items: [
      {
        product_key: params.serviceKey,
        notes: service.name,
        cost: service.rate,
        quantity: qty,
        tax_name1: 'USt.',
        tax_rate1: 19,
      },
    ],
    public_notes: params.notes || '',
  });

  if (!res.ok) {
    console.error('[invoiceninja] Failed to create quote:', res.status);
    return null;
  }

  const data = await res.json();
  const q = data.data;

  if (params.sendEmail && q.id) {
    await inApi('POST', `/quotes/${q.id}/email`);
  }

  return { id: q.id, number: q.number, amount: q.amount };
}
