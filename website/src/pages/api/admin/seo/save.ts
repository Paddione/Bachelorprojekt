import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { setSiteSetting } from '../../../../lib/website-db';

const BRAND = process.env.BRAND || 'mentolder';

const ALLOWED_PAGE_KEYS = ['home', 'kontakt', 'ueber-mich', 'leistungen'];

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });

  let body: { pageKey: string; description: string };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { pageKey, description } = body;

  if (!ALLOWED_PAGE_KEYS.includes(pageKey)) {
    return new Response(JSON.stringify({ error: 'Invalid pageKey' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (typeof description !== 'string') {
    return new Response(JSON.stringify({ error: 'description must be a string' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    await setSiteSetting(BRAND, `seo_meta_desc_${pageKey}`, description);
  } catch (err) {
    console.error('[seo/save] DB error:', err);
    return new Response(JSON.stringify({ error: 'DB error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
