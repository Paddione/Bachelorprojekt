import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../lib/auth';
import { evaluateTriggers } from '../../../lib/assistant/triggers';
import { isSnoozed } from '../../../lib/assistant/dismissals';
import type { AssistantProfile } from '../../../lib/assistant/types';

import '../../../lib/assistant/triggers/admin';
import '../../../lib/assistant/triggers/portal';

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { 'content-type': 'application/json' } });

export const GET: APIRoute = async ({ request, url }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session) return json({ error: 'unauthorized' }, 401);

  const profile = url.searchParams.get('profile') as AssistantProfile | null;
  if (profile !== 'admin' && profile !== 'portal') return json({ error: 'invalid profile' }, 400);
  if (profile === 'admin' && !isAdmin(session)) return json({ error: 'forbidden' }, 403);

  const currentRoute = url.searchParams.get('route') ?? '/';
  const all = await evaluateTriggers(profile, { userSub: session.sub, currentRoute });

  const active: typeof all = [];
  for (const n of all) {
    if (await isSnoozed(session.sub, n.id)) continue;
    active.push(n);
  }
  return json({ nudges: active });
};
