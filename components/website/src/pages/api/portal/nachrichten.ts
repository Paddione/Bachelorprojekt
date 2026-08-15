import type { APIRoute } from 'astro';
import { getSession } from '../../../lib/auth';
import { getCustomerByEmail, listRoomsWithInboxData } from '../../../lib/messaging-db';

export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });

  const customer = await getCustomerByEmail(session.email);
  if (!customer) return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } });

  const rooms = await listRoomsWithInboxData(customer.id);
  return new Response(JSON.stringify(rooms), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
