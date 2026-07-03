import type { HomepageService, LeistungCategory } from './content-schema';

/**
 * Explicit, non-fuzzy card-slug/title → catalog-category-id map.
 * Extend per brand as needed.
 */
export const TITLE_TO_CATEGORY: Record<string, string> = {
  'digital-50plus': 'digital-50plus',
  'fuehrungskraefte': 'fuehrungskraefte',
  'beratung': 'beratung',
};

export interface Divergence {
  slug: string;
  old: string;
  catalog: string;
}

function resolveCategoryId(card: HomepageService): string | undefined {
  return TITLE_TO_CATEGORY[card.slug] ?? TITLE_TO_CATEGORY[card.title];
}

/**
 * For each card that is not yet linked to a catalog category, attempt to
 * resolve its category from TITLE_TO_CATEGORY, pick the headline row
 * (highlight row preferred, else first), drop the legacy `price` and
 * `pageContent.pricing` fields, and log any price divergence.
 *
 * Cards that already have `leistungCategoryId` are returned unchanged
 * (idempotent).
 *
 * Cards with no matching category are also returned unchanged.
 */
export function linkCardsToCatalog(
  cards: HomepageService[],
  cats: LeistungCategory[],
): { migrated: HomepageService[]; divergences: Divergence[] } {
  const catById = new Map(cats.map((c) => [c.id, c]));
  const divergences: Divergence[] = [];

  const migrated = cards.map((card): HomepageService => {
    // Already linked → idempotent pass-through
    if (card.leistungCategoryId) return card;

    const catId = resolveCategoryId(card);
    const cat = catId ? catById.get(catId) : undefined;

    // No clean mapping → leave untouched
    if (!cat || !(cat.services ?? []).length) return card;

    const rows = cat.services!;
    const headline = rows.find((r) => r.highlight) ?? rows[0];

    const old = card.price ?? '';
    if (old && !old.includes(headline.price ?? '')) {
      divergences.push({ slug: card.slug, old, catalog: headline.price ?? '' });
    }

    // Strip legacy price fields
    const { price: _price, pageContent, ...rest } = card;
    void _price;
    const newPageContent = pageContent
      ? { ...pageContent, pricing: undefined }
      : undefined;

    return {
      ...rest,
      leistungCategoryId: cat.id,
      headlineKey: headline.key,
      headlinePrefix: /^ab\b/i.test(old),
      ...(newPageContent ? { pageContent: newPageContent } : {}),
    } as HomepageService;
  });

  return { migrated, divergences };
}
