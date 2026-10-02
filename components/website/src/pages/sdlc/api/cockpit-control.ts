import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../lib/auth';

export const prerender = false;

// T900399 — Software-Factory-Decommission: `tickets.factory_control` ist mit
// dem Factory-Subsystem entfallen. Der Cockpit-Endpunkt bleibt als Stub, damit
// das SDLC-Cockpit keinen 500er aus `tickets.factory_control` bekommt.
// GET antwortet neutral mit der "alles aus"-Belegung, Schreibzugriffe mit 410.
const DECOMMISSIONED = true;

const NEUTRAL_STATE = {
  killSwitch: false,
  dryRun: true,
  slotCap: 0,
  dailyCap: 0,
  contextBudget: 0,
  spawnHarness: false,
  lavishDelegation: false,
  updatedAt: null,
};

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

function gone(): Response {
  return new Response(
    JSON.stringify({ error: 'factory_decommissioned', message: 'Das Software-Factory-Subsystem wurde mit T900399 abgebaut.' }),
    { status: 410, headers: { 'Content-Type': 'application/json' } },
  );
}

export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  const guard = authGuard(session);
  if (guard) return guard;

  if (DECOMMISSIONED) {
    return new Response(JSON.stringify(NEUTRAL_STATE), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify(NEUTRAL_STATE), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

export const PATCH: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  const guard = authGuard(session);
  if (guard) return guard;

  return gone();
};
