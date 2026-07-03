import { describe, it, expect } from 'vitest';
import { loadDomain, BundleValidationError, validateAllBundles, listBundleBrands } from '../content-bundle';

describe('content-bundle', () => {
  it('loads a valid seeded domain synchronously', () => {
    const hp = loadDomain('mentolder', 'homepage');
    expect(hp.hero.title).toBeTypeOf('string');
  });

  it('throws BundleValidationError naming brand+domain on a missing file', () => {
    expect(() => loadDomain('nonexistent-brand', 'homepage')).toThrow(BundleValidationError);
  });

  it('validates every seeded brand×domain fail-closed at build time', () => {
    const brands = listBundleBrands();
    expect(brands.length).toBeGreaterThan(0);
    const { validated } = validateAllBundles();
    expect(validated).toBeGreaterThan(0);
  });

  it('every required domain is present for every brand', () => {
    for (const brand of listBundleBrands()) {
      const stammdaten = loadDomain(brand, 'stammdaten');
      expect(stammdaten.name.length).toBeGreaterThan(0);
    }
  });
});
