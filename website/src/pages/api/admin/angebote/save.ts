import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { saveServiceConfig } from '../../../../lib/meetings-db';
import type { ServiceOverride } from '../../../../lib/meetings-db';
import { mentolderConfig } from '../../../../config/brands/mentolder';

export const POST: APIRoute = async ({ request, redirect }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response('Forbidden', { status: 403 });
  }

  const form = await request.formData();
  const BRAND = process.env.BRAND || 'mentolder';

  const overrides: ServiceOverride[] = mentolderConfig.services.map(s => {
    const rawFeatures = (form.get(`${s.slug}_features`) as string) ?? '';
    const features = rawFeatures
      .split('\n')
      .map(f => f.trim())
      .filter(Boolean);

    return {
      slug: s.slug,
      title: (form.get(`${s.slug}_title`) as string) ?? s.title,
      description: (form.get(`${s.slug}_description`) as string) ?? s.description,
      icon: (form.get(`${s.slug}_icon`) as string) ?? s.icon,
      price: (form.get(`${s.slug}_price`) as string) ?? s.price,
      features: features.length > 0 ? features : s.features,
      hidden: form.get(`${s.slug}_hidden`) === '1',
    };
  });

  await saveServiceConfig(BRAND, overrides);

  return redirect('/admin/angebote?saved=1', 303);
};
