import type { APIRoute } from 'astro';
import { pool } from '../../../lib/website-db';
import { getSession, isAdmin } from '../../../lib/auth';

export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });

  try {
    const result = await pool.query(`
      SELECT id, name, type, file_path, tags, metadata, created_at
      FROM assets.registry
      ORDER BY type, name
    `);
    return new Response(JSON.stringify(result.rows), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch {
    return new Response(JSON.stringify([]), {
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
