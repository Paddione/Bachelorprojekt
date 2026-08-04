import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { setTicketStatus, BrandMismatchError, NotFoundError } from '../../../../lib/sdlc/tickets/cockpit-db';
import type { TicketStatus } from '../../../../lib/tickets/admin.ts';

const BRAND = (): string => process.env.BRAND_ID ?? process.env.BRAND ?? 'mentolder';
const json = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json' } });

const VALID_STATUSES: TicketStatus[] = [
  'triage', 'planning', 'plan_staged', 'backlog', 'in_progress', 'in_review', 'qa_review',
  'blocked', 'awaiting_deploy', 'done', 'archived',
];

function actorFrom(session: { preferred_username?: string; email?: string; name?: string }): string {
  return session.preferred_username ?? session.email ?? session.name ?? 'admin';
}

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response(null, { status: 403 });
  let body: { ticketId?: string; status?: string };
  try { body = await request.json(); } catch { return json({ error: 'bad json' }, 400); }
  const { ticketId, status } = body;
  if (!ticketId || !status) return json({ error: 'ticketId and status required' }, 400);
  if (!VALID_STATUSES.includes(status as TicketStatus)) return json({ error: 'invalid status' }, 400);
  try {
    return json(await setTicketStatus(BRAND(), ticketId, status as TicketStatus, actorFrom(session)));
  } catch (e) {
    if (e instanceof BrandMismatchError) return json({ error: 'cross-brand' }, 400);
    if (e instanceof NotFoundError) return json({ error: 'not found' }, 404);
    return json({ error: String((e as Error).message) }, 500);
  }
};
