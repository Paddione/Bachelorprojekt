import type { APIRoute } from 'astro';
import { randomUUID } from 'crypto';
import {
  getSubscriberByEmail,
  createSubscriber,
  updateSubscriberToken,
} from '../../../lib/newsletter-db';
import { sendNewsletterConfirmation } from '../../../lib/email';

function isValidEmail(e: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

export const POST: APIRoute = async ({ request }) => {
  let email: string;
  try {
    const body = await request.json();
    email = String(body.email ?? '').trim().toLowerCase();
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'Invalid JSON' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!isValidEmail(email)) {
    return new Response(JSON.stringify({ ok: false, error: 'Ungültige E-Mail-Adresse' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const prodDomain = process.env.PROD_DOMAIN || '';
  const baseUrl = prodDomain ? `https://web.${prodDomain}` : 'http://web.localhost';

  const existing = await getSubscriberByEmail(email);

  // confirmed or unsubscribed: no-op, no info leak
  if (existing?.status === 'confirmed' || existing?.status === 'unsubscribed') {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const token = randomUUID();
  const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
  const confirmUrl = `${baseUrl}/api/newsletter/confirm?token=${token}`;

  if (existing?.status === 'pending') {
    await updateSubscriberToken(existing.id, token, expiresAt);
  } else {
    await createSubscriber({
      email,
      status: 'pending',
      source: 'website',
      confirmToken: token,
      tokenExpiresAt: expiresAt,
      unsubscribeToken: randomUUID(),
    });
  }

  await sendNewsletterConfirmation(email, confirmUrl);

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
