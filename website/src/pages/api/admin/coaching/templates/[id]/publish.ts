import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../../lib/auth';
import { getTemplate } from '../../../../../../lib/coaching-db';
import { publishTemplate } from '../../../../../../lib/coaching-publish';
import { pool } from '../../../../../../lib/website-db';

export const prerender = false;

export const POST: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });

  const template = await getTemplate(pool, params.id as string);
  if (!template) return new Response('Not Found', { status: 404 });

  const r = await pool.query(`SELECT body FROM coaching.snippets WHERE id = $1`, [template.snippetId]);
  if (r.rows.length === 0) return new Response('Snippet missing', { status: 409 });
  const snippetBody: string = r.rows[0].body;

  const result = await publishTemplate(pool, template.id, { snippetBody });
  if (!result.ok) {
    return new Response(JSON.stringify({ error: result.error }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return new Response(JSON.stringify(result.template), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
