import { kontaktSchema } from './kontakt';
import { stammdatenSchema } from './stammdaten';
import { seoSchema } from './seo';
import { serviceSchema } from './service';
import { uebermichSchema } from './uebermich';
import { faqSchema } from './faq';
import { referenzenSchema } from './referenzen';
import { legalSchemas } from './legal';
import { validateAgainst } from '../validate';
import type { SectionSchema, FieldError } from '../schema-types';

const REGISTRY: Record<string, SectionSchema> = {
  kontakt: kontaktSchema,
  stammdaten: stammdatenSchema,
  seo: seoSchema,
  uebermich: uebermichSchema,
  faq: faqSchema,
  referenzen: referenzenSchema,
  ...legalSchemas,
  'service:coaching': serviceSchema,
  'service:fuehrung-persoenlichkeit': serviceSchema,
  'service:50plus-digital': serviceSchema,
  'service:ki-transition': serviceSchema,
  'service:beratung': serviceSchema,
};

export function schemaFor(contentKey: string): SectionSchema | undefined {
  return REGISTRY[contentKey];
}

export function validateSection(contentKey: string, payload: Record<string, unknown>): FieldError[] {
  const s = schemaFor(contentKey);
  if (!s) return [];
  return validateAgainst(s.fields, payload);
}
