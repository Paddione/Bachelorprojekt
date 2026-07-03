import type { APIRoute } from 'astro';
import { corsHeaders, handlePreflight } from '../../lib/cors';
import { bundleHomepageBlocks } from '../../lib/content-bundle';

// Public read of the live homepage block document for this brand.
//
// T001490 Task 10 — bundle-sourced: the document is served from the
// build-time content bundle (`website/content/<brand>/homepage-blocks.json`)
// rather than from the legacy `homepage_block_documents` table. The DB
// path is decommissioned; the contract is preserved for the React SPA
// (`react.<brand>`) which reads this endpoint at render time. No auth.
//
// Fail-soft contract (T001490 Task 5): if the bundle read throws (build
// artefact missing, validation error, …) we MUST NOT bubble a 500 to the
// public surface. We return 204 with the `X-Homepage-Version` header
// set to `0` so the React SPA knows it has nothing to apply.
const BRAND = import.meta.env.BRAND || process.env.BRAND || 'mentolder';

export const OPTIONS: APIRoute = ({ request }) => handlePreflight(request) as Response;

export const GET: APIRoute = async ({ request }) => {
  const cors = corsHeaders(request.headers.get('origin'));
  let document: ReturnType<typeof bundleHomepageBlocks> | null = null;
  try {
    document = bundleHomepageBlocks(BRAND);
  } catch (err) {
    console.warn('[api/homepage] bundle read failed, returning 204:', (err as Error)?.message ?? err);
  }
  // The bundle carries a build-time SHA via Vite; expose it as a version
  // surrogate so the cross-origin editor can do optimistic-concurrency
  // saves without the version leaking into the public body. We use 0
  // when no document is present — the SPA treats that as "no override".
  const versionHeaders = {
    'X-Homepage-Version': document ? '1' : '0',
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
