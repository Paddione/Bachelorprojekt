import { describe, it, expect } from 'vitest';
import { loadDomain, BundleValidationError } from '../content-bundle';

describe('content-bundle', () => {
  it('loads a valid seeded domain synchronously', () => {
    const hp = loadDomain('mentolder', 'homepage');
    expect(hp.hero.title).toBeTypeOf('string');
  });

  it('throws BundleValidationError naming brand+domain on a missing file', () => {
    expect(() => loadDomain('nonexistent-brand', 'homepage')).toThrow(BundleValidationError);
  });
});
