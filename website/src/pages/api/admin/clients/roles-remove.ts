import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { removeRealmRole } from '../../../../lib/keycloak';
import type { KcRole } from '../../../../lib/keycloak';

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

  let body: { userId?: string; roles?: KcRole[] };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!body.userId || !Array.isArray(body.roles) || body.roles.length === 0) {
    return new Response(JSON.stringify({ error: 'userId und roles erforderlich.' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  const ok = await removeRealmRole(body.userId, body.roles);
  return new Response(JSON.stringify({ ok }), {
    status: ok ? 200 : 500, headers: { 'Content-Type': 'application/json' },
  });
};
