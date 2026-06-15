import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { updatePlanningRanks, BrandMismatchError } from '../../../../lib/tickets/cockpit-db';

const BRAND = (): string => process.env.BRAND_ID ?? process.env.BRAND ?? 'mentolder';
const json = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json' } });

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response(null, { status: 403 });
  let body: { updates?: { ticketId: string; planningRank: number }[] };
  try { body = await request.json(); } catch { return json({ error: 'bad json' }, 400); }
  const updates = body.updates;
  if (!Array.isArray(updates) || updates.length === 0) return json({ error: 'updates required' }, 400);
  if (updates.length > 100) return json({ error: 'too many updates' }, 400);
  try {
    await updatePlanningRanks(BRAND(), updates);
    return json({ ok: true, updated: updates.length });
  } catch (e) {
    if (e instanceof BrandMismatchError || (e as Error).name === 'BrandMismatchError') return json({ error: 'cross-brand' }, 400);
    return json({ error: String((e as Error).message) }, 500);
  }
};
