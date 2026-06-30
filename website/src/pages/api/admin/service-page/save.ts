import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { getServiceConfig, saveServiceConfig } from '../../../../lib/website-db';
import type { ServiceOverride } from '../../../../lib/website-db';
import { config } from '../../../../config/index';

const BRAND = process.env.BRAND || 'mentolder';

export const POST: APIRoute = async ({ request, url , locals }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Forbidden', { status: 403 });

  const slug = url.searchParams.get('slug');
  if (!slug) return new Response(JSON.stringify({ error: 'slug required' }), {
    status: 400, headers: { 'Content-Type': 'application/json' },
  });

  // Request payload shape, restricted to the fields read below.
  interface ServicePageSaveBody {
    introNote?: string;
    sections?: Array<{ title: string; items: string[] }>;
    cardTitle?: string;
    cardDescription?: string;
    cardIcon?: string;
    cardFeatures?: string[];
    cardPrice?: string;
    headline?: string;
    intro?: string;
    forWhom?: string[];
    pricing?: Array<{ label: string; price: string; unit?: string; highlight?: boolean }>;
    faq?: Array<{ question: string; answer: string }>;
    seoTitle?: string;
    seoDescription?: string;
  }

  let body: ServicePageSaveBody;
  try { body = (await request.json()) as ServicePageSaveBody; }
  catch { return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
    status: 400, headers: { 'Content-Type': 'application/json' },
  }); }

  try {
    const existing = await getServiceConfig(BRAND) ?? [];
    const staticSvc = config.services.find(s => s.slug === slug);
    const idx = existing.findIndex(s => s.slug === slug);

    // Build sections: introNote als __introNote__ wenn vorhanden
    const introNoteItems = body.introNote?.trim()
      ? body.introNote.split('\n\n').filter(Boolean)
      : null;
    const sections = [
      ...(introNoteItems ? [{ title: '__introNote__', items: introNoteItems }] : []),
      ...(body.sections ?? []),
    ];

    const prev = idx >= 0 ? existing[idx] : null;
    const isCatalogLinked = !!(prev?.leistungCategoryId);

    const override: ServiceOverride = {
      slug,
      title: body.cardTitle ?? staticSvc?.title ?? slug,
      description: body.cardDescription ?? staticSvc?.description ?? '',
      icon: body.cardIcon ?? staticSvc?.icon ?? '✨',
      features: body.cardFeatures ?? staticSvc?.features ?? [],
      hidden: prev?.hidden ?? false,
      // Preserve catalog linkage — strip legacy price/pricing when linked
      ...(prev?.leistungCategoryId ? { leistungCategoryId: prev.leistungCategoryId } : {}),
      ...(prev?.headlineKey ? { headlineKey: prev.headlineKey } : {}),
      ...(prev?.headlinePrefix != null ? { headlinePrefix: prev.headlinePrefix } : {}),
      ...(isCatalogLinked
        ? {}
        : { price: body.cardPrice ?? staticSvc?.price ?? '' }),
      pageContent: {
        headline: body.headline,
        intro: body.intro,
        forWhom: body.forWhom ?? [],
        sections,
        ...(isCatalogLinked
          ? {}
          : { pricing: body.pricing ?? [] }),
        faq: body.faq ?? [],
        seoTitle: body.seoTitle || undefined,
        seoDescription: body.seoDescription || undefined,
      },
    };

    if (idx >= 0) existing[idx] = override;
    else existing.push(override);

    await saveServiceConfig(BRAND, existing);
  } catch (err) {
    locals.requestLogger.error({ err }, '[service-page/save] DB error:');
    return new Response(JSON.stringify({ error: 'DB error' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
