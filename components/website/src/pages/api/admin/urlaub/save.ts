import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { saveVacationPeriods } from '../../../../lib/website-db';
import type { VacationPeriod } from '../../../../lib/website-db';
import { randomUUID } from 'crypto';

const BRAND = process.env.BRAND || 'mentolder';

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });

  const { periods } = await request.json() as { periods: Omit<VacationPeriod, 'id'>[] };
  if (!Array.isArray(periods)) return new Response(JSON.stringify({ error: 'periods required' }), { status: 400 });

  const validated: VacationPeriod[] = periods
    .filter(p => p.start && p.end && p.start <= p.end)
    .map(p => ({ id: randomUUID(), start: p.start, end: p.end, label: (p.label || '').trim() || 'Auszeit' }));

  await saveVacationPeriods(BRAND, validated);
  return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } });
};
