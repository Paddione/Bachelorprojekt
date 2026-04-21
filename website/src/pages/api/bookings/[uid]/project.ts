import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { setBookingProject } from '../../../../lib/website-db';

export const PATCH: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  }
  if (!isAdmin(session)) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403, headers: { 'Content-Type': 'application/json' },
    });
  }

  const uid = params.uid;
  if (!uid) {
    return new Response(JSON.stringify({ error: 'Missing uid' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  let body: { projectId?: string | null; leistungKey?: string | null };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  const brand = process.env.BRAND_NAME || 'mentolder';
  try {
    await setBookingProject(uid, body.projectId ?? null, brand, body.leistungKey ?? undefined);
    return new Response(JSON.stringify({ ok: true }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[PATCH /api/bookings/[uid]/project] DB error:', err);
    return new Response(JSON.stringify({ error: 'Database error' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
};
