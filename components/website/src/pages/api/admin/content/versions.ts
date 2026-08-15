import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { listVersions } from '../../../../lib/website-db';

const BRAND = import.meta.env.BRAND || process.env.BRAND || 'mentolder';

export const GET: APIRoute = async ({ request, url }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });
  const key = url.searchParams.get('key');
  if (!key) return new Response('key required', { status: 400 });
  const rows = await listVersions(BRAND, key);
  const list = rows.map(({ id, editor, createdAt }) => ({ id, editor, createdAt }));
  return new Response(JSON.stringify(list), { status: 200, headers: { 'content-type': 'application/json' } });
};
