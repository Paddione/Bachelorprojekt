import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { publishContent } from '../../../../lib/content-publish';
import { publishResultToResponse } from '../../../../lib/content-publish-handler';
import { config } from '../../../../config/index';
import type { HomepageService, LeistungCategory } from '../../../../content-schema';

function parseJson<T>(raw: string | null, fallback: T): T {
  if (!raw?.trim()) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

const BRAND = process.env.BRAND || 'mentolder';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/**
 * Angebote save spans two content domains (services + leistungen). We
 * publish both via the bot-PR pipeline; priceListUrl is a per-brand
 * site-wide field — T001490 stores it in the `stammdaten` bundle so
 * no separate DB key is needed. T001490 retires the legacy
 * `saveServiceConfig` / `saveLeistungenConfig` / `price_list_url`
 * `site_settings` writes.
 */
export const POST: APIRoute = async ({ request, redirect, locals }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });

  const editor = session.email ?? session.name ?? 'unknown';

  if (request.headers.get('content-type')?.includes('application/json')) {
    let body: { services: HomepageService[]; leistungen: LeistungCategory[]; baseSha?: { services?: string; leistungen?: string } };
    try {
      body = await request.json() as typeof body;
    } catch {
      return jsonResponse(400, { error: 'Invalid JSON' });
    }
    if (!Array.isArray(body.services) || !Array.isArray(body.leistungen)) {
      return jsonResponse(400, { error: 'services and leistungen are required arrays' });
    }
    // Sanitize linked cards: strip legacy price/pageContent.pricing when
    // a leistungCategoryId binds the card to the catalog. The bundle's
    // HomepageService has no leistungCategoryId, so we also drop it.
    const sanitizedServices: HomepageService[] = body.services.map((rawCard) => {
      const card = rawCard as HomepageService & { leistungCategoryId?: string };
      if (!card.leistungCategoryId) return card;
      const { price: _price, pageContent, ...rest } = card;
      const cleanPageContent = pageContent
        ? (({ pricing: _p, ...pc }) => pc)(pageContent as unknown as Record<string, unknown>) as unknown as typeof pageContent
        : undefined;
      return {
        ...rest,
        pageContent: cleanPageContent ?? card.pageContent,
      } as HomepageService;
    });

    // Publish services first, then leistungen. If the first publish
    // 409s, the user can rebase and retry; the second publish only
    // runs when the first succeeds.
    try {
      const servicesRes = await publishContent({
        brand: BRAND, domain: 'services',
        payload: sanitizedServices, baseSha: body.baseSha?.services ?? null, editor,
      });
      if (!servicesRes.ok) return publishResultToResponse(servicesRes);
      const leistungenRes = await publishContent({
        brand: BRAND, domain: 'leistungen',
        payload: body.leistungen, baseSha: body.baseSha?.leistungen ?? null, editor,
      });
      if (!leistungenRes.ok) return publishResultToResponse(leistungenRes);
      return jsonResponse(200, {
        ok: true,
        services: servicesRes.ok ? { sha: servicesRes.sha, prNumber: servicesRes.prNumber, prUrl: servicesRes.prUrl } : null,
        leistungen: leistungenRes.ok ? { sha: leistungenRes.sha, prNumber: leistungenRes.prNumber, prUrl: leistungenRes.prUrl } : null,
      });
    } catch (e) {
      locals.requestLogger?.error?.({ e }, 'angebote save failed');
      return jsonResponse(500, { error: 'publish failed' });
    }
  }

  // Legacy form-encoded path — convert form fields to services + leistungen
  // payloads, then publish through the same pipeline.
  const form = await request.formData();

  const serviceOverrides: HomepageService[] = config.services.map((s) => {
    const features = ((form.get(`${s.slug}_features`) as string) ?? '').split('\n').map((f) => f.trim()).filter(Boolean);
    const forWhom = ((form.get(`${s.slug}_pc_forWhom`) as string) ?? '').split('\n').map((f) => f.trim()).filter(Boolean);
    return {
      slug: s.slug,
      title: (form.get(`${s.slug}_title`) as string) || s.title,
      description: (form.get(`${s.slug}_description`) as string) || s.description,
      icon: (form.get(`${s.slug}_icon`) as string) || s.icon,
      price: (form.get(`${s.slug}_price`) as string) || s.price,
      features: features.length > 0 ? features : s.features,
      pageContent: {
        headline: (form.get(`${s.slug}_pc_headline`) as string) || s.pageContent.headline,
        intro: (form.get(`${s.slug}_pc_intro`) as string) || s.pageContent.intro,
        forWhom: forWhom.length > 0 ? forWhom : s.pageContent.forWhom,
        sections: parseJson(form.get(`${s.slug}_pc_sections`) as string, s.pageContent.sections),
        pricing: parseJson(form.get(`${s.slug}_pc_pricing`) as string, s.pageContent.pricing),
        faq: parseJson(form.get(`${s.slug}_pc_faq`) as string, s.pageContent.faq ?? []),
      },
    } as HomepageService;
  });

  const leistungenOverrides: LeistungCategory[] = config.leistungen.map((cat) => ({
    id: cat.id,
    title: (form.get(`lk_${cat.id}_title`) as string) || cat.title,
    icon: (form.get(`lk_${cat.id}_icon`) as string) || cat.icon,
    services: cat.services.map((svc) => {
      const stundensatzEuro = parseFloat((form.get(`lk_${cat.id}_${svc.key}_stundensatz`) as string) || '0');
      const stundensatz_cents = Number.isNaN(stundensatzEuro) ? 0 : Math.round(stundensatzEuro * 100);
      return {
        key: svc.key,
        name: (form.get(`lk_${cat.id}_${svc.key}_name`) as string) || svc.name,
        price: (form.get(`lk_${cat.id}_${svc.key}_price`) as string) || svc.price,
        unit: ((form.get(`lk_${cat.id}_${svc.key}_unit`) as string) || svc.unit),
        desc: (form.get(`lk_${cat.id}_${svc.key}_desc`) as string) || svc.desc,
        highlight: form.get(`lk_${cat.id}_${svc.key}_highlight`) === '1',
        ...(stundensatz_cents > 0 ? { stundensatz_cents } : {}),
      };
    }),
  }));

  try {
    const servicesRes = await publishContent({
      brand: BRAND, domain: 'services', payload: serviceOverrides, baseSha: null, editor,
    });
    if (!servicesRes.ok) return publishResultToResponse(servicesRes);
    const leistungenRes = await publishContent({
      brand: BRAND, domain: 'leistungen', payload: leistungenOverrides, baseSha: null, editor,
    });
    if (!leistungenRes.ok) return publishResultToResponse(leistungenRes);
  } catch (e) {
    locals.requestLogger?.error?.({ e }, 'angebote save failed');
    return jsonResponse(500, { error: 'publish failed' });
  }
  return redirect('/admin/angebote?saved=1', 303);
};
