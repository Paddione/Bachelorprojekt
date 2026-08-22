import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { createGoalTickets, type TicketOutcome } from '../../../../lib/sdlc/health-goal-tickets';
import { GOALS } from '../../../../lib/sdlc/goals-data';

export const prerender = false;

export const MAX_IDS_PER_REQUEST = 25;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

export const POST: APIRoute = async ({ request }) => {
  // Admin-Guard zuerst — vor jeder Validierung, vor jedem Spawn.
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return json({ error: 'Unauthorized' }, 401);
  }

  let body: { ids?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Body muss JSON sein' }, 400);
  }
  if (!Array.isArray(body.ids) || body.ids.length === 0) {
    return json({ error: 'ids: nicht-leeres Array erforderlich' }, 400);
  }
  const ids = body.ids as unknown[];
  if (ids.some((id) => typeof id !== 'string')) {
    return json({ error: 'ids: nur Strings erlaubt' }, 400);
  }
  if (ids.length > MAX_IDS_PER_REQUEST) {
    return json({ error: `maximal ${MAX_IDS_PER_REQUEST} IDs je Anfrage` }, 400);
  }

  const byId = new Map(GOALS.map((g) => [g.id, g]));
  const unknownId = ids.find((id) => !byId.has(id as string));
  if (unknownId) {
    return json({ error: `unbekannte Ziel-ID: ${unknownId}` }, 400);
  }

  // Teilerfolg ist 200: einzelne failed-Einträge stehen im Body — ein 500 würde
  // die erfolgreich angelegten Tickets im Frontend unsichtbar machen.
  try {
    const goals = ids.map((id) => byId.get(id as string)!);
    const outcomes: TicketOutcome[] = await createGoalTickets(goals);
    return json({ outcomes }, 200);
  } catch (err) {
    return json(
      { error: err instanceof Error ? err.message : 'Ticket-Erzeugung fehlgeschlagen' },
      500,
    );
  }
};
