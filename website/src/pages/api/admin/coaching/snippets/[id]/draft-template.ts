import type { APIRoute } from 'astro';
import { Pool } from 'pg';
import { getSession, isAdmin } from '../../../../../../lib/auth';
import { createTemplateDraft, type TargetSurface } from '../../../../../../lib/coaching-db';

const pool = new Pool();
export const prerender = false;

const SURFACES: TargetSurface[] = ['questionnaire', 'brett', 'chatroom', 'assistant'];

export const POST: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });

  const body = (await request.json()) as {
    targetSurface?: string;
    payload?: Record<string, unknown>;
  };
  if (!body.targetSurface || !SURFACES.includes(body.targetSurface as TargetSurface)) {
    return new Response(JSON.stringify({ error: 'targetSurface required: questionnaire|brett|chatroom|assistant' }), { status: 400 });
  }

  const r = await pool.query(
    `SELECT s.id, s.book_id, s.page, s.knowledge_chunk_id, b.id AS book_uuid
       FROM coaching.snippets s
       JOIN coaching.books b ON b.id = s.book_id
      WHERE s.id = $1`,
    [params.id],
  );
  if (r.rows.length === 0) return new Response('Not Found', { status: 404 });
  const row = r.rows[0];

  const t = await createTemplateDraft(pool, {
    snippetId: row.id,
    targetSurface: body.targetSurface as TargetSurface,
    payload: body.payload ?? {},
    sourcePointer: {
      bookId: row.book_uuid,
      page: row.page ?? null,
      chunkId: row.knowledge_chunk_id ?? null,
    },
    createdBy: session.preferred_username,
  });
  return new Response(JSON.stringify(t), { status: 201, headers: { 'Content-Type': 'application/json' } });
};
