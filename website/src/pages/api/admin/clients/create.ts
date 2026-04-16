import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { createUser } from '../../../../lib/keycloak';

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  }
  if (!isAdmin(session)) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403, headers: { 'Content-Type': 'application/json' },
    });
  }

  let body: { email?: string; firstName?: string; lastName?: string; phone?: string; company?: string };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!body.email || !body.firstName || !body.lastName) {
    return new Response(JSON.stringify({ error: 'email, firstName und lastName sind erforderlich.' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  const result = await createUser({
    email: body.email,
    firstName: body.firstName,
    lastName: body.lastName,
    phone: body.phone,
    company: body.company,
  });

  if (!result.success) {
    return new Response(JSON.stringify({ error: result.error }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ ok: true, userId: result.userId }), {
    status: 201, headers: { 'Content-Type': 'application/json' },
  });
};
