import type { APIRoute } from 'astro';
import { listTimeline } from '../../lib/website-db';

export const prerender = false;

export const GET: APIRoute = async ({ url }) => {
  const limit    = parseInt(url.searchParams.get('limit') ?? '20', 10);
  const offset   = parseInt(url.searchParams.get('offset') ?? '0', 10);
  const category = url.searchParams.get('cat')   ?? undefined;
  const brand    = url.searchParams.get('brand') ?? undefined;

  try {
    const rows = await listTimeline({ limit, offset, category, brand });
    return new Response(JSON.stringify({ rows }), {
      status: 200,
      headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=30' },
    });
  } catch (err) {
    console.error('[api/timeline]', err);
    return new Response(JSON.stringify({ rows: [], error: 'fetch_failed' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }
};
