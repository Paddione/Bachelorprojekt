import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { getEurSummary } from '../../../../lib/eur-bookkeeping';

export const GET: APIRoute = async ({ request, url }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });
  const brand = process.env.BRAND || 'mentolder';
  const year  = parseInt(url.searchParams.get('year') ?? String(new Date().getFullYear()));
  const data  = await getEurSummary(brand, year);
  return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });
};
