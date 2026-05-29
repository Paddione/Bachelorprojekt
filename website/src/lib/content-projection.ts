import type { LeistungCategoryOverride, LeistungServiceOverride } from './website-db';

/** True for prices that are not a concrete amount (e.g. "nach Vereinbarung"). */
function isFreeText(price: string): boolean {
  return !/\d/.test(price);
}

function pickRow(cat: LeistungCategoryOverride, headlineKey?: string): LeistungServiceOverride | undefined {
  const rows = cat.services ?? [];
  if (!rows.length) return undefined;
  return rows.find((r) => r.key === headlineKey) ?? rows[0];
}

/** The single price string shown on a homepage service card. */
export function deriveHeadlinePrice(
  cat: LeistungCategoryOverride,
  headlineKey: string | undefined,
  headlinePrefix: boolean,
): string {
  const row = pickRow(cat, headlineKey);
  if (!row || !row.price) return '';
  const base = row.unit ? `${row.price} ${row.unit}`.replace(/\s+/g, ' ').trim() : row.price;
  if (headlinePrefix && !isFreeText(row.price)) return `ab ${base}`;
  return base;
}
