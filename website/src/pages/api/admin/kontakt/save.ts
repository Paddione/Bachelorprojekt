import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { saveKontaktContent } from '../../../../lib/website-db';

const BRAND = process.env.BRAND || 'mentolder';

export const POST: APIRoute = async ({ request, redirect }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Forbidden', { status: 403 });

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
