import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../lib/auth';
import { searchCode, searchCodeAugmented } from '../../lib/codesearch-db';

export const prerender = false;

export const GET: APIRoute = async ({ request, url , locals }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    });
  }

  const q = url.searchParams.get('q')?.trim();
  if (!q || q.length < 2) {
    return new Response(JSON.stringify({ error: 'query parameter q is required (min 2 chars)' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  }

  const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') ?? '5', 10), 1), 20);
  const augmented = url.searchParams.get('augmented') === 'true';

  try {
    const results = augmented
      ? await searchCodeAugmented(q, limit)
      : await searchCode(q, limit);
    return new Response(JSON.stringify({ query: q, results }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  } catch (err) {
    const status = (err as { status?: number }).status;
    if (status && status >= 500) {
      return new Response(JSON.stringify({ error: 'embedding service unavailable' }), {
        status: 503,
        headers: { 'content-type': 'application/json' },
      });
    }
    locals.requestLogger.error({ err }, '[api/codesearch]');
    return new Response(JSON.stringify({ error: 'search failed' }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }
};
