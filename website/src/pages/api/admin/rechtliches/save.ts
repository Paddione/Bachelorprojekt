import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { saveLegalPage } from '../../../../lib/website-db';

export const POST: APIRoute = async ({ request, redirect }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response('Forbidden', { status: 403 });
  }

  const form = await request.formData();
  const BRAND = process.env.BRAND || 'mentolder';

  const pages = ['impressum-zusatz', 'datenschutz', 'agb', 'barrierefreiheit'] as const;

  await Promise.all(
    pages.map(key => {
      const value = (form.get(key) as string) ?? '';
      return saveLegalPage(BRAND, key, value);
    })
  );

  return redirect('/admin/rechtliches?saved=1', 303);
};
