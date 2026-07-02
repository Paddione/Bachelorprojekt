import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { corsHeaders, handlePreflight } from '../../../../lib/cors';
import { publishContent } from '../../../../lib/content-publish';
import { publishResultToResponse } from '../../../../lib/content-publish-handler';
import type { HomepageBlocksContent } from '../../../../content-schema';

const BRAND = import.meta.env.BRAND || process.env.BRAND || 'mentolder';

function json(status: number, body: unknown, cors: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...cors },
  });
}

export const OPTIONS: APIRoute = ({ request }) => handlePreflight(request) as Response;

/**
 * T001490: the React homepage block document is now published via the
 * bot-PR pipeline as `homepage-blocks.json`. The legacy `version`-based
 * optimistic concurrency is replaced by blob-SHA `baseSha` — editors
 * that still send `baseVersion` get the SHA-equivalent `null` (no
 * pre-check; publishContent still reads the live SHA for the PR).
 *
 * Contract change vs the legacy handler:
 *   in  : `{ baseVersion, payload }`     →   `{ baseSha?, payload }`
 *   out : `{ version }`                  →   `{ sha, prNumber, prUrl }`
 *   409 : `{ currentVersion, currentValue }` → `{ currentSha, currentValue }`
 */
export const POST: APIRoute = async ({ request, locals }) => {
  const cors = corsHeaders(request.headers.get('origin'));
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response('Unauthorized', { status: 401, headers: cors });
  }

  const body = (await request.json().catch(() => null)) as
    | { payload: HomepageBlocksContent; baseSha?: string; baseVersion?: number }
    | null;
  if (!body || !body.payload) {
    return json(400, { error: 'expected { payload, baseSha? }' }, cors);
  }
  const baseSha = typeof body.baseSha === 'string' && body.baseSha
    ? body.baseSha
    : null;
  const editor = session.email ?? session.name ?? 'unknown';
  try {
    const result = await publishContent({
      brand: BRAND,
      domain: 'homepage-blocks',
      payload: body.payload,
      baseSha,
      editor,
    });
    return publishResultToResponse(result);
  } catch (e) {
    locals.requestLogger?.error?.({ e }, 'homepage-blocks save failed');
    return json(500, { error: 'save failed' }, cors);
  }
};
