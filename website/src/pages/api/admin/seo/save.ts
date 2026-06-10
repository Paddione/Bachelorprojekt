import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { setSiteSetting } from '../../../../lib/website-db';

const BRAND = process.env.BRAND || 'mentolder';

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });

  let body: { pageKey: string; description: string; title?: string; ogImage?: string };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { pageKey, description, title, ogImage } = body;

  if (typeof pageKey !== 'string' || !pageKey) {
    return new Response(JSON.stringify({ error: 'pageKey is required' }), {
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
    if (description.trim()) {
      await setSiteSetting(BRAND, `seo_meta_desc_${pageKey}`, description);
    } else {
      await setSiteSetting(BRAND, `seo_meta_desc_${pageKey}`, '');
    }
    if (title !== undefined && typeof title === 'string') {
      if (title.trim()) {
        await setSiteSetting(BRAND, `seo_title_${pageKey}`, title);
      } else {
        await setSiteSetting(BRAND, `seo_title_${pageKey}`, '');
      }
    }
    if (ogImage !== undefined) {
      if (typeof ogImage === 'string' && ogImage.trim()) {
        await setSiteSetting(BRAND, `seo_og_image_${pageKey}`, ogImage);
      } else {
        await setSiteSetting(BRAND, `seo_og_image_${pageKey}`, '');
      }
    }
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
