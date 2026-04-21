import type { APIRoute } from 'astro';
import { stripe } from '../../../lib/stripe';


export const POST: APIRoute = async ({ request }) => {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || '';
  const sig = request.headers.get('stripe-signature') ?? '';
  const body = await request.text();

  if (!webhookSecret) {
    console.error('[stripe/webhook] STRIPE_WEBHOOK_SECRET not configured — rejecting all events');
    return new Response('Internal Server Error', { status: 500 });
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch (err) {
    console.error('[stripe/webhook] Signature verification failed:', err);
    return new Response('Bad Request', { status: 400 });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const amount = session.amount_total ?? 0;
    const amountFormatted = new Intl.NumberFormat('de-DE', {
      style: 'currency',
      currency: 'EUR',
    }).format(amount / 100);
    const customerEmail = session.customer_details?.email ?? 'unbekannt';
    const serviceKey = session.metadata?.serviceKey ?? 'unbekannt';

    console.log(`[stripe] Payment received: ${serviceKey} ${amountFormatted} from ${customerEmail} (${session.id})`);
  }

  if (event.type === 'payment_intent.succeeded') {
    const pi = event.data.object;
    const invoiceId = pi.metadata?.invoice_id;
    if (invoiceId) {
      try {
        const invoice = await stripe.invoices.retrieve(invoiceId);
        const piCustomerId = typeof pi.customer === 'string' ? pi.customer : pi.customer?.id;
        const invCustomerId = typeof invoice.customer === 'string' ? invoice.customer : (invoice.customer as { id?: string } | null)?.id;

        if (piCustomerId !== invCustomerId) {
          console.error(`[stripe] Customer mismatch for invoice ${invoiceId}: PI=${piCustomerId} Invoice=${invCustomerId}`);
          return new Response('OK', { status: 200 });
        }

        if (pi.amount_received < (invoice.amount_remaining ?? 0)) {
          console.error(`[stripe] Underpayment for invoice ${invoiceId}: received=${pi.amount_received} remaining=${invoice.amount_remaining}`);
          return new Response('OK', { status: 200 });
        }


        await stripe.invoices.pay(invoiceId, { paid_out_of_band: true });
        console.log(`[stripe] Invoice ${invoiceId} marked paid via payment_intent ${pi.id}`);
      } catch (err) {
        // Invoice may already be paid (e.g. webhook replayed) — log and continue
        console.error(`[stripe] Failed to mark invoice ${invoiceId} as paid:`, err);
      }
    }
  }

  return new Response('OK', { status: 200 });
};
