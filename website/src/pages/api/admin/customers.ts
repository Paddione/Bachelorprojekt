import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../lib/auth';
import { listAllCustomers } from '../../../lib/messaging-db';
import { pool } from '../../../lib/website-db';
import { recordAudit, clientIpFromRequest } from '../../../lib/audit-log';

export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  const customers = await listAllCustomers();
  recordAudit(pool, { actor_id: session.sub, actor_email: session.email, action: 'customer.list', ip: clientIpFromRequest(request) });
  return new Response(JSON.stringify({ customers }), { headers: { 'Content-Type': 'application/json' } });
};
