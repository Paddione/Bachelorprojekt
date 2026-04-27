import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { saveKontaktContent } from '../../../../lib/website-db';
import type { KontaktContent } from '../../../../lib/website-db';

const BRAND = process.env.BRAND || 'mentolder';

export const POST: APIRoute = async ({ request, redirect }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Forbidden', { status: 403 });

  if (request.headers.get('content-type')?.includes('application/json')) {
    let body: KontaktContent;
    try {
      body = await request.json() as KontaktContent;
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }
    try {
      await saveKontaktContent(BRAND, body);
    } catch (err) {
      console.error('[kontakt/save] DB error:', err);
      return new Response(JSON.stringify({ error: 'DB error' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
  }

  const form = await request.formData();
  const g = (k: string) => (form.get(k) as string | null) ?? '';

  await saveKontaktContent(BRAND, {
    intro: g('intro'),
    sidebarTitle: g('sidebarTitle'),
    sidebarText: g('sidebarText'),
    sidebarCta: g('sidebarCta'),
    showPhone: form.get('showPhone') === '1',
  });

  return redirect('/admin/kontakt?saved=1');
};
