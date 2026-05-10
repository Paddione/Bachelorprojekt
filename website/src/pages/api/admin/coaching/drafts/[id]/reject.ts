import type { APIRoute } from 'astro';
import { Pool } from 'pg';
import { getSession, isAdmin } from '../../../../../../lib/auth';
import { rejectDraft } from '../../../../../../lib/coaching-db';

const pool = new Pool();
export const prerender = false;

export const POST: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });
  const id = params.id as string;
  const body = await request.json().catch(() => ({} as Record<string, unknown>));
  const reason = (body as any).reason as string | undefined;
  const reviewedBy = (session as any).email ?? (session as any).user ?? 'admin';
  try {
    const draft = await rejectDraft(pool, id, reviewedBy, reason);
    return new Response(JSON.stringify({ draft }), { headers: { 'content-type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), { status: 409, headers: { 'content-type': 'application/json' } });
  }
};
