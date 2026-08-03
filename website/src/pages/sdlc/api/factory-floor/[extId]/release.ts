import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { releaseToBacklog } from '../../../../lib/factory-floor';

export const prerender = false;

const json = (o: unknown, status = 200) => new Response(JSON.stringify(o),
  { status, headers: { 'content-type': 'application/json' } });

export const POST: APIRoute = async ({ request, params , locals }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return json({ error: 'Unauthorized' }, 401);

  const extId = params.extId ?? '';
  if (!extId) return json({ error: 'extId missing' }, 400);

  try {
    const ok = await releaseToBacklog(extId);
    // 409, wenn das Ticket nicht (mehr) plan_staged ist - z.B. Doppelklick / schon freigegeben.
    if (!ok) return json({ error: 'not_staged' }, 409);
    return json({ ok: true });
  } catch (err) {
    locals.requestLogger.error({ err }, '[api/factory-floor/[extId]/release]');
    return json({ error: 'release_failed' }, 500);
  }
};
