import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchEcbRates, eurPer } from './ecb-exchange-rates';

const MOCK_XML = `<?xml version="1.0" encoding="UTF-8"?>
<gesmes:Envelope xmlns:gesmes="http://www.gesmes.org/xml/2002-08-01"
  xmlns="http://www.ecb.int/vocabulary/2002-08-01/eurofxref">
  <Cube>
    <Cube time="2026-04-28">
      <Cube currency="USD" rate="1.1398"/>
      <Cube currency="GBP" rate="0.8598"/>
      <Cube currency="CHF" rate="0.9312"/>
    </Cube>
  </Cube>
</gesmes:Envelope>`;

afterEach(() => vi.restoreAllMocks());

describe('fetchEcbRates', () => {
  it('returns EUR-per-unit map from ECB XML', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: async () => MOCK_XML,
    }));
    const rates = await fetchEcbRates();
    expect(rates.USD).toBeCloseTo(1 / 1.1398, 5);
    expect(rates.GBP).toBeCloseTo(1 / 0.8598, 5);
    expect(rates.CHF).toBeCloseTo(1 / 0.9312, 5);
    expect(rates.EUR).toBe(1);
  });

  it('throws on HTTP error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    await expect(fetchEcbRates()).rejects.toThrow('ECB rate fetch failed: 503');
  });
});

describe('eurPer', () => {
  it('returns 1 for EUR', () => expect(eurPer('EUR', { EUR: 1, USD: 0.877 })).toBe(1));
  it('returns mapped rate for known currency', () => expect(eurPer('USD', { EUR: 1, USD: 0.877 })).toBeCloseTo(0.877));
  it('throws for unknown currency', () => {
    expect(() => eurPer('ZZZ', { EUR: 1 })).toThrow('No ECB rate for ZZZ');
  });
});
