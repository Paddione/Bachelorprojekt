import { describe, it, expect } from 'vitest';
import { linkCardsToCatalog, TITLE_TO_CATEGORY } from './content-hub-migrate';

const cats = [{ id: 'digital-50plus', title: '50+ Digital', services: [
  { key: '50plus-digital-einzel', name: 'Einzelstunde', price: '60 €', unit: '/Stunde' },
  { key: '50plus-digital-paket-s', name: 'Paket S', price: '330 €', unit: '', highlight: true }] }];

describe('linkCardsToCatalog', () => {
  it('links a card to its category, picks the highlight row, logs divergence, drops stored price', () => {
    const cards = [{ slug: 'digital-50plus', title: '50+ Digital', description: 'd', icon: '💻',
      features: [], price: 'Ab 99 € / Stunde', pageContent: { pricing: [{ label: 'x', price: '99 €' }] } }];
    const { migrated, divergences } = linkCardsToCatalog(cards, cats);
    expect(migrated[0].leistungCategoryId).toBe('digital-50plus');
    expect(migrated[0].headlineKey).toBe('50plus-digital-paket-s'); // highlight row preferred
    expect(migrated[0].headlinePrefix).toBe(true);                  // old price began with "Ab"
    expect(migrated[0].price).toBeUndefined();                      // stored price dropped
    expect(migrated[0].pageContent?.pricing).toBeUndefined();
    expect(divergences).toContainEqual({ slug: 'digital-50plus', old: 'Ab 99 € / Stunde', catalog: '330 €' });
  });

  it('is idempotent — re-running on already-linked cards changes nothing', () => {
    const linked = linkCardsToCatalog([{ slug: 'digital-50plus', title: '50+ Digital', description: 'd', icon: '💻',
      features: [], leistungCategoryId: 'digital-50plus', headlineKey: '50plus-digital-einzel', headlinePrefix: false }], cats);
    const again = linkCardsToCatalog(linked.migrated, cats);
    expect(again.migrated).toEqual(linked.migrated);
    expect(again.divergences).toEqual([]);
  });

  it('leaves cards untouched when no category mapping exists', () => {
    const cards = [{ slug: 'unbekannt', title: 'Unbekannt', description: 'd', icon: '?', features: [], price: '99 €' }];
    const { migrated, divergences } = linkCardsToCatalog(cards, cats);
    expect(migrated[0].leistungCategoryId).toBeUndefined();
    expect(migrated[0].price).toBe('99 €'); // price kept — nothing to map to
    expect(divergences).toHaveLength(0);
  });

  it('TITLE_TO_CATEGORY maps contain expected brand slugs', () => {
    expect(TITLE_TO_CATEGORY['digital-50plus']).toBe('digital-50plus');
    expect(TITLE_TO_CATEGORY['fuehrungskraefte']).toBe('fuehrungskraefte');
    expect(TITLE_TO_CATEGORY['beratung']).toBe('beratung');
  });
});
