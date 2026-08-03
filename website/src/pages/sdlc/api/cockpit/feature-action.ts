import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { setFeatureAction, BrandMismatchError } from '../../../../lib/tickets/cockpit-db';

const BRAND = (): string => process.env.BRAND_ID ?? process.env.BRAND ?? 'mentolder';
const json = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json' } });

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response(null, { status: 403 });
  let body: { featureId?: string; action?: string; value?: boolean | string };
  try { body = await request.json(); } catch { return json({ error: 'bad json' }, 400); }
  const { featureId, action, value } = body;
  if (!featureId || !action) return json({ error: 'featureId and action required' }, 400);
  if (!['next_step', 'discard', 'major', 'comment'].includes(action))
    return json({ error: 'invalid action' }, 400);
  try {
    return json(await setFeatureAction(BRAND(), featureId, action, value));
  } catch (e) {
    if (e instanceof BrandMismatchError) return json({ error: 'cross-brand' }, 400);
    return json({ error: String((e as Error).message) }, 500);
  }
};
