import type { APIRoute } from 'astro';
import { Pool } from 'pg';
import { getSession, isAdmin } from '../../../../../../lib/auth';
import { acceptDraft } from '../../../../../../lib/coaching-db';

const pool = new Pool();
export const prerender = false;

export const POST: APIRoute = async ({ request, params, url }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });
  const id = params.id as string;
  const body = await request.json().catch(() => ({} as Record<string, unknown>));
  const reviewedBy = (session as any).email ?? (session as any).user ?? 'admin';
  const then = url.searchParams.get('then');

  try {
    const result = await acceptDraft(pool, id, {
      reviewedBy,
      payloadOverrides: (body as any).payload_overrides as Record<string, unknown> | undefined,
      snippetTitleOverride: (body as any).snippet_title as string | undefined,
      tags: (body as any).tags as string[] | undefined,
    });
    const out: Record<string, unknown> = {
      draft: result.draft,
      snippet_id: result.snippetId,
    };
    if (then === 'publish') {
      out.redirect_to = `/admin/knowledge/snippets/${result.snippetId}/publish`;
    }
    return new Response(JSON.stringify(out), { headers: { 'content-type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), { status: 409, headers: { 'content-type': 'application/json' } });
  }
};
