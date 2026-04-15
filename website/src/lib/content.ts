import { config } from '../config/index';
import { getServiceConfig, getLeistungenConfig, getSiteSetting, getReferenzen } from './website-db';
import type { HomepageService, LeistungCategory } from '../config/types';
import type { ReferenzItem } from './website-db';

const BRAND = process.env.BRAND || 'mentolder';

export async function getPriceListUrl(): Promise<string | null> {
  return getSiteSetting(BRAND, 'price_list_url').catch(() => null);
}

export async function getEffectiveReferenzen(): Promise<ReferenzItem[]> {
  return (await getReferenzen(BRAND).catch(() => null)) ?? [];
}

/**
 * Returns the effective services list, merging DB overrides over the static
 * config. Hidden services are included — callers decide whether to filter them.
 */
export async function getEffectiveServices(): Promise<(HomepageService & { hidden?: boolean })[]> {
  const overrides = await getServiceConfig(BRAND).catch(() => null);
  if (!overrides) return config.services;

  return config.services.map((svc) => {
    const o = overrides.find((x) => x.slug === svc.slug);
    if (!o) return svc;

    const pc = o.pageContent;
    return {
      ...svc,
      title: o.title ?? svc.title,
      description: o.description ?? svc.description,
      icon: o.icon ?? svc.icon,
      price: o.price ?? svc.price,
      features: o.features ?? svc.features,
      hidden: o.hidden ?? false,
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
  });
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
