import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { saveHomepageContent } from '../../../../lib/website-db';
import type { HomepageContent } from '../../../../lib/website-db';

const BRAND = process.env.BRAND || 'mentolder';

export const POST: APIRoute = async ({ request, redirect }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Forbidden', { status: 403 });

  if (request.headers.get('content-type')?.includes('application/json')) {
    let body: HomepageContent;
    try {
      body = await request.json() as HomepageContent;
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }
    try {
      await saveHomepageContent(BRAND, body);
    } catch (err) {
      console.error('[startseite/save] DB error:', err);
      return new Response(JSON.stringify({ error: 'DB error' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
  }

  const form = await request.formData();
  const g = (k: string) => (form.get(k) as string | null) ?? '';

  await saveHomepageContent(BRAND, {
    hero: {
      tagline: g('hero_tagline'),
      title: g('hero_title'),
      subtitle: g('hero_subtitle'),
    },
    stats: Array.from({ length: parseInt(g('stats_count') || '4', 10) }, (_, i) => ({
      value: g(`stat_${i}_value`),
      label: g(`stat_${i}_label`),
    })),
    servicesHeadline: g('services_headline'),
    servicesSubheadline: g('services_subheadline'),
    whyMeHeadline: g('whyme_headline'),
    whyMeIntro: g('whyme_intro'),
    whyMePoints: Array.from({ length: parseInt(g('whyme_count') || '3', 10) }, (_, i) => ({
      title: g(`whyme_point_${i}_title`),
      text: g(`whyme_point_${i}_text`),
    })),
    avatarType: (g('avatar_type') || 'initials') as 'image' | 'initials',
    avatarSrc: g('avatar_src') || undefined,
    avatarInitials: g('avatar_initials') || undefined,
    quote: g('quote'),
    quoteName: g('quote_name'),
    processSteps: Array.from({ length: parseInt(g('process_count') || '0', 10) }, (_, i) => ({
      num: g(`process_${i}_num`),
      heading: g(`process_${i}_heading`),
      description: g(`process_${i}_description`),
    })),
  });

  return redirect('/admin/startseite?saved=1');
};
