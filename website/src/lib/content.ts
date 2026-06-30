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
  getJsonSetting,
  NAV_KEY,
  FOOTER_KEY,
  STAMMDATEN_KEY,
  KORE_FLAGS_KEY,
  PRICING_HIGHLIGHT_KEY,
} from './website-db';
import { deriveHeadlinePrice, detailTiers, resolveStammdaten, resolveHighlightTable } from './content-projection';
import type { HighlightEntry, ResolvedHighlight } from './content-projection';
import type { HomepageService, LeistungCategory } from '../config/types';
import type { ReferenzenConfig, Stammdaten, NavItem, FooterConfig, KoreFlags } from './website-db';
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
  const db = await getReferenzen(BRAND).catch(() => null);
  if (db) return db;
  return config.referenzen ?? { types: [], items: [] };
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

  const cats = (await getLeistungenConfig(BRAND).catch(() => null)) ?? config.leistungen;
  const catById = new Map(cats.map((c) => [c.id, c]));
  const headlineFor = (o: typeof overrides[number], staticPrice: string) =>
    o.leistungCategoryId && catById.get(o.leistungCategoryId)
      ? deriveHeadlinePrice(catById.get(o.leistungCategoryId)!, o.headlineKey, o.headlinePrefix ?? false)
      : (o.price ?? staticPrice);
  const tiersFor = (
    o: typeof overrides[number],
    staticTiers: { label: string; price: string; unit?: string; highlight?: boolean }[],
  ) =>
    o.leistungCategoryId && catById.get(o.leistungCategoryId)
      ? detailTiers(catById.get(o.leistungCategoryId))
      : staticTiers;

  const staticBySlug = new Map(config.services.map((s) => [s.slug, s]));
  const merge = (svc: HomepageService, o: typeof overrides[number]) => {
    const pc = o.pageContent;
    return {
      ...svc,
      title: o.title ?? svc.title,
      description: o.description ?? svc.description,
      icon: o.icon ?? svc.icon,
      price: headlineFor(o, svc.price),
      features: o.features ?? svc.features,
      hidden: o.hidden ?? false,
      meta: o.meta,
      pageContent: pc
        ? {
            headline: pc.headline ?? svc.pageContent.headline,
            intro: pc.intro ?? svc.pageContent.intro,
            forWhom: pc.forWhom ?? svc.pageContent.forWhom,
            sections: pc.sections ?? svc.pageContent.sections,
            pricing: tiersFor(o, pc.pricing ?? svc.pageContent.pricing),
            faq: pc.faq ?? svc.pageContent.faq,
            faqTitle: pc.faqTitle ?? svc.pageContent.faqTitle,
          }
        : {
            ...svc.pageContent,
            pricing: tiersFor(o, svc.pageContent.pricing),
          },
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
      price: headlineFor(o, ''),
      hidden: o.hidden ?? false,
      meta: o.meta,
      pageContent: {
        headline: pc.headline ?? o.title ?? '',
        intro: pc.intro ?? o.description ?? '',
        forWhom: pc.forWhom ?? [],
        sections: pc.sections ?? [],
        pricing: tiersFor(o, pc.pricing ?? []),
        faq: pc.faq ?? [],
        faqTitle: pc.faqTitle,
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

const DEFAULT_PROCESS_STEPS = [
  { num: '01 — Erstgespräch', heading: 'Kennenlernen', description: '30 Minuten, kostenlos. Wir klären Ihre Situation und Ihre Herausforderung.' },
  { num: '02 — Klarheit', heading: 'Zieldefinition', description: 'Gemeinsam entscheiden wir: Was ist das richtige Format, was der richtige Rahmen?' },
  { num: '03 — Begleitung', heading: 'Arbeitsphase', description: 'Individuelle Sessions in Ihrem Tempo – online oder vor Ort in Lüneburg und Umgebung.' },
  { num: '04 — Transfer', heading: 'Nachhaltigkeit', description: 'Was Sie hier lernen, bleibt bei Ihnen. Nicht als Wissen, sondern als Haltung.' },
];

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
    processSteps: DEFAULT_PROCESS_STEPS,
    processEyebrow: 'So arbeiten wir',
    processHeadline: 'Vier ruhige Schritte.',
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
    whyMePoints: Array.isArray(db.whyMePoints)
      ? db.whyMePoints.map((pt, i) => ({
          ...pt,
          iconPath: c.whyMePoints[i]?.iconPath,
        }))
      : c.whyMePoints.map(p => ({ title: p.title, text: p.text, iconPath: p.iconPath })),
    processSteps: db.processSteps ?? DEFAULT_PROCESS_STEPS,
    processEyebrow: db.processEyebrow ?? 'So arbeiten wir',
    processHeadline: db.processHeadline ?? 'Vier ruhige Schritte.',
  };
}

export async function getEffectiveUebermich(): Promise<UebermichContent> {
  const db = await getUebermichContent(BRAND).catch(() => null);
  const f = config.uebermich;
  if (!db) return f;
  return {
    pageHeadline: typeof db.pageHeadline === 'string' ? db.pageHeadline : f.pageHeadline,
    subheadline: typeof db.subheadline === 'string' ? db.subheadline : f.subheadline,
    introParagraphs: Array.isArray(db.introParagraphs) ? db.introParagraphs : f.introParagraphs,
    sections: Array.isArray(db.sections) ? db.sections : f.sections,
    milestones: Array.isArray(db.milestones) ? db.milestones : f.milestones,
    notDoing: Array.isArray(db.notDoing) ? db.notDoing : f.notDoing,
    privateText: typeof db.privateText === 'string' ? db.privateText : f.privateText,
    warumdieserName: db.warumdieserName ?? f.warumdieserName,
  };
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

export async function getEffectiveStammdaten(): Promise<Stammdaten> {
  const db = await getJsonSetting<Partial<Stammdaten>>(BRAND, STAMMDATEN_KEY).catch(() => null);
  return resolveStammdaten(db, staticStammdaten());
}

export async function getEffectiveNavigation(): Promise<NavItem[]> {
  return (await getJsonSetting<NavItem[]>(BRAND, NAV_KEY).catch(() => null)) ?? staticNavigation();
}

export async function getEffectiveFooter(): Promise<FooterConfig> {
  return (await getJsonSetting<FooterConfig>(BRAND, FOOTER_KEY).catch(() => null)) ?? staticFooter();
}

export async function getEffectiveKoreFlags(): Promise<KoreFlags> {
  return (await getJsonSetting<KoreFlags>(BRAND, KORE_FLAGS_KEY).catch(() => null)) ?? { timeline: !!config.homepage.timeline };
}

/**
 * Returns the effective pricing-highlight table rows.
 * DB (`site_settings.pricing_highlight`) wins; fallback is the static
 * `config.leistungenPricingHighlight` array (converted to plain HighlightEntry
 * shape — no catalog key references needed for the static default).
 */
export async function getEffectiveHighlightTable(): Promise<ResolvedHighlight[]> {
  const cats = (await getLeistungenConfig(BRAND).catch(() => null)) ?? config.leistungen;
  const dbEntries = await getJsonSetting<HighlightEntry[]>(BRAND, PRICING_HIGHLIGHT_KEY).catch(() => null);
  if (dbEntries && dbEntries.length > 0) {
    return resolveHighlightTable(dbEntries, cats);
  }
  // Fallback: convert static LeistungPricingHighlight[] to plain HighlightEntries
  const staticEntries: HighlightEntry[] = (config.leistungenPricingHighlight ?? []).map((h) => ({
    label: h.label,
    price: h.price,
    note: h.note,
    highlight: h.highlight ?? false,
  }));
  return resolveHighlightTable(staticEntries, cats);
}

function getInitials(name: string): string {
  if (!name) return BRAND === 'korczewski' ? 'PK' : 'GK';
  const parts = name.split(/\s+/).filter(Boolean);
  return parts.map(p => p[0]).join('').toUpperCase().substring(0, 2);
}

function staticStammdaten(): Stammdaten {
  return {
    name: config.contact.name,
    role: config.legal.jobtitle,
    email: config.contact.email,
    phone: config.contact.phone,
    street: config.legal.street,
    zip: config.legal.zip,
    city: config.contact.city,
    ustId: config.legal.ustId,
    website: config.legal.website,
    avatarInitials: getInitials(config.contact.name),
  };
}

function staticNavigation(): NavItem[] {
  return config.navigation.map((n, i) => ({ label: n.label, href: n.href, order: i }));
}

function staticFooter(): FooterConfig {
  return {
    columns: config.footer.columns.map((c) => ({
      heading: c.heading,
      links: c.links.map((l) => ({ label: l.label, href: l.href })),
    })),
    copyright: config.footer.copyright ?? `© ${new Date().getFullYear()} ${config.contact.name || BRAND}`,
  };
}

