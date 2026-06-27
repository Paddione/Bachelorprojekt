import { describe, it, expect } from 'vitest';
import { SRGB_ICC } from './srgb-icc';

describe('SRGB_ICC', () => {
  it('is exported as a Uint8Array', () => {
    expect(SRGB_ICC).toBeInstanceOf(Uint8Array);
  });

  it('has a non-trivial size (sRGB ICC profile is a few hundred bytes)', () => {
    expect(SRGB_ICC.length).toBeGreaterThan(100);
    expect(SRGB_ICC.length).toBeLessThan(10_000);
  });

  it('is non-empty and the data round-trips through Buffer', () => {
    expect(SRGB_ICC.length).toBeGreaterThan(100);
    const buf = Buffer.from(SRGB_ICC);
    expect(buf.length).toBe(SRGB_ICC.length);
  });

  it('contains the standard Apple/APPL "acsp" profile signature', () => {
    const text = new TextDecoder('latin1').decode(SRGB_ICC.subarray(36, 80));
    expect(text).toContain('acsp');
  });

  it('has identical exports on repeated import (constant module behavior)', async () => {
    const mod1 = await import('./srgb-icc');
    const mod2 = await import('./srgb-icc');
    expect(mod1.SRGB_ICC.length).toBe(mod2.SRGB_ICC.length);
  });
});
