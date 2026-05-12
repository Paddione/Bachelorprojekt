import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { getServiceConfig, saveServiceConfig } from '../../../../lib/website-db';
import type { ServiceOverride } from '../../../../lib/website-db';
import { config } from '../../../../config/index';
import type { FuehrungContent } from '../../../../lib/fuehrung-content';

const BRAND = process.env.BRAND || 'mentolder';
const SLUG = 'fuehrung-persoenlichkeit';

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Forbidden', { status: 403 });

  let body: FuehrungContent;
  try {
    body = await request.json() as FuehrungContent;
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const existing = await getServiceConfig(BRAND) ?? [];
    const staticSvc = config.services.find(s => s.slug === SLUG);

    // Build pageContent from FuehrungContent
    // introNote (persönlicher Absatz) wird als erster Section-Eintrag gespeichert
    // damit er auf der Seite sichtbar ist.
    const introNoteSection = body.introNote?.trim()
      ? [{ title: '__introNote__', items: body.introNote.split('\n\n').filter(Boolean) }]
      : [];

    const pageContent: ServiceOverride['pageContent'] = {
      headline: body.headline,
      intro: body.intro,
      forWhom: body.forWhom,
      sections: [
        ...introNoteSection,
        ...body.process.map(p => ({
          title: `${p.step} — ${p.title}`,
          items: [p.text],
        })),
      ],
      pricing: [
        { label: body.ctaText, price: staticSvc?.price ?? 'Ab 150 €', highlight: true },
      ],
      faq: body.faq,
    };

    const idx = existing.findIndex(s => s.slug === SLUG);
    const override: ServiceOverride = {
      slug: SLUG,
      title: staticSvc?.title ?? 'Führung & Persönlichkeit',
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
    console.error('[fuehrung/save] DB error:', err);
    return new Response(JSON.stringify({ error: 'DB error' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
