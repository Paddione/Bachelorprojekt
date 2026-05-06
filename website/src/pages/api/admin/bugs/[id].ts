import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { getBugTicketWithComments } from '../../../../lib/website-db';

export const GET: APIRoute = async ({ params, request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const id = params.id?.toString().trim() ?? '';
  if (!id) {
    return new Response(JSON.stringify({ error: 'Missing ticket id' }), { status: 400 });
  }

  try {
    const data = await getBugTicketWithComments(id);
    if (!data) {
      return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
    }
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('[bugs/[id]] DB error:', err);
    return new Response(JSON.stringify({ error: err.message ?? 'DB error' }), { status: 500 });
  }
};
