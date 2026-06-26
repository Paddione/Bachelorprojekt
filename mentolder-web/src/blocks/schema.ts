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

const heroBlock = z.object({
  id: z.string(),
  type: z.literal('hero'),
  props: heroProps,
});

const statsBlock = z.object({
  id: z.string(),
  type: z.literal('stats'),
  props: statsProps,
});

const servicesBlock = z.object({
  id: z.string(),
  type: z.literal('services'),
  props: servicesProps,
});

const whyMeBlock = z.object({
  id: z.string(),
  type: z.literal('whyMe'),
  props: whyMeProps,
});

const processBlock = z.object({
  id: z.string(),
  type: z.literal('process'),
  props: processProps,
});

const faqBlock = z.object({
  id: z.string(),
  type: z.literal('faq'),
  props: faqProps,
});

const ctaBlock = z.object({
  id: z.string(),
  type: z.literal('cta'),
  props: ctaProps,
});

const richTextBlock = z.object({
  id: z.string(),
  type: z.literal('richText'),
  props: richTextProps,
});

const imageBlock = z.object({
  id: z.string(),
  type: z.literal('image'),
  props: imageProps,
});

const spacerBlock = z.object({
  id: z.string(),
  type: z.literal('spacer'),
  props: spacerProps,
});

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
export type HeroProps = z.infer<typeof heroProps>;
export type StatsProps = z.infer<typeof statsProps>;
export type ServicesProps = z.infer<typeof servicesProps>;
export type WhyMeProps = z.infer<typeof whyMeProps>;
export type ProcessProps = z.infer<typeof processProps>;
export type FaqProps = z.infer<typeof faqProps>;
export type CtaProps = z.infer<typeof ctaProps>;
