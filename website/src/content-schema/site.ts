// Zod schemas for the site-wide content domains: stammdaten, navigation,
// footer, kore-flags.
// Pure module — no DB / API / website-db imports (S2 acyclic-website gate).
import { z } from 'zod';

export interface Stammdaten {
  name: string;
  role: string;
  email: string;
  phone: string;
  street: string;
  zip: string;
  city: string;
  ustId: string;
  website: string;
  avatarInitials: string;
}
export const StammdatenSchema = z.object({
  name: z.string(),
  role: z.string(),
  email: z.string(),
  phone: z.string(),
  street: z.string(),
  zip: z.string(),
  city: z.string(),
  ustId: z.string(),
  website: z.string(),
  avatarInitials: z.string(),
}) satisfies z.ZodType<Stammdaten>;

export interface NavItem { label: string; href: string; order: number }
export const NavItemSchema = z.object({
  label: z.string(),
  href: z.string(),
  order: z.number().int(),
}) satisfies z.ZodType<NavItem>;
export const NavigationSchema = z.array(NavItemSchema) satisfies z.ZodType<NavItem[]>;

export interface FooterLink { label: string; href: string }
export interface FooterColumn { heading: string; links: FooterLink[] }
export interface FooterConfig { columns: FooterColumn[]; copyright: string }
export const FooterConfigSchema = z.object({
  columns: z.array(z.object({
    heading: z.string(),
    links: z.array(z.object({ label: z.string(), href: z.string() })),
  })),
  copyright: z.string(),
}) satisfies z.ZodType<FooterConfig>;

export interface KoreFlags { timeline: boolean }
export const KoreFlagsSchema = z.object({
  timeline: z.boolean(),
}) satisfies z.ZodType<KoreFlags>;
