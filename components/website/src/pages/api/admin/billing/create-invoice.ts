import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { createInvoice, type InvoiceLine } from '../../../../lib/native-billing';
import { getCustomerByEmail, createCustomer } from '../../../../lib/native-billing';
import { isE2ETestRequest } from '../../../../lib/e2e-marker';

export const POST: APIRoute = async ({ request , locals }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });

  try {
    // T015362: Testkontext erkennen und auf Kunde + Rechnung markieren
    // (fail-closed, siehe e2e-marker), damit der Purge-Pfad sie entfernen kann.
    const isTestData = isE2ETestRequest(request);
    const body = await request.json();
    const {
      name, email, company, addressLine1, city, postalCode, vatNumber,
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
        brand, name, email, company, addressLine1, city, postalCode, vatNumber,
        isTestData,
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
      parentInvoiceId,
      isTestData
    });

    return new Response(JSON.stringify({ success: true, data: invoice }), { status: 200 });
  } catch (err: unknown) {
    locals.requestLogger.error({ err }, '[api/admin/billing/create-invoice]');
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
};
