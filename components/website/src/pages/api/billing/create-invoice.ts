import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../lib/auth';
import {
  getOrCreateCustomer,
  createBillingInvoice,
  SERVICES,
} from '../../../lib/stripe-billing';
import type { ServiceKey } from '../../../lib/stripe-billing';
import { isE2ETestRequest } from '../../../lib/e2e-marker';

export const POST: APIRoute = async ({ request , locals }) => {
  // F5 (#6822): Admin-only — anonyme Requests dürfen weder Kunden anlegen
  // noch Rechnungsentwürfe (ggf. mit E-Mail-Versand) erzeugen.
  const session = await getSession(request.headers.get('cookie'));
  if (!session) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }
  if (!isAdmin(session)) {
    return new Response(
      JSON.stringify({ error: 'Forbidden' }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    // T015362: Testkontext erkennen und auf den erzeugten Zeilen markieren,
    // damit der Purge-Pfad sie entfernen kann (fail-closed, siehe e2e-marker).
    const isTestData = isE2ETestRequest(request);
    const body = await request.json();
    const {
      name, email, company,
      serviceKey, quantity, asQuote, sendEmail: shouldSendEmail,
    } = body;

    if (asQuote) {
      // Ehemals toter Zweig (createBillingQuote warf immer → 500):
      // native-billing kennt keine Angebots-Entities. 410 statt 500,
      // mit Hinweis auf die Admin-Route für freie Rechnungszeilen.
      return new Response(
        JSON.stringify({ error: 'Angebote werden nicht mehr unterstützt. Bitte /api/admin/billing/create-invoice verwenden.' }),
        { status: 410, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!name || !email || !serviceKey) {
      return new Response(
        JSON.stringify({ error: 'name, email, and serviceKey required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!(serviceKey in SERVICES)) {
      return new Response(
        JSON.stringify({ error: `Unknown service: ${serviceKey}` }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const customer = await getOrCreateCustomer({
      brand: process.env.BRAND || 'mentolder', name, email, company,
      isTestData,
    });

    if (!customer) {
      return new Response(
        JSON.stringify({ error: 'Stripe customer could not be created. Is STRIPE_SECRET_KEY configured?' }),
        { status: 502, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const key = serviceKey as ServiceKey;

    const invoice = await createBillingInvoice({
      customerId: customer.id,
      serviceKey: key,
      quantity: quantity || 1,
      sendEmail: shouldSendEmail !== false,
      isTestData,
    });

    return new Response(
      JSON.stringify({ success: true, type: 'invoice', data: invoice }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    locals.requestLogger.error({ err }, 'Billing error:');
    return new Response(
      JSON.stringify({ error: 'Interner Serverfehler.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
