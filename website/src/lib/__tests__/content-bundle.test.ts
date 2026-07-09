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

  it('mentolder hero avatar is Gerald\'s real photo, not the placeholder illustration [T001561]', () => {
    // Regression guard: fb4826963 silently reverted this to the SVG
    // placeholder by re-running the one-shot DB export against a DB
    // that lacked the T001561 admin override. The content bundle is
    // now the git-tracked SSOT for this field — pin the value so any
    // future re-export (or manual edit) that loses it fails CI.
    const hp = loadDomain('mentolder', 'homepage');
    expect(hp.avatarSrc).toBe('/gerald.jpg');
  });
});
