import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { getPortfolio } from '../../../../lib/tickets/cockpit-db';

const BRAND = (): string => process.env.BRAND_ID ?? process.env.BRAND ?? 'mentolder';
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response(null, { status: 403 });
  try {
    return json(await getPortfolio(BRAND()));
  } catch (e) {
    return json({ error: String((e as Error).message) }, 500);
  }
};
