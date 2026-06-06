import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../lib/auth';
import { listFactoryMetrics, listActiveFeatures, listActiveFlags } from '../../lib/factory-metrics';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    });
  }

  const brand = (process.env.BRAND_ID ?? process.env.BRAND ?? 'mentolder').toLowerCase();

  try {
    const [metrics, activeFeatures, flags] = await Promise.all([
      listFactoryMetrics(),
      listActiveFeatures(),
      listActiveFlags(brand),
    ]);
    return new Response(
      JSON.stringify({ brand, metrics, activeFeatures, flags, fetchedAt: new Date().toISOString() }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  } catch (err) {
    console.error('[api/factory-metrics]', err);
    return new Response(JSON.stringify({ error: 'fetch_failed' }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }
};
