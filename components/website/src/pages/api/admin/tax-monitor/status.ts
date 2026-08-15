import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { getYearRevenue, checkThreshold, getTaxMode, THRESHOLD_KLEIN, THRESHOLD_WARNING } from '../../../../lib/tax-monitor';

export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });
  const brand = process.env.BRAND || 'mentolder';
  const year  = new Date().getFullYear();
  const [revenue, taxMode] = await Promise.all([
    getYearRevenue(brand, year), getTaxMode(brand)
  ]);
  const status = checkThreshold(revenue);
  return new Response(JSON.stringify({
    year, revenue, taxMode, status,
    thresholdWarning: THRESHOLD_WARNING, thresholdKlein: THRESHOLD_KLEIN,
    percentToLimit: Math.min(100, (revenue / THRESHOLD_KLEIN) * 100),
  }), { headers: { 'Content-Type': 'application/json' } });
};
