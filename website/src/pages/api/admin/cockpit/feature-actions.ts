import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { setFeatureAction, BrandMismatchError } from '../../../../lib/tickets/cockpit-db';

const BRAND = (): string => process.env.BRAND_ID ?? process.env.BRAND ?? 'mentolder';
const json = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json' } });

const VALID_ACTIONS = ['next_step', 'discard', 'major', 'comment'];

interface ActionEntry {
  featureId: string;
  action: string;
  value?: boolean | string;
}

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response(null, { status: 403 });

  let body: { actions?: ActionEntry[] };
  try { body = await request.json(); } catch { return json({ error: 'bad json' }, 400); }
  if (!body.actions || !Array.isArray(body.actions) || body.actions.length === 0)
    return json({ error: 'actions array required' }, 400);

  for (const entry of body.actions) {
    if (!entry.featureId || !entry.action) return json({ error: 'each action needs featureId and action' }, 400);
    if (!VALID_ACTIONS.includes(entry.action)) return json({ error: `invalid action: ${entry.action}` }, 400);
  }

  const results: { featureId: string; success: boolean; error?: string }[] = [];
  for (const entry of body.actions) {
    try {
      await setFeatureAction(BRAND(), entry.featureId, entry.action, entry.value);
      results.push({ featureId: entry.featureId, success: true });
    } catch (e) {
      if (e instanceof BrandMismatchError) {
        results.push({ featureId: entry.featureId, success: false, error: 'cross-brand' });
      } else {
        results.push({ featureId: entry.featureId, success: false, error: String((e as Error).message) });
      }
    }
  }

  return json({ ok: true, results });
};
