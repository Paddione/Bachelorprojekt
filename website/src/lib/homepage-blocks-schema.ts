// Server-side copy of the React homepage block schema.
//
// SOURCE OF TRUTH for the *editor UI* is mentolder-web/src/blocks/schema.ts
// (zod v3). This file is the SERVER-SIDE validation gate (zod v4) that the
// React app POSTs against — it is the authority for what gets persisted.
// The two copies are intentionally kept in parity by hand (a shared package
// is YAGNI for one consumer pair); homepage-blocks-schema.test.ts asserts the
// block-type literals stay in lock-step with the canonical set.
//
// Keep this file dependency-light (zod only) so it is safe to import from API
// routes and the block store without pulling in Astro/runtime concerns.
import { z } from 'zod';

export const SCHEMA_VERSION = 1;

const iconNameEnum = z.enum([
  'fuehrung',
  'digitalisierung',
  'team',
  'strategie',
  'kommunikation',
  'resilienz',
]);

const heroProps = z.object({
  title: z.string(),
  titleEmphasis: z.string(),
  subtitle: z.string(),
  tagline: z.string(),
  avatarType: z.enum(['initials', 'image']),
  avatarInitials: z.string().optional(),
  avatarSrc: z.string().optional(),
  personName: z.string(),
  personRole: z.string(),
});

const statsItem = z.object({
  value: z.string(),
  target: z.number().optional(),
  label: z.string(),
});

const statsProps = z.object({
  items: z.array(statsItem),
});

const servicesItem = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  features: z.array(z.string()),
  price: z.string(),
  priceUnit: z.string().optional(),
  meta: z.string().optional(),
  href: z.string(),
  icon: iconNameEnum,
});

const servicesProps = z.object({
  headline: z.string(),
  subheadline: z.string(),
  items: z.array(servicesItem),
});

const whyMePoint = z.object({
  title: z.string(),
  text: z.string(),
});

const whyMeProps = z.object({
  headline: z.string(),
  intro: z.object({
    prefix: z.string(),
    emphasis: z.string(),
    suffix: z.string(),
  }),
  points: z.array(whyMePoint),
  quote: z.string(),
  quoteName: z.string(),
  quoteRole: z.string(),
});

const processStep = z.object({
  num: z.string(),
  title: z.string(),
  text: z.string(),
});

const processProps = z.object({
  eyebrow: z.string(),
  headline: z.string(),
  steps: z.array(processStep),
});

const faqItem = z.object({
  question: z.string(),
  answer: z.string(),
});

const faqProps = z.object({
  title: z.string(),
  items: z.array(faqItem),
});

const ctaProps = z.object({
  eyebrow: z.string(),
  title: z.string(),
  titleEmphasis: z.string(),
  subtitle: z.string(),
  primaryText: z.string(),
  primaryHref: z.string(),
  secondaryText: z.string(),
  secondaryHref: z.string(),
});

const richTextProps = z.object({
  html: z.string(),
});

const imageProps = z.object({
  src: z.string(),
  alt: z.string(),
});

const spacerProps = z.object({
  size: z.number(),
});

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

export const Block = z.discriminatedUnion('type', [
  heroBlock,
  statsBlock,
  servicesBlock,
  whyMeBlock,
  processBlock,
  faqBlock,
  ctaBlock,
  richTextBlock,
  imageBlock,
  spacerBlock,
]);

export const HomepageBlocksDocument = z.object({
  schemaVersion: z.number(),
  blocks: z.array(Block),
});

export type HomepageBlocksDocumentType = z.infer<typeof HomepageBlocksDocument>;
export type BlockType = z.infer<typeof Block>;

/** Canonical block-type literals — see homepage-blocks-schema.test.ts. */
export const BLOCK_TYPES = [
  'hero',
  'stats',
  'services',
  'whyMe',
  'process',
  'faq',
  'cta',
  'richText',
  'image',
  'spacer',
] as const;

export interface HomepageFieldError {
  path: string;
  message: string;
}

export type ValidateResult =
  | { ok: true; document: HomepageBlocksDocumentType }
  | { ok: false; errors: HomepageFieldError[] };

/**
 * Server-side validation gate for a posted homepage block document.
 * Returns the parsed document on success or a flat list of field errors
 * (`{ path, message }`) on failure — shaped for the API's 422 response body.
 */
export function validateHomepageDocument(payload: unknown): ValidateResult {
  const result = HomepageBlocksDocument.safeParse(payload);
  if (result.success) return { ok: true, document: result.data };
  const errors: HomepageFieldError[] = result.error.issues.map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
  }));
  return { ok: false, errors };
}
