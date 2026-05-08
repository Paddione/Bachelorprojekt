import type { APIRoute } from 'astro';
import { getSession } from '../../../lib/auth';
import { snoozeNudge } from '../../../lib/assistant/dismissals';

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { 'content-type': 'application/json' } });

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session) return json({ error: 'unauthorized' }, 401);

  let body: { nudgeId: string; snoozeSeconds?: number };
  try { body = await request.json(); } catch { return json({ error: 'bad json' }, 400); }

  if (!body.nudgeId) return json({ error: 'missing nudgeId' }, 400);
  const seconds = Math.max(60, Math.min(86400 * 7, body.snoozeSeconds ?? 86400));
  await snoozeNudge(session.sub, body.nudgeId, seconds);
  return json({ ok: true });
};
