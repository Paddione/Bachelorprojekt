import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { getUstvaExport } from '../../../../lib/tax-monitor';

export const GET: APIRoute = async ({ request, url }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });
  const brand   = process.env.BRAND || 'mentolder';
  const year    = parseInt(url.searchParams.get('year') ?? String(new Date().getFullYear()));
  const quarter = url.searchParams.get('quarter') ? parseInt(url.searchParams.get('quarter')!) : undefined;
  const data    = await getUstvaExport(brand, year, quarter);
  const format  = url.searchParams.get('format') ?? 'json';
  if (format === 'csv') {
    const csv = [
      'Periode;Steuer-Modus;Umsatz 0%;Umsatz 7%;Umsatz 19%;USt 7%;USt 19%;USt gesamt',
      `${data.period};${data.taxMode};${data.revenue0.toFixed(2)};${data.revenue7.toFixed(2)};${data.revenue19.toFixed(2)};${data.tax7.toFixed(2)};${data.tax19.toFixed(2)};${data.totalTax.toFixed(2)}`
    ].join('\n');
    return new Response(csv, {
      headers: { 'Content-Type': 'text/csv', 'Content-Disposition': `attachment; filename="ustva-${data.period}.csv"` }
    });
  }
  return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });
};
