import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { setIsAdmin } from '../../../../lib/website-db';

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  }

  const body = await request.json() as { customerId?: string; isAdmin?: boolean };
  if (!body.customerId || typeof body.isAdmin !== 'boolean') {
    return new Response(JSON.stringify({ error: 'customerId und isAdmin erforderlich' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  await setIsAdmin(body.customerId, body.isAdmin);
  return new Response(JSON.stringify({ success: true }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
};
