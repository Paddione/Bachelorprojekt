import { describe, it, expect } from 'vitest';
import { CONTENT_REGISTRY, refFor, publicRouteFor } from './content-registry';

describe('CONTENT_REGISTRY / refFor / publicRouteFor', () => {
  it('exposes the four content types', () => {
    const types = new Set(CONTENT_REGISTRY.map((r) => r.contentType));
    expect(types).toEqual(new Set(['site_setting', 'legal_page', 'service', 'leistungen']));
  });

  it('contains a kontakt site_setting', () => {
    const r = refFor('kontakt');
    expect(r?.publicRoute).toBe('/kontakt');
    expect(r?.storeKey).toBe('kontakt');
  });

  it('returns undefined for unknown contentKeys', () => {
    expect(refFor('nope')).toBeUndefined();
  });

  it('exposes a publicRouteFor for legal pages', () => {
    expect(publicRouteFor('legal:impressum')).toBe('/impressum');
    expect(publicRouteFor('legal:datenschutz')).toBe('/datenschutz');
    expect(publicRouteFor('legal:agb')).toBe('/agb');
    expect(publicRouteFor('legal:barrierefreiheit')).toBe('/barrierefreiheit');
  });

  it('returns undefined for an unknown contentKey', () => {
    expect(publicRouteFor('nope')).toBeUndefined();
  });

  it('every registry entry has a non-empty storeKey and publicRoute', () => {
    for (const r of CONTENT_REGISTRY) {
      expect(r.contentKey.length).toBeGreaterThan(0);
      expect(r.storeKey.length).toBeGreaterThan(0);
      expect(r.publicRoute.startsWith('/')).toBe(true);
    }
  });
});
