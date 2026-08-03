import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { setFeatureAction, BrandMismatchError } from '../../../../lib/tickets/cockpit-db';

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

  const brand = process.env.BRAND_ID ?? process.env.BRAND ?? '';
  if (!brand) return json({ error: 'brand not configured' }, 500);

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
      await setFeatureAction(brand, entry.featureId, entry.action, entry.value);
      results.push({ featureId: entry.featureId, success: true });
    } catch (e) {
      if (e instanceof BrandMismatchError) {
        results.push({ featureId: entry.featureId, success: false, error: 'cross-brand' });
      } else {
        throw e;
      }
    }
  }

  return json({ ok: true, results });
};
