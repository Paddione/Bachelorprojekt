import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { saveLegalPage } from '../../../../lib/website-db';

const PAGES = ['impressum-zusatz', 'datenschutz', 'agb', 'barrierefreiheit'] as const;
type LegalKey = typeof PAGES[number];

export const POST: APIRoute = async ({ request, redirect }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Forbidden', { status: 403 });

  const BRAND = process.env.BRAND || 'mentolder';

  if (request.headers.get('content-type')?.includes('application/json')) {
    let body: Record<LegalKey, string>;
    try {
      body = await request.json() as Record<LegalKey, string>;
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }
    try {
      await Promise.all(PAGES.map(key => saveLegalPage(BRAND, key, body[key] ?? '')));
    } catch (err) {
      console.error('[rechtliches/save] DB error:', err);
      return new Response(JSON.stringify({ error: 'DB error' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
  }

  const form = await request.formData();
  await Promise.all(PAGES.map(key => saveLegalPage(BRAND, key, (form.get(key) as string) ?? '')));
  return redirect('/admin/rechtliches?saved=1', 303);
};
