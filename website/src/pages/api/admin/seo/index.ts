import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { pool } from '../../../../lib/website-db';

const BRAND = process.env.BRAND || 'mentolder';

export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });

  const result = await pool.query(
    `SELECT key, value FROM site_settings WHERE brand = $1 AND key LIKE 'seo_meta_desc_%'`,
    [BRAND],
  );

  const data: Record<string, string> = {};
  for (const row of result.rows) {
    const pageKey = (row.key as string).replace('seo_meta_desc_', '');
    data[pageKey] = row.value as string;
  }

  return new Response(JSON.stringify(data), {
    headers: { 'Content-Type': 'application/json' },
  });
};
