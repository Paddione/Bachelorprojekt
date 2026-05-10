import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { saveCoachingContent } from '../../../../lib/coaching-content';
import type { CoachingContent } from '../../../../lib/coaching-content';

const BRAND = process.env.BRAND || 'mentolder';

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Forbidden', { status: 403 });

  let body: CoachingContent;
  try {
    body = await request.json() as CoachingContent;
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }
  try {
    await saveCoachingContent(BRAND, body);
  } catch (err) {
    console.error('[coaching/save] DB error:', err);
    return new Response(JSON.stringify({ error: 'DB error' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
  return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
};
