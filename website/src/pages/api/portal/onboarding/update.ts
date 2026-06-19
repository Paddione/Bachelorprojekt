import type { APIRoute } from 'astro';
import { getSession } from '../../../../lib/auth';
import { pool } from '../../../../lib/website-db';

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session) return new Response(null, { status: 401 });

  const form = await request.formData();
  const id   = form.get('id') as string;
  const done = form.get('done') === 'true';
  const back = form.get('_back') as string | null;

  if (!id) return new Response(null, { status: 400 });

  // Verify ownership: only update if the item belongs to this user
  const result = await pool.query(
    'UPDATE onboarding_items SET done = $2 WHERE id = $1 AND keycloak_user_id = $3',
    [id, done, session.sub]
  );

  if (result.rowCount === 0) return new Response(null, { status: 404 });

  return new Response(null, { status: 302, headers: { Location: back || '/portal' } });
};
