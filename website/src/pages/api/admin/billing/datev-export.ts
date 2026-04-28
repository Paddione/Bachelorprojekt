import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { getBookingsForPeriod, buildExtfCsv, periodRange } from '../../../../lib/datev-extf';

export const GET: APIRoute = async ({ request, url }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });

  const yearStr = url.searchParams.get('year');
  if (!yearStr) return new Response('year required', { status: 400 });
  const year  = parseInt(yearStr, 10);
  const monthStr = url.searchParams.get('month');
  const month = monthStr ? parseInt(monthStr, 10) : undefined;

  if (isNaN(year) || year < 2020 || year > 2099) {
    return new Response('invalid year', { status: 400 });
  }
  if (month !== undefined && (isNaN(month) || month < 1 || month > 12)) {
    return new Response('invalid month (1–12)', { status: 400 });
  }

  const brand = process.env.BRAND || 'mentolder';
  const { from, to, label } = periodRange(year, month);
  const records = await getBookingsForPeriod(brand, from, to);
  const csv = buildExtfCsv(records, {
    periodStart: from,
    periodEnd: to,
    fiscalYearStart: `${year}-01-01`,
    bezeichnung: `Buchungsstapel ${label}`,
  });

  const filename = `datev-buchungsstapel-${label.replace(/\s+/g, '-').toLowerCase()}.csv`;
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
};
