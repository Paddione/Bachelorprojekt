import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { writeContent, ContentConflictError } from '../../../../lib/website-db';
import { validateSection } from '../../../../lib/admin/schemas/index';
import { refFor } from '../../../../lib/content-registry';

const BRAND = import.meta.env.BRAND || process.env.BRAND || 'mentolder';

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

export const POST: APIRoute = async ({ request , locals }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });

  const { contentKey, baseVersion, payload } = await request.json();
  if (!refFor(contentKey)) return new Response('Unknown contentKey', { status: 400 });

  const errors = validateSection(contentKey, payload);
  if (errors.length) return json(422, { errors });

  const editor = session.email ?? session.name ?? 'unknown';
  try {
    const { version } = await writeContent(BRAND, contentKey, payload, baseVersion ?? 0, editor);
    return json(200, { version });
  } catch (e) {
    if (e instanceof ContentConflictError) {
      return json(409, { currentVersion: e.currentVersion, currentValue: e.currentValue });
    }
    locals.requestLogger.error({ e }, 'content save failed');
    return json(500, { error: 'save failed' });
  }
};
