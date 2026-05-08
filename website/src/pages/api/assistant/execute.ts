import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../lib/auth';
import { executeAction } from '../../../lib/assistant/actions';
import type { AssistantProfile } from '../../../lib/assistant/types';

import '../../../lib/assistant/actions/admin/index';
import '../../../lib/assistant/actions/portal/index';

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { 'content-type': 'application/json' } });

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session) return json({ error: 'unauthorized' }, 401);

  let body: { profile: AssistantProfile; actionId: string; payload: Record<string, unknown> };
  try { body = await request.json(); } catch { return json({ error: 'bad json' }, 400); }

  const { profile, actionId, payload } = body;
  if (profile !== 'admin' && profile !== 'portal') return json({ error: 'invalid profile' }, 400);
  if (profile === 'admin' && !isAdmin(session)) return json({ error: 'forbidden' }, 403);
  if (typeof actionId !== 'string' || !actionId) return json({ error: 'missing actionId' }, 400);

  try {
    const result = await executeAction(actionId, { profile, userSub: session.sub, payload: payload ?? {} });
    return json({ result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'execute failed';
    if (msg.startsWith('unknown action')) return json({ error: msg }, 404);
    if (msg.includes('not allowed')) return json({ error: msg }, 403);
    console.error('[assistant/execute] error:', err);
    return json({ error: 'internal' }, 500);
  }
};
