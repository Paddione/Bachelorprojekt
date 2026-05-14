import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../lib/auth';
import { saveLegalPage } from '../../../../../lib/website-db';

const ALLOWED = ['impressum-zusatz', 'datenschutz', 'agb', 'barrierefreiheit'] as const;
type LegalKey = typeof ALLOWED[number];

export const POST: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Forbidden', { status: 403 });

  const key = params.key as string;
  if (!ALLOWED.includes(key as LegalKey)) {
    return new Response(JSON.stringify({ error: 'Invalid key' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const BRAND = process.env.BRAND || 'mentolder';

  let content: string;
  try {
    const body = await request.json() as { content: string };
    content = body.content ?? '';
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    await saveLegalPage(BRAND, key, content);
    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[legal/save] DB error:', err);
    return new Response(JSON.stringify({ error: 'DB error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
