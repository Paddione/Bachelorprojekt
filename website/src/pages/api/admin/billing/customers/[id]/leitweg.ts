import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../../lib/auth';
import { setBillingCustomerLeitwegId } from '../../../../../../lib/native-billing';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

export const PATCH: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return json(401, { error: 'Unauthorized' });
  const id = params.id;
  if (!id) return json(400, { error: 'Missing id' });
  let body: { leitwegId?: string | null };
  try { body = await request.json(); }
  catch { return json(400, { error: 'Invalid JSON' }); }
  const raw = body.leitwegId ?? null;
  const r = await setBillingCustomerLeitwegId(id, typeof raw === 'string' ? raw : null);
  if (!r.ok) return json(422, { error: r.reason });
  return json(200, { leitwegId: r.value });
};
