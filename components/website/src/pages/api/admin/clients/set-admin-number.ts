import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { setAdminNumber } from '../../../../lib/website-db';

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  }

  const body = await request.json() as { customerId?: string; adminNumber?: string | null };
  if (!body.customerId) {
    return new Response(JSON.stringify({ error: 'customerId erforderlich' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  const result = await setAdminNumber(body.customerId, body.adminNumber ?? null);
  if (!result.ok) {
    return new Response(JSON.stringify({ error: result.error }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ success: true }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
};
