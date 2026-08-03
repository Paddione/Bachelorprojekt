import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { getFeatureTickets, NotFoundError } from '../../../../lib/tickets/cockpit-db';

const BRAND = (): string => process.env.BRAND_ID ?? process.env.BRAND ?? 'mentolder';
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

export const GET: APIRoute = async ({ request, url }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response(null, { status: 403 });
  const id = url.searchParams.get('id');
  if (!id) return json({ error: 'id required' }, 400);
  try {
    return json(await getFeatureTickets(BRAND(), id));
  } catch (e) {
    if (e instanceof NotFoundError || (e as Error).name === 'NotFoundError') {
      return json({ error: 'not found' }, 404);
    }
    return json({ error: String((e as Error).message) }, 500);
  }
};
