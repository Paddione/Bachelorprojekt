// components/website/src/pages/sdlc/api/factory/parallel-status.ts
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { deriveParallelStatus, type ParallelStatusRow } from '../../../../lib/parallel-status';

export const prerender = false;

// T900399 — Software-Factory-Decommission: die Gang-/Slot-Auswertung lebte von
// `tickets.factory_control` (last-tick-at) und den Factory-Pipeline-Slots. Die
// Tabelle ist entfallen, deshalb antwortet der Endpunkt statisch, ohne Query.

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

const EMPTY_ROW: ParallelStatusRow = { gang_tickets: 0, slots_claimed: 0 };

export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  const guard = authGuard(session);
  if (guard) return guard;

  const status = deriveParallelStatus(EMPTY_ROW, 0, null);

  return new Response(JSON.stringify(status), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
