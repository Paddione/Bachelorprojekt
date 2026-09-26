// components/website/src/pages/sdlc/api/factory/force-tick.ts
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';

export const prerender = false;

// T900399 — Software-Factory-Decommission: der Tick-Dispatcher existiert nicht
// mehr, es gibt keinen `tickets.factory_control.force-tick-requested`-Flag und
// keinen wakeup.sh, der ihn liest. Der Endpunkt bleibt als 410-Stub, damit das
// Cockpit-Frontend keinen 500er sieht.

function authGuard(session: Awaited<ReturnType<typeof getSession>>): Response | null {
  if (!session) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  if (!isAdmin(session)) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return null;
}

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  const guard = authGuard(session);
  if (guard) return guard;

  return new Response(
    JSON.stringify({
      error: 'factory_decommissioned',
      message: 'Der Factory-Tick-Dispatcher wurde mit T900399 abgebaut; es gibt keinen Force-Tick mehr.',
    }),
    { status: 410, headers: { 'Content-Type': 'application/json' } },
  );
};
