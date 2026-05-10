import type { APIRoute } from 'astro';
import { Pool } from 'pg';
import { getSession, isAdmin } from '../../../../../lib/auth';
import { listDrafts, type DraftFilter, type DraftKind, type DraftStatus } from '../../../../../lib/coaching-db';

const pool = new Pool();
export const prerender = false;

export const GET: APIRoute = async ({ request, url }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });

  const filter: DraftFilter = {
    bookId: url.searchParams.get('book_id') ?? undefined,
    templateKind: (url.searchParams.get('template_kind') as DraftKind | null) ?? undefined,
    status: (url.searchParams.get('status') as DraftStatus | null) ?? undefined,
  };
  const rows = await listDrafts(pool, filter);
  return new Response(JSON.stringify({ drafts: rows }), { headers: { 'content-type': 'application/json' } });
};
