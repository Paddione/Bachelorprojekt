import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { addFreeTimeWindow } from '../../../../lib/website-db';

const BRAND = process.env.BRAND_NAME || 'mentolder';

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  if (!isAdmin(session)) return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { 'Content-Type': 'application/json' } });

  try {
    const { date, winStart, winEnd } = await request.json();
    if (!date || !winStart || !winEnd) {
      return new Response(JSON.stringify({ error: 'date, winStart und winEnd sind Pflicht.' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }
    if (winStart >= winEnd) {
      return new Response(JSON.stringify({ error: 'winStart muss vor winEnd liegen.' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }
    const id = await addFreeTimeWindow(BRAND, date, winStart, winEnd);
    return new Response(JSON.stringify({ id }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('[time-windows/add]', err);
    return new Response(JSON.stringify({ error: 'Interner Serverfehler.' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
};
