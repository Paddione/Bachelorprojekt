import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { pool } from '../../../../lib/website-db';

const BRAND = process.env.BRAND || 'mentolder';

export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });

  const result = await pool.query(
    `SELECT key, value FROM site_settings WHERE brand = $1 AND (key LIKE 'seo_meta_desc_%' OR key LIKE 'seo_title_%' OR key LIKE 'seo_og_image_%')`,
    [BRAND],
  );

  const descriptions: Record<string, string> = {};
  const titles: Record<string, string> = {};
  const ogImages: Record<string, string> = {};
  for (const row of result.rows) {
    const key = row.key as string;
    if (key.startsWith('seo_meta_desc_')) {
      descriptions[key.replace('seo_meta_desc_', '')] = row.value as string;
    } else if (key.startsWith('seo_og_image_')) {
      ogImages[key.replace('seo_og_image_', '')] = row.value as string;
    } else if (key.startsWith('seo_title_')) {
      titles[key.replace('seo_title_', '')] = row.value as string;
    }
  }

  return new Response(JSON.stringify({ descriptions, titles, ogImages }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
