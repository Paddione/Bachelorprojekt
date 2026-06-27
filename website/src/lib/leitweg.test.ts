import { describe, it, expect } from 'vitest';
import { formatLeitwegId, validateLeitwegId } from './leitweg';

describe('formatLeitwegId', () => {
  it('trims and uppercases the input', () => {
    expect(formatLeitwegId('  991-12345-67  ')).toBe('991-12345-67');
    expect(formatLeitwegId('991-aBcD-99')).toBe('991-ABCD-99');
  });
});

describe('validateLeitwegId', () => {
  it('rejects empty / null / undefined', () => {
    expect(validateLeitwegId(null)).toEqual({ ok: false, reason: 'leer' });
    expect(validateLeitwegId(undefined)).toEqual({ ok: false, reason: 'leer' });
    expect(validateLeitwegId('')).toEqual({ ok: false, reason: 'leer' });
  });

  it('rejects strings longer than 46 characters', () => {
    const tooLong = 'A'.repeat(47) + '-12';
    expect(validateLeitwegId(tooLong).ok).toBe(false);
    expect(validateLeitwegId(tooLong).reason).toContain('46');
  });

  it('accepts a standard 991-X-YY Leitweg-ID', () => {
    expect(validateLeitwegId('991-12345-67')).toEqual({ ok: true });
  });

  it('accepts IDs without a feinadressierung', () => {
    expect(validateLeitwegId('991-12')).toEqual({ ok: true });
  });

  it('rejects IDs with bad check digit format', () => {
    expect(validateLeitwegId('991-12345-AB').ok).toBe(false);
    expect(validateLeitwegId('991-12345-1').ok).toBe(false);
  });

  it('rejects grobadressierung with special characters', () => {
    expect(validateLeitwegId('99!-12345-67').ok).toBe(false);
  });
});
