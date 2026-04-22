import type { APIRoute } from 'astro';
import { createCheckoutSession, STRIPE_PRODUCTS } from '../../../lib/stripe';

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const serviceKey: string = body?.serviceKey ?? '';

    if (!serviceKey || !STRIPE_PRODUCTS[serviceKey]) {
      return new Response(
        JSON.stringify({ error: 'Ungültiger Service-Key.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const siteUrl = (process.env.SITE_URL || 'http://web.localhost').replace(/\/$/, '');
    const url = await createCheckoutSession({
      serviceKey,
      successUrl: `${siteUrl}/stripe/success?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${siteUrl}/leistungen`,
    });

    return new Response(
      JSON.stringify({ url }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('[stripe/checkout]', err);
    return new Response(
      JSON.stringify({ error: 'Checkout konnte nicht gestartet werden.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
