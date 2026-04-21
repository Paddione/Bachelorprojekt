import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { removeFreeTimeWindow } from '../../../../lib/website-db';

const BRAND = process.env.BRAND_NAME || 'mentolder';

export const DELETE: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  if (!isAdmin(session)) return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { 'Content-Type': 'application/json' } });

  try {
    const { id } = await request.json();
    if (!id) {
      return new Response(JSON.stringify({ error: 'id ist Pflicht.' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }
    await removeFreeTimeWindow(BRAND, id);
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('[time-windows/remove]', err);
    return new Response(JSON.stringify({ error: 'Interner Serverfehler.' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
};
