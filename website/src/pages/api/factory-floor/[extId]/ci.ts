import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { getTicketDetail } from '../../../../lib/factory-floor';
import { fetchCiChecks } from '../../../../lib/factory-ci';

export const prerender = false;

export const GET: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { 'content-type': 'application/json' },
    });
  }
  const extId = params.extId ?? '';
  try {
    const detail = await getTicketDetail(extId);
    const prNumber = detail?.prNumber ?? null;
    if (!prNumber) {
      return new Response(JSON.stringify({ prNumber: null, checks: [], rollup: null }), {
        status: 200, headers: { 'content-type': 'application/json' },
      });
    }
    const { checks, rollup } = await fetchCiChecks(prNumber);
    return new Response(JSON.stringify({ prNumber, checks, rollup }), {
      status: 200, headers: { 'content-type': 'application/json', 'cache-control': 'private, max-age=30' },
    });
  } catch (err) {
    console.error('[api/factory-floor/[extId]/ci]', err);
    return new Response(JSON.stringify({ error: 'fetch_failed' }), {
      status: 500, headers: { 'content-type': 'application/json' },
    });
  }
};
