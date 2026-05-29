import { describe, it, expect } from 'vitest';
import { deriveHeadlinePrice } from './content-projection';
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
