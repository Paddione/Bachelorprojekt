import type { APIRoute } from 'astro';
import { stripe } from '../../../lib/stripe';
import { getSession } from '../../../lib/auth';

export const POST: APIRoute = async ({ request }) => {
  try {
    // Auth check: require a valid session
    const cookieHeader = request.headers.get('cookie');
    const session = await getSession(cookieHeader);
    if (!session) {
      return new Response(
        JSON.stringify({ error: 'Nicht authentifiziert.' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const body = await request.json();
    const invoiceId: string = body?.invoiceId ?? '';

    if (!invoiceId) {
      return new Response(
        JSON.stringify({ error: 'invoiceId erforderlich.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Expand the customer so we can compare emails
    const invoice = await stripe.invoices.retrieve(invoiceId, {
      expand: ['customer'],
    });

    // Authorization check: session email must match the invoice customer email
    // invoice.customer is Customer | DeletedCustomer | string | null after expand.
    // DeletedCustomer has `deleted: true` and no email field.
    const invoiceCustomerEmail =
      invoice.customer !== null &&
      typeof invoice.customer === 'object' &&
      !invoice.customer.deleted
        ? (invoice.customer as { email?: string | null }).email
        : null;
    if (!invoiceCustomerEmail || invoiceCustomerEmail !== session.email) {
      return new Response(
        JSON.stringify({ error: 'Zugriff verweigert.' }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if ((invoice.amount_remaining ?? 0) <= 0) {
      return new Response(
        JSON.stringify({ error: 'Bereits beglichen.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const customerId = typeof invoice.customer === 'string'
      ? invoice.customer
      : invoice.customer?.id ?? undefined;

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
