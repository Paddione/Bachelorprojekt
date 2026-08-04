import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { getTestRunTrend } from '../../../../lib/website-db';

export const GET: APIRoute = async ({ request, url }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  const days = Number(url.searchParams.get('days') ?? 30);
  const safeDays = Math.max(1, Math.min(days, 180));
  const trend = await getTestRunTrend(safeDays);
  return new Response(JSON.stringify({ days: safeDays, trend }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
