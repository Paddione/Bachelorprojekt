import { describe, it, expect } from 'vitest';
import { deriveHeadlinePrice, detailTiers, resolveHighlightTable, resolveStammdaten } from './content-projection';
import type { LeistungCategoryOverride } from './website-db';

const cat: LeistungCategoryOverride = {
  id: 'digital-50plus', title: '50+ Digital',
  services: [
    { key: '50plus-digital-einzel', name: 'Einzelstunde', price: '60 €', unit: '/ Stunde' },
    { key: '50plus-digital-paket-s', name: 'Paket S', price: '330 €', unit: '', highlight: true },
  ],
};

describe('deriveHeadlinePrice', () => {
  it('renders the chosen row price with unit', () => {
    expect(deriveHeadlinePrice(cat, '50plus-digital-einzel', false)).toBe('60 € / Stunde');
  });
  it('prefixes "ab " when headlinePrefix is true', () => {
    expect(deriveHeadlinePrice(cat, '50plus-digital-einzel', true)).toBe('ab 60 € / Stunde');
  });
  it('renders free-text rows verbatim without prefix even if requested', () => {
    const c2: LeistungCategoryOverride = { id: 'beratung', services: [{ key: 'b', price: 'nach Vereinbarung', unit: '' }] };
    expect(deriveHeadlinePrice(c2, 'b', true)).toBe('nach Vereinbarung');
  });
  it('falls back to the first row when headlineKey is missing', () => {
    expect(deriveHeadlinePrice(cat, undefined, false)).toBe('60 € / Stunde');
  });
  it('returns empty string when category has no rows', () => {
    expect(deriveHeadlinePrice({ id: 'x', services: [] }, 'k', true)).toBe('');
  });
});

describe('detailTiers', () => {
  it('returns all rows of the linked category as {label, price, unit, highlight}', () => {
    expect(detailTiers(cat)).toEqual([
      { label: 'Einzelstunde', price: '60 €', unit: '/ Stunde', highlight: false },
      { label: 'Paket S', price: '330 €', unit: '', highlight: true },
    ]);
  });
  it('returns [] for a missing category', () => {
    expect(detailTiers(undefined)).toEqual([]);
  });
});

describe('resolveHighlightTable', () => {
  const cats = [cat];
  it('resolves a catalog-key reference to label+price, keeping the local note', () => {
    expect(resolveHighlightTable([{ catalogKey: '50plus-digital-einzel', note: 'Netto §19' }], cats))
      .toEqual([{ label: 'Einzelstunde', price: '60 €', unit: '/ Stunde', note: 'Netto §19', highlight: false }]);
  });
  it('passes literal rows through unchanged', () => {
    expect(resolveHighlightTable([{ label: 'Erstgespräch', price: 'Kostenlos', note: 'Unverbindlich' }], cats))
      .toEqual([{ label: 'Erstgespräch', price: 'Kostenlos', unit: '', note: 'Unverbindlich', highlight: false }]);
  });
  it('drops references whose catalog key no longer exists', () => {
    expect(resolveHighlightTable([{ catalogKey: 'gone' }], cats)).toEqual([]);
  });
});

describe('resolveStammdaten', () => {
  const fallback = { name: 'Patrick', role: 'Coach', email: 'env@x.de', phone: '0', street: 's', zip: 'z', city: 'c', ustId: 'u', website: 'w', avatarInitials: 'PK' };
  it('returns the DB record when present', () => {
    const db = { ...fallback, email: 'db@x.de' };
    expect(resolveStammdaten(db, fallback).email).toBe('db@x.de');
  });
  it('fills missing DB fields from the static fallback', () => {
    const partial = { email: 'db@x.de' };
    const r = resolveStammdaten(partial, fallback);
    expect(r.email).toBe('db@x.de');
    expect(r.city).toBe('c');
  });
  it('returns the full fallback when DB row is null', () => {
    expect(resolveStammdaten(null, fallback)).toEqual(fallback);
  });
});
