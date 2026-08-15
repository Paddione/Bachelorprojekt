import type { APIRoute } from 'astro';
import { getSession } from '../../../../lib/auth';
import { getCustomerByEmail, ensureDirectRoomForCustomer } from '../../../../lib/messaging-db';

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  const customer = await getCustomerByEmail(session.email);
  if (!customer) return new Response(JSON.stringify({ error: 'Customer not found' }), { status: 403 });
  const result = await ensureDirectRoomForCustomer(customer.id, customer.name, 'system');
  return new Response(JSON.stringify(result), { headers: { 'Content-Type': 'application/json' } });
};
