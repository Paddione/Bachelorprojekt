import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../lib/auth';
import { pool } from '../../../../../lib/website-db';
import { listActions } from '../../../../../lib/admin-actions';

export const GET: APIRoute = async ({ url, request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session) return new Response(JSON.stringify({ error: 'Bitte erneut anmelden' }), { status: 401 });
  if (!isAdmin(session)) return new Response(JSON.stringify({ error: 'Keine Berechtigung' }), { status: 403 });

  const actionFilter = url.searchParams.get('action_filter') || undefined;
  const limit = Number(url.searchParams.get('limit') ?? 50);
  const actions = await listActions(pool, { actionFilter, limit });
  return new Response(JSON.stringify({ actions }), { status: 200 });
};
