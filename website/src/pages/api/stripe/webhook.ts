import type { APIRoute } from 'astro';
import { stripe } from '../../../lib/stripe';
import { postWebhook } from '../../../lib/mattermost';

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

    await postWebhook({
      text:
        `💳 **Neue Zahlung eingegangen!**\n\n` +
        `**Service:** ${serviceKey}\n` +
        `**Betrag:** ${amountFormatted}\n` +
        `**Kunde:** ${customerEmail}\n` +
        `**Stripe Session:** ${session.id}`,
      icon_emoji: ':moneybag:',
    });
  }

  return new Response('OK', { status: 200 });
};
