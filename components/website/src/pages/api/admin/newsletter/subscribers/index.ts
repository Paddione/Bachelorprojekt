import type { APIRoute } from 'astro';
import { randomUUID } from 'crypto';
import { getSession, isAdmin } from '../../../../../lib/auth';
import { listSubscribers, createSubscriber, getSubscriberByEmail } from '../../../../../lib/newsletter-db';

export const GET: APIRoute = async ({ request, url }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }
  const status = url.searchParams.get('status') ?? undefined;
  const subscribers = await listSubscribers(status ? { status } : undefined);
  return new Response(JSON.stringify(subscribers), {
    headers: { 'Content-Type': 'application/json' },
  });
};

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }
  let email: string;
  try {
    const body = await request.json();
    email = String(body.email ?? '').trim().toLowerCase();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return new Response(JSON.stringify({ error: 'Ungültige E-Mail-Adresse' }), { status: 400 });
  }
  const existing = await getSubscriberByEmail(email);
  if (existing) {
    return new Response(JSON.stringify({ error: 'E-Mail bereits vorhanden' }), { status: 409 });
  }
  const subscriber = await createSubscriber({
    email,
    status: 'confirmed',
    source: 'admin',
    unsubscribeToken: randomUUID(),
  });
  return new Response(JSON.stringify(subscriber), {
    status: 201,
    headers: { 'Content-Type': 'application/json' },
  });
};
