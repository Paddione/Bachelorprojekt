import type { APIRoute } from 'astro';
import { corsHeaders, handlePreflight } from '../../lib/cors';
import { readCurrent } from '../../lib/homepage-blocks-store';

// Public read of the live homepage block document for this brand.
// Consumed by the React SPA (react.<brand>) at render time — no auth.
const BRAND = import.meta.env.BRAND || process.env.BRAND || 'mentolder';

export const OPTIONS: APIRoute = ({ request }) => handlePreflight(request) as Response;

export const GET: APIRoute = async ({ request }) => {
  const cors = corsHeaders(request.headers.get('origin'));
  const { document } = await readCurrent(BRAND);
  if (!document) {
    return new Response(null, { status: 204, headers: { ...cors } });
  }
  return new Response(JSON.stringify(document), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...cors },
  });
};
