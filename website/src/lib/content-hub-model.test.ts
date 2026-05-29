import { describe, it, expect } from 'vitest';
import type { ServiceOverride } from './website-db';
import { NAV_KEY, FOOTER_KEY, STAMMDATEN_KEY, KORE_FLAGS_KEY,
         type NavItem, type FooterConfig, type Stammdaten, type KoreFlags } from './website-db';

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

describe('content-hub site_settings keys', () => {
  it('exposes stable key constants', () => {
    expect([NAV_KEY, FOOTER_KEY, STAMMDATEN_KEY, KORE_FLAGS_KEY])
      .toEqual(['navigation', 'footer', 'stammdaten', 'kore_flags']);
  });
  it('types compile for each section', () => {
    const nav: NavItem[] = [{ label: 'Start', href: '/', order: 0 }];
    const footer: FooterConfig = { columns: [{ heading: 'Service', links: [{ label: 'X', href: '/x' }] }], copyright: '© mentolder' };
    const sd: Stammdaten = { name: 'PK', role: 'Coach', email: 'a@b.de', phone: '', street: '', zip: '', city: '', ustId: '', website: '', avatarInitials: 'PK' };
    const flags: KoreFlags = { timeline: true };
    expect(nav[0].href).toBe('/');
    expect(footer.copyright).toContain('mentolder');
    expect(sd.email).toBe('a@b.de');
    expect(flags.timeline).toBe(true);
  });
});

