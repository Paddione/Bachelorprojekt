import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { listAudit } from '../../../../lib/tickets/cockpit-audit';

const BRAND = (): string => process.env.BRAND_ID ?? process.env.BRAND ?? 'mentolder';
const json = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json' } });

export const GET: APIRoute = async ({ request, url }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response(null, { status: 403 });
  const rawLimit = Number(url.searchParams.get('limit') ?? 50);
  const limit = Number.isFinite(rawLimit) ? rawLimit : 50;
  const entries = await listAudit(BRAND(), limit);
  return json({ entries, fetchedAt: new Date().toISOString() });
};
