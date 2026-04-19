import type { APIRoute } from 'astro';
import { stripe } from '../../../lib/stripe';


export const POST: APIRoute = async ({ request }) => {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || '';
  const sig = request.headers.get('stripe-signature') ?? '';
  const body = await request.text();

  if (!webhookSecret) {
    console.warn('[stripe/webhook] STRIPE_WEBHOOK_SECRET not configured — ignoring event');
    return new Response('OK', { status: 200 });
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
