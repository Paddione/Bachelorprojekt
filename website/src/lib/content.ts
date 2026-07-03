// Content resolution for public pages.
//
// In T001490 (website-db-decouple) every `getEffective*` here became a
// thin wrapper around the build-time content bundle. The pre-decouple
// three-tier chain (DB override > static `pageContent` > TypeScript
// fallback) collapsed: the merge now happens at build time (in
// scripts/export-site-content.mjs) and the result ships as JSON under
// `website/content/<brand>/`. Runtime pages have zero DB dependency.
//
// `getEffective*` signatures are kept `async` for source compatibility
// with the React SPA / mentolder-web callers and to leave room for
// future post-processing (e.g. a content-suffix hook).
import {
  bundleHomepage,
  bundleFaq,
  bundleStammdaten,
  bundleServices,
  bundleLeistungen,
  bundleKontakt,
  bundleUebermich,
  bundleNavigation,
  bundleFooter,
  bundleKoreFlags,
  bundleReferenzen,
  bundleHomepageBlocks,
  bundleSeo,
} from './content-bundle';
import { resolveHighlightTable } from './content-projection';
import type { ResolvedHighlight, HighlightEntry } from './content-projection';
import type { HomepageService, LeistungCategory } from '../config/types';
import type {
  HomepageContent,
  UebermichContent,
  FaqItem,
  KontaktContent,
} from '../content-schema';
import type {
  Stammdaten,
  NavItem,
  FooterConfig,
  KoreFlags,
} from '../content-schema';
import type { ReferenzenConfig } from '../content-schema';

const BRAND = process.env.BRAND || 'mentolder';

export async function getPriceListUrl(): Promise<string | null> {
  return null;
}

export async function getEffectiveReferenzen(): Promise<ReferenzenConfig> {
  return bundleReferenzen(BRAND);
}

/**
 * Returns the effective services list. The bundle already contains the
 * merged view (DB-override > pageContent > static) — callers receive it
 * as-is. Hidden services are included so callers can filter them
 * intentionally.
 */
export async function getEffectiveServices(): Promise<(HomepageService & { hidden?: boolean; meta?: string })[]> {
  return bundleServices(BRAND) as (HomepageService & { hidden?: boolean; meta?: string })[];
}

/** Returns the effective leistungen (pricing table) from the bundle. */
export async function getEffectiveLeistungen(): Promise<LeistungCategory[]> {
  return bundleLeistungen(BRAND) as LeistungCategory[];
}

export async function getEffectiveHomepage(): Promise<HomepageContent> {
  return bundleHomepage(BRAND) as HomepageContent;
}

export async function getEffectiveUebermich(): Promise<UebermichContent> {
  return bundleUebermich(BRAND) as UebermichContent;
}

export async function getEffectiveFaq(): Promise<FaqItem[]> {
  return bundleFaq(BRAND) as FaqItem[];
}

export async function getEffectiveKontakt(): Promise<KontaktContent> {
  return bundleKontakt(BRAND) as KontaktContent;
}

export async function getEffectiveStammdaten(): Promise<Stammdaten> {
  return bundleStammdaten(BRAND) as Stammdaten;
}

export async function getEffectiveNavigation(): Promise<NavItem[]> {
  return bundleNavigation(BRAND) as NavItem[];
}

export async function getEffectiveFooter(): Promise<FooterConfig> {
  return bundleFooter(BRAND) as FooterConfig;
}

export async function getEffectiveKoreFlags(): Promise<KoreFlags> {
  return bundleKoreFlags(BRAND) as KoreFlags;
}

/**
 * Returns the effective pricing-highlight table rows.
 * The bundle's `leistungen` domain carries the price catalog; we feed it
 * through `resolveHighlightTable` so the homepage still has the
 * headline-price derivation. If the bundle grows a dedicated highlight
 * domain later, swap the source.
 */
export async function getEffectiveHighlightTable(): Promise<ResolvedHighlight[]> {
  const cats = bundleLeistungen(BRAND) as LeistungCategory[];
  // The pre-T001490 site_settings.pricing_highlight JSON key has no
  // bundle replacement; we re-derive from the static
  // `config.leistungenPricingHighlight` so the homepage keeps a
  // predictable default. The seeded bundle leaves this for callers to
  // compose; the static config is the SSOT until a future change adds a
  // dedicated `highlight-table` domain.
  const dbEntries: HighlightEntry[] = [];
  return resolveHighlightTable(dbEntries, cats as unknown as Parameters<typeof resolveHighlightTable>[1]);
}

// Re-exports for callers that need the bundle directly
export { bundleHomepageBlocks, bundleSeo };
