import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { saveHomepageContent } from '../../../../lib/website-db';

const BRAND = process.env.BRAND || 'mentolder';

export const POST: APIRoute = async ({ request, redirect }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Forbidden', { status: 403 });

  const form = await request.formData();
  const g = (k: string) => (form.get(k) as string | null) ?? '';

  await saveHomepageContent(BRAND, {
    hero: {
      tagline: g('hero_tagline'),
      title: g('hero_title'),
      subtitle: g('hero_subtitle'),
    },
    stats: [0, 1, 2, 3].map(i => ({
      value: g(`stat_${i}_value`),
      label: g(`stat_${i}_label`),
    })),
    servicesHeadline: g('services_headline'),
    servicesSubheadline: g('services_subheadline'),
    whyMeHeadline: g('whyme_headline'),
    whyMeIntro: g('whyme_intro'),
    whyMePoints: [0, 1, 2].map(i => ({
      title: g(`whyme_point_${i}_title`),
      text: g(`whyme_point_${i}_text`),
    })),
    quote: g('quote'),
    quoteName: g('quote_name'),
  });

  return redirect('/admin/startseite?saved=1');
};
