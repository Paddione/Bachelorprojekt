import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { getUserById } from '../../../../lib/keycloak';
import {
  getSubscriberByEmail,
  createSubscriber,
  confirmSubscriber,
  deleteSubscriber,
} from '../../../../lib/newsletter-db';
import { randomUUID } from 'crypto';

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });

  const body = await request.json() as { keycloakUserId?: string; subscribe?: boolean };
  if (!body.keycloakUserId || body.subscribe === undefined) {
    return new Response(JSON.stringify({ error: 'keycloakUserId und subscribe erforderlich.' }), { status: 400 });
  }

  const kcUser = await getUserById(body.keycloakUserId).catch(() => null);
  if (!kcUser?.email) {
    return new Response(JSON.stringify({ error: 'Benutzer nicht gefunden.' }), { status: 404 });
  }

  const existing = await getSubscriberByEmail(kcUser.email);

  if (body.subscribe) {
    if (existing && existing.status === 'confirmed') {
      return new Response(JSON.stringify({ ok: true, status: 'confirmed' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (existing) {
      await confirmSubscriber(existing.id);
    } else {
      const sub = await createSubscriber({
        email: kcUser.email,
        status: 'confirmed',
        source: 'admin',
        unsubscribeToken: randomUUID(),
      });
      await confirmSubscriber(sub.id);
    }
    return new Response(JSON.stringify({ ok: true, status: 'confirmed' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } else {
    if (existing) await deleteSubscriber(existing.id);
    return new Response(JSON.stringify({ ok: true, status: 'removed' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
