import type { APIRoute } from 'astro';
import { stripe } from '../../../lib/stripe';

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const invoiceId: string = body?.invoiceId ?? '';

    if (!invoiceId) {
      return new Response(
        JSON.stringify({ error: 'invoiceId erforderlich.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const invoice = await stripe.invoices.retrieve(invoiceId);

    if ((invoice.amount_remaining ?? 0) <= 0) {
      return new Response(
        JSON.stringify({ error: 'Bereits beglichen.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const customerId = typeof invoice.customer === 'string'
      ? invoice.customer
      : (invoice.customer as { id: string } | null)?.id;

    const paymentIntent = await stripe.paymentIntents.create(
      {
        amount: invoice.amount_remaining,
        currency: invoice.currency,
        customer: customerId,
        metadata: { invoice_id: invoiceId },
      },
      { idempotencyKey: `pay-invoice-${invoiceId}` }
    );

    return new Response(
      JSON.stringify({ clientSecret: paymentIntent.client_secret }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('[stripe/invoice-payment-intent]', err);
    return new Response(
      JSON.stringify({ error: 'Zahlung konnte nicht initiiert werden.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
