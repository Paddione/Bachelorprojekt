import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { getCustomerById, ensureDirectRoomForCustomer } from '../../../../lib/messaging-db';

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  const { customerId } = await request.json() as { customerId: string };
  if (!customerId?.trim()) return new Response(JSON.stringify({ error: 'customerId required' }), { status: 400 });
  const customer = await getCustomerById(customerId);
  if (!customer) return new Response(JSON.stringify({ error: 'Customer not found' }), { status: 404 });
  const result = await ensureDirectRoomForCustomer(customer.id, customer.name, session.sub);
  return new Response(JSON.stringify(result), { headers: { 'Content-Type': 'application/json' } });
};
