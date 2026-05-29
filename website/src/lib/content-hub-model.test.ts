import { describe, it, expect } from 'vitest';
import type { ServiceOverride } from './website-db';

describe('ServiceOverride catalog link', () => {
  it('accepts a catalog-linked card with a headline key', () => {
    const card: ServiceOverride = {
      slug: 'digital-50plus',
      title: '50+ Digital',
      description: 'd',
      icon: '💻',
      features: [],
      leistungCategoryId: 'digital-50plus',
      headlineKey: '50plus-digital-einzel',
      headlinePrefix: true,
    };
    expect(card.leistungCategoryId).toBe('digital-50plus');
    expect(card.headlinePrefix).toBe(true);
  });
});
