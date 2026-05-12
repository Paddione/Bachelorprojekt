import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { getServiceConfig, saveServiceConfig } from '../../../../lib/website-db';
import type { ServiceOverride } from '../../../../lib/website-db';
import { config } from '../../../../config/index';
import type { CoachingContent } from '../../../../lib/coaching-content';

const BRAND = process.env.BRAND || 'mentolder';
const SLUG = 'coaching';

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Forbidden', { status: 403 });

  let body: CoachingContent;
  try {
    body = await request.json() as CoachingContent;
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    // Load existing service_config overrides
    const existing = await getServiceConfig(BRAND) ?? [];
    const staticSvc = config.services.find(s => s.slug === SLUG);

    // Build the pageContent from CoachingContent fields
    const pageContent: ServiceOverride['pageContent'] = {
      headline: body.headline,
      intro: body.intro,
      forWhom: body.forWhom,
      // Map process steps → sections
      sections: body.process.map(p => ({
        title: `${p.step} — ${p.title}`,
        items: [p.text],
      })),
      pricing: [
        { label: body.ctaText, price: staticSvc?.price ?? 'Ab 150 €', highlight: true },
      ],
      faq: body.faq,
    };

    // Find or create the service override for this slug
    const idx = existing.findIndex(s => s.slug === SLUG);
    const override: ServiceOverride = {
      slug: SLUG,
      title: staticSvc?.title ?? 'Coaching',
      description: staticSvc?.description ?? '',
      icon: staticSvc?.icon ?? '🎯',
      price: staticSvc?.price ?? '',
      features: staticSvc?.features ?? [],
      pageContent,
    };

    if (idx >= 0) {
      existing[idx] = { ...existing[idx], pageContent };
    } else {
      existing.push(override);
    }

    await saveServiceConfig(BRAND, existing);
  } catch (err) {
    console.error('[coaching/save] DB error:', err);
    return new Response(JSON.stringify({ error: 'DB error' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
