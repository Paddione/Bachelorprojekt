import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { corsHeaders, handlePreflight } from '../../../../lib/cors';
import { restore, HomepageConflictError } from '../../../../lib/homepage-blocks-store';

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

  const { versionId } = await request.json();
  const editor = session.email ?? session.name ?? 'unknown';
  try {
    const { version } = await restore(BRAND, Number(versionId), editor);
    return json(200, { version }, cors);
  } catch (e) {
    if (e instanceof HomepageConflictError) {
      return json(409, { currentVersion: e.currentVersion, currentValue: e.currentValue }, cors);
    }
    if (e instanceof Error && /not found/i.test(e.message)) {
      return json(404, { error: 'version not found' }, cors);
    }
    locals.requestLogger.error({ e }, 'homepage restore failed');
    return json(500, { error: 'restore failed' }, cors);
  }
};
