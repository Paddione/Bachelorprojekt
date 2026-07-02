// Barrel re-exporting every content-domain Zod schema as a single map.
// Pure module — no DB / API / website-db imports (S2 acyclic-website gate).
//
// The 13 content domains are the keys a brand's `website/content/<brand>/`
// directory must hold. `ContentBundleSchema` is consumed by the build-time
// loader (content-bundle.ts) and by the DB→JSON exporter (scripts/export-site-content.mjs).
import type { z } from 'zod';
import { HomepageSchema, HomepageBlocksSchema, SeoSchema, SCHEMA_VERSION } from './homepage';
import {
  FaqSchema, KontaktSchema, UebermichSchema, ServicesSchema,
  LeistungenSchema, HighlightTableSchema, ReferenzenConfigSchema,
} from './pages';
import {
  StammdatenSchema, NavigationSchema, FooterConfigSchema, KoreFlagsSchema,
} from './site';

export {
  HomepageSchema, HomepageBlocksSchema, SeoSchema, SCHEMA_VERSION,
} from './homepage';
export {
  FaqSchema, KontaktSchema, UebermichSchema, ServicesSchema,
  LeistungenSchema, HighlightTableSchema, ReferenzenConfigSchema,
} from './pages';
export {
  StammdatenSchema, NavigationSchema, FooterConfigSchema, KoreFlagsSchema,
} from './site';
export type {
  HomepageContent, HomepageHero, HomepageStat, HomepageWhyMePoint, HomepageProcessStep,
  SeoContent, SeoPageKey, HomepageBlocksContent, BlockContent,
} from './homepage';
export type {
  FaqItem, KontaktContent, UebermichContent, UebermichSection, UebermichMilestone,
  UebermichNotDoing, HomepageService, ServicePageContent, ServicePagePricing,
  ServicePageSection, LeistungServiceRow, LeistungCategory, HighlightEntryResolved,
  ReferenzItem, ReferenzenType, ReferenzenConfig,
} from './pages';
export type {
  Stammdaten, NavItem, FooterLink, FooterColumn, FooterConfig, KoreFlags,
} from './site';

export const DOMAINS = [
  'homepage',
  'homepage-blocks',
  'seo',
  'faq',
  'kontakt',
  'ueber-mich',
  'services',
  'leistungen',
  'stammdaten',
  'navigation',
  'footer',
  'referenzen',
  'kore-flags',
] as const;
export type Domain = typeof DOMAINS[number];

export type DomainContent = {
  'homepage': import('./homepage').HomepageContent;
  'homepage-blocks': import('./homepage').HomepageBlocksContent;
  'seo': import('./homepage').SeoContent;
  'faq': import('./pages').FaqItem[];
  'kontakt': import('./pages').KontaktContent;
  'ueber-mich': import('./pages').UebermichContent;
  'services': import('./pages').HomepageService[];
  'leistungen': import('./pages').LeistungCategory[];
  'stammdaten': import('./site').Stammdaten;
  'navigation': import('./site').NavItem[];
  'footer': import('./site').FooterConfig;
  'referenzen': import('./pages').ReferenzenConfig;
  'kore-flags': import('./site').KoreFlags;
};

// ContentBundleSchema — the single source of truth for what the bundle
// loader validates against and the DB→JSON exporter seeds from. Adding a
// new content domain means (1) defining its Zod schema in the matching
// file, (2) adding the key here, (3) appending to DOMAINS.
export const ContentBundleSchema = {
  'homepage':        HomepageSchema,
  'homepage-blocks': HomepageBlocksSchema,
  'seo':             SeoSchema,
  'faq':             FaqSchema,
  'kontakt':         KontaktSchema,
  'ueber-mich':      UebermichSchema,
  'services':        ServicesSchema,
  'leistungen':      LeistungenSchema,
  'stammdaten':      StammdatenSchema,
  'navigation':      NavigationSchema,
  'footer':          FooterConfigSchema,
  'referenzen':      ReferenzenConfigSchema,
  'kore-flags':      KoreFlagsSchema,
} satisfies { [K in Domain]: z.ZodType<DomainContent[K]> };

export type SchemaOf<D extends Domain> = z.infer<typeof ContentBundleSchema[D]>;
