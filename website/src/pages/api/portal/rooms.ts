// website/src/pages/api/portal/rooms.ts
import type { APIRoute } from 'astro';
import { getSession } from '../../../lib/auth';
import { getCustomerByEmail, listRoomsForCustomer } from '../../../lib/messaging-db';

export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  const customer = await getCustomerByEmail(session.email);
  if (!customer) return new Response(JSON.stringify({ rooms: [] }), { headers: { 'Content-Type': 'application/json' } });
  const rooms = await listRoomsForCustomer(customer.id);
  return new Response(JSON.stringify({ rooms }), { headers: { 'Content-Type': 'application/json' } });
};
