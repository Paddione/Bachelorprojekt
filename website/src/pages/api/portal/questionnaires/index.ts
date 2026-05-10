import type { APIRoute } from 'astro';
import { getSession } from '../../../../lib/auth';
import { getCustomerByEmail } from '../../../../lib/website-db';
import { listQAssignmentsForCustomer } from '../../../../lib/questionnaire-db';

export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session) return new Response('Unauthorized', { status: 401 });

  const customer = await getCustomerByEmail(session.email).catch(() => null);
  if (!customer) return new Response(JSON.stringify([]), { headers: { 'Content-Type': 'application/json' } });

  const assignments = await listQAssignmentsForCustomer(customer.id);
  // Chat widget only — hide dismissed/archived so they don't reappear after reload.
  // FragebogenSection.astro receives assignments directly (server-side props), not from this endpoint.
  const active = assignments.filter(a => a.status !== 'dismissed' && a.status !== 'archived');
  return new Response(JSON.stringify(active), { headers: { 'Content-Type': 'application/json' } });
};
