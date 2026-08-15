import type { LeistungCategory, LeistungServiceRow, Stammdaten } from '../content-schema';

/** True for prices that are not a concrete amount (e.g. "nach Vereinbarung"). */
function isFreeText(price: string): boolean {
  return !/\d/.test(price);
}

function pickRow(cat: LeistungCategory, headlineKey?: string): LeistungServiceRow | undefined {
  const rows = cat.services ?? [];
  if (!rows.length) return undefined;
  return rows.find((r) => r.key === headlineKey) ?? rows[0];
}

/** The single price string shown on a homepage service card. */
export function deriveHeadlinePrice(
  cat: LeistungCategory,
  headlineKey: string | undefined,
  headlinePrefix: boolean,
): string {
  const row = pickRow(cat, headlineKey);
  if (!row || !row.price) return '';
  const base = row.unit ? `${row.price} ${row.unit}`.replace(/\s+/g, ' ').trim() : row.price;
  if (headlinePrefix && !isFreeText(row.price)) return `ab ${base}`;
  return base;
}

export interface Tier { label: string; price: string; unit: string; highlight: boolean }

export function detailTiers(cat: LeistungCategory | undefined): Tier[] {
  return (cat?.services ?? []).map((r) => ({
    label: r.name ?? '', price: r.price ?? '', unit: r.unit ?? '', highlight: r.highlight ?? false,
  }));
}

export type HighlightEntry =
  | { catalogKey: string; note?: string; highlight?: boolean }
  | { label: string; price: string; note?: string; highlight?: boolean };

export interface ResolvedHighlight { label: string; price: string; unit: string; note: string; highlight: boolean }

export function resolveHighlightTable(
  entries: HighlightEntry[],
  categories: LeistungCategory[],
): ResolvedHighlight[] {
  const out: ResolvedHighlight[] = [];
  for (const e of entries ?? []) {
    if ('catalogKey' in e) {
      const row = categories.flatMap((c) => c.services ?? []).find((r) => r.key === e.catalogKey);
      if (!row) continue; // reference to a deleted row → drop
      out.push({ label: row.name ?? '', price: row.price ?? '', unit: row.unit ?? '', note: e.note ?? '', highlight: e.highlight ?? false });
    } else {
      out.push({ label: e.label, price: e.price, unit: '', note: e.note ?? '', highlight: e.highlight ?? false });
    }
  }
  return out;
}

export function resolveStammdaten(db: Partial<Stammdaten> | null, fallback: Stammdaten): Stammdaten {
  if (!db) return fallback;
  return {
    name: db.name ?? fallback.name,
    role: db.role ?? fallback.role,
    email: db.email ?? fallback.email,
    phone: db.phone ?? fallback.phone,
    street: db.street ?? fallback.street,
    zip: db.zip ?? fallback.zip,
    city: db.city ?? fallback.city,
    ustId: db.ustId ?? fallback.ustId,
    website: db.website ?? fallback.website,
    avatarInitials: db.avatarInitials ?? fallback.avatarInitials,
  };
}
