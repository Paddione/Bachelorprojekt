import { config } from '../config/index';
import {
  getServiceConfig,
  getLeistungenConfig,
  getSiteSetting,
  getReferenzen,
  getHomepageContent,
  getUebermichContent,
  getFaqContent,
  getKontaktContent,
} from './website-db';
import type { HomepageService, LeistungCategory } from '../config/types';
import type { ReferenzenConfig } from './website-db';
import type {
  HomepageContent,
  UebermichContent,
  FaqItem,
  KontaktContent,
} from './website-db';

const BRAND = process.env.BRAND || 'mentolder';

export async function getPriceListUrl(): Promise<string | null> {
  return getSiteSetting(BRAND, 'price_list_url').catch(() => null);
}

export async function getEffectiveReferenzen(): Promise<ReferenzenConfig> {
  return (await getReferenzen(BRAND).catch(() => null)) ?? { types: [], items: [] };
}

/**
 * Returns the effective services list, merging DB overrides over the static
 * config. Hidden services are included — callers decide whether to filter them.
 *
 * Order: when DB overrides exist, the override array order wins (so admins can
 * reorder cards). Static services not yet present in the overrides are appended
 * at the end so newly-added entries from `config.services` don't disappear.
 *
 * Override-only entries (no matching static slug) are admin-created cards and
 * are returned as-is with empty fallbacks for optional pageContent fields, so
 * the homepage and detail page render without crashing.
 */
export async function getEffectiveServices(): Promise<(HomepageService & { hidden?: boolean; meta?: string })[]> {
  const overrides = await getServiceConfig(BRAND).catch(() => null);
  if (!overrides) return config.services;

  const staticBySlug = new Map(config.services.map((s) => [s.slug, s]));
  const merge = (svc: HomepageService, o: typeof overrides[number]) => {
    const pc = o.pageContent;
    return {
      ...svc,
      title: o.title ?? svc.title,
      description: o.description ?? svc.description,
      icon: o.icon ?? svc.icon,
      price: o.price ?? svc.price,
      features: o.features ?? svc.features,
      hidden: o.hidden ?? false,
      meta: o.meta,
      pageContent: pc
        ? {
            headline: pc.headline ?? svc.pageContent.headline,
            intro: pc.intro ?? svc.pageContent.intro,
            forWhom: pc.forWhom ?? svc.pageContent.forWhom,
            sections: pc.sections ?? svc.pageContent.sections,
            pricing: pc.pricing ?? svc.pageContent.pricing,
            faq: pc.faq ?? svc.pageContent.faq,
          }
        : svc.pageContent,
    };
  };

  const fromOverride = (o: typeof overrides[number]): HomepageService & { hidden?: boolean; meta?: string } => {
    const pc = o.pageContent ?? {};
    return {
      slug: o.slug,
      title: o.title ?? '',
      description: o.description ?? '',
      icon: o.icon ?? '✨',
      features: o.features ?? [],
      price: o.price ?? '',
      hidden: o.hidden ?? false,
      meta: o.meta,
      pageContent: {
        headline: pc.headline ?? o.title ?? '',
        intro: pc.intro ?? o.description ?? '',
        forWhom: pc.forWhom ?? [],
        sections: pc.sections ?? [],
        pricing: pc.pricing ?? [],
        faq: pc.faq ?? [],
      },
    };
  };

  const overrideSlugs = new Set(overrides.map((o) => o.slug));
  const fromOverrides: (HomepageService & { hidden?: boolean })[] = [];
  for (const o of overrides) {
    const svc = staticBySlug.get(o.slug);
    fromOverrides.push(svc ? merge(svc, o) : fromOverride(o));
  }
  const missing = config.services.filter((s) => !overrideSlugs.has(s.slug));
  return [...fromOverrides, ...missing];
}

/**
 * Returns the effective leistungen (pricing table), merging DB overrides over
 * the static config.
 */
export async function getEffectiveLeistungen(): Promise<LeistungCategory[]> {
  const overrides = await getLeistungenConfig(BRAND).catch(() => null);
  if (!overrides) return config.leistungen;

  return config.leistungen.map((cat) => {
    const o = overrides.find((x) => x.id === cat.id);
    if (!o) return cat;

    const mergedServices = cat.services.map((svc) => {
      const so = o.services?.find((x) => x.key === svc.key);
      if (!so) return svc;
      return {
        ...svc,
        name: so.name ?? svc.name,
        price: so.price ?? svc.price,
        unit: so.unit ?? svc.unit,
        desc: so.desc ?? svc.desc,
        highlight: so.highlight ?? svc.highlight,
        stundensatz_cents: so.stundensatz_cents ?? svc.stundensatz_cents,
      };
    });

    return {
      ...cat,
      title: o.title ?? cat.title,
      icon: o.icon ?? cat.icon,
      services: mergedServices,
    };
  });
}

export async function getEffectiveHomepage(): Promise<HomepageContent> {
  const db = await getHomepageContent(BRAND).catch(() => null);
  const c = config.homepage;
  // Fallback: BrandConfig.homepage has no hero sub-object, so title/tagline are
  // hardcoded here. The admin UI (admin/startseite) overwrites this on first save.
  if (!db) return {
    hero: {
      title: 'Digital Coach & Führungskräfte-Mentor –',
      titleEmphasis: 'der Mensch und Technologie wieder verbindet.',
      subtitle: c.whyMeIntro,
      tagline: 'Praxisnah. Strukturiert. Auf Augenhöhe.',
    },
    stats: c.stats,
    servicesHeadline: c.servicesHeadline,
    servicesSubheadline: c.servicesSubheadline,
    whyMeHeadline: c.whyMeHeadline,
    whyMeIntro: c.whyMeIntro,
    whyMePoints: c.whyMePoints.map(p => ({ title: p.title, text: p.text, iconPath: p.iconPath })),
    avatarType: c.avatarType,
    avatarSrc: c.avatarSrc,
    avatarInitials: c.avatarInitials,
    quote: c.quote,
    quoteName: c.quoteName,
  };
  return {
    ...db,
    hero: {
      ...db.hero,
      titleEmphasis: db.hero.titleEmphasis ?? 'der Mensch und Technologie wieder verbindet.',
    },
    avatarType: db.avatarType ?? c.avatarType,
    avatarSrc: db.avatarSrc ?? c.avatarSrc,
    avatarInitials: db.avatarInitials ?? c.avatarInitials,
    whyMePoints: db.whyMePoints.map((pt, i) => ({
      ...pt,
      iconPath: c.whyMePoints[i]?.iconPath,
    })),
  };
}

export async function getEffectiveUebermich(): Promise<UebermichContent> {
  const db = await getUebermichContent(BRAND).catch(() => null);
  if (!db) return config.uebermich;
  return db;
}

export async function getEffectiveFaq(): Promise<FaqItem[]> {
  const db = await getFaqContent(BRAND).catch(() => null);
  if (!db) return config.faq;
  return db;
}

export async function getEffectiveKontakt(): Promise<KontaktContent> {
  const db = await getKontaktContent(BRAND).catch(() => null);
  if (!db) return config.kontakt;
  return db;
}
