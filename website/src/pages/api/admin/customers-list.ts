// website/src/pages/api/admin/customers-list.ts
// Returns all non-admin customers (id, name, email) for the compose modal and
// other admin UIs that need a customer picker without the full Keycloak roundtrip.
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../lib/auth';
import { listAllCustomers } from '../../../lib/projects-db';

export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  try {
    const customers = await listAllCustomers();
    return new Response(JSON.stringify(customers), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch {
    return new Response(JSON.stringify({ error: 'Datenbankfehler' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
