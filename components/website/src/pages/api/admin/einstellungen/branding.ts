import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { setSiteSetting } from '../../../../lib/website-db';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const KEYS = ['brand_name','brand_contact_email','brand_phone','brand_logo_url','brand_social_linkedin','brand_social_instagram'] as const;

export const POST: APIRoute = async ({ request, redirect }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Forbidden', { status: 403 });

  const form = await request.formData();
  const brand = process.env.BRAND || 'mentolder';

  const contactEmail = (form.get('brand_contact_email') as string)?.trim();
  if (contactEmail && !EMAIL_RE.test(contactEmail)) {
    return new Response(JSON.stringify({ error: 'Ungültige Kontakt-E-Mail' }), { status: 400 });
  }

  await Promise.all(KEYS.map(key => setSiteSetting(brand, key, (form.get(key) as string)?.trim() ?? '')));
  return redirect('/admin/einstellungen/branding?saved=1', 303);
};
