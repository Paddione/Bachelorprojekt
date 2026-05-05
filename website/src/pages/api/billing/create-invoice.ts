import type { APIRoute } from 'astro';
import {
  getOrCreateCustomer,
  createBillingInvoice,
  createBillingQuote,
  SERVICES,
} from '../../../lib/stripe-billing';
import type { ServiceKey } from '../../../lib/stripe-billing';

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const {
      name, email, phone, company, address1, city, postalCode, vatNumber,
      serviceKey, quantity, asQuote, sendEmail: shouldSendEmail,
    } = body;

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
    });

    if (!customer) {
      return new Response(
        JSON.stringify({ error: 'Stripe customer could not be created. Is STRIPE_SECRET_KEY configured?' }),
        { status: 502, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const key = serviceKey as ServiceKey;

    if (asQuote) {
      const quote = await createBillingQuote({
        customerId: customer.id,
        serviceKey: key,
        quantity: quantity || 1,
      });
      return new Response(
        JSON.stringify({ success: true, type: 'quote', data: quote }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const invoice = await createBillingInvoice({
      customerId: customer.id,
      serviceKey: key,
      quantity: quantity || 1,
      sendEmail: shouldSendEmail !== false,
    });

    return new Response(
      JSON.stringify({ success: true, type: 'invoice', data: invoice }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('Billing error:', err);
    return new Response(
      JSON.stringify({ error: 'Interner Serverfehler.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
