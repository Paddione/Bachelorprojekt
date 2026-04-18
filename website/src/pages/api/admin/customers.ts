import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../lib/auth';
import { listAllCustomers } from '../../../lib/messaging-db';

export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  const customers = await listAllCustomers();
  return new Response(JSON.stringify({ customers }), { headers: { 'Content-Type': 'application/json' } });
};
