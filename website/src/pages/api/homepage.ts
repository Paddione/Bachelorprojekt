import type { APIRoute } from 'astro';
import { corsHeaders, handlePreflight } from '../../lib/cors';
import { readCurrent } from '../../lib/homepage-blocks-store';

// Public read of the live homepage block document for this brand.
// Consumed by the React SPA (react.<brand>) at render time — no auth.
//
// Fail-soft contract (T001490 Task 5): if the store read throws (DB
// down, network blip, table not yet migrated, …) we MUST NOT bubble
// a 500 to the public surface. The homepage-blocks document is a
// runtime enhancement on top of the build-time content bundle — the
// site stays available without it. We return 204 with the
// `X-Homepage-Version` header set to `0` so the React SPA knows it
// has nothing to apply and the contract is preserved.
const BRAND = import.meta.env.BRAND || process.env.BRAND || 'mentolder';

export const OPTIONS: APIRoute = ({ request }) => handlePreflight(request) as Response;

export const GET: APIRoute = async ({ request }) => {
  const cors = corsHeaders(request.headers.get('origin'));
  let document: Awaited<ReturnType<typeof readCurrent>>['document'] = null;
  let version = 0;
  try {
    const r = await readCurrent(BRAND);
    document = r.document;
    version = r.version;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[api/homepage] readCurrent failed, returning 204:', (err as Error)?.message ?? err);
  }
  // Expose the live version so the cross-origin editor can do optimistic-
  // concurrency saves without the version leaking into the public body.
  const versionHeaders = {
    'X-Homepage-Version': String(version),
    'Access-Control-Expose-Headers': 'X-Homepage-Version',
  };
  if (!document) {
    return new Response(null, { status: 204, headers: { ...cors, ...versionHeaders } });
  }
  return new Response(JSON.stringify(document), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...cors, ...versionHeaders },
  });
};
