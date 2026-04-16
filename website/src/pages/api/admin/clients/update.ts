import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { updateUser } from '../../../../lib/keycloak';

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

  let body: { userId?: string; firstName?: string; lastName?: string; email?: string; enabled?: boolean };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!body.userId) {
    return new Response(JSON.stringify({ error: 'userId erforderlich.' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  const ok = await updateUser(body.userId, {
    firstName: body.firstName,
    lastName: body.lastName,
    email: body.email,
    enabled: body.enabled,
  });

  return new Response(JSON.stringify({ ok }), {
    status: ok ? 200 : 500, headers: { 'Content-Type': 'application/json' },
  });
};
