// Build-time content bundle loader.
//
// Reads every `website/content/<brand>/<domain>.json` via Vite's
// `import.meta.glob('/content/**/*.json', { eager: true })` and validates
// each against `ContentBundleSchema[domain]`. The result is a single
// in-memory map keyed by `brand` → `domain` → typed object, looked up
// synchronously by `loadDomain` and the thin typed getters below.
//
// Validation is fail-closed: a missing or schema-invalid file aborts the
// build via `validateAllBundles()` (called from the export script and
// from the bundle pre-warm path). The runtime getters throw
// `BundleValidationError` with a `{ brand, domain, issues }` payload so
// the caller can surface a build error.
//
// S2: no back-imports onto DB / API layers. The schemas themselves
// (website/src/content-schema) are pure Zod; this module only reads JSON
// and runs validation.
import { ZodError } from 'zod';
import {
  ContentBundleSchema,
  DOMAINS,
  type Domain,
  type SchemaOf,
  type HomepageContent,
  type FaqItem,
  type KontaktContent,
  type UebermichContent,
  type HomepageService,
  type LeistungCategory,
  type Stammdaten,
  type NavItem,
  type FooterConfig,
  type KoreFlags,
  type ReferenzenConfig,
  type SeoContent,
  type HomepageBlocksContent,
} from '../content-schema';

export class BundleValidationError extends Error {
  readonly brand: string;
  readonly domain: string;
  readonly issues: string[];
  constructor(brand: string, domain: string, issues: string[], message?: string) {
    super(message ?? `content bundle validation failed for ${brand}/${domain}: ${issues.join('; ')}`);
    this.name = 'BundleValidationError';
    this.brand = brand;
    this.domain = domain;
    this.issues = issues;
  }
}

const RAW_BUNDLES = import.meta.glob<unknown>('/content/**/*.json', { eager: true });

interface BundleState {
  /** Parsed + validated content, keyed by `brand/domain`. */
  data: Map<string, Map<Domain, unknown>>;
}

const state: BundleState = (() => {
  const data = new Map<string, Map<Domain, unknown>>();
  for (const [path, raw] of Object.entries(RAW_BUNDLES)) {
    // path looks like '/content/mentolder/homepage.json'
    const match = path.match(/^\/content\/([^/]+)\/([^/]+)\.json$/);
    if (!match) continue;
    const brand = match[1];
    const domain = match[2] as Domain;
    if (!ContentBundleSchema[domain]) continue;
    if (!data.has(brand)) data.set(brand, new Map());
    data.get(brand)!.set(domain, raw);
  }
  return { data };
})();

function parseDomain<D extends Domain>(brand: string, domain: D): SchemaOf<D> {
  const brandMap = state.data.get(brand);
  const raw = brandMap?.get(domain);
  if (raw === undefined) {
    throw new BundleValidationError(
      brand,
      domain,
      [`missing file website/content/${brand}/${domain}.json`],
    );
  }
  const schema = ContentBundleSchema[domain];
  const result = schema.safeParse(raw);
  if (!result.success) {
    const issues = (result.error as ZodError).issues.map(
      (i) => `${i.path.join('.') || '(root)'}: ${i.message}`,
    );
    throw new BundleValidationError(brand, domain, issues);
  }
  return result.data as SchemaOf<D>;
}

/** Synchronously load + validate one content domain for a brand. */
export function loadDomain<D extends Domain>(brand: string, domain: D): SchemaOf<D> {
  return parseDomain(brand, domain);
}

/** Validate every brand×domain that has a JSON file. Throws on the first failure. */
export function validateAllBundles(): { validated: number } {
  let validated = 0;
  for (const [brand, brandMap] of state.data) {
    for (const domain of brandMap.keys()) {
      parseDomain(brand, domain);
      validated++;
    }
  }
  return { validated };
}

// ── Thin typed getters (one per content domain) ────────────────────────────
export const bundleHomepage        = (brand: string) => loadDomain(brand, 'homepage') as HomepageContent;
export const bundleHomepageBlocks  = (brand: string) => loadDomain(brand, 'homepage-blocks') as HomepageBlocksContent;
export const bundleSeo             = (brand: string) => loadDomain(brand, 'seo') as SeoContent;
export const bundleFaq             = (brand: string) => loadDomain(brand, 'faq') as FaqItem[];
export const bundleKontakt         = (brand: string) => loadDomain(brand, 'kontakt') as KontaktContent;
export const bundleUebermich       = (brand: string) => loadDomain(brand, 'ueber-mich') as UebermichContent;
export const bundleServices        = (brand: string) => loadDomain(brand, 'services') as HomepageService[];
export const bundleLeistungen      = (brand: string) => loadDomain(brand, 'leistungen') as LeistungCategory[];
export const bundleStammdaten      = (brand: string) => loadDomain(brand, 'stammdaten') as Stammdaten;
export const bundleNavigation      = (brand: string) => loadDomain(brand, 'navigation') as NavItem[];
export const bundleFooter          = (brand: string) => loadDomain(brand, 'footer') as FooterConfig;
export const bundleReferenzen      = (brand: string) => loadDomain(brand, 'referenzen') as ReferenzenConfig;
export const bundleKoreFlags       = (brand: string) => loadDomain(brand, 'kore-flags') as KoreFlags;

/** List every brand that has at least one content file. */
export function listBundleBrands(): string[] {
  return [...state.data.keys()].sort();
}

/** List every domain present for a brand. */
export function listBundleDomains(brand: string): Domain[] {
  const brandMap = state.data.get(brand);
  if (!brandMap) return [];
  return [...brandMap.keys()].sort((a, b) => a.localeCompare(b)) as Domain[];
}

/** True when both brand and domain are present in the bundle. */
export function hasDomain(brand: string, domain: Domain): boolean {
  return state.data.get(brand)?.has(domain) ?? false;
}

/** Re-exported for callers that want to iterate over the canonical set. */
export { DOMAINS };
