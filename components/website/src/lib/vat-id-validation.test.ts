import { describe, it, expect, vi, afterEach } from 'vitest';
import { checkViesVatId, parseVatIdCountry } from './vat-id-validation';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('parseVatIdCountry', () => {
  it('extracts 2-letter country prefix', () => {
    expect(parseVatIdCountry('DE123456789')).toBe('DE');
    expect(parseVatIdCountry('FR12345678901')).toBe('FR');
    expect(parseVatIdCountry('NL123456789B01')).toBe('NL');
  });
  it('throws for non-2-letter prefix', () => {
    expect(() => parseVatIdCountry('123456789')).toThrow('Invalid VAT ID format');
  });
});

describe('checkViesVatId', () => {
  it('returns valid=true for a valid VIES response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        isValid: true,
        name: 'ACME GMBH',
        address: 'Musterstr 1, 10115 Berlin',
        requestIdentifier: 'WAPIAAAAWbcHHAvv',
        requestDate: '2026-04-28',
      }),
    }));
    const result = await checkViesVatId({ vatId: 'DE123456789', requesterVatId: 'DE987654321' });
    expect(result.valid).toBe(true);
    expect(result.name).toBe('ACME GMBH');
    expect(result.requestIdentifier).toBe('WAPIAAAAWbcHHAvv');
  });

  it('returns valid=false for invalid VIES response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ isValid: false }),
    }));
    const result = await checkViesVatId({ vatId: 'DE000000000' });
    expect(result.valid).toBe(false);
    expect(result.name).toBeUndefined();
  });

  it('throws on HTTP error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    await expect(checkViesVatId({ vatId: 'FR12345678901' })).rejects.toThrow('VIES');
  });
});
