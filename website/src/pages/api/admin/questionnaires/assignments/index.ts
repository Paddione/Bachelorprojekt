import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../lib/auth';
import { listQAssignmentsForCustomer } from '../../../../../lib/questionnaire-db';
import { getCustomerByEmail } from '../../../../../lib/website-db';
import { getUserById } from '../../../../../lib/keycloak';

export const GET: APIRoute = async ({ request, url }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });

  const keycloakUserId = url.searchParams.get('keycloakUserId');
  if (!keycloakUserId) {
    return new Response(JSON.stringify({ error: 'keycloakUserId erforderlich.' }), { status: 400 });
  }

  const kcUser = await getUserById(keycloakUserId).catch(() => null);
  if (!kcUser?.email) return new Response(JSON.stringify([]), { headers: { 'Content-Type': 'application/json' } });

  const customer = await getCustomerByEmail(kcUser.email).catch(() => null);
  if (!customer) return new Response(JSON.stringify([]), { headers: { 'Content-Type': 'application/json' } });

  const assignments = await listQAssignmentsForCustomer(customer.id);
  return new Response(JSON.stringify(assignments), { headers: { 'Content-Type': 'application/json' } });
};
