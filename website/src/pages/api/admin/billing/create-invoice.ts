import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { createInvoice, type InvoiceLine } from '../../../../lib/native-billing';
import { getCustomerByEmail, createCustomer } from '../../../../lib/native-billing';

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });

  try {
    const body = await request.json();
    const {
      name, email, company, addressLine1, city, postalCode, vatNumber, landIso,
      lines, notes, servicePeriodStart, servicePeriodEnd, leitwegId,
      currency, supplyType, kind, parentInvoiceId,
      dueDays = 14, taxMode = 'regelbesteuerung', taxRate = 19
    } = body;

    if (!name || !email || !lines || !Array.isArray(lines)) {
      return new Response(JSON.stringify({ error: 'name, email, and lines array required' }), { status: 400 });
    }

    const brand = process.env.BRAND || 'mentolder';

    let customer = await getCustomerByEmail(brand, email);
    if (!customer) {
      customer = await createCustomer({
        brand, name, email, company, addressLine1, city, postalCode, vatNumber
      });
    }

    const invoice = await createInvoice({
      brand,
      customerId: customer.id,
      issueDate: new Date().toISOString().split('T')[0],
      dueDays,
      taxMode,
      taxRate,
      lines: lines as InvoiceLine[],
      notes,
      servicePeriodStart,
      servicePeriodEnd,
      leitwegId,
      currency,
      supplyType,
      kind,
      parentInvoiceId
    });

    return new Response(JSON.stringify({ success: true, data: invoice }), { status: 200 });
  } catch (err: any) {
    console.error('[api/admin/billing/create-invoice]', err);
    return new Response(JSON.stringify({ error: err.message || 'Internal Server Error' }), { status: 500 });
  }
};
