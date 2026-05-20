import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../../lib/auth';
import { getTicketsByAsset } from '../../../../../../lib/platform-db';

export const prerender = false;

export const GET: APIRoute = async ({ params, request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  try {
    const { slug } = params;
    if (!slug) return new Response(JSON.stringify({ error: 'Slug required' }), { status: 400 });
    
    const tickets = await getTicketsByAsset(slug);
    return new Response(JSON.stringify({ tickets }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
};
