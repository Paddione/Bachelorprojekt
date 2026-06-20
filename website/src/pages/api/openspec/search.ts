import type { APIRoute } from 'astro';
import { searchOpenspec } from '../../../lib/knowledge-db';

export const prerender = false;

export const GET: APIRoute = async ({ url, locals }) => {
  const q = url.searchParams.get('q')?.trim();
  if (!q || q.length < 2) {
    return new Response(JSON.stringify({ error: 'query parameter q is required (min 2 chars)' }), {
      status: 400, headers: { 'content-type': 'application/json' },
    });
  }
  const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') ?? '5', 10), 1), 20);
  const status = url.searchParams.get('status') ?? undefined;
  try {
    const results = await searchOpenspec({ query: q, limit, status });
    return new Response(JSON.stringify({ query: q, results }), {
      status: 200, headers: { 'content-type': 'application/json' },
    });
  } catch (err) {
    const code = (err as { status?: number }).status;
    if (code && code >= 500) {
      return new Response(JSON.stringify({ error: 'embedding service unavailable' }), {
        status: 503, headers: { 'content-type': 'application/json' },
      });
    }
    locals.requestLogger?.error?.({ err }, '[api/openspec/search]');
    return new Response(JSON.stringify({ error: 'search failed' }), {
      status: 500, headers: { 'content-type': 'application/json' },
    });
  }
};
