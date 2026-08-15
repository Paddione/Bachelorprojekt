import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { upsertCustomer, setIsAdmin } from '../../../../lib/website-db';

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  }

  const body = await request.json() as { keycloakUserId?: string; email?: string; name?: string; isAdmin?: boolean };
  if (!body.keycloakUserId || !body.email || typeof body.isAdmin !== 'boolean') {
    return new Response(JSON.stringify({ error: 'keycloakUserId, email und isAdmin erforderlich' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  const customer = await upsertCustomer({
    name: body.name || body.email,
    email: body.email,
    keycloakUserId: body.keycloakUserId,
  });
  await setIsAdmin(customer.id, body.isAdmin);

  return new Response(JSON.stringify({ success: true }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
};
