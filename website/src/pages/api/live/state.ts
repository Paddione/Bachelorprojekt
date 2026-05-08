import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../lib/auth';
import { fetchLiveCockpitData, deriveLiveState } from '../../../lib/live-state';

export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const data = await fetchLiveCockpitData();
    return new Response(JSON.stringify({ ...data, state: deriveLiveState(data) }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    console.error('[/api/live/state] failed:', err);
    return new Response(JSON.stringify({ error: 'Cockpit nicht erreichbar' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
