import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../lib/auth';
import { listUsers } from '../../../lib/keycloak';

export interface ClientOption {
  id: string;
  name: string;
  email: string;
}

export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  try {
    const users = await listUsers();
    const clients: ClientOption[] = users
      .filter(u => !!u.email)
      .map(u => ({
        id: u.id,
        name: [u.firstName, u.lastName].filter(Boolean).join(' ') || u.username,
        email: u.email!,
      }));
    return new Response(JSON.stringify(clients), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch {
    return new Response(JSON.stringify({ error: 'Keycloak nicht erreichbar' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
