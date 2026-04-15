import Stripe from 'stripe';

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '');

export interface StripeProduct {
  name: string;
  amountCents: number;
  currency: 'eur';
}

export const STRIPE_PRODUCTS: Record<string, StripeProduct> = {
  'digital-cafe-einzel': { name: '50+ digital — Einzelstunde',          amountCents: 6000,  currency: 'eur' },
  'digital-cafe-5er':    { name: '50+ digital — 5er-Paket',             amountCents: 27000, currency: 'eur' },
  'digital-cafe-10er':   { name: '50+ digital — 10er-Paket',            amountCents: 50000, currency: 'eur' },
  'digital-cafe-gruppe': { name: '50+ digital — Gruppe',                 amountCents: 4000,  currency: 'eur' },
  'coaching-session':    { name: 'Coaching — Einzelsession (90 Min.)',   amountCents: 15000, currency: 'eur' },
  'coaching-6er':        { name: 'Coaching — 6er-Paket',                 amountCents: 80000, currency: 'eur' },
  'coaching-intensiv':   { name: 'Coaching — Intensivtag (6 Std.)',      amountCents: 50000, currency: 'eur' },
};

export async function createCheckoutSession(params: {
  serviceKey: string;
  successUrl: string;
  cancelUrl: string;
}): Promise<string> {
  const product = STRIPE_PRODUCTS[params.serviceKey];
  if (!product) throw new Error(`Unknown serviceKey: ${params.serviceKey}`);

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card'],
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: product.currency,
          unit_amount: product.amountCents,
          product_data: { name: product.name },
        },
      },
    ],
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
    metadata: { serviceKey: params.serviceKey },
    locale: 'de',
  });

  if (!session.url) throw new Error('Stripe returned no checkout URL');
  return session.url;
}
