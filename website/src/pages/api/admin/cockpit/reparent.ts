import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { reparentTicket, CycleError, BrandMismatchError, NotFoundError }
  from '../../../../lib/tickets/cockpit-db';

const BRAND = (): string => process.env.BRAND_ID ?? process.env.BRAND ?? 'mentolder';
const json = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json' } });

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response(null, { status: 403 });
  let body: { ticketId?: string; newParentId?: string | null };
  try { body = await request.json(); } catch { return json({ error: 'bad json' }, 400); }
  if (!body.ticketId) return json({ error: 'ticketId required' }, 400);
  const newParentId = body.newParentId ?? null;
  try {
    await reparentTicket(BRAND(), body.ticketId, newParentId);
    return json({ ok: true, ticketId: body.ticketId, newParentId });
  } catch (e) {
    const name = (e as Error).name;
    if (e instanceof CycleError || name === 'CycleError') return json({ error: 'cycle detected' }, 400);
    if (e instanceof BrandMismatchError || name === 'BrandMismatchError') return json({ error: 'cross-brand' }, 400);
    if (e instanceof NotFoundError || name === 'NotFoundError') return json({ error: 'not found' }, 404);
    return json({ error: String((e as Error).message) }, 500);
  }
};
