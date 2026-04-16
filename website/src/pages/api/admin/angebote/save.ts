import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { saveServiceConfig, saveLeistungenConfig, setSiteSetting } from '../../../../lib/website-db';
import type { ServiceOverride, LeistungCategoryOverride } from '../../../../lib/website-db';
import { mentolderConfig } from '../../../../config/brands/mentolder';

function parseJson<T>(raw: string | null, fallback: T): T {
  if (!raw?.trim()) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export const POST: APIRoute = async ({ request, redirect }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response('Forbidden', { status: 403 });
  }

  const form = await request.formData();
  const BRAND = process.env.BRAND || 'mentolder';

  // ── Services (card fields + pageContent) ──────────────────────────────────
  const serviceOverrides: ServiceOverride[] = mentolderConfig.services.map(s => {
    const features = ((form.get(`${s.slug}_features`) as string) ?? '')
      .split('\n').map(f => f.trim()).filter(Boolean);
    const forWhom = ((form.get(`${s.slug}_pc_forWhom`) as string) ?? '')
      .split('\n').map(f => f.trim()).filter(Boolean);

    return {
      slug: s.slug,
      title: (form.get(`${s.slug}_title`) as string) || s.title,
      description: (form.get(`${s.slug}_description`) as string) || s.description,
      icon: (form.get(`${s.slug}_icon`) as string) || s.icon,
      price: (form.get(`${s.slug}_price`) as string) || s.price,
      features: features.length > 0 ? features : s.features,
      hidden: form.get(`${s.slug}_hidden`) === '1',
      pageContent: {
        headline: (form.get(`${s.slug}_pc_headline`) as string) || s.pageContent.headline,
        intro: (form.get(`${s.slug}_pc_intro`) as string) || s.pageContent.intro,
        forWhom: forWhom.length > 0 ? forWhom : s.pageContent.forWhom,
        sections: parseJson(form.get(`${s.slug}_pc_sections`) as string, s.pageContent.sections),
        pricing: parseJson(form.get(`${s.slug}_pc_pricing`) as string, s.pageContent.pricing),
        faq: parseJson(form.get(`${s.slug}_pc_faq`) as string, s.pageContent.faq ?? []),
      },
    };
  });

  // ── Leistungen (pricing table) ─────────────────────────────────────────────
  const leistungenOverrides: LeistungCategoryOverride[] = mentolderConfig.leistungen.map(cat => ({
    id: cat.id,
    title: (form.get(`lk_${cat.id}_title`) as string) || cat.title,
    icon: (form.get(`lk_${cat.id}_icon`) as string) || cat.icon,
    services: cat.services.map(svc => ({
      key: svc.key,
      name: (form.get(`lk_${cat.id}_${svc.key}_name`) as string) || svc.name,
      price: (form.get(`lk_${cat.id}_${svc.key}_price`) as string) || svc.price,
      unit: (form.get(`lk_${cat.id}_${svc.key}_unit`) as string ?? svc.unit),
      desc: (form.get(`lk_${cat.id}_${svc.key}_desc`) as string) || svc.desc,
      highlight: form.get(`lk_${cat.id}_${svc.key}_highlight`) === '1',
    })),
  }));

  const priceListUrl = (form.get('price_list_url') as string)?.trim() ?? '';

  await Promise.all([
    saveServiceConfig(BRAND, serviceOverrides),
    saveLeistungenConfig(BRAND, leistungenOverrides),
    priceListUrl
      ? setSiteSetting(BRAND, 'price_list_url', priceListUrl)
      : setSiteSetting(BRAND, 'price_list_url', ''),
  ]);

  return redirect('/admin/angebote?saved=1', 303);
};
