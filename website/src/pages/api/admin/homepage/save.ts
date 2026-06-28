import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { corsHeaders, handlePreflight } from '../../../../lib/cors';
import { save, HomepageConflictError, HomepageValidationError } from '../../../../lib/homepage-blocks-store';

const BRAND = import.meta.env.BRAND || process.env.BRAND || 'mentolder';

function json(status: number, body: unknown, cors: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...cors },
  });
}

export const OPTIONS: APIRoute = ({ request }) => handlePreflight(request) as Response;

export const POST: APIRoute = async ({ request, locals }) => {
  const cors = corsHeaders(request.headers.get('origin'));
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response('Unauthorized', { status: 401, headers: cors });
  }

  const { baseVersion, payload } = await request.json();
  const editor = session.email ?? session.name ?? 'unknown';
  try {
    const { version } = await save(BRAND, payload, baseVersion ?? 0, editor);
    return json(200, { version }, cors);
  } catch (e) {
    if (e instanceof HomepageValidationError) return json(422, { errors: e.errors }, cors);
    if (e instanceof HomepageConflictError) {
      return json(409, { currentVersion: e.currentVersion, currentValue: e.currentValue }, cors);
    }
    locals.requestLogger.error({ e }, 'homepage save failed');
    return json(500, { error: 'save failed' }, cors);
  }
};
