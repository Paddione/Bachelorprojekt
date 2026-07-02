// Zod schemas for the homepage, homepage-blocks, and SEO content domains.
// Pure module — no DB / API / website-db imports (S2 acyclic-website gate).
//
// `HomepageBlocksSchema` mirrors `mentolder-web/src/blocks/schema.ts` with
// `SCHEMA_VERSION = 1` as a fail-closed versionsgate; the two are kept in
// parity by hand (the SSOT is in mentolder-web/). `homepage-blocks-schema.ts`
// already holds the server-side copy that the React app POSTs against; this
// is the same shape re-exported for the bundle loader and seed.
import { z } from 'zod';

// ── Homepage content ────────────────────────────────────────────────────────
export interface HomepageHero {
  title: string;
  subtitle: string;
  tagline: string;
  titleEmphasis?: string;
}
export interface HomepageStat { value: string; label: string }
export interface HomepageWhyMePoint { title: string; text: string; iconPath?: string }
export interface HomepageProcessStep { num: string; heading: string; description: string }
export interface HomepageContent {
  hero: HomepageHero;
  stats: HomepageStat[];
  servicesHeadline: string;
  servicesSubheadline: string;
  whyMeHeadline: string;
  whyMeIntro: string;
  whyMePoints: HomepageWhyMePoint[];
  avatarType?: 'image' | 'initials';
  avatarSrc?: string;
  avatarInitials?: string;
  quote: string;
  quoteName: string;
  processSteps?: HomepageProcessStep[];
  processEyebrow?: string;
  processHeadline?: string;
}

const heroSchema = z.object({
  title: z.string(),
  subtitle: z.string(),
  tagline: z.string(),
  titleEmphasis: z.string().optional(),
}) satisfies z.ZodType<HomepageHero>;

const statItemSchema = z.object({
  value: z.string(),
  label: z.string(),
}) satisfies z.ZodType<HomepageStat>;

const whyMePointSchema = z.object({
  title: z.string(),
  text: z.string(),
  iconPath: z.string().optional(),
}) satisfies z.ZodType<HomepageWhyMePoint>;

const processStepSchema = z.object({
  num: z.string(),
  heading: z.string(),
  description: z.string(),
}) satisfies z.ZodType<HomepageProcessStep>;

export const HomepageSchema = z.object({
  hero: heroSchema,
  stats: z.array(statItemSchema),
  servicesHeadline: z.string(),
  servicesSubheadline: z.string(),
  whyMeHeadline: z.string(),
  whyMeIntro: z.string(),
  whyMePoints: z.array(whyMePointSchema),
  avatarType: z.enum(['image', 'initials']).optional(),
  avatarSrc: z.string().optional(),
  avatarInitials: z.string().optional(),
  quote: z.string(),
  quoteName: z.string(),
  processSteps: z.array(processStepSchema).optional(),
  processEyebrow: z.string().optional(),
  processHeadline: z.string().optional(),
}) satisfies z.ZodType<HomepageContent>;

// ── SEO per-page overrides ──────────────────────────────────────────────────
// Maps pageKey -> override. Empty map is valid (falls back to defaults).
export const SeoPageKeySchema = z.enum([
  'home', 'leistungen', 'kontakt', 'faq', 'ueber-mich', 'referenzen',
  'impressum', 'datenschutz',
]);
export type SeoPageKey = z.infer<typeof SeoPageKeySchema>;

export const SeoSchema = z.object({
  titles: z.record(z.string(), z.string()),
  descriptions: z.record(z.string(), z.string()),
  ogImages: z.record(z.string(), z.string()),
});
export type SeoContent = z.infer<typeof SeoSchema>;

// ── Homepage blocks (React SPA document; mirrors mentolder-web) ────────────
export const SCHEMA_VERSION = 1;
const iconNameEnum = z.enum([
  'fuehrung', 'digitalisierung', 'team', 'strategie', 'kommunikation', 'resilienz',
]);
const heroProps = z.object({
  title: z.string(), titleEmphasis: z.string(), subtitle: z.string(), tagline: z.string(),
  avatarType: z.enum(['initials', 'image']),
  avatarInitials: z.string().optional(), avatarSrc: z.string().optional(),
  personName: z.string(), personRole: z.string(),
});
const statsItem = z.object({ value: z.string(), target: z.number().optional(), label: z.string() });
const statsProps = z.object({ items: z.array(statsItem) });
const servicesItem = z.object({
  id: z.string(), title: z.string(), description: z.string(),
  features: z.array(z.string()), price: z.string(), priceUnit: z.string().optional(),
  meta: z.string().optional(), href: z.string(), icon: iconNameEnum,
});
const servicesProps = z.object({
  headline: z.string(), subheadline: z.string(), items: z.array(servicesItem),
});
const whyMePoint = z.object({ title: z.string(), text: z.string() });
const whyMeProps = z.object({
  headline: z.string(),
  intro: z.object({ prefix: z.string(), emphasis: z.string(), suffix: z.string() }),
  points: z.array(whyMePoint), quote: z.string(), quoteName: z.string(), quoteRole: z.string(),
});
const processStep = z.object({ num: z.string(), title: z.string(), text: z.string() });
const processProps = z.object({
  eyebrow: z.string(), headline: z.string(), steps: z.array(processStep),
});
const faqItem = z.object({ question: z.string(), answer: z.string() });
const faqProps = z.object({ title: z.string(), items: z.array(faqItem) });
const ctaProps = z.object({
  eyebrow: z.string(), title: z.string(), titleEmphasis: z.string(),
  subtitle: z.string(),
  primaryText: z.string(), primaryHref: z.string(),
  secondaryText: z.string(), secondaryHref: z.string(),
});
const richTextProps = z.object({ html: z.string() });
const imageProps = z.object({ src: z.string(), alt: z.string() });
const spacerProps = z.object({ size: z.number() });

const heroBlock = z.object({ id: z.string(), type: z.literal('hero'), props: heroProps });
const statsBlock = z.object({ id: z.string(), type: z.literal('stats'), props: statsProps });
const servicesBlock = z.object({ id: z.string(), type: z.literal('services'), props: servicesProps });
const whyMeBlock = z.object({ id: z.string(), type: z.literal('whyMe'), props: whyMeProps });
const processBlock = z.object({ id: z.string(), type: z.literal('process'), props: processProps });
const faqBlock = z.object({ id: z.string(), type: z.literal('faq'), props: faqProps });
const ctaBlock = z.object({ id: z.string(), type: z.literal('cta'), props: ctaProps });
const richTextBlock = z.object({ id: z.string(), type: z.literal('richText'), props: richTextProps });
const imageBlock = z.object({ id: z.string(), type: z.literal('image'), props: imageProps });
const spacerBlock = z.object({ id: z.string(), type: z.literal('spacer'), props: spacerProps });

const BlockSchema = z.discriminatedUnion('type', [
  heroBlock, statsBlock, servicesBlock, whyMeBlock, processBlock,
  faqBlock, ctaBlock, richTextBlock, imageBlock, spacerBlock,
]);

export const HomepageBlocksSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  blocks: z.array(BlockSchema),
});

export type HomepageBlocksContent = z.infer<typeof HomepageBlocksSchema>;
export type BlockContent = z.infer<typeof BlockSchema>;
