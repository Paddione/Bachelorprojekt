// Zod schemas for the page-specific content domains: faq, kontakt, ueber-mich,
// leistungen, services, referenzen.
// Pure module — no DB / API / website-db imports (S2 acyclic-website gate).
import { z } from 'zod';

export interface FaqItem { question: string; answer: string }
export const FaqSchema = z.array(z.object({ question: z.string(), answer: z.string() }))
  .min(0) satisfies z.ZodType<FaqItem[]>;

export interface KontaktContent {
  intro: string;
  sidebarTitle: string;
  sidebarText: string;
  sidebarCta: string;
  showPhone: boolean;
  showSteps?: boolean;
  footerEmail?: string;
  footerPhone?: string;
  footerCity?: string;
  footerTagline?: string;
}
export const KontaktSchema = z.object({
  intro: z.string(),
  sidebarTitle: z.string(),
  sidebarText: z.string(),
  sidebarCta: z.string(),
  showPhone: z.boolean(),
  showSteps: z.boolean().optional(),
  footerEmail: z.string().optional(),
  footerPhone: z.string().optional(),
  footerCity: z.string().optional(),
  footerTagline: z.string().optional(),
}) satisfies z.ZodType<KontaktContent>;

export interface UebermichSection { title: string; content: string }
export interface UebermichMilestone { year: string; title: string; desc: string }
export interface UebermichNotDoing { title: string; text: string }
export interface UebermichContent {
  pageHeadline: string;
  subheadline: string;
  introParagraphs: string[];
  sections: UebermichSection[];
  milestones: UebermichMilestone[];
  notDoing: UebermichNotDoing[];
  privateText: string;
  warumdieserName?: { title: string; text: string };
}
export const UebermichSchema = z.object({
  pageHeadline: z.string(),
  subheadline: z.string(),
  introParagraphs: z.array(z.string()),
  sections: z.array(z.object({ title: z.string(), content: z.string() })),
  milestones: z.array(z.object({ year: z.string(), title: z.string(), desc: z.string() })),
  notDoing: z.array(z.object({ title: z.string(), text: z.string() })),
  privateText: z.string(),
  warumdieserName: z.object({ title: z.string(), text: z.string() }).optional(),
}) satisfies z.ZodType<UebermichContent>;

// ── Services (homepage cards) ──────────────────────────────────────────────
export interface ServicePagePricing { label: string; price: string; unit?: string; highlight?: boolean }
export interface ServicePageSection { title: string; items: string[] }
export interface ServicePageContent {
  headline: string;
  intro: string;
  forWhom: string[];
  sections: ServicePageSection[];
  pricing: ServicePagePricing[];
  faq?: FaqItem[];
  faqTitle?: string;
  seoTitle?: string;
  seoDescription?: string;
}
export interface HomepageService {
  slug: string;
  title: string;
  description: string;
  icon: string;
  iconSpriteId?: string;
  features: string[];
  price: string;
  stripeServiceKey?: string;
  pageContent: ServicePageContent;
}
export const ServiceSchema = z.object({
  slug: z.string(),
  title: z.string(),
  description: z.string(),
  icon: z.string(),
  iconSpriteId: z.string().optional(),
  features: z.array(z.string()),
  price: z.string(),
  stripeServiceKey: z.string().optional(),
  pageContent: z.object({
    headline: z.string(),
    intro: z.string(),
    forWhom: z.array(z.string()),
    sections: z.array(z.object({ title: z.string(), items: z.array(z.string()) })),
    pricing: z.array(z.object({
      label: z.string(), price: z.string(),
      unit: z.string().optional(), highlight: z.boolean().optional(),
    })),
    faq: z.array(z.object({ question: z.string(), answer: z.string() })).optional(),
    faqTitle: z.string().optional(),
    seoTitle: z.string().optional(),
    seoDescription: z.string().optional(),
  }),
}) satisfies z.ZodType<HomepageService>;

export const ServicesSchema = z.array(ServiceSchema) satisfies z.ZodType<HomepageService[]>;

// ── Leistungen (pricing catalog) ───────────────────────────────────────────
export interface LeistungServiceRow {
  key: string; name: string; price: string; unit: string; desc: string;
  highlight?: boolean; stundensatz_cents?: number; durationMin?: number;
}
export interface LeistungCategory {
  id: string; title: string; icon: string; description?: string;
  services: LeistungServiceRow[];
}
export const LeistungCategorySchema = z.object({
  id: z.string(),
  title: z.string(),
  icon: z.string(),
  description: z.string().optional(),
  services: z.array(z.object({
    key: z.string(), name: z.string(), price: z.string(), unit: z.string(), desc: z.string(),
    highlight: z.boolean().optional(), stundensatz_cents: z.number().optional(),
    durationMin: z.number().optional(),
  })),
}) satisfies z.ZodType<LeistungCategory>;

export const LeistungenSchema = z.array(LeistungCategorySchema) satisfies z.ZodType<LeistungCategory[]>;

// ── Highlight table ────────────────────────────────────────────────────────
export interface HighlightEntryResolved {
  label: string; price: string; unit: string; note: string; highlight: boolean;
}
export const HighlightEntrySchema = z.union([
  z.object({
    catalogKey: z.string(), note: z.string().optional(), highlight: z.boolean().optional(),
  }),
  z.object({
    label: z.string(), price: z.string(),
    note: z.string().optional(), highlight: z.boolean().optional(),
  }),
]);
export const HighlightTableSchema = z.array(HighlightEntrySchema);

// ── Referenzen ─────────────────────────────────────────────────────────────
export interface ReferenzItem {
  id: string; name: string; url?: string; logoUrl?: string;
  description?: string; type?: string;
}
export interface ReferenzenType { id: string; label: string }
export interface ReferenzenConfig {
  heading?: string; subheading?: string; types: ReferenzenType[]; items: ReferenzItem[];
}
export const ReferenzenConfigSchema = z.object({
  heading: z.string().optional(),
  subheading: z.string().optional(),
  types: z.array(z.object({ id: z.string(), label: z.string() })),
  items: z.array(z.object({
    id: z.string(), name: z.string(),
    url: z.string().optional(), logoUrl: z.string().optional(),
    description: z.string().optional(), type: z.string().optional(),
  })),
}) satisfies z.ZodType<ReferenzenConfig>;
