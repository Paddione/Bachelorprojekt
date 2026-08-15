import type { FieldSchema, FieldError } from './schema-types';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isUrl(v: string): boolean {
  try {
    new URL(v);
    return true;
  } catch {
    return false;
  }
}

export function validateAgainst(fields: FieldSchema[], value: Record<string, unknown>): FieldError[] {
  const errs: FieldError[] = [];

  for (const f of fields) {
    const v = value?.[f.key];
    const val = f.validation;

    if (!val) continue;

    const empty = v == null || v === '';

    // Check required
    if (val.required && empty) {
      errs.push({ field: f.key, message: `${f.label} ist erforderlich` });
      continue;
    }

    // Skip further validation if empty and not required
    if (empty) continue;

    // Email validation
    if (val.email && !EMAIL.test(String(v))) {
      errs.push({ field: f.key, message: `${f.label}: ungültige E-Mail` });
    }

    // URL validation
    if (val.url && !isUrl(String(v))) {
      errs.push({ field: f.key, message: `${f.label}: ungültige URL` });
    }

    // Min length validation
    if (val.min != null && String(v).length < val.min) {
      errs.push({ field: f.key, message: `${f.label}: zu kurz` });
    }

    // Max length validation
    if (val.max != null && String(v).length > val.max) {
      errs.push({ field: f.key, message: `${f.label}: zu lang` });
    }
  }

  return errs;
}
