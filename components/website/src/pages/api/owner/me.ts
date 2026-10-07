import type { APIRoute } from 'astro';
import { requireOwner, ownerBusiness } from '../../../lib/owner-guard';

export const GET: APIRoute = async ({ request }) => {
  const session = await requireOwner(request.headers.get('cookie'));
  if (!session) {
    return new Response(JSON.stringify({ authenticated: false }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return new Response(
    JSON.stringify({
      authenticated: true,
      user: { sub: session.sub, email: session.email, name: session.name },
      business: ownerBusiness(session),
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
};
