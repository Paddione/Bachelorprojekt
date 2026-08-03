import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../lib/auth';
import { queryRange, queryInstant, buildPromQL, listPhaseTimeline } from '../../lib/factory-observability';

export const prerender = false;

export const GET: APIRoute = async ({ request , locals }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { 'content-type': 'application/json' },
    });
  }
  const brand = (process.env.BRAND_ID ?? process.env.BRAND ?? 'mentolder').toLowerCase();
  const now = Math.floor(Date.now() / 1000);
  const start = now - 7 * 24 * 3600;
  const step = 3600;
  try {
    const [cost, tokens, phaseDuration, costByModel, costByTicket, timeline] = await Promise.all([
      queryRange(buildPromQL('cost', brand), start, now, step).catch(() => null),
      queryRange(buildPromQL('tokens', brand), start, now, step).catch(() => null),
      queryRange(buildPromQL('phase_duration', brand), start, now, step).catch(() => null),
      queryInstant(buildPromQL('cost_by_model', brand)).catch(() => null),
      queryInstant(buildPromQL('cost_by_ticket', brand)).catch(() => null),
      listPhaseTimeline(200).catch(() => []),
    ]);
    return new Response(
      JSON.stringify({ brand, cost, tokens, phaseDuration, costByModel, costByTicket, timeline, fetchedAt: new Date().toISOString() }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  } catch (err) {
    locals.requestLogger.error({ err }, '[api/factory-observability]');
    return new Response(JSON.stringify({ error: 'fetch_failed' }), {
      status: 500, headers: { 'content-type': 'application/json' },
    });
  }
};
