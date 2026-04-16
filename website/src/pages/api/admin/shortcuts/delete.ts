import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { deleteAdminShortcut } from '../../../../lib/website-db';

export const DELETE: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
  }

  let id: string;
  try {
    const body = await request.json();
    id = (body.id ?? '').trim();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
  }

  if (!id) {
    return new Response(JSON.stringify({ error: 'id required' }), { status: 400 });
  }

  try {
    await deleteAdminShortcut(id);
    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[shortcuts/delete]', err);
    return new Response(JSON.stringify({ error: 'DB error' }), { status: 500 });
  }
};
