import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { batchMutate, BrandMismatchError } from '../../../../lib/tickets/cockpit-db';
import type { BatchMutation } from '../../../../lib/tickets/cockpit-types';

const BRAND = (): string => process.env.BRAND_ID ?? process.env.BRAND ?? 'mentolder';
const json = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json' } });

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response(null, { status: 403 });
  let body: { ticketIds?: string[]; mutation?: BatchMutation };
  try { body = await request.json(); } catch { return json({ error: 'bad json' }, 400); }
  const { ticketIds, mutation } = body;
  if (!Array.isArray(ticketIds) || ticketIds.length === 0) return json({ error: 'ticketIds required' }, 400);
  if (ticketIds.length > 100) return json({ error: 'too many' }, 400);
  if (!mutation || Object.keys(mutation).length === 0) return json({ error: 'mutation required' }, 400);
  try {
    return json(await batchMutate(BRAND(), ticketIds, mutation));
  } catch (e) {
    if (e instanceof BrandMismatchError) return json({ error: 'cross-brand' }, 400);
    return json({ error: String((e as Error).message) }, 500);
  }
};
